import { NextRequest, after } from "next/server";
import { getOrdersByAwbs } from "@/lib/db/queries";
import { fetchPackingSlip } from "@/lib/delhivery/client";
import { getDefaultSellerAddressCached } from "@/lib/delhivery/one-mcp";
import {
  generateDelhiveryLabelPdf,
  type ShippingLabelData,
} from "@/lib/labels/delhivery-label-pdf";
import {
  getLabelsBucketName,
  getSupabaseAdmin,
} from "@/lib/supabase/server";

export const maxDuration = 30;

function extractPdfDownloadUrl(
  jsonBody: Record<string, unknown>,
  wbns: string[]
): { url?: string; base64?: string } {
  const packages = Array.isArray(jsonBody.packages)
    ? (jsonBody.packages as Array<Record<string, unknown>>)
    : [];

  // Prefer matching exact AWB if multiple packages returned
  const firstMatch =
    packages.find((p) => wbns.includes(String(p.wbn ?? p.waybill ?? ""))) ??
    packages[0];

  const base64 =
    (typeof firstMatch?.pdf_encoding === "string"
      ? firstMatch.pdf_encoding
      : undefined) ??
    (typeof jsonBody.pdf_encoding === "string"
      ? jsonBody.pdf_encoding
      : undefined);

  if (base64 && base64.length > 50) {
    return { base64 };
  }

  const rawUrl =
    firstMatch?.pdf_download_link ??
    firstMatch?.pdf_url ??
    firstMatch?.label_url ??
    jsonBody.pdf_download_link ??
    jsonBody.pdf_url ??
    jsonBody.url;

  if (typeof rawUrl === "string" && /^https?:\/\//i.test(rawUrl)) {
    return { url: rawUrl };
  }

  return {};
}

export async function GET(request: NextRequest) {
  const wbnsParam = request.nextUrl.searchParams.get("wbns")?.trim();
  const isDownload = request.nextUrl.searchParams.get("download") === "1";
  const dispositionType = isDownload ? "attachment" : "inline";
  if (!wbnsParam) {
    return Response.json(
      { error: "Missing required `wbns` query parameter" },
      { status: 400 }
    );
  }

  const wbns = wbnsParam
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9_-]{5,30}$/.test(s));

  if (wbns.length === 0) {
    return Response.json(
      { error: "No valid AWB waybill numbers provided" },
      { status: 400 }
    );
  }

  const normalizedKey = wbns.slice().sort().join("_");
  const storagePath = `labels/${normalizedKey}.pdf`;
  const supabase = getSupabaseAdmin();
  const bucket = getLabelsBucketName();

  try {
    // 1. Serve cached official Delhivery PDF from Supabase Storage if present
    if (supabase) {
      const { data: cachedBlob } = await supabase.storage
        .from(bucket)
        .download(storagePath)
        .catch(() => ({ data: null }));

      if (cachedBlob) {
        const bytes = await cachedBlob.arrayBuffer();
        return new Response(bytes, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `${dispositionType}; filename="kraftman-label-${normalizedKey}.pdf"`,
            "Cache-Control": "private, max-age=86400",
            "X-Label-Cache": "HIT-SUPABASE",
          },
        });
      }
    }

    // 2. Fetch the official shipping label directly from Delhivery One Packing Slip API
    let pdfBytes: Uint8Array | null = null;
    let isOfficialUpstream = false;

    try {
      const upstream = await fetchPackingSlip(wbns.join(","));
      const contentType = upstream.headers.get("content-type") ?? "";

      if (contentType.includes("application/pdf")) {
        pdfBytes = new Uint8Array(await upstream.arrayBuffer());
        isOfficialUpstream = true;
      } else {
        const jsonBody = (await upstream.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        const extracted = extractPdfDownloadUrl(jsonBody, wbns);

        if (extracted.base64) {
          pdfBytes = new Uint8Array(Buffer.from(extracted.base64, "base64"));
          isOfficialUpstream = true;
        } else if (extracted.url) {
          const pdfRes = await fetch(extracted.url, {
            signal: AbortSignal.timeout(15_000),
          });
          if (pdfRes.ok) {
            pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());
            isOfficialUpstream = true;
          }
        }
      }
    } catch {
      // Upstream packing slip failed (e.g., 401 token or offline): fall back to Kraftman Delhivery 4x6 template
    }

    if (!pdfBytes) {
      const [orders, sellerInfo] = await Promise.all([
        getOrdersByAwbs(wbns),
        getDefaultSellerAddressCached(),
      ]);

      const orderByAwb = new Map(
        orders.map((o) => [o.awb_number ?? "", o])
      );

      const labelItems: ShippingLabelData[] = wbns.map((wbn) => {
        const o = orderByAwb.get(wbn);
        if (o) {
          return {
            awb: wbn,
            orderNumber: o.order_number,
            customerName: o.customer_name,
            address: o.address,
            city: o.city,
            state: o.state,
            pincode: o.pincode,
            paymentMethod: o.payment_method,
            totalAmount: o.total_amount,
            itemDescription: o.item_description,
            createdAt: o.created_at,
            shippingMode: "Surface",
            sellerName: sellerInfo.sellerName,
            sellerAddress: sellerInfo.sellerAddress,
            returnAddress: sellerInfo.sellerAddress,
          };
        }

        return {
          awb: wbn,
          orderNumber: wbn.slice(-6),
          customerName: "Valued Customer",
          address: "Delivery Address",
          city: "India",
          state: "",
          pincode: "000000",
          paymentMethod: "Prepaid",
          totalAmount: 0,
          itemDescription: `Shipment ${wbn}`,
          shippingMode: "Surface",
          sellerName: sellerInfo.sellerName,
          sellerAddress: sellerInfo.sellerAddress,
          returnAddress: sellerInfo.sellerAddress,
        };
      });

      pdfBytes = await generateDelhiveryLabelPdf(labelItems);
    }

    // 3. Cache official Delhivery label PDF into Supabase Storage non-blockingly via `after()`
    if (supabase && isOfficialUpstream) {
      const bytesToCache = pdfBytes;
      after(async () => {
        try {
          await supabase.storage.from(bucket).upload(storagePath, bytesToCache, {
            contentType: "application/pdf",
            upsert: true,
          });
          if (wbns.length === 1) {
            await supabase
              .from("shipments")
              .update({
                label_storage_path: storagePath,
                label_url: `/api/labels?wbns=${encodeURIComponent(wbns[0])}`,
              })
              .eq("awb_number", wbns[0]);
          }
        } catch {
          // Non-fatal if bucket is not accessible
        }
      });
    }

    return new Response(new Uint8Array(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${dispositionType}; filename="kraftman-label-${normalizedKey}.pdf"`,
        "Cache-Control": "private, max-age=86400",
        "X-Label-Cache": isOfficialUpstream
          ? "OFFICIAL-DELHIVERY"
          : "KRAFTMAN-DELHIVERY-4X6",
      },
    });
  } catch (err) {
    const rawMsg =
      err instanceof Error ? err.message : "Failed to fetch official Delhivery label";
    const isAuth = /401|Invalid token/i.test(rawMsg);
    const status = rawMsg.includes("DELHIVERY_API_TOKEN")
      ? 503
      : isAuth
        ? 401
        : 502;

    const helpfulMessage = isAuth
      ? "Delhivery Packing Slip API returned 401 Invalid token. Replace DELHIVERY_API_TOKEN with your active KRAFTMAN B2C API token from Delhivery One -> Settings -> API Setup to download official Delhivery labels."
      : rawMsg;

    return Response.json({ error: helpfulMessage }, { status });
  }
}
