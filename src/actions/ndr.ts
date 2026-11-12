"use server";

import { revalidatePath } from "next/cache";
import { cancelShipment, submitNdrAction } from "@/lib/delhivery/client";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  ndrUpdateSchema,
  type NdrUpdateInput,
} from "@/lib/validations/shipping";

export async function submitNdrResolutionAction(
  input: NdrUpdateInput
): Promise<{
  data?: {
    waybill: string;
    action: NdrUpdateInput["action"];
    queued: boolean;
    uplId?: string;
  };
  error?: string;
}> {
  const parsed = ndrUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid NDR update request",
    };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      error:
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  const data = parsed.data;

  try {
    // Prevent RTO request if shipment is currently Dispatched / Out for Delivery
    if (data.action === "RTO") {
      const { data: shipmentRow } = await supabase
        .from("shipments")
        .select("latest_tracking_status")
        .eq("awb_number", data.waybill)
        .maybeSingle();

      const latest = (
        (shipmentRow?.latest_tracking_status as string | null) ?? ""
      ).toLowerCase();
      if (latest.includes("dispatched") || latest.includes("out for delivery")) {
        return {
          error:
            "Delhivery blocks cancellation/RTO while Out for Delivery. Wait until the delivery attempt settles to Pending/NDR.",
        };
      }

      await cancelShipment(data.waybill);
      await supabase
        .from("shipments")
        .update({
          is_rto: true,
          latest_tracking_status: "RTO Requested",
        })
        .eq("awb_number", data.waybill);

      revalidatePath("/");
      return {
        data: { waybill: data.waybill, action: data.action, queued: false },
      };
    }

    const res = await submitNdrAction({
      waybill: data.waybill,
      act: data.action,
      ...(data.action === "DEFER_DLV"
        ? { deferred_date: data.deferred_date }
        : {}),
      ...(data.action === "EDIT_DETAILS"
        ? { phone: data.phone, add: data.add, name: data.name }
        : {}),
    });

    const uplId = res.upl_id ?? res.request_id ?? undefined;
    await supabase
      .from("shipments")
      .update({
        ndr_upl_id: uplId ?? null,
        latest_tracking_status: `NDR Action Submitted (${data.action})`,
      })
      .eq("awb_number", data.waybill);

    revalidatePath("/");
    return {
      data: {
        waybill: data.waybill,
        action: data.action,
        queued: false,
        uplId,
      },
    };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to submit NDR resolution",
    };
  }
}
