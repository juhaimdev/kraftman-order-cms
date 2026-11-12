"use client";

import { MessageCircle } from "lucide-react";
import type { OrderWithShipment } from "@/lib/db/types";
import { buildWhatsAppStatusUrl } from "@/lib/delhivery/tracking-link";
import { cn } from "@/lib/utils";

interface WhatsAppButtonProps {
  order: OrderWithShipment;
  label?: string;
  className?: string;
}

export function WhatsAppButton({
  order,
  label,
  className,
}: WhatsAppButtonProps) {
  const href = buildWhatsAppStatusUrl(order);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      aria-label={`Send WhatsApp update to ${order.customer_name}`}
      title="Send 1-click WhatsApp status update with tracking link"
      className={cn(
        "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 active:scale-[0.98]",
        className
      )}
    >
      <MessageCircle className="h-4 w-4 shrink-0" />
      {label && <span>{label}</span>}
    </a>
  );
}

