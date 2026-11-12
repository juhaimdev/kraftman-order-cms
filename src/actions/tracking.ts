"use server";

import { revalidatePath } from "next/cache";
import { cacheGet, cachePut } from "@/lib/cache";
import { trackShipments } from "@/lib/delhivery/client";
import {
  extractDelhiveryScans,
  normalizeDelhiveryStatus,
} from "@/lib/delhivery/normalize";
import type { DelhiveryTrackingResponse } from "@/lib/delhivery/types";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function syncTrackingAction(
  awbs: string[],
  forceRefresh = true
): Promise<{
  data?: { updated: number; cacheHit: boolean };
  error?: string;
}> {
  const cleanAwbs = Array.from(
    new Set(awbs.map((a) => a.trim()).filter(Boolean))
  );
  if (cleanAwbs.length === 0) {
    return { error: "Select at least one shipment with an AWB to track" };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      error:
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  try {
    let updated = 0;
    let anyCacheHit = false;

    // Delhivery limits tracking queries to 50 AWBs per request
    for (let i = 0; i < cleanAwbs.length; i += 50) {
      const chunk = cleanAwbs.slice(i, i + 50);
      const cacheKey = `track:${chunk.slice().sort().join(",")}`;

      let response: DelhiveryTrackingResponse | null = null;
      if (!forceRefresh) {
        response = await cacheGet<DelhiveryTrackingResponse>(cacheKey);
        if (response) anyCacheHit = true;
      }

      if (!response) {
        response = await trackShipments(chunk);
        if (response.ShipmentData && response.ShipmentData.length > 0) {
          await cachePut(cacheKey, response, 300); // 5 min warm TTL
        }
      }

      if (
        response.Success === false &&
        (!response.ShipmentData || response.ShipmentData.length === 0)
      ) {
        if (cleanAwbs.length === chunk.length) {
          return {
            error:
              response.Error ||
              response.rmk ||
              "Delhivery returned no tracking data",
          };
        }
        continue;
      }

      await Promise.all(
        (response.ShipmentData ?? []).map(async (entry) => {
          const s = entry.Shipment;
          if (!s?.AWB) return;

          const { appStatus, isRto, latestLabel } = normalizeDelhiveryStatus(
            s.Status?.Status,
            s.Status?.StatusType,
            s.Status?.Instructions || s.Status?.Remarks || s.Status?.SubStatus
          );
          const scans = extractDelhiveryScans(s.Scans);

          const { data: updatedShipments } = await supabase
            .from("shipments")
            .update({
              latest_tracking_status: latestLabel,
              tracking_scans: scans,
              is_rto: isRto,
            })
            .eq("awb_number", s.AWB)
            .select("order_id");

          const orderIds = (updatedShipments ?? []).map(
            (row) => row.order_id as string
          );
          if (orderIds.length > 0) {
            await supabase
              .from("orders")
              .update({ status: appStatus })
              .in("id", orderIds);
          }

          updated++;
        })
      );
    }

    revalidatePath("/");
    return { data: { updated, cacheHit: anyCacheHit } };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to sync live tracking",
    };
  }
}

/**
 * Tracks all active shipments with AWBs in Supabase (optionally including Delivered).
 */
export async function syncAllActiveShipmentsAction(
  includeDelivered = false
): Promise<{
  data?: { updated: number; totalChecked: number };
  error?: string;
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      error:
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  let query = supabase
    .from("shipments")
    .select("awb_number, orders!inner(status)")
    .not("awb_number", "is", null)
    .limit(200);

  if (!includeDelivered) {
    query = query.neq("orders.status", "Delivered");
  }

  const { data, error } = await query;
  if (error) {
    return { error: error.message };
  }

  const awbs = Array.from(
    new Set(
      (data ?? [])
        .map((row) => String(row.awb_number ?? "").trim())
        .filter(Boolean)
    )
  );

  if (awbs.length === 0) {
    return { data: { updated: 0, totalChecked: 0 } };
  }

  const res = await syncTrackingAction(awbs, true);
  if (res.error) return { error: res.error };

  return {
    data: {
      updated: res.data?.updated ?? 0,
      totalChecked: awbs.length,
    },
  };
}
