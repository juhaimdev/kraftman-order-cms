"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CreditCard,
  Database,
  IndianRupee,
  Loader2,
  Package,
  RefreshCw,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { getLiveSalesDashboardAction } from "@/actions/sales";
import type { ProductPreset, SalesDashboardData } from "@/lib/db/types";
import { cn, formatINR, formatWalletINR } from "@/lib/utils";
import { MobileNavBar } from "@/components/mobile/mobile-nav-bar";
import { RateCalculatorDialog } from "@/components/shared/rate-calculator-dialog";
import { Button } from "@/components/ui/button";
import {
  FulfillmentFunnelChart,
  PaymentSplitChart,
  RevenueTrendChart,
  TopDestinationsChart,
} from "./sales-charts";

interface SalesDashboardClientProps {
  initialData: SalesDashboardData;
  products: ProductPreset[];
}

export function SalesDashboardClient({
  initialData,
  products,
}: SalesDashboardClientProps) {
  const [data, setData] = React.useState<SalesDashboardData>(initialData);
  const [liveMode, setLiveMode] = React.useState(true);
  const [refreshPending, startRefresh] = React.useTransition();

  const refreshLive = React.useCallback((quiet = false) => {
    startRefresh(async () => {
      const res = await getLiveSalesDashboardAction(30);
      if (res.error) {
        if (!quiet) toast.error(res.error);
        return;
      }
      if (res.data) {
        setData(res.data);
        if (!quiet) toast.success("Live sales metrics refreshed");
      }
    });
  }, []);

  React.useEffect(() => {
    if (!liveMode) return;
    const timer = window.setInterval(() => {
      refreshLive(true);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [liveMode, refreshLive]);

  const { sales, counts, wallet } = data;
  const isLowBalance = wallet != null && wallet.current_balance < 200;

  const updatedLabel = React.useMemo(() => {
    const ts = Date.parse(data.updatedAt);
    if (Number.isNaN(ts)) return "Just now";
    return new Intl.DateTimeFormat("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(ts));
  }, [data.updatedAt]);

  return (
    <div className="min-h-dvh bg-slate-50 pb-24 md:pb-10">
      {/* Kraftman Sticky Header */}
      <header className="sticky top-0 z-30 border-t-[3px] border-t-[#D9232A] border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-2xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-slate-950 via-slate-900 to-[#D9232A] text-white shadow-sm">
              <BarChart3 className="h-5 w-5" />
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-extrabold tracking-tight text-slate-950">
                  KRAFTMAN
                </h1>
                <span className="rounded bg-[#D9232A] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                  LIVE SALES
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-500">
                Revenue &amp; Courier Analytics · Updated {updatedLabel}
              </p>
            </div>
          </div>

          {/* Desktop Route Tabs */}
          <nav
            aria-label="Primary dashboard sections"
            className="hidden md:flex items-center gap-1 rounded-xl bg-slate-100 p-1"
          >
            <Link
              href="/"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-slate-600 transition-colors hover:text-slate-950"
            >
              <Package className="h-3.5 w-3.5" />
              <span>Orders</span>
            </Link>
            <Link
              href="/sales"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-[#D9232A] shadow-2xs"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span>Sales &amp; Graphs</span>
            </Link>
          </nav>

          {/* Header Controls */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => refreshLive(false)}
              disabled={refreshPending}
              className={cn(
                "inline-flex min-h-10 sm:min-h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold cursor-pointer",
                isLowBalance
                  ? "border-amber-300 bg-amber-50 text-amber-900"
                  : wallet
                    ? "border-emerald-200 bg-emerald-50/90 text-emerald-900"
                    : "border-slate-200 bg-slate-100 text-slate-700"
              )}
            >
              <Wallet className="h-3.5 w-3.5 text-emerald-600" />
              <span className="font-mono font-bold">
                {wallet ? formatWalletINR(wallet.current_balance) : "Load ₹"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setLiveMode((v) => !v)}
              title="Toggle 30-second live auto-refresh"
              className={cn(
                "inline-flex min-h-10 sm:min-h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold cursor-pointer transition-colors",
                liveMode
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-white text-slate-600"
              )}
            >
              <Activity
                className={cn(
                  "h-3.5 w-3.5",
                  liveMode ? "text-emerald-600 animate-pulse" : "text-slate-400"
                )}
              />
              <span className="hidden sm:inline">
                {liveMode ? "LIVE 30s" : "Paused"}
              </span>
            </button>

            <RateCalculatorDialog products={products} />

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => refreshLive(false)}
              disabled={refreshPending}
              className="hidden sm:inline-flex"
            >
              {refreshPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span>Refresh</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 space-y-5">
        {!data.dbReady && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <Database className="h-5 w-5 shrink-0 text-amber-700 mt-0.5" />
            <div>
              <p className="font-semibold">
                {data.dbReason === "missing_env"
                  ? "Connect your Supabase project to populate sales analytics"
                  : "Apply supabase/migrations/0001_init.sql in Supabase SQL Editor"}
              </p>
              <p className="mt-1 text-xs text-amber-900">
                Live Delhivery Wallet works immediately; sales graphs populate as
                soon as your Supabase tables are initialized.
              </p>
            </div>
          </div>
        )}

        {/* Top KPI Strip */}
        <section
          aria-label="Live sales KPI cards"
          className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-5"
        >
          <button
            type="button"
            onClick={() => refreshLive(false)}
            className="col-span-2 md:col-span-1 rounded-2xl border border-slate-900 bg-gradient-to-br from-slate-950 via-slate-900 to-[#5b1015] p-3.5 text-left text-white shadow-sm cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs font-medium text-slate-300">
              <span>Delhivery Wallet</span>
              <CreditCard className="h-4 w-4 text-[#ff6b72]" />
            </div>
            <p className="mt-1 font-mono text-xl font-bold">
              {wallet ? formatWalletINR(wallet.current_balance) : "Tap to load ₹"}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-300">
              {wallet?.is_active ? "Active Prepaid Account" : "Click to refresh"}
            </p>
          </button>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Gross Revenue</span>
              <IndianRupee className="h-4 w-4 text-slate-700" />
            </div>
            <p className="mt-1 font-mono text-lg font-bold text-slate-950">
              {formatINR(sales.total_revenue)}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {sales.total_orders} total · AOV {formatINR(sales.avg_order_value)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Delivery Rate</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-1 font-mono text-lg font-bold text-emerald-700">
              {data.deliveryRatePct}%
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {sales.delivered_count} delivered ({formatINR(sales.delivered_revenue)})
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Active Pipeline</span>
              <TrendingUp className="h-4 w-4 text-indigo-600" />
            </div>
            <p className="mt-1 font-mono text-lg font-bold text-indigo-700">
              {formatINR(sales.in_pipeline_revenue)}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {sales.in_pipeline_count} in progress · {counts.ofd} OFD
            </p>
          </div>

          <Link
            href="/?filter=ndr"
            className="col-span-2 md:col-span-1 rounded-2xl border border-red-200/90 bg-gradient-to-br from-white to-red-50/40 p-3.5 text-left shadow-2xs transition-colors hover:bg-red-50/70"
          >
            <div className="flex items-center justify-between text-xs font-medium text-[#D9232A]">
              <span>NDR At Risk</span>
              <AlertTriangle className="h-4 w-4 text-[#D9232A]" />
            </div>
            <p className="mt-1 font-mono text-lg font-bold text-[#D9232A]">
              {formatINR(sales.ndr_revenue)}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {sales.ndr_count} exception{sales.ndr_count === 1 ? "" : "s"} ·
              Manage in Orders →
            </p>
          </Link>
        </section>

        {/* Interactive Live Graphs Grid */}
        <section
          aria-label="Live sales graphs"
          className="grid grid-cols-1 gap-4 lg:grid-cols-12"
        >
          <div className="lg:col-span-8">
            <RevenueTrendChart series={data.dailySeries} />
          </div>
          <div className="lg:col-span-4">
            <PaymentSplitChart sales={sales} />
          </div>
          <div className="lg:col-span-6">
            <FulfillmentFunnelChart sales={sales} />
          </div>
          <div className="lg:col-span-6">
            <TopDestinationsChart
              cities={sales.top_cities}
              states={data.stateBreakdown}
            />
          </div>
        </section>
      </main>

      <MobileNavBar
        ndrCount={counts.ndr}
        refreshPending={refreshPending}
        onRefresh={() => refreshLive(false)}
        refreshLabel="Refresh"
      />
    </div>
  );
}

