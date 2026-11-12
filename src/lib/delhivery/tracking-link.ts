import type { OrderWithShipment } from "@/lib/db/types";

/**
 * Official customer-facing Delhivery live tracking page for an AWB.
 */
export function getDelhiveryTrackingUrl(awb: string): string {
  return `https://www.delhivery.com/track-v2/package/${encodeURIComponent(awb.trim())}`;
}

/**
 * Extracts a clean Indian WhatsApp E.164 digits string ("91XXXXXXXXXX")
 * or returns null when the stored phone is masked (e.g. "+91XXXXXX3479").
 */
export function getWhatsAppDialNumber(phone?: string | null): string | null {
  if (!phone || /[x*]/i.test(phone)) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits || /^0+$/.test(digits) || digits === "910000000000") return null;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

/**
 * Builds a concise, customer-ready WhatsApp status message containing order ID,
 * shipment state, AWB, latest scan info, COD notice (if any), and tracking link.
 */
export function buildWhatsAppStatusMessage(order: OrderWithShipment): string {
  const firstName = order.customer_name.split(/\s+/)[0] || "Customer";
  const statusLine = order.latest_tracking_status || order.status;
  const latestScan = order.tracking_scans?.[0];
  const lines: string[] = [
    `Hi ${firstName},`,
    ``,
    `Update for your Order *#${order.order_number}*:`,
    `Status: *${statusLine}*`,
  ];

  if (order.awb_number) {
    lines.push(`Courier: Delhivery (AWB: \`${order.awb_number}\`)`);
  }

  if (latestScan?.ScannedLocation) {
    lines.push(`Location: ${latestScan.ScannedLocation}`);
  }

  if (order.payment_method === "COD" && order.total_amount > 0 && order.status !== "Delivered") {
    lines.push(`COD Amount Due: Rs. ${Math.round(order.total_amount)}`);
  }

  if (order.awb_number) {
    lines.push(``);
    lines.push(`Track live here: ${getDelhiveryTrackingUrl(order.awb_number)}`);
  }

  return lines.join("\n");
}

/**
 * Builds a wa.me deep link that pre-fills the message directly to the customer's number
 * (or opens WhatsApp contact picker if the phone number from courier is masked).
 */
export function buildWhatsAppStatusUrl(order: OrderWithShipment): string {
  const dialNumber = getWhatsAppDialNumber(order.customer_phone);
  const text = encodeURIComponent(buildWhatsAppStatusMessage(order));
  return dialNumber
    ? `https://wa.me/${dialNumber}?text=${text}`
    : `https://wa.me/?text=${text}`;
}

