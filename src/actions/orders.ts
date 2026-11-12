"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { cancelShipment, submitNdrAction } from "@/lib/delhivery/client";
import type { TrackingScan } from "@/lib/db/types";
import {
  createOrderSchema,
  updateOrderSchema,
  type CreateOrderInput,
  type UpdateOrderInput,
} from "@/lib/validations/shipping";

export async function createOrderAction(input: CreateOrderInput): Promise<{
  data?: { id: string; orderNumber: string };
  error?: string;
}> {
  const parsed = createOrderSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid order details",
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
  const orderNumber =
    data.order_number && data.order_number.length >= 3
      ? data.order_number
      : `ORD-${Math.floor(100000 + Math.random() * 900000)}`;

  const id = crypto.randomUUID();

  const { error } = await supabase.from("orders").insert({
    id,
    order_number: orderNumber,
    customer_name: data.customer_name,
    customer_phone: data.customer_phone,
    address: data.address,
    city: data.city,
    state: data.state,
    pincode: data.pincode,
    payment_method: data.payment_method,
    total_amount: data.total_amount,
    status: "Unfulfilled",
    ...(data.product_id ? { product_id: data.product_id } : {}),
    ...(data.item_description ? { item_description: data.item_description } : {}),
  });

  if (error) {
    if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
      return { error: `Order number ${orderNumber} already exists` };
    }
    return { error: error.message };
  }

  revalidatePath("/");
  return { data: { id, orderNumber } };
}

/**
 * Edit order & customer details locally in Supabase, and push consignee edits
 * to Delhivery (`/api/p/update`) automatically when an active AWB exists.
 */
export async function updateOrderAction(input: UpdateOrderInput): Promise<{
  data?: { orderId: string; syncedToDelhivery: boolean };
  error?: string;
}> {
  const parsed = updateOrderSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid order update details",
    };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { error: "Supabase is not configured." };
  }

  const data = parsed.data;
  const { data: orderRow, error: fetchError } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", data.order_id)
    .maybeSingle();

  if (fetchError) {
    return { error: fetchError.message };
  }
  if (!orderRow) {
    return { error: "Order not found." };
  }
  if (orderRow.status === "Delivered" || orderRow.status === "Cancelled") {
    return { error: `Cannot edit a ${orderRow.status} order.` };
  }

  const { data: shipRow } = await supabase
    .from("shipments")
    .select("awb_number")
    .eq("order_id", data.order_id)
    .maybeSingle();

  let syncedToDelhivery = false;
  if (shipRow?.awb_number) {
    const fullAdd = `${data.address}, ${data.city}, ${data.state} - ${data.pincode}`;
    try {
      const res = await submitNdrAction({
        waybill: shipRow.awb_number,
        act: "EDIT_DETAILS",
        name: data.customer_name,
        phone: data.customer_phone,
        add: fullAdd,
      });

      if (res.success === false || res.error) {
        return {
          error:
            typeof res.error === "string"
              ? res.error
              : res.message ?? "Delhivery rejected live consignee update.",
        };
      }
      syncedToDelhivery = true;
    } catch (err) {
      return {
        error:
          err instanceof Error
            ? err.message
            : "Failed to sync consignee edits to Delhivery.",
      };
    }
  }

  const { error: updateErr } = await supabase
    .from("orders")
    .update({
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      address: data.address,
      city: data.city,
      state: data.state,
      pincode: data.pincode,
      payment_method: data.payment_method,
      total_amount: data.total_amount,
      product_id: data.product_id || null,
      item_description: data.item_description || null,
    })
    .eq("id", data.order_id);

  if (updateErr) {
    return { error: updateErr.message };
  }

  revalidatePath("/");
  return { data: { orderId: data.order_id, syncedToDelhivery } };
}

/**
 * Cancel a manifested Delhivery AWB via `/api/p/edit`, or permanently delete
 * an unfulfilled draft order from Supabase.
 */
export async function cancelOrDeleteOrderAction(input: {
  orderId: string;
  mode: "cancel_shipment" | "delete_draft";
}): Promise<{
  data?: { orderId: string; message: string };
  error?: string;
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { error: "Supabase is not configured." };
  }

  const { data: orderRow, error: orderErr } = await supabase
    .from("orders")
    .select("id, order_number, status")
    .eq("id", input.orderId)
    .maybeSingle();

  if (orderErr) return { error: orderErr.message };
  if (!orderRow) return { error: "Order not found." };

  const { data: shipRow } = await supabase
    .from("shipments")
    .select("id, awb_number, tracking_scans")
    .eq("order_id", input.orderId)
    .maybeSingle();

  if (input.mode === "delete_draft") {
    if (shipRow?.awb_number || orderRow.status !== "Unfulfilled") {
      return {
        error:
          "Only Unfulfilled orders without an AWB can be deleted. Cancel the shipment instead.",
      };
    }
    const { error: delErr } = await supabase
      .from("orders")
      .delete()
      .eq("id", input.orderId);
    if (delErr) return { error: delErr.message };
    revalidatePath("/");
    return {
      data: {
        orderId: input.orderId,
        message: `Draft order ${orderRow.order_number} deleted.`,
      },
    };
  }

  // Cancel manifested shipment in Delhivery One + mark Cancelled in Supabase
  if (orderRow.status === "Delivered" || orderRow.status === "Cancelled") {
    return { error: `Order ${orderRow.order_number} is already ${orderRow.status}.` };
  }

  if (shipRow?.awb_number) {
    try {
      const cancelRes = await cancelShipment(shipRow.awb_number);
      if (cancelRes.status === false) {
        return {
          error:
            cancelRes.remark ??
            cancelRes.error ??
            `Delhivery rejected cancellation for AWB ${shipRow.awb_number}.`,
        };
      }
    } catch (err) {
      return {
        error:
          err instanceof Error
            ? err.message
            : "Failed to call Delhivery cancellation API.",
      };
    }

    const existingScans: TrackingScan[] = Array.isArray(shipRow.tracking_scans)
      ? (shipRow.tracking_scans as TrackingScan[])
      : [];
    const cancelScan: TrackingScan = {
      ScanDateTime: new Date().toISOString(),
      ScanType: "CN",
      Scan: "Cancelled",
      Instructions: "Shipment cancelled from Kraftman Dispatch Hub",
      ScannedLocation: "Seller Dashboard",
    };

    await supabase
      .from("shipments")
      .update({
        latest_tracking_status: "Cancelled",
        tracking_scans: [...existingScans, cancelScan],
        updated_at: new Date().toISOString(),
      })
      .eq("id", shipRow.id);
  }

  const { error: statusErr } = await supabase
    .from("orders")
    .update({ status: "Cancelled" })
    .eq("id", input.orderId);

  if (statusErr) return { error: statusErr.message };

  revalidatePath("/");
  return {
    data: {
      orderId: input.orderId,
      message: shipRow?.awb_number
        ? `Cancelled shipment AWB ${shipRow.awb_number}`
        : `Marked order ${orderRow.order_number} as Cancelled`,
    },
  };
}
