import { NextRequest } from "next/server";
import { listOrdersWithShipments } from "@/lib/db/queries";
import { getDelhiveryTrackingUrl } from "@/lib/delhivery/tracking-link";

export const maxDuration = 30;

function csvCell(value: unknown): string {
  const str = String(value ?? "");
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: NextRequest) {
  const filter = request.nextUrl.searchParams.get("filter") ?? undefined;
  const q = request.nextUrl.searchParams.get("q") ?? undefined;
  const wbnsParam = request.nextUrl.searchParams.get("wbns")?.trim();
  const requestedAwbs = wbnsParam
    ? new Set(
        wbnsParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      )
    : null;

  const { orders } = await listOrdersWithShipments({ filter, q });

  const rows = orders.filter((o) => {
    if (!o.awb_number) return false;
    if (requestedAwbs && !requestedAwbs.has(o.awb_number)) return false;
    return true;
  });

  const headers = [
    "Order Number",
    "AWB Number",
    "Status",
    "Latest Scan",
    "Customer Name",
    "Phone",
    "City",
    "State",
    "PIN Code",
    "Payment Method",
    "Amount (INR)",
    "Weight (g)",
    "Dimensions (cm)",
    "Delhivery Tracking Link",
    "Label PDF URL",
  ];

  const origin = request.nextUrl.origin;
  const lines = [headers.map(csvCell).join(",")];

  for (const o of rows) {
    const awb = o.awb_number ?? "";
    const dims =
      o.length_cm && o.width_cm && o.height_cm
        ? `${o.length_cm}x${o.width_cm}x${o.height_cm}`
        : "";
    const trackUrl = awb ? getDelhiveryTrackingUrl(awb) : "";
    const labelUrl = awb ? `${origin}/api/labels?wbns=${encodeURIComponent(awb)}` : "";

    lines.push(
      [
        o.order_number,
        awb,
        o.status,
        o.latest_tracking_status ?? "",
        o.customer_name,
        o.customer_phone,
        o.city,
        o.state,
        o.pincode,
        o.payment_method,
        o.total_amount,
        o.weight_grams ?? "",
        dims,
        trackUrl,
        labelUrl,
      ]
        .map(csvCell)
        .join(",")
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(lines.join("\r\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="delhivery-awbs-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

