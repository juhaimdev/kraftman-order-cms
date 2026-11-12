"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { trackByRefIds, trackShipments } from "@/lib/delhivery/client";
import { extractOrderAndShipment } from "@/lib/delhivery/normalize";
import type { DelhiveryTrackingShipment } from "@/lib/delhivery/types";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const importSchema = z.object({
  mode: z.enum(["waybill", "ref_ids"]),
  identifiers: z.string().trim().min(3, "Enter at least one AWB or Order ID"),
});

export interface ImportDelhiveryResult {
  importedCount: number;
  updatedCount: number;
  returnedCount: number;
  requestedCount: number;
}

function toIsoTimestamp(raw: string): string {
  const parsed = Date.parse(raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`);
  return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
}

export async function importFromDelhiveryAction(input: {
  mode: "waybill" | "ref_ids";
  identifiers: string;
}): Promise<{
  data?: ImportDelhiveryResult;
  error?: string;
}> {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid import parameters",
    };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      error:
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  const tokens = Array.from(
    new Set(
      parsed.data.identifiers
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 3)
    )
  );

  if (tokens.length === 0) {
    return { error: "No valid AWB numbers or Order IDs found" };
  }

  try {
    const collected: DelhiveryTrackingShipment[] = [];
    let apiError: string | null = null;

    // Delhivery allows up to 50 identifiers per tracking call
    for (let i = 0; i < tokens.length; i += 50) {
      const chunk = tokens.slice(i, i + 50);
      const res =
        parsed.data.mode === "waybill"
          ? await trackShipments(chunk)
          : await trackByRefIds(chunk);

      if (
        res.Success === false &&
        (!res.ShipmentData || res.ShipmentData.length === 0)
      ) {
        apiError =
          res.Error || res.rmk || "No matching shipments found in Delhivery";
        continue;
      }

      for (const item of res.ShipmentData ?? []) {
        if (item.Shipment?.AWB) {
          collected.push(item.Shipment);
        }
      }
    }

    if (collected.length === 0) {
      return {
        error:
          apiError ||
          "No shipments returned by Delhivery for the provided identifier(s)",
      };
    }

    let importedCount = 0;
    let updatedCount = 0;

    for (const rawShipment of collected) {
      const s = extractOrderAndShipment(rawShipment);

      const [{ data: byOrder }, { data: byAwb }] = await Promise.all([
        supabase
          .from("orders")
          .select("id, customer_phone, pincode, total_amount")
          .eq("order_number", s.orderNumber)
          .maybeSingle(),
        supabase
          .from("shipments")
          .select("order_id")
          .eq("awb_number", s.awb)
          .maybeSingle(),
      ]);

      const existingId =
        (byOrder?.id as string | undefined) ||
        (byAwb?.order_id as string | undefined);
      const orderId = existingId ?? crypto.randomUUID();
      if (existingId) updatedCount++;
      else importedCount++;

      const labelUrl = `/api/labels?wbns=${encodeURIComponent(s.awb)}`;

      await supabase.from("orders").upsert(
        {
          id: orderId,
          order_number: s.orderNumber,
          customer_name: s.customerName,
          customer_phone:
            s.customerPhone !== "0000000000"
              ? s.customerPhone
              : ((byOrder?.customer_phone as string | undefined) ?? "0000000000"),
          address: s.address,
          city: s.city,
          state: s.state,
          pincode:
            s.pincode !== "000000"
              ? s.pincode
              : ((byOrder?.pincode as string | undefined) ?? "000000"),
          payment_method: s.paymentMethod,
          total_amount:
            s.totalAmount > 0
              ? s.totalAmount
              : Number(byOrder?.total_amount ?? 0),
          status: s.status,
          created_at: toIsoTimestamp(s.createdAt),
        },
        { onConflict: "id" }
      );

      await supabase.from("shipments").upsert(
        {
          order_id: orderId,
          awb_number: s.awb,
          label_url: labelUrl,
          weight_grams: s.weightGrams,
          latest_tracking_status: s.latestLabel,
          tracking_scans: s.scans,
          is_rto: s.isRto,
        },
        { onConflict: "order_id" }
      );
    }

    revalidatePath("/");
    return {
      data: {
        importedCount,
        updatedCount,
        returnedCount: collected.length,
        requestedCount: tokens.length,
      },
    };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to fetch live shipments from Delhivery",
    };
  }
}
