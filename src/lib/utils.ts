import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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

export function normalizeTelHref(phone: string): string {
  const digits = phone.replace(/\D/g, "").slice(-10);
  return `tel:+91${digits}`;
}

export function getDelhiveryTrackingUrl(awb: string): string {
  return `https://www.delhivery.com/track-v2/package/${encodeURIComponent(awb.trim())}`;
}

