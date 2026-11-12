"use client";

import * as React from "react";
import { ArrowUpDown, Download, ExternalLink, Loader2, Navigation, Printer, Zap } from "lucide-react";
import type { OrderWithShipment, ProductPreset } from "@/lib/db/types";
import {
  cn,
  deriveTransitInsights,
  formatDateTime,
  formatINR,
  formatPhoneDisplay,
  getDelhiveryTrackingUrl,
  getLabelUrl,
} from "@/lib/utils";
import { CallButton } from "@/components/shared/call-button";
import { CopyButton } from "@/components/shared/copy-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { WhatsAppButton } from "@/components/shared/whatsapp-button";
import { Checkbox } from "@/components/ui/checkbox";

type SortField = "created_at" | "order_number" | "total_amount" | "status";

interface OrdersTableProps {
  orders: OrderWithShipment[];
  selectedIds: Set<string>;
  activeOrderId: string | null;
  products?: ProductPreset[];
  quickShipPendingId?: string | null;
  onQuickShip?: (order: OrderWithShipment) => void;
  onToggleSelect: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onOpenDetail: (order: OrderWithShipment) => void;
}

export function OrdersTable({
  orders,
  selectedIds,
  activeOrderId,
  products = [],
  quickShipPendingId,
  onQuickShip,
  onToggleSelect,
  onToggleAll,
  onOpenDetail,
}: OrdersTableProps) {
  const [sortField, setSortField] = React.useState<SortField>("created_at");
  const [sortAsc, setSortAsc] = React.useState(false);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  }

  const sortedOrders = React.useMemo(() => {
    const copy = [...orders];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortField === "total_amount") {
        cmp = a.total_amount - b.total_amount;
      } else {
        cmp = String(a[sortField]).localeCompare(String(b[sortField]));
      }
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [orders, sortField, sortAsc]);

  const allSelected =
    orders.length > 0 && orders.every((o) => selectedIds.has(o.id));

  return (
    <div className="hidden md:block flex-1 min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="w-11 px-3 py-3">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) => onToggleAll(Boolean(v))}
                  aria-label="Select all visible orders"
                />
              </th>
              <th className="px-3 py-3">
                <button
                  type="button"
                  onClick={() => toggleSort("order_number")}
                  className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                >
                  <span>Order</span>
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="px-3 py-3">Customer</th>
              <th className="px-3 py-3">Destination</th>
              <th className="px-3 py-3">
                <button
                  type="button"
                  onClick={() => toggleSort("total_amount")}
                  className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                >
                  <span>Payment</span>
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="px-3 py-3">
                <button
                  type="button"
                  onClick={() => toggleSort("status")}
                  className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                >
                  <span>Status</span>
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="px-3 py-3">AWB & Latest Scan</th>
              <th className="px-3 py-3 text-right">Quick Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedOrders.map((order) => {
              const isSelected = selectedIds.has(order.id);
              const isActive = activeOrderId === order.id;
              const isOfd = Boolean(
                order.latest_tracking_status
                  ?.toLowerCase()
                  .includes("out for delivery") ||
                  order.latest_tracking_status
                    ?.toLowerCase()
                    .includes("dispatched")
              );

              const rowProduct =
                products.find((p) => p.id === order.product_id) ??
                products[0] ??
                null;

              return (
                <tr
                  key={order.id}
                  onClick={() => onOpenDetail(order)}
                  className={cn(
                    "transition-colors cursor-pointer hover:bg-slate-50/80",
                    isActive && "bg-blue-50/60 hover:bg-blue-50/80",
                    isSelected && !isActive && "bg-slate-50"
                  )}
                >
                  <td
                    className="px-3 py-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleSelect(order.id)}
                      aria-label={`Select order ${order.order_number}`}
                    />
                  </td>

                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="font-mono font-bold text-slate-900">
                      {order.order_number}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {formatDateTime(order.created_at)}
                    </div>
                  </td>

                  <td className="px-3 py-3 max-w-[200px]">
                    <div className="font-semibold text-slate-900 truncate">
                      {order.customer_name}
                    </div>
                    {(() => {
                      const ph = formatPhoneDisplay(order.customer_phone);
                      return (
                        <div className="font-mono text-xs text-slate-600">
                          {ph.text || (
                            <span className="font-sans text-[11px] text-amber-700">
                              Phone missing — Edit
                            </span>
                          )}
                        </div>
                      );
                    })()}
                    {order.item_description && (
                      <div className="mt-0.5 truncate text-[11px] text-slate-500">
                        {order.item_description}
                      </div>
                    )}
                  </td>

                  <td className="px-3 py-3 max-w-[240px]">
                    <div
                      className="line-clamp-2 text-xs leading-snug text-slate-700"
                      title={order.address}
                    >
                      {order.address}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {[order.city, order.state].filter(Boolean).join(", ") || "—"}{" "}
                      <span className="font-mono font-semibold text-slate-800">
                        {order.pincode}
                      </span>
                    </div>
                  </td>

                  <td className="px-3 py-3 whitespace-nowrap">
                    <span
                      className={cn(
                        "inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold",
                        order.payment_method === "COD"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-700"
                      )}
                    >
                      {order.payment_method}
                    </span>
                    <div className="mt-0.5 font-mono text-xs font-semibold text-slate-800">
                      {formatINR(order.total_amount)}
                    </div>
                  </td>

                  <td className="px-3 py-3 whitespace-nowrap">
                    <StatusBadge
                      status={order.status}
                      isOfd={isOfd}
                      isRto={order.is_rto}
                    />
                  </td>

                  <td
                    className="px-3 py-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {order.awb_number ? (
                      (() => {
                        const insights = deriveTransitInsights(
                          order.tracking_scans,
                          order.status,
                          order.latest_tracking_status
                        );
                        return (
                          <div className="space-y-1 max-w-[230px]">
                            <CopyButton
                              value={order.awb_number}
                              label={order.awb_number}
                              toastText={`Copied AWB ${order.awb_number}`}
                              className="min-h-8 h-8 px-2"
                            />
                            {order.latest_tracking_status && (
                              <div className="truncate text-[11px] font-medium text-slate-700">
                                {order.latest_tracking_status}
                              </div>
                            )}
                            <div className="flex items-center gap-1 text-[10px] text-slate-500">
                              <Navigation className="h-2.5 w-2.5 shrink-0 text-[#D9232A]" />
                              <span className="truncate">{insights.currentLocation}</span>
                              {insights.lastScanRelative && (
                                <span className="shrink-0 font-mono text-slate-400">
                                  · {insights.lastScanRelative}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <span className="text-xs text-slate-400">Pending AWB</span>
                    )}
                  </td>

                  <td
                    className="px-3 py-3 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <CallButton
                        phone={order.customer_phone}
                        customerName={order.customer_name}
                      />
                      <WhatsAppButton order={order} />
                      {order.awb_number ? (
                        <>
                          <a
                            href={getDelhiveryTrackingUrl(order.awb_number)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open Delhivery tracking for ${order.order_number}`}
                            title="Open Delhivery tracking link"
                            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                          <a
                            href={getLabelUrl(order.awb_number, { download: true })}
                            download
                            aria-label={`Download shipping label for ${order.order_number}`}
                            title="1-Click Download 4x6 Shipping Label PDF"
                            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                          <a
                            href={getLabelUrl(order.awb_number)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Print label for ${order.order_number}`}
                            title="Open Print View"
                            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          >
                            <Printer className="h-4 w-4" />
                          </a>
                        </>
                      ) : rowProduct && onQuickShip ? (
                        <button
                          type="button"
                          disabled={quickShipPendingId === order.id}
                          onClick={() => onQuickShip(order)}
                          title={`1-click manifest using ${rowProduct.name} (${rowProduct.weight_grams}g)`}
                          className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                        >
                          {quickShipPendingId === order.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Zap className="h-3.5 w-3.5" />
                          )}
                          <span>Ship</span>
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

