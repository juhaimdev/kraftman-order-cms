"use server";

import { revalidatePath } from "next/cache";
import {
  callDelhiveryOneMcpTool,
  getWalletDetailsCached,
} from "@/lib/delhivery/one-mcp";
import type {
  DelhiveryExceptionItem,
  PickupLocationInfo,
  PickupRequestInfo,
  ShippingRateQuote,
  WalletSummary,
} from "@/lib/db/types";
import {
  rateCheckSchema,
  schedulePickupSchema,
  type RateCheckInput,
  type SchedulePickupInput,
} from "@/lib/validations/shipping";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : v != null ? String(v) : fallback;
}

async function safeMcpCall(
  name: string,
  args: Record<string, unknown>
): Promise<{ data: Record<string, unknown> | null; error?: string }> {
  try {
    const raw = await callDelhiveryOneMcpTool<Record<string, unknown>>(name, args);
    return { data: asRecord(raw) };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : `MCP call ${name} failed`,
    };
  }
}

/** Fetch active pickup warehouses registered on Delhivery One for Kraftman */
export async function getPickupLocationsAction(): Promise<{
  data?: PickupLocationInfo[];
  error?: string;
}> {
  const res = await safeMcpCall("list-pickup-locations", {
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
  });

  if (!res.data) {
    return { error: res.error ?? "Unable to load Delhivery One warehouses" };
  }

  const rawResults: unknown[] = Array.isArray(res.data.results)
    ? res.data.results
    : [];
  const locations: PickupLocationInfo[] = rawResults
    .map((item: unknown): PickupLocationInfo | null => {
      const r = asRecord(item);
      if (!r) return null;
      const addr = asRecord(r.address);
      const rawSlots: unknown[] = Array.isArray(r.preferred_pickup_slots)
        ? r.preferred_pickup_slots
        : [];
      const slots = rawSlots
        .map((s) => asRecord(s))
        .filter((s): s is Record<string, unknown> => s !== null)
        .map((s) => ({
          start_time: str(s.start_time, "14:00:00"),
          end_time: str(s.end_time, "18:00:00"),
        }));

      return {
        facility_id: str(r.facility_id),
        facility_name: str(r.facility_name, "Warehouse"),
        facility_code: r.facility_code ? str(r.facility_code) : null,
        status: str(r.status, "ACTIVE"),
        address_line: [str(addr?.address_line1), str(addr?.address_line2)]
          .filter(Boolean)
          .join(", "),
        city: str(addr?.city),
        state: str(addr?.state),
        pin_code: str(addr?.pin_code),
        phone: str(addr?.phone),
        preferred_slots:
          slots.length > 0
            ? slots
            : [{ start_time: "14:00:00", end_time: "18:00:00" }],
      };
    })
    .filter(
      (x: PickupLocationInfo | null): x is PickupLocationInfo =>
        x !== null && Boolean(x.facility_id)
    );

  return { data: locations };
}

/** Calculate Express & Surface shipping rates via Delhivery One Bulk Rate Calculator */
export async function calculateShippingRatesAction(
  input: RateCheckInput
): Promise<{
  data?: ShippingRateQuote[];
  error?: string;
}> {
  const parsed = rateCheckSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid rate inputs" };
  }

  const v = parsed.data;
  const paymentMode = v.payment_method === "COD" ? "COD" : "PREPAID";
  const modes: Array<"EXPRESS" | "SURFACE"> = ["EXPRESS", "SURFACE"];

  const responses = await Promise.all(
    modes.map((mode) =>
      safeMcpCall("bulk-rate-calculator", {
        id: `${mode}_${Date.now()}`,
        origin_pin: v.origin_pin,
        destination_pin: v.destination_pin,
        shipment_type: "FORWARD",
        shipping_mode: mode,
        weight: v.weight_grams,
        weight_unit: "GM",
        payment_mode: paymentMode,
        cod_amount: paymentMode === "COD" ? v.cod_amount : 0,
        length: v.length_cm,
        breadth: v.breadth_cm,
        height: v.height_cm,
        packaging_type: v.packaging_type,
        ...(v.facility_id ? { facility_id: v.facility_id } : {}),
      })
    )
  );

  const quotes: ShippingRateQuote[] = [];
  let firstErr: string | undefined;

  responses.forEach((res, idx) => {
    const mode = modes[idx];
    if (!res.data) {
      firstErr = firstErr ?? res.error;
      return;
    }

    if (res.data.error_code && res.data.message) {
      firstErr =
        firstErr ?? str(res.data.translated_message || res.data.message);
      return;
    }

    const list: unknown[] = Array.isArray(res.data.responses)
      ? res.data.responses
      : [];
    const entry = asRecord(list[0]);
    if (!entry) return;

    const tax = asRecord(entry.tax_data);
    quotes.push({
      mode,
      total_amount: num(entry.total_amount),
      gross_amount: num(entry.gross_amount),
      freight_cost: num(entry.freight_cost),
      charged_cod: num(entry.charged_cod),
      dph_charge: num(entry.dph_charge),
      fuel_surcharge: num(entry.fuel_surcharge),
      cgst: num(tax?.cgst),
      sgst: num(tax?.sgst),
      igst: num(tax?.igst),
      zone: str(entry.zone, "-"),
      charged_weight: num(entry.charged_weight, v.weight_grams),
      success: Boolean(entry.success),
      message: str(entry.message, "Estimate"),
    });
  });

  if (quotes.length === 0) {
    return { error: firstErr ?? "Could not calculate Delhivery rate quotes." };
  }

  return { data: quotes };
}

/** List Delhivery One pickup requests within +/- 7 days (<= 15-day API window) */
export async function listPickupRequestsAction(): Promise<{
  data?: PickupRequestInfo[];
  error?: string;
}> {
  const now = new Date();
  const start = new Date(now.getTime() - 7 * 86400_000)
    .toISOString()
    .slice(0, 10);
  const end = new Date(now.getTime() + 7 * 86400_000).toISOString().slice(0, 10);

  const res = await safeMcpCall("list-pickup-requests", {
    search_on: ["pickup_id"],
    search_term: "",
    page: 1,
    page_size: 15,
    field: "pickup_start_time",
    direction: "DESC",
    filter_start_date: start,
    filter_end_date: end,
  });

  if (!res.data) {
    return { error: res.error ?? "Unable to list pickup requests" };
  }
  if (res.data.error_code && res.data.message) {
    return { error: str(res.data.translated_message || res.data.message) };
  }

  const rawList: unknown[] = Array.isArray(res.data.results)
    ? res.data.results
    : [];
  const items: PickupRequestInfo[] = rawList
    .map((row: unknown): PickupRequestInfo | null => {
      const r = asRecord(row);
      if (!r) return null;
      return {
        pickup_id: str(r.pickup_id),
        pickup_location_name: str(r.pickup_location_name, "Kraftman Warehouse"),
        pincode: str(r.pincode),
        status: str(r.status, "open"),
        pickup_start_time: str(r.pickup_start_time),
        pickup_end_time: str(r.pickup_end_time),
        expected_packages_count: num(r.expected_packages_count),
        total_packages_count: num(r.total_packages_count),
        nsl_remark: r.nsl_remark ? str(r.nsl_remark) : null,
      };
    })
    .filter(
      (x: PickupRequestInfo | null): x is PickupRequestInfo =>
        x !== null && Boolean(x.pickup_id)
    );

  return { data: items };
}

/** Schedule a Delhivery courier pickup request for manifested AWBs */
export async function schedulePickupAction(
  input: SchedulePickupInput
): Promise<{
  data?: { pickupId: string; status: string; locationName: string };
  error?: string;
}> {
  const parsed = schedulePickupSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid pickup input" };
  }

  const v = parsed.data;
  const startTime =
    v.start_time.length === 5 ? `${v.start_time}:00` : v.start_time;
  const endTime = v.end_time.length === 5 ? `${v.end_time}:00` : v.end_time;

  const res = await safeMcpCall("create-pickup-request", {
    facility_id: v.facility_id,
    pickup_date: v.pickup_date,
    start_time: startTime,
    end_time: endTime,
    awb_number: v.awb_numbers,
    expected_package_count: v.expected_package_count,
    ...(v.pincode ? { pincode: v.pincode } : {}),
    ...(v.facility_code ? { facility_code: v.facility_code } : {}),
  });

  if (!res.data) {
    return { error: res.error ?? "Failed to create pickup request." };
  }
  if (res.data.error_code && res.data.message) {
    return { error: str(res.data.translated_message || res.data.message) };
  }

  const pickupId = str(res.data.pickup_id);
  if (!pickupId) {
    return { error: "Delhivery One did not return a Pickup Request ID." };
  }

  revalidatePath("/");
  return {
    data: {
      pickupId,
      status: str(res.data.status, "scheduled"),
      locationName: str(res.data.pickup_location_name, "Kraftman Warehouse"),
    },
  };
}

/** Resolve a Delhivery One exception bucket CTA */
export async function resolveExceptionAction(input: {
  exception_id: string;
  actionable_id: string;
  bucket_id: string;
  waybill?: string;
}): Promise<{ data?: { ok: boolean }; error?: string }> {
  const res = await safeMcpCall("update-exceptions", input);
  if (!res.data) {
    return { error: res.error ?? "Failed to update exception" };
  }
  if (res.data.error_code && res.data.message) {
    return { error: str(res.data.translated_message || res.data.message) };
  }
  revalidatePath("/");
  return { data: { ok: true } };
}

/** Optional live exception queue fetch from Delhivery One */
export async function listDelhiveryExceptionsAction(): Promise<{
  data?: DelhiveryExceptionItem[];
  note?: string;
}> {
  const res = await safeMcpCall("list-exceptions", {
    bucket: ["EB01", "EB05", "EB10", "EB11", "EB20", "EB23", "EB24"],
    status: ["OPEN", "OVERDUE"],
    action: "NEED_ACTION",
    field: "sla",
    direction: "DESC",
    op: "GTE",
    value: "0",
    range_dispatch_count_op: "EQ",
    range_dispatch_count_value: 1,
    page: 1,
    page_size: 20,
  });

  if (!res.data || res.data.error_code) {
    return {
      data: [],
      note: str(
        res.data?.translated_message || res.data?.message || res.error,
        "Showing Kraftman local NDR & RTO queue."
      ),
    };
  }

  const rows: unknown[] = Array.isArray(res.data.results) ? res.data.results : [];
  const mapped: DelhiveryExceptionItem[] = rows
    .map((item: unknown): DelhiveryExceptionItem | null => {
      const r = asRecord(item);
      if (!r) return null;
      const rawCtas: unknown[] = Array.isArray(r.cta_list) ? r.cta_list : [];
      const ctas = rawCtas
        .map((c) => asRecord(c))
        .filter((c): c is Record<string, unknown> => c !== null)
        .map((c) => ({
          actionable_id: str(c.actionable_id),
          bucket_id: str(c.bucket_id),
          label: str(c.label || c.name || "Take Action"),
        }));
      return {
        exception_id: str(r.exception_id || r.id),
        awb: str(r.awb || r.waybill),
        bucket: str(r.bucket_name || r.bucket),
        status: str(r.status, "OPEN"),
        reason: str(r.nsl_remark || r.exception_reason || "Action needed"),
        cta_list: ctas,
      };
    })
    .filter(
      (x: DelhiveryExceptionItem | null): x is DelhiveryExceptionItem =>
        x !== null && Boolean(x.awb)
    );

  return { data: mapped };
}

/** Force-refresh live Delhivery One prepaid wallet balance */
export async function refreshWalletAction(): Promise<{
  data?: WalletSummary;
  error?: string;
}> {
  const wallet = await getWalletDetailsCached(true);
  if (!wallet) {
    return { error: "Could not load Delhivery One wallet balance." };
  }
  return { data: wallet };
}
