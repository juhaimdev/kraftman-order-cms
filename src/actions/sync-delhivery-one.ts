"use server";

import { revalidatePath } from "next/cache";
import { trackShipments } from "@/lib/delhivery/client";
import {
  extractDelhiveryScans,
  normalizeDelhiveryStatus,
} from "@/lib/delhivery/normalize";
import {
  callDelhiveryOneMcpTool,
  getMcpConfig,
} from "@/lib/delhivery/one-mcp";
import type { DelhiveryTrackingShipment } from "@/lib/delhivery/types";
import type { OrderStatus, PaymentMethod, TrackingScan } from "@/lib/db/types";
import { getSupabaseAdmin } from "@/lib/supabase/server";

interface SaleOrderSummary {
  id: string;
  order_number?: string;
}

interface SaleOrderBox {
  weight?: number;
  length?: number;
  breadth?: number;
  height?: number;
  awb_number?: string | null;
}

interface SaleOrderDetail {
  id: string;
  order_number?: string;
  total_order_value?: number;
  cod_amount?: number;
  payment_mode?: string;
  shipment_status?: string;
  source_order_created_at?: number;
  shipping_address_first_name?: string;
  shipping_address_last_name?: string;
  shipping_address_phone_number?: string;
  shipping_address_address_line?: string;
  shipping_address_city?: string;
  shipping_address_state?: string;
  shipping_address_pin_code?: string;
  box_map?: Record<string, SaleOrderBox>;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapOmsStatus(status?: string): OrderStatus {
  const s = (status ?? "").toUpperCase();
  if (s === "DELIVERED") return "Delivered";
  if (s === "READY_TO_SHIP" || s === "MANIFESTED") return "Manifested";
  if (s === "SHIPPED" || s === "IN_TRANSIT" || s === "OUT_FOR_DELIVERY") {
    return "In Transit";
  }
  if (s.includes("NDR") || s.includes("RTO") || s.includes("UNDELIVERED")) {
    return "NDR";
  }
  return "Unfulfilled";
}

function isValidTenDigitPhone(phone?: string | null): boolean {
  if (!phone || /[xX*]/.test(phone)) return false;
  const digits = phone.replace(/\D/g, "").slice(-10);
  return digits.length === 10 && !/^0+$/.test(digits);
}

function sanitizePhone(raw?: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  if (/[xX*]/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, "").slice(-10);
  if (digits.length === 10 && !/^0+$/.test(digits)) return digits;
  return "";
}

function sanitizePin(raw?: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length === 6 ? digits : "000000";
}

function toIsoTimestamp(epochMs?: number, isoDate?: string | null): string {
  if (isoDate && !Number.isNaN(Date.parse(isoDate))) {
    return new Date(isoDate).toISOString();
  }
  if (!epochMs || epochMs <= 0 || epochMs > Date.now() + 86_400_000) {
    return new Date().toISOString();
  }
  return new Date(epochMs).toISOString();
}

export interface DelhiveryOneSyncResult {
  syncedOrders: number;
  syncedShipments: number;
  walletBalance: number | null;
  warehouses: string[];
}

export async function syncDelhiveryOneAction(): Promise<{
  data?: DelhiveryOneSyncResult;
  error?: string;
}> {
  const cfg = await getMcpConfig();
  if (!cfg) {
    return {
      error:
        "Delhivery One MCP credentials are missing. Add D1_CLIENT_ID, D1_CLIENT_SECRET, D1_AUTH_URL, D1_REALM, D1_CLIENT_CMS, and D1_MCP_URL to .env.local or Vercel Environment Variables.",
    };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      error:
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  try {
    // 1. Fetch sale orders list, pickup warehouses, and wallet balance in parallel
    const [ordersListRes, warehousesRes, walletRes] = await Promise.all([
      callDelhiveryOneMcpTool<{
        data?: { results?: SaleOrderSummary[]; total_count?: number };
      }>("list-sale-orders-es", {
        page_size: 50,
        page: 1,
        op: "GTE",
        value: 0,
        field: "source_order_created_at",
        direction: "DESC",
        selected_fields: ["id", "order_number"],
      }),
      callDelhiveryOneMcpTool<{
        results?: Array<{ facility_name?: string; status?: string }>;
      }>("list-pickup-locations", {
        search_on: ["facility_name"],
        search_term: "",
        page_size: 20,
        page: 1,
        field: "updated_at",
        direction: "DESC",
        op: "GTE",
        value: "",
        range_updated_at_op: "GTE",
        range_updated_at_value: "",
      }).catch(() => ({ results: [] })),
      callDelhiveryOneMcpTool<{ current_balance?: number }>(
        "get-wallet-details",
        {}
      ).catch(() => ({ current_balance: undefined })),
    ]);

    const summaries = ordersListRes?.data?.results ?? [];
    const warehouses = (warehousesRes?.results ?? [])
      .filter((w) => w.status === "ACTIVE" && w.facility_name)
      .map((w) => w.facility_name!);
    const walletBalance =
      typeof walletRes?.current_balance === "number"
        ? walletRes.current_balance
        : null;

    if (summaries.length === 0) {
      return {
        data: {
          syncedOrders: 0,
          syncedShipments: 0,
          walletBalance,
          warehouses,
        },
      };
    }

    // 2. Fetch full order details in parallel batches of 10
    const orderDetails: SaleOrderDetail[] = [];
    const selectedFields = [
      "order_number",
      "payment_mode",
      "total_order_value",
      "cod_amount",
      "shipment_status",
      "shipping_address_first_name",
      "shipping_address_last_name",
      "shipping_address_phone_number",
      "shipping_address_address_line",
      "shipping_address_city",
      "shipping_address_state",
      "shipping_address_pin_code",
      "box_map",
      "source_order_created_at",
    ];

    for (let i = 0; i < summaries.length; i += 10) {
      const chunk = summaries.slice(i, i + 10);
      const batch = await Promise.all(
        chunk.map((item) =>
          callDelhiveryOneMcpTool<{ data?: SaleOrderDetail }>(
            "get-sale-order",
            {
              sale_order_id: item.id,
              selected_fields: selectedFields,
            }
          )
            .then((r) => r.data ?? null)
            .catch(() => null)
        )
      );
      for (const detail of batch) {
        if (detail) orderDetails.push(detail);
      }
    }

    // 3. Collect AWBs and fetch live tracking scans from Delhivery Express API
    const awbList: string[] = [];
    for (const detail of orderDetails) {
      const boxes = Object.values(detail.box_map ?? {});
      const awb = boxes.find((b) => b.awb_number)?.awb_number;
      if (awb) awbList.push(awb);
    }

    const trackingByAwb = new Map<string, DelhiveryTrackingShipment>();
    for (let i = 0; i < awbList.length; i += 50) {
      const chunk = awbList.slice(i, i + 50);
      const trackRes = await trackShipments(chunk).catch(() => null);
      for (const item of trackRes?.ShipmentData ?? []) {
        if (item.Shipment?.AWB) {
          trackingByAwb.set(item.Shipment.AWB, item.Shipment);
        }
      }
    }

    // 4. Lookup existing order numbers / AWBs in 2 bulk queries (faster than N+1)
    const orderNumbers = orderDetails.map((d) => (d.order_number || d.id).trim());
    const [existingOrdersRes, existingShipmentsRes] = await Promise.all([
      supabase
        .from("orders")
        .select("id, order_number, customer_phone")
        .in("order_number", orderNumbers),
      awbList.length > 0
        ? supabase
            .from("shipments")
            .select("order_id, awb_number")
            .in("awb_number", awbList)
        : Promise.resolve({ data: [] as Array<{ order_id: string; awb_number: string }> }),
    ]);

    const orderIdByNumber = new Map(
      (existingOrdersRes.data ?? []).map((r) => [
        r.order_number as string,
        r.id as string,
      ])
    );
    const existingPhoneById = new Map(
      (existingOrdersRes.data ?? []).map((r) => [
        r.id as string,
        (r.customer_phone as string | null) ?? "",
      ])
    );
    const orderIdByAwb = new Map(
      (existingShipmentsRes.data ?? []).map((r) => [
        r.awb_number as string,
        r.order_id as string,
      ])
    );

    const orderRows: Array<Record<string, unknown>> = [];
    const shipmentRows: Array<Record<string, unknown>> = [];

    for (const detail of orderDetails) {
      const orderNumber = (detail.order_number || detail.id).trim();
      const boxes = Object.values(detail.box_map ?? {});
      const masterBox = boxes[0];
      const awb = masterBox?.awb_number?.trim() || null;
      const trackInfo = awb ? trackingByAwb.get(awb) : undefined;

      const isCod =
        (detail.payment_mode ?? "").toUpperCase() === "COD" ||
        Number(detail.cod_amount ?? 0) > 0;
      const paymentMethod: PaymentMethod = isCod ? "COD" : "Prepaid";
      const totalAmount = Number(
        detail.total_order_value ?? detail.cod_amount ?? 0
      );

      const fullName = [
        detail.shipping_address_first_name,
        detail.shipping_address_last_name,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

      let appStatus: OrderStatus = mapOmsStatus(detail.shipment_status);
      let isRto = false;
      let latestLabel = detail.shipment_status || "Pending";
      let scans: TrackingScan[] = [];

      if (trackInfo) {
        const normalized = normalizeDelhiveryStatus(
          trackInfo.Status?.Status,
          trackInfo.Status?.StatusType,
          trackInfo.Status?.Instructions ||
            trackInfo.Status?.Remarks ||
            trackInfo.Status?.SubStatus
        );
        appStatus = normalized.appStatus;
        isRto = normalized.isRto;
        latestLabel = normalized.latestLabel;
        scans = extractDelhiveryScans(trackInfo.Scans);
      }

      const fallbackId = UUID_REGEX.test(detail.id)
        ? detail.id
        : crypto.randomUUID();
      const orderId =
        orderIdByNumber.get(orderNumber) ??
        (awb ? orderIdByAwb.get(awb) : undefined) ??
        fallbackId;
      const incomingPhone = sanitizePhone(detail.shipping_address_phone_number);
      const savedPhone = existingPhoneById.get(orderId) ?? "";
      const finalPhone = isValidTenDigitPhone(incomingPhone)
        ? incomingPhone
        : isValidTenDigitPhone(savedPhone)
          ? savedPhone
          : incomingPhone || savedPhone;

      orderRows.push({
        id: orderId,
        order_number: orderNumber,
        customer_name: fullName || "Consignee",
        customer_phone: finalPhone,
        address: (detail.shipping_address_address_line || "").trim() || "—",
        city: (detail.shipping_address_city || "").trim(),
        state: (detail.shipping_address_state || "").trim(),
        pincode: sanitizePin(detail.shipping_address_pin_code),
        payment_method: paymentMethod,
        total_amount: totalAmount,
        status: appStatus,
        created_at: toIsoTimestamp(
          detail.source_order_created_at,
          trackInfo?.PickUpDate || trackInfo?.PickedupDate
        ),
      });

      if (awb) {
        shipmentRows.push({
          order_id: orderId,
          awb_number: awb,
          label_url: `/api/labels?wbns=${encodeURIComponent(awb)}`,
          weight_grams: Math.max(1, Math.round(Number(masterBox?.weight ?? 500))),
          length_cm: masterBox?.length ?? null,
          width_cm: masterBox?.breadth ?? null,
          height_cm: masterBox?.height ?? null,
          latest_tracking_status: latestLabel,
          tracking_scans: scans,
          is_rto: isRto,
        });
      }
    }

    if (orderRows.length > 0) {
      const { error: orderErr } = await supabase
        .from("orders")
        .upsert(orderRows, { onConflict: "id" });
      if (orderErr) throw new Error(orderErr.message);
    }

    if (shipmentRows.length > 0) {
      const { error: shipErr } = await supabase
        .from("shipments")
        .upsert(shipmentRows, { onConflict: "order_id" });
      if (shipErr) throw new Error(shipErr.message);
    }

    revalidatePath("/");
    return {
      data: {
        syncedOrders: orderRows.length,
        syncedShipments: shipmentRows.length,
        walletBalance,
        warehouses,
      },
    };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to sync data from Delhivery One MCP",
    };
  }
}
