"use server";

import { revalidatePath } from "next/cache";
import { createShipment } from "@/lib/delhivery/client";
import type { DelhiveryShipmentInput } from "@/lib/delhivery/types";
import type { OrderRecord } from "@/lib/db/types";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  createShipmentsSchema,
  type CreateShipmentsInput,
} from "@/lib/validations/shipping";

export interface ManifestBatchResult {
  succeeded: Array<{ orderId: string; orderNumber: string; awb: string }>;
  failed: Array<{ orderId: string; orderNumber: string; reason: string }>;
}

export async function createShipmentsAction(
  input: CreateShipmentsInput
): Promise<{
  data?: ManifestBatchResult;
  error?: string;
}> {
  const parsed = createShipmentsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid manifest parameters",
    };
  }

  const pickupLocation = process.env.DELHIVERY_PICKUP_LOCATION?.trim() || "";
  if (!pickupLocation) {
    return {
      error:
        "DELHIVERY_PICKUP_LOCATION is not set. Add your registered Delhivery One warehouse name in .env.local or Vercel Environment Variables before manifesting.",
    };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      error:
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  const { orderIds, weightGrams, dimensions, productsDesc } = parsed.data;

  try {
    const [ordersRes, existingRes] = await Promise.all([
      supabase.from("orders").select("*").in("id", orderIds),
      supabase
        .from("shipments")
        .select("order_id, awb_number")
        .in("order_id", orderIds)
        .not("awb_number", "is", null),
    ]);

    if (ordersRes.error) {
      return { error: ordersRes.error.message };
    }

    const orders = (ordersRes.data ?? []) as unknown as OrderRecord[];
    if (orders.length === 0) {
      return { error: "No matching orders found" };
    }

    const existingMap = new Map(
      (existingRes.data ?? []).map((r) => [
        r.order_id as string,
        r.awb_number as string,
      ])
    );

    const eligibleOrders: OrderRecord[] = [];
    const failed: ManifestBatchResult["failed"] = [];

    for (const order of orders) {
      if (existingMap.has(order.id)) {
        failed.push({
          orderId: order.id,
          orderNumber: order.order_number,
          reason: `Already manifested (AWB ${existingMap.get(order.id)})`,
        });
        continue;
      }
      if (order.status !== "Unfulfilled") {
        failed.push({
          orderId: order.id,
          orderNumber: order.order_number,
          reason: `Order status is ${order.status}, expected Unfulfilled`,
        });
        continue;
      }
      eligibleOrders.push(order);
    }

    if (eligibleOrders.length === 0) {
      return {
        error: failed[0]?.reason ?? "No eligible unfulfilled orders to manifest",
      };
    }

    const delhiveryPayloads: DelhiveryShipmentInput[] = eligibleOrders.map(
      (o) => ({
        name: o.customer_name,
        add: o.address,
        pin: o.pincode,
        city: o.city || "India",
        state: o.state || "India",
        country: "India",
        phone: o.customer_phone,
        order: o.order_number,
        payment_mode: o.payment_method,
        cod_amount:
          o.payment_method === "COD" ? String(o.total_amount) : "0",
        weight: String(weightGrams),
        shipment_length: String(dimensions.length),
        shipment_width: String(dimensions.width),
        shipment_height: String(dimensions.height),
        products_desc:
          o.item_description?.trim() ||
          productsDesc?.trim() ||
          `Order ${o.order_number}`,
      })
    );

    const response = await createShipment(delhiveryPayloads);
    const packages = response.packages ?? [];

    if (response.success === false && packages.length === 0) {
      return {
        error: response.rmk || "Delhivery rejected shipment manifestation",
      };
    }

    const succeeded: ManifestBatchResult["succeeded"] = [];
    const shipmentUpserts: Array<Record<string, unknown>> = [];
    const manifestedOrderIds: string[] = [];

    for (const order of eligibleOrders) {
      const pkg = packages.find((p) => p.refnum === order.order_number);

      if (pkg?.waybill && pkg.status !== "Fail") {
        const labelUrl = `/api/labels?wbns=${encodeURIComponent(pkg.waybill)}`;
        const initialScans = [
          {
            ScanDateTime: new Date().toISOString(),
            ScanType: "UD",
            Scan: "Manifested",
            Instructions: "Shipment manifested via Delhivery One API",
            ScannedLocation: "Seller Warehouse",
          },
        ];

        shipmentUpserts.push({
          order_id: order.id,
          awb_number: pkg.waybill,
          label_url: labelUrl,
          weight_grams: weightGrams,
          length_cm: dimensions.length,
          width_cm: dimensions.width,
          height_cm: dimensions.height,
          latest_tracking_status: "Manifested",
          tracking_scans: initialScans,
        });
        manifestedOrderIds.push(order.id);

        succeeded.push({
          orderId: order.id,
          orderNumber: order.order_number,
          awb: pkg.waybill,
        });
      } else {
        const remarks = Array.isArray(pkg?.remarks)
          ? pkg.remarks.join(", ")
          : pkg?.remarks || response.rmk || "Failed to generate AWB";
        failed.push({
          orderId: order.id,
          orderNumber: order.order_number,
          reason: String(remarks),
        });
      }
    }

    if (shipmentUpserts.length > 0) {
      await Promise.all([
        supabase
          .from("shipments")
          .upsert(shipmentUpserts, { onConflict: "order_id" }),
        supabase
          .from("orders")
          .update({ status: "Manifested" })
          .in("id", manifestedOrderIds),
      ]);
    }

    revalidatePath("/");
    return { data: { succeeded, failed } };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Unexpected error manifesting shipments",
    };
  }
}
