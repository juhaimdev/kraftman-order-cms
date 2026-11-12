import { NextRequest, after } from "next/server";
import { getOrdersByAwbs } from "@/lib/db/queries";
import { fetchPackingSlip } from "@/lib/delhivery/client";
import {
  buildThermalLabelsPdf,
  type ThermalLabelData,
} from "@/lib/delhivery/pdf-fallback";
import {
  getLabelsBucketName,
  getSupabaseAdmin,
} from "@/lib/supabase/server";

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const wbnsParam = request.nextUrl.searchParams.get("wbns")?.trim();
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
    // 1. Check Supabase Storage private label cache if available
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
            "Content-Disposition": `inline; filename="delhivery-labels-${normalizedKey}.pdf"`,
            "Cache-Control": "private, max-age=86400",
            "X-Label-Cache": "HIT-SUPABASE",
          },
        });
      }
    }

    // 2. Fetch from Delhivery Packing Slip API
    let pdfBytes: ArrayBuffer | Uint8Array;
    let fromFallback = false;

    try {
      const upstream = await fetchPackingSlip(wbns.join(","));
      const contentType = upstream.headers.get("content-type") ?? "";

      if (contentType.includes("application/pdf")) {
        pdfBytes = await upstream.arrayBuffer();
      } else {
        const jsonBody = (await upstream.json().catch(() => ({}))) as {
          packages?: Array<Record<string, unknown>>;
        };
        const dbOrders = await getOrdersByAwbs(wbns);
        const orderByAwb = new Map(
          dbOrders.map((o) => [o.awb_number ?? "", o])
        );

        const pkgList = Array.isArray(jsonBody.packages)
          ? jsonBody.packages
          : [];
        const labels: ThermalLabelData[] = wbns.map((awb) => {
          const pkg = pkgList.find(
            (p) => String(p.wbn ?? p.waybill ?? "") === awb
          );
          const order = orderByAwb.get(awb);
          const dims =
            order?.length_cm && order?.width_cm && order?.height_cm
              ? `${order.length_cm}x${order.width_cm}x${order.height_cm}`
              : undefined;
          return {
            awb,
            orderNumber: String(pkg?.oid ?? order?.order_number ?? awb),
            customerName: String(
              pkg?.name ?? order?.customer_name ?? "Consignee"
            ),
            phone: String(pkg?.contact ?? order?.customer_phone ?? ""),
            address: String(pkg?.address ?? order?.address ?? ""),
            city: String(pkg?.destination_city ?? order?.city ?? ""),
            state: String(order?.state ?? ""),
            pincode: String(pkg?.pin ?? order?.pincode ?? ""),
            paymentMode: String(pkg?.pt ?? order?.payment_method ?? "Prepaid"),
            codAmount: String(
              pkg?.cod ??
                (order?.payment_method === "COD" ? order.total_amount : 0)
            ),
            weightGrams: String(order?.weight_grams ?? 500),
            dimensions: dims,
            itemDescription: order?.item_description ?? undefined,
            pickupWarehouse: process.env.DELHIVERY_PICKUP_LOCATION?.trim() || undefined,
            sortCode: pkg?.sort_code ? String(pkg.sort_code) : undefined,
          };
        });

        pdfBytes = buildThermalLabelsPdf(labels);
      }
    } catch (upstreamErr) {
      // If Delhivery packing_slip fails (e.g. 401 token scope) but the shipment exists in Supabase,
      // generate a compliant 4x6 slip from Supabase data without caching it permanently.
      const dbOrders = await getOrdersByAwbs(wbns);
      if (dbOrders.length === 0) {
        throw upstreamErr;
      }
      fromFallback = true;
      pdfBytes = buildThermalLabelsPdf(
        dbOrders.map((o) => ({
          awb: o.awb_number ?? "",
          orderNumber: o.order_number,
          customerName: o.customer_name,
          phone: o.customer_phone,
          address: o.address,
          city: o.city,
          state: o.state,
          pincode: o.pincode,
          paymentMode: o.payment_method,
          codAmount: o.payment_method === "COD" ? String(o.total_amount) : "0",
          weightGrams: String(o.weight_grams ?? 500),
          dimensions:
            o.length_cm && o.width_cm && o.height_cm
              ? `${o.length_cm}x${o.width_cm}x${o.height_cm}`
              : undefined,
          itemDescription: o.item_description ?? undefined,
          pickupWarehouse:
            process.env.DELHIVERY_PICKUP_LOCATION?.trim() || undefined,
        }))
      );
    }

    const bodyBuffer =
      pdfBytes instanceof Uint8Array
        ? new Uint8Array(pdfBytes)
        : new Uint8Array(pdfBytes);

    // 3. Cache official Delhivery labels into Supabase Storage non-blockingly via Next.js `after()`
    if (supabase && !fromFallback) {
      after(async () => {
        try {
          await supabase.storage.from(bucket).upload(storagePath, bodyBuffer, {
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
          // Non-fatal if bucket has not been provisioned yet
        }
      });
    }

    return new Response(bodyBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="delhivery-labels-${normalizedKey}.pdf"`,
        "Cache-Control": fromFallback ? "no-store" : "private, max-age=86400",
        "X-Label-Cache": fromFallback ? "FALLBACK-DB" : "MISS",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch shipping label";
    const status = message.includes("DELHIVERY_API_TOKEN") ? 503 : 502;
    return Response.json({ error: message }, { status });
  }
}
