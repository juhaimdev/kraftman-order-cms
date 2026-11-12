"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { cancelShipment, submitNdrAction } from "@/lib/delhivery/client";
import type { TrackingScan } from "@/lib/db/types";
import { createShipmentsAction } from "@/actions/shipments";
import {
  bulkCreateOrdersSchema,
  createOrderSchema,
  updateOrderSchema,
  type BulkCreateOrdersInput,
  type CreateOrderInput,
  type UpdateOrderInput,
} from "@/lib/validations/shipping";

function buildOrderInsertRow(data: CreateOrderInput) {
  const orderNumber =
    data.order_number && data.order_number.length >= 3
      ? data.order_number
      : `ORD-${Math.floor(100000 + Math.random() * 900000)}`;

  return {
    id: crypto.randomUUID(),
    order_number: orderNumber,
    customer_name: data.customer_name,
    customer_phone: data.customer_phone,
    address: data.address,
    city: data.city,
    state: data.state,
    pincode: data.pincode,
    payment_method: data.payment_method,
    total_amount: data.total_amount,
    status: "Unfulfilled" as const,
    ...(data.product_id ? { product_id: data.product_id } : {}),
    ...(data.item_description ? { item_description: data.item_description } : {}),
  };
}

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

  const row = buildOrderInsertRow(parsed.data);
  const { error } = await supabase.from("orders").insert(row);

  if (error) {
    if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
      return { error: `Order number ${row.order_number} already exists` };
    }
    return { error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/sales");
  return { data: { id: row.id, orderNumber: row.order_number } };
}

export interface BulkCreateResult {
  created: Array<{ id: string; orderNumber: string; customerName: string }>;
  manifested: Array<{ orderId: string; orderNumber: string; awb: string }>;
  failedOrders: Array<{ row: number; customerName: string; reason: string }>;
  manifestError?: string;
  manifestFailures: Array<{ orderId: string; orderNumber: string; reason: string }>;
}

/**
 * Create multiple orders in one batch and optionally auto-manifest them
 * immediately via Delhivery One so all shipping labels are ready to download.
 */
export async function createBulkOrdersAction(
  input: BulkCreateOrdersInput
): Promise<{
  data?: BulkCreateResult;
  error?: string;
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      error:
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  if (!Array.isArray(input.orders) || input.orders.length === 0) {
    return { error: "Add at least one order before submitting." };
  }
  if (input.orders.length > 100) {
    return { error: "Maximum 100 orders per bulk batch." };
  }

  const validRows: Array<ReturnType<typeof buildOrderInsertRow>> = [];
  const failedOrders: BulkCreateResult["failedOrders"] = [];

  input.orders.forEach((rawOrder, idx) => {
    const parsed = createOrderSchema.safeParse(rawOrder);
    if (!parsed.success) {
      failedOrders.push({
        row: idx + 1,
        customerName: rawOrder.customer_name || `Row ${idx + 1}`,
        reason: parsed.error.issues[0]?.message ?? "Invalid order fields",
      });
      return;
    }
    validRows.push(buildOrderInsertRow(parsed.data));
  });

  if (validRows.length === 0) {
    return {
      error: failedOrders[0]
        ? `Row ${failedOrders[0].row}: ${failedOrders[0].reason}`
        : "No valid order rows to import.",
    };
  }

  const created: BulkCreateResult["created"] = [];
  const { error: batchErr } = await supabase.from("orders").insert(validRows);

  if (!batchErr) {
    for (const r of validRows) {
      created.push({
        id: r.id,
        orderNumber: r.order_number,
        customerName: r.customer_name,
      });
    }
  } else {
    // Fallback to row-by-row inserts when a duplicate order_number occurs
    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i];
      const { error: singleErr } = await supabase.from("orders").insert(r);
      if (singleErr) {
        failedOrders.push({
          row: i + 1,
          customerName: r.customer_name,
          reason:
            singleErr.code === "23505"
              ? `Order number ${r.order_number} already exists`
              : singleErr.message,
        });
      } else {
        created.push({
          id: r.id,
          orderNumber: r.order_number,
          customerName: r.customer_name,
        });
      }
    }
  }

  if (created.length === 0) {
    return {
      error: failedOrders[0]?.reason ?? "Failed to create any orders in batch.",
    };
  }

  let manifested: BulkCreateResult["manifested"] = [];
  let manifestFailures: BulkCreateResult["manifestFailures"] = [];
  let manifestError: string | undefined;

  if (input.autoManifest) {
    const manifestConfigParsed = bulkCreateOrdersSchema.safeParse({
      orders: [input.orders[0]],
      autoManifest: true,
      weightGrams: input.weightGrams ?? 500,
      dimensions: input.dimensions ?? { length: 20, width: 15, height: 10 },
      productsDesc: input.productsDesc,
    });

    if (!manifestConfigParsed.success) {
      manifestError =
        manifestConfigParsed.error.issues[0]?.message ??
        "Invalid parcel weight/dimensions for auto-manifest";
    } else {
      const shipRes = await createShipmentsAction({
        orderIds: created.map((c) => c.id),
        weightGrams: manifestConfigParsed.data.weightGrams ?? 500,
        dimensions: manifestConfigParsed.data.dimensions ?? {
          length: 20,
          width: 15,
          height: 10,
        },
        productsDesc: input.productsDesc,
      });

      if (shipRes.error) {
        manifestError = shipRes.error;
      } else if (shipRes.data) {
        manifested = shipRes.data.succeeded;
        manifestFailures = shipRes.data.failed;
      }
    }
  }

  revalidatePath("/");
  revalidatePath("/sales");

  return {
    data: {
      created,
      manifested,
      failedOrders,
      manifestError,
      manifestFailures,
    },
  };
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
