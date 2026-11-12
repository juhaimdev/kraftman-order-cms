import { NextRequest, after } from "next/server";
import { fetchPackingSlip } from "@/lib/delhivery/client";
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
            "Content-Disposition": `inline; filename="delhivery-labels-${normalizedKey}.pdf"`,
            "Cache-Control": "private, max-age=86400",
            "X-Label-Cache": "HIT-SUPABASE",
          },
        });
      }
    }

    // 2. Fetch the official shipping label directly from Delhivery One Packing Slip API
    const upstream = await fetchPackingSlip(wbns.join(","));
    const contentType = upstream.headers.get("content-type") ?? "";
    let pdfBytes: Uint8Array;

    if (contentType.includes("application/pdf")) {
      pdfBytes = new Uint8Array(await upstream.arrayBuffer());
    } else {
      const jsonBody = (await upstream.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const extracted = extractPdfDownloadUrl(jsonBody, wbns);

      if (extracted.base64) {
        pdfBytes = new Uint8Array(Buffer.from(extracted.base64, "base64"));
      } else if (extracted.url) {
        const pdfRes = await fetch(extracted.url, {
          signal: AbortSignal.timeout(15_000),
        });
        if (!pdfRes.ok) {
          throw new Error(
            `Delhivery label download URL returned HTTP ${pdfRes.status}`
          );
        }
        pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());
      } else {
        throw new Error(
          `Delhivery packing slip response did not contain an official PDF or pdf_download_link for ${wbns.join(", ")}.`
        );
      }
    }

    // 3. Cache official Delhivery label PDF into Supabase Storage non-blockingly via `after()`
    if (supabase) {
      after(async () => {
        try {
          await supabase.storage.from(bucket).upload(storagePath, pdfBytes, {
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
        "Content-Disposition": `inline; filename="delhivery-labels-${normalizedKey}.pdf"`,
        "Cache-Control": "private, max-age=86400",
        "X-Label-Cache": "OFFICIAL-DELHIVERY",
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
