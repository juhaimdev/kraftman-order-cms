"use client";

import { Phone } from "lucide-react";
import { cn, normalizeTelHref } from "@/lib/utils";

interface CallButtonProps {
  phone: string;
  customerName: string;
  showNumber?: boolean;
  className?: string;
}

export function CallButton({
  phone,
  customerName,
  showNumber = false,
  className,
}: CallButtonProps) {
  const digits = phone.replace(/\D/g, "");
  const isMaskedOrMissing = /[xX*]/.test(phone) || digits.length < 10;

  if (isMaskedOrMissing) {
    return (
      <span
        onClick={(e) => e.stopPropagation()}
        title="Phone number masked by Delhivery PII policy"
        className={cn(
          "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-400",
          !showNumber && "px-0",
          className
        )}
      >
        <Phone className="h-4 w-4 text-slate-400 shrink-0" />
        {showNumber && <span className="font-mono">{phone || "Masked"}</span>}
      </span>
    );
  }

  return (
    <a
      href={normalizeTelHref(phone)}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Call ${customerName} (${phone})`}
      className={cn(
        "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98]",
        !showNumber && "px-0",
        className
      )}
    >
      <Phone className="h-4 w-4 text-emerald-600 shrink-0" />
      {showNumber && <span className="font-mono">{phone}</span>}
    </a>
  );
}
