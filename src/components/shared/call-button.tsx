"use client";

import { Phone } from "lucide-react";
import { cn, formatPhoneDisplay, normalizeTelHref } from "@/lib/utils";

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
  const info = formatPhoneDisplay(phone);

  if (!info.isValid) {
    return (
      <span
        onClick={(e) => e.stopPropagation()}
        title={
          info.isMasked
            ? "Middle digits masked by Delhivery PII policy — click Edit to enter full number"
            : "Customer mobile number not available — click Edit to add"
        }
        className={cn(
          "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-600",
          !showNumber && !info.text && "px-0",
          className
        )}
      >
        <Phone className="h-4 w-4 text-slate-400 shrink-0" />
        {(showNumber || info.isMasked) && (
          <span className="font-mono text-[11px]">
            {info.text || "Add Phone"}
          </span>
        )}
      </span>
    );
  }

  return (
    <a
      href={normalizeTelHref(phone)}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Call ${customerName} (${info.text})`}
      title={`Call ${customerName} (${info.text})`}
      className={cn(
        "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98]",
        !showNumber && "px-0",
        className
      )}
    >
      <Phone className="h-4 w-4 text-emerald-600 shrink-0" />
      {showNumber && <span className="font-mono">{info.text}</span>}
    </a>
  );
}
