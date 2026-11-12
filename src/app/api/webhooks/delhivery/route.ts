import { NextRequest } from "next/server";
import type { TrackingScan } from "@/lib/db/types";
import { normalizeDelhiveryStatus } from "@/lib/delhivery/normalize";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const maxDuration = 30;

interface DelhiveryWebhookPayload {
  Shipment?: {
    AWB?: string;
    ReferenceNo?: string;
    Status?: {
      Status?: string;
      StatusDateTime?: string;
      StatusType?: string;
      StatusLocation?: string;
      Instructions?: string;
    };
  };
}

export async function POST(request: NextRequest) {
  try {
    const expectedSecret = process.env.DELHIVERY_WEBHOOK_SECRET?.trim();
    if (expectedSecret) {
      const provided =
        request.nextUrl.searchParams.get("secret") ||
        request.headers.get("x-webhook-secret") ||
        "";
      if (provided !== expectedSecret) {
        return Response.json(
          { ok: false, error: "Unauthorized webhook secret" },
          { status: 401 }
        );
      }
    }

    const body = (await request.json()) as DelhiveryWebhookPayload;
    const s = body?.Shipment;

    if (!s?.AWB) {
      return Response.json(
        { ok: false, error: "Missing Shipment.AWB" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return Response.json(
        { ok: false, error: "Supabase is not configured" },
        { status: 503 }
      );
    }

    const awb = String(s.AWB).trim();
    const { appStatus, isRto, latestLabel } = normalizeDelhiveryStatus(
      s.Status?.Status,
      s.Status?.StatusType,
      s.Status?.Instructions
    );

    const { data: existing } = await supabase
      .from("shipments")
      .select("order_id, tracking_scans")
      .eq("awb_number", awb)
      .maybeSingle();

    if (existing) {
      const scans: TrackingScan[] = Array.isArray(existing.tracking_scans)
        ? (existing.tracking_scans as TrackingScan[])
        : [];

      const newScan: TrackingScan = {
        ScanDateTime: s.Status?.StatusDateTime ?? new Date().toISOString(),
        ScanType: s.Status?.StatusType ?? "",
        Scan: s.Status?.Status ?? latestLabel,
        Instructions: s.Status?.Instructions ?? "",
        ScannedLocation: s.Status?.StatusLocation ?? "",
      };

      const deduped = [
        newScan,
        ...scans.filter(
          (item) =>
            item.ScanDateTime !== newScan.ScanDateTime ||
            item.Scan !== newScan.Scan
        ),
      ];

      await Promise.all([
        supabase
          .from("shipments")
          .update({
            latest_tracking_status: latestLabel,
            tracking_scans: deduped,
            is_rto: isRto,
          })
          .eq("awb_number", awb),
        supabase
          .from("orders")
          .update({ status: appStatus })
          .eq("id", existing.order_id as string),
      ]);
    }

    return Response.json({ ok: true, awb, status: appStatus }, { status: 200 });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Invalid webhook payload",
      },
      { status: 400 }
    );
  }
}
