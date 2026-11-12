"use client";

import type { OrderWithShipment, ProductPreset } from "@/lib/db/types";
import {
  cn,
  deriveTransitInsights,
  formatINR,
  formatPhoneDisplay,
  getDelhiveryTrackingUrl,
} from "@/lib/utils";
import { CallButton } from "@/components/shared/call-button";
import { CopyButton } from "@/components/shared/copy-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { WhatsAppButton } from "@/components/shared/whatsapp-button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ExternalLink,
  Loader2,
  MapPin,
  Navigation,
  Printer,
  Zap,
} from "lucide-react";

interface OrderCardProps {
  order: OrderWithShipment;
  selected: boolean;
  defaultProduct?: ProductPreset | null;
  quickShipPending?: boolean;
  onQuickShip?: (order: OrderWithShipment) => void;
  onToggleSelect: (orderId: string) => void;
  onOpenDetail: (order: OrderWithShipment) => void;
}

export function OrderCard({
  order,
  selected,
  defaultProduct,
  quickShipPending = false,
  onQuickShip,
  onToggleSelect,
  onOpenDetail,
}: OrderCardProps) {
  const isOfd = Boolean(
    order.latest_tracking_status?.toLowerCase().includes("out for delivery") ||
      order.latest_tracking_status?.toLowerCase().includes("dispatched")
  );

  return (
    <article
      onClick={() => onOpenDetail(order)}
      className={cn(
        "rounded-xl border bg-white p-3.5 shadow-2xs transition-colors active:bg-slate-50/70 cursor-pointer",
        selected ? "border-blue-500 ring-1 ring-blue-500/30" : "border-slate-200"
      )}
    >
      {/* Top Row: Checkbox + Order ID + Status Badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center justify-center"
          >
            <Checkbox
              checked={selected}
              onCheckedChange={() => onToggleSelect(order.id)}
              aria-label={`Select order ${order.order_number}`}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-slate-900">
                {order.order_number}
              </span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                  order.payment_method === "COD"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-slate-100 text-slate-700"
                )}
              >
                {order.payment_method} {formatINR(order.total_amount)}
              </span>
            </div>
            <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">
              {order.customer_name}
            </p>
            <p className="font-mono text-[11px] font-medium text-slate-600">
              {(() => {
                const ph = formatPhoneDisplay(order.customer_phone);
                return ph.text || "No phone";
              })()}
              {order.item_description ? (
                <span className="font-sans text-slate-400">
                  {" "}
                  · {order.item_description}
                </span>
              ) : null}
            </p>
          </div>
        </div>

        <StatusBadge
          status={order.status}
          isOfd={isOfd}
          isRto={order.is_rto}
        />
      </div>

      {/* Middle Row: Full Customer Address, City, State, PIN & Rich Tracking Info */}
      <div className="mt-2.5 space-y-1.5">
        <div className="flex items-start gap-1.5 text-xs text-slate-600">
          <MapPin className="mt-0.5 h-3.5 w-3.5 text-slate-400 shrink-0" />
          <div className="min-w-0">
            <p className="line-clamp-2 leading-snug text-slate-700">
              {order.address}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {[order.city, order.state].filter(Boolean).join(", ")}{" "}
              <strong className="font-mono text-slate-800">{order.pincode}</strong>
            </p>
          </div>
        </div>

        {order.awb_number && (() => {
          const insights = deriveTransitInsights(
            order.tracking_scans,
            order.status,
            order.latest_tracking_status
          );
          return (
            <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-1.5 text-[11px] text-slate-600">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 font-medium text-slate-800 truncate">
                  <Navigation className="h-3 w-3 shrink-0 text-[#D9232A]" />
                  <span className="truncate">{insights.currentLocation}</span>
                </span>
                <span className="shrink-0 font-mono text-[10px] text-slate-500">
                  {insights.lastScanRelative || insights.lastScanTime}
                  {insights.checkpointCount > 0 ? ` · ${insights.checkpointCount} scans` : ""}
                </span>
              </div>
              {insights.latestInstruction && (
                <p className="mt-0.5 truncate text-[10px] text-slate-500">
                  {insights.latestInstruction}
                </p>
              )}
            </div>
          );
        })()}
      </div>

      {/* Footer Quick Actions (All >= 44x44px) */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <CallButton
            phone={order.customer_phone}
            customerName={order.customer_name}
          />

          <WhatsAppButton order={order} />

          {order.awb_number ? (
            <CopyButton
              value={order.awb_number}
              label={order.awb_number}
              toastText={`Copied AWB ${order.awb_number}`}
            />
          ) : (
            <span className="inline-flex min-h-11 items-center rounded-lg border border-dashed border-amber-300 bg-amber-50/70 px-2.5 text-xs font-medium text-amber-800">
              Needs AWB
            </span>
          )}
        </div>

        {order.awb_number ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href={getDelhiveryTrackingUrl(order.awb_number)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Open Delhivery tracking for ${order.order_number}`}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <a
              href={`/api/labels?wbns=${encodeURIComponent(order.awb_number)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Print label for ${order.order_number}`}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              <Printer className="h-4 w-4" />
            </a>
          </div>
        ) : defaultProduct && onQuickShip ? (
          <button
            type="button"
            disabled={quickShipPending}
            onClick={(e) => {
              e.stopPropagation();
              onQuickShip(order);
            }}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
          >
            {quickShipPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            <span>1-Click Ship</span>
          </button>
        ) : (
          <span className="text-xs font-medium text-blue-600 pr-1">
            Tap to Manifest →
          </span>
        )}
      </div>
    </article>
  );
}

