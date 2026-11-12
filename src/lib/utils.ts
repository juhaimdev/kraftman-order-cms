import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { OrderStatus, TrackingScan } from "@/lib/db/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatWalletINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDateTime(isoOrSqliteDate: string | null | undefined): string {
  if (!isoOrSqliteDate) return "—";
  const normalized = isoOrSqliteDate.includes("T")
    ? isoOrSqliteDate
    : isoOrSqliteDate.replace(" ", "T") + "Z";
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return isoOrSqliteDate;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatRelativeTime(isoOrSqliteDate: string | null | undefined): string {
  if (!isoOrSqliteDate) return "";
  const normalized = isoOrSqliteDate.includes("T")
    ? isoOrSqliteDate
    : isoOrSqliteDate.replace(" ", "T") + "Z";
  const ts = Date.parse(normalized);
  if (Number.isNaN(ts)) return "";
  const diffMins = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

export function normalizeTelHref(phone: string): string {
  const digits = phone.replace(/\D/g, "").slice(-10);
  return `tel:+91${digits}`;
}

export function getDelhiveryTrackingUrl(awb: string): string {
  return `https://www.delhivery.com/track-v2/package/${encodeURIComponent(awb.trim())}`;
}

export interface TransitInsights {
  stageIndex: number; // 0: Manifested, 1: In Transit, 2: Out for Delivery, 3: Delivered
  originLocation: string;
  currentLocation: string;
  lastScanTime: string;
  lastScanRelative: string;
  latestInstruction: string;
  checkpointCount: number;
  transitDurationLabel: string;
}

export function deriveTransitInsights(
  scans: TrackingScan[],
  status: OrderStatus,
  latestStatus?: string | null
): TransitInsights {
  const latestScan = scans[0];
  const firstScan = scans[scans.length - 1];

  let stageIndex = 0;
  const lower = (latestStatus ?? "").toLowerCase();
  if (status === "Delivered") stageIndex = 3;
  else if (lower.includes("out for delivery") || lower.includes("dispatched"))
    stageIndex = 2;
  else if (status === "In Transit" || status === "NDR" || scans.length > 1)
    stageIndex = 1;

  let transitDurationLabel = "—";
  if (firstScan?.ScanDateTime && latestScan?.ScanDateTime && scans.length > 1) {
    const startTs = Date.parse(firstScan.ScanDateTime);
    const endTs = Date.parse(latestScan.ScanDateTime);
    if (!Number.isNaN(startTs) && !Number.isNaN(endTs) && endTs >= startTs) {
      const hours = Math.round((endTs - startTs) / 3_600_000);
      transitDurationLabel =
        hours < 24
          ? `${Math.max(1, hours)}h`
          : `${Math.floor(hours / 24)}d ${hours % 24}h`;
    }
  }

  return {
    stageIndex,
    originLocation: firstScan?.ScannedLocation || "Origin Warehouse",
    currentLocation: latestScan?.ScannedLocation || "Awaiting first scan",
    lastScanTime: latestScan?.ScanDateTime ? formatDateTime(latestScan.ScanDateTime) : "—",
    lastScanRelative: latestScan?.ScanDateTime
      ? formatRelativeTime(latestScan.ScanDateTime)
      : "",
    latestInstruction: latestScan?.Instructions || "",
    checkpointCount: scans.length,
    transitDurationLabel,
  };
}
