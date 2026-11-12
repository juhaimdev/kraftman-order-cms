import type { OrderStatus, PaymentMethod, TrackingScan } from "@/lib/db/types";
import type { DelhiveryTrackingShipment } from "./types";

export function normalizeDelhiveryStatus(
  status?: string,
  statusType?: string,
  instructions?: string
): { appStatus: OrderStatus; isRto: boolean; latestLabel: string } {
  const s = (status ?? "").trim();
  const t = (statusType ?? "").trim().toUpperCase();
  const instr = (instructions ?? "").trim();
  const combined = `${s} ${instr}`.toLowerCase();

  if (
    t === "RT" ||
    s.toLowerCase().includes("rto") ||
    s.toLowerCase().includes("returned")
  ) {
    return {
      appStatus: "NDR",
      isRto: true,
      latestLabel: instr ? `${s} - ${instr}` : s || "RTO",
    };
  }

  if (
    t === "NDR" ||
    s.toUpperCase() === "UD" ||
    combined.includes("undelivered")
  ) {
    return {
      appStatus: "NDR",
      isRto: false,
      latestLabel: instr ? `Undelivered - ${instr}` : "Undelivered - NDR",
    };
  }

  if (s.toLowerCase() === "delivered" || t === "DL") {
    return {
      appStatus: "Delivered",
      isRto: false,
      latestLabel: "Delivered",
    };
  }

  if (s.toLowerCase() === "manifested") {
    return {
      appStatus: "Manifested",
      isRto: false,
      latestLabel: "Manifested",
    };
  }

  if (
    s.toLowerCase() === "dispatched" ||
    combined.includes("out for delivery")
  ) {
    return {
      appStatus: "In Transit",
      isRto: false,
      latestLabel: "Out for Delivery",
    };
  }

  return {
    appStatus: "In Transit",
    isRto: false,
    latestLabel: s || "In Transit",
  };
}

export function extractDelhiveryScans(
  scans?: DelhiveryTrackingShipment["Scans"]
): TrackingScan[] {
  return (scans ?? [])
    .map((item) => item.ScanDetail)
    .filter((d): d is NonNullable<typeof d> => Boolean(d))
    .map((d) => ({
      ScanDateTime: d.ScanDateTime ?? d.ScanTime ?? "",
      ScanType: d.ScanType ?? "",
      Scan: d.Scan ?? "",
      Instructions: d.Instructions ?? "",
      ScannedLocation: d.ScannedLocation ?? "",
    }));
}

function cleanPhone(raw?: string[] | string): string {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = (first ?? "").trim();
  if (!trimmed) return "";
  if (/[xX*]/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, "").slice(-10);
  if (digits.length === 10 && !/^0+$/.test(digits)) return digits;
  return "";
}

function cleanPincode(raw?: number | string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length === 6 ? digits : "000000";
}

function parseAmount(raw?: number | string): number {
  const num = Number(raw);
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

function parseWeightGrams(shipment: DelhiveryTrackingShipment): number {
  const raw = Number(shipment.Weight ?? shipment.ChargedWeight ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 500;
  // Delhivery ChargedWeight is typically in kg when < 50 (e.g., "0.50")
  if (shipment.Weight === undefined && raw < 50) {
    return Math.max(1, Math.round(raw * 1000));
  }
  return Math.max(1, Math.round(raw));
}

function asText(val: unknown): string {
  if (Array.isArray(val)) {
    return val.map((v) => String(v ?? "").trim()).filter(Boolean).join(", ");
  }
  return String(val ?? "").trim();
}

export function extractOrderAndShipment(s: DelhiveryTrackingShipment) {
  const { appStatus, isRto, latestLabel } = normalizeDelhiveryStatus(
    s.Status?.Status,
    s.Status?.StatusType,
    s.Status?.Instructions || s.Status?.Remarks || s.Status?.SubStatus
  );

  const codAmt = parseAmount(s.CODAmount);
  const invAmt = parseAmount(s.InvoiceAmount);
  const isCod =
    (s.OrderType ?? "").toUpperCase() === "COD" || codAmt > 0;
  const paymentMethod: PaymentMethod = isCod ? "COD" : "Prepaid";
  const totalAmount = invAmt > 0 ? invAmt : codAmt;

  const consignee = s.Consignee ?? {};
  const addressParts = [
    asText(consignee.Address1),
    asText(consignee.Address2),
    asText(consignee.Address3),
  ].filter(Boolean);

  const createdRaw = s.PickUpDate || s.PickedupDate || s.Status?.StatusDateTime;
  const createdAt =
    createdRaw && !Number.isNaN(Date.parse(createdRaw))
      ? new Date(createdRaw).toISOString().replace("T", " ").slice(0, 19)
      : new Date().toISOString().replace("T", " ").slice(0, 19);

  return {
    awb: asText(s.AWB),
    orderNumber: asText(s.ReferenceNo) || `DLV-${asText(s.AWB)}`,
    customerName: asText(consignee.Name) || "Consignee",
    customerPhone: cleanPhone(consignee.Telephone1 ?? consignee.Telephone2),
    address: addressParts.join(", ") || asText(s.Destination) || "Address via Delhivery",
    city: asText(consignee.City) || asText(s.Destination),
    state: asText(consignee.State),
    pincode: cleanPincode(consignee.PinCode),
    paymentMethod,
    totalAmount,
    status: appStatus,
    isRto,
    latestLabel,
    weightGrams: parseWeightGrams(s),
    scans: extractDelhiveryScans(s.Scans),
    createdAt,
  };
}

