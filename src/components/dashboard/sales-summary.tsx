"use client";

import * as React from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CreditCard,
  IndianRupee,
  MapPin,
  Wallet,
} from "lucide-react";
import type {
  OrderWithShipment,
  SalesSummary,
  WalletSummary,
} from "@/lib/db/types";
import { cn, formatINR, formatWalletINR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { FilterKey } from "./quick-filters";

interface SalesSummarySectionProps {
  sales: SalesSummary;
  wallet?: WalletSummary | null;
  visibleOrders: OrderWithShipment[];
  isFiltered: boolean;
  onSelectFilter: (filter: FilterKey) => void;
  onRefreshWallet?: () => void;
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export function SalesSummarySection({
  sales,
  wallet,
  visibleOrders,
  isFiltered,
  onSelectFilter,
  onRefreshWallet,
}: SalesSummarySectionProps) {
  const [open, setOpen] = React.useState(false);

  const codPct = pct(sales.cod_revenue, sales.total_revenue);
  const prepaidPct = sales.total_revenue > 0 ? 100 - codPct : 0;

  const filteredRevenue = React.useMemo(
    () => visibleOrders.reduce((acc, o) => acc + o.total_amount, 0),
    [visibleOrders]
  );

  const stageRows = [
    {
      label: "Delivered",
      count: sales.delivered_count,
      revenue: sales.delivered_revenue,
      barClass: "bg-emerald-500",
    },
    {
      label: "In Transit",
      count: sales.in_transit_count,
      revenue: sales.in_transit_revenue,
      barClass: "bg-indigo-500",
    },
    {
      label: "Manifested",
      count: sales.manifested_count,
      revenue: sales.manifested_revenue,
      barClass: "bg-blue-500",
    },
    {
      label: "Unfulfilled",
      count: sales.unfulfilled_count,
      revenue: sales.unfulfilled_revenue,
      barClass: "bg-amber-500",
    },
    {
      label: "NDR / At Risk",
      count: sales.ndr_count,
      revenue: sales.ndr_revenue,
      barClass: "bg-red-500",
    },
  ];

  return (
    <section aria-label="Total sales summary" className="space-y-2.5">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Total Sales Overview
          </h2>
          {isFiltered && (
            <span className="rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-[11px] font-medium text-blue-700">
              View: {formatINR(filteredRevenue)} ({visibleOrders.length})
            </span>
          )}
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="text-xs">
              <BarChart3 className="h-3.5 w-3.5 text-blue-600" />
              <span>Sales Details</span>
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Total Sales & Revenue Breakdown</DialogTitle>
              <DialogDescription>
                Real-time aggregate metrics across all {sales.total_orders} orders in Supabase.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              {/* Top Stats */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <p className="text-[11px] font-medium text-slate-500">Gross Sales</p>
                  <p className="mt-1 font-mono text-base font-bold text-slate-900">
                    {formatINR(sales.total_revenue)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <p className="text-[11px] font-medium text-slate-500">Orders</p>
                  <p className="mt-1 font-mono text-base font-bold text-slate-900">
                    {sales.total_orders}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <p className="text-[11px] font-medium text-slate-500">Avg Order</p>
                  <p className="mt-1 font-mono text-base font-bold text-slate-900">
                    {formatINR(sales.avg_order_value)}
                  </p>
                </div>
              </div>

              {/* Payment Mix */}
              <div className="space-y-2 rounded-xl border border-slate-200 p-3.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>Payment Mix (COD vs Prepaid)</span>
                  <span className="font-mono text-slate-500">
                    {codPct}% COD · {prepaidPct}% Prepaid
                  </span>
                </div>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="bg-amber-500 transition-all"
                    style={{ width: `${codPct}%` }}
                  />
                  <div
                    className="bg-emerald-500 transition-all"
                    style={{ width: `${prepaidPct}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
                  <div className="flex items-center justify-between rounded-lg bg-amber-50 px-2.5 py-2 text-amber-950">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <Wallet className="h-3.5 w-3.5 text-amber-600" />
                      COD ({sales.cod_count})
                    </span>
                    <span className="font-mono font-bold">
                      {formatINR(sales.cod_revenue)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-2.5 py-2 text-emerald-950">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <CreditCard className="h-3.5 w-3.5 text-emerald-600" />
                      Prepaid ({sales.prepaid_count})
                    </span>
                    <span className="font-mono font-bold">
                      {formatINR(sales.prepaid_revenue)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Sales by Fulfillment Stage */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Revenue by Shipping Stage
                </h3>
                <div className="space-y-2">
                  {stageRows.map((row) => {
                    const share = pct(row.revenue, sales.total_revenue);
                    return (
                      <div key={row.label} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-700">
                            {row.label}{" "}
                            <span className="text-slate-400">({row.count})</span>
                          </span>
                          <span className="font-mono font-semibold text-slate-900">
                            {formatINR(row.revenue)}{" "}
                            <span className="text-[11px] font-normal text-slate-400">
                              ({share}%)
                            </span>
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={cn("h-full rounded-full", row.barClass)}
                            style={{ width: `${share}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Top Cities */}
              {sales.top_cities.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Top Cities by Sales
                  </h3>
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {sales.top_cities.map((item) => (
                      <div
                        key={item.city}
                        className="flex items-center justify-between px-3 py-2 text-xs"
                      >
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                          <MapPin className="h-3.5 w-3.5 text-slate-400" />
                          {item.city}
                          <span className="text-slate-400">
                            ({item.order_count} order{item.order_count === 1 ? "" : "s"})
                          </span>
                        </span>
                        <span className="font-mono font-semibold text-slate-900">
                          {formatINR(item.revenue)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Responsive KPI Cards: Delhivery Wallet + Sales Metrics */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-5">
        {/* Featured Card 1: Delhivery One Wallet Balance */}
        <button
          type="button"
          onClick={onRefreshWallet}
          className="col-span-2 md:col-span-1 rounded-2xl border border-slate-900 bg-gradient-to-br from-slate-950 via-slate-900 to-[#5b1015] p-3.5 text-left text-white shadow-sm transition-opacity hover:opacity-95 cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-300">
            <span>Delhivery Wallet</span>
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-white/10">
              <CreditCard className="h-3.5 w-3.5 text-[#ff6b72]" />
            </span>
          </div>
          <p className="mt-1 font-mono text-xl font-bold tracking-tight text-white">
            {wallet ? formatWalletINR(wallet.current_balance) : "Tap to load ₹"}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-300">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                wallet
                  ? wallet.current_balance < 200
                    ? "bg-amber-400"
                    : "bg-emerald-400"
                  : "bg-slate-500"
              )}
            />
            <span>
              {wallet
                ? `${wallet.is_active ? "Active" : "Paused"}${wallet.payment_gateway ? ` · ${wallet.payment_gateway}` : ""} · Tap to refresh`
                : "Tap here to refresh wallet balance"}
            </span>
          </p>
        </button>

        {/* Card 2: Total Sales */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Total Sales</span>
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100">
              <IndianRupee className="h-3.5 w-3.5 text-slate-700" />
            </span>
          </div>
          <p className="mt-1 font-mono text-lg font-bold tracking-tight text-slate-900">
            {formatINR(sales.total_revenue)}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {sales.total_orders} orders · AOV {formatINR(sales.avg_order_value)}
          </p>
        </div>

        {/* Card 3: COD vs Prepaid */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>COD / Prepaid</span>
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-amber-50">
              <Wallet className="h-3.5 w-3.5 text-amber-600" />
            </span>
          </div>
          <p className="mt-1 font-mono text-lg font-bold tracking-tight text-slate-900">
            {formatINR(sales.cod_revenue)}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className="bg-amber-500" style={{ width: `${codPct}%` }} />
              <div className="bg-emerald-500" style={{ width: `${prepaidPct}%` }} />
            </div>
            <span className="text-[10px] font-mono text-slate-500">
              {codPct}% COD
            </span>
          </div>
        </div>

        {/* Card 4: Delivered Revenue */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Delivered</span>
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-50">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            </span>
          </div>
          <p className="mt-1 font-mono text-lg font-bold tracking-tight text-emerald-700">
            {formatINR(sales.delivered_revenue)}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {sales.delivered_count} delivered · {formatINR(sales.in_pipeline_revenue)} active
          </p>
        </div>

        {/* Card 5: NDR At Risk (clickable shortcut to NDR filter) */}
        <button
          type="button"
          onClick={() => onSelectFilter("ndr")}
          className="min-h-11 rounded-2xl border border-red-200/90 bg-gradient-to-br from-white to-red-50/40 p-3.5 text-left shadow-2xs transition-colors hover:bg-red-50/70 cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs font-medium text-[#D9232A]">
            <span>NDR At Risk</span>
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-red-100/70">
              <AlertTriangle className="h-3.5 w-3.5 text-[#D9232A]" />
            </span>
          </div>
          <p className="mt-1 font-mono text-lg font-bold tracking-tight text-[#D9232A]">
            {formatINR(sales.ndr_revenue)}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {sales.ndr_count} exception{sales.ndr_count === 1 ? "" : "s"} · Tap to triage
          </p>
        </button>
      </div>
    </section>
  );
}

