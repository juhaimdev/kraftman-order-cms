"use client";

import * as React from "react";
import {
  Download,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  Search,
  Wallet,
  X,
} from "lucide-react";
import type {
  DashboardCounts,
  OrderWithShipment,
  ProductPreset,
  WalletSummary,
} from "@/lib/db/types";
import { cn, formatWalletINR } from "@/lib/utils";
import { AddOrderDialog } from "@/components/shared/add-order-dialog";
import { ImportDelhiveryDialog } from "@/components/shared/import-delhivery-dialog";
import { OperationsHubDialog } from "@/components/shared/operations-hub-dialog";
import { ProductsDialog } from "@/components/shared/products-dialog";
import { RateCalculatorDialog } from "@/components/shared/rate-calculator-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type FilterKey = "all" | "pending" | "ofd" | "ndr";

interface QuickFiltersProps {
  activeFilter: FilterKey;
  searchQuery: string;
  counts: DashboardCounts;
  orders: OrderWithShipment[];
  products: ProductPreset[];
  wallet?: WalletSummary | null;
  exportUrl: string;
  syncAllPending?: boolean;
  walletPending?: boolean;
  trackAllPending?: boolean;
  onSyncAll?: () => void;
  onRefreshWallet?: () => void;
  onTrackAll?: () => void;
  onFilterChange: (filter: FilterKey) => void;
  onSearchChange: (q: string) => void;
}

export function QuickFilters({
  activeFilter,
  searchQuery,
  counts,
  orders,
  products,
  wallet,
  exportUrl,
  syncAllPending = false,
  walletPending = false,
  trackAllPending = false,
  onSyncAll,
  onRefreshWallet,
  onTrackAll,
  onFilterChange,
  onSearchChange,
}: QuickFiltersProps) {
  const pills: Array<{ key: FilterKey; label: string; count: number }> = [
    { key: "all", label: "All", count: counts.total },
    { key: "pending", label: "Pending AWB", count: counts.pending },
    { key: "ofd", label: "Out for Delivery", count: counts.ofd },
    { key: "ndr", label: "NDR / Failed", count: counts.ndr },
  ];

  const isLowBalance = wallet != null && wallet.current_balance < 200;

  return (
    <header className="sticky top-0 z-30 border-t-[3px] border-t-[#D9232A] border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-2xs">
      <div className="mx-auto max-w-7xl px-3 pt-2.5 pb-2.5 sm:px-6 space-y-2.5">
        {/* Top Row: Delhivery One Brand + Wallet Pill + Search + Quick Tools */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-slate-950 via-slate-900 to-[#D9232A] text-white shadow-sm">
              <Package className="h-5 w-5" />
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#D9232A]" />
            </div>
            <div className="hidden lg:block">
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-extrabold tracking-tight text-slate-950">
                  KRAFTMAN
                </h1>
                <span className="rounded bg-[#D9232A] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                  DELHIVERY ONE
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-500">
                Order & Shipping Command Center
              </p>
            </div>
          </div>

          {/* Always-Visible Live Wallet Balance Pill */}
          <button
            type="button"
            onClick={onRefreshWallet ?? onSyncAll}
            disabled={walletPending || syncAllPending}
            title={
              wallet
                ? `Delhivery One Wallet (${wallet.is_active ? "Active" : "Inactive"}${wallet.payment_gateway ? ` · ${wallet.payment_gateway}` : ""}). Click to refresh.`
                : "Click to load live Delhivery One Wallet balance"
            }
            className={cn(
              "inline-flex min-h-10 sm:min-h-9 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition-colors cursor-pointer",
              isLowBalance
                ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                : wallet
                  ? "border-emerald-200 bg-emerald-50/90 text-emerald-900 hover:bg-emerald-100"
                  : "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
            )}
          >
            {walletPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
            ) : (
              <Wallet
                className={cn(
                  "h-3.5 w-3.5",
                  isLowBalance
                    ? "text-amber-600"
                    : wallet
                      ? "text-emerald-600"
                      : "text-slate-500"
                )}
              />
            )}
            <span className="hidden sm:inline text-[11px] font-medium opacity-80">
              Wallet
            </span>
            <span className="font-mono font-bold">
              {wallet ? formatWalletINR(wallet.current_balance) : "Load ₹"}
            </span>
          </button>

          <div className="relative flex-1 min-w-[150px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search Order #, AWB, Customer, PIN..."
              className="pl-9 pr-9 bg-slate-50/90 border-slate-200 focus-visible:bg-white"
              aria-label="Search orders"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                aria-label="Clear search"
                className="absolute right-0.5 top-1/2 -translate-y-1/2 inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <RateCalculatorDialog products={products} />
            <OperationsHubDialog orders={orders} ndrCount={counts.ndr} />
            <ProductsDialog products={products} />

            {onTrackAll && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onTrackAll}
                disabled={trackAllPending}
                aria-label="Track all shipped orders"
                title="Refresh live tracking across all shipped orders"
              >
                {trackAllPending ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[#D9232A]" />
                ) : (
                  <MapPin className="h-4 w-4 text-[#D9232A]" />
                )}
                <span className="hidden sm:inline">Track All</span>
              </Button>
            )}

            <a
              href={exportUrl}
              download
              aria-label="Download AWB shipping numbers CSV"
              title="Download CSV with all delivery AWB numbers & tracking links"
              className="inline-flex min-h-11 sm:min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 active:scale-[0.98]"
            >
              <Download className="h-4 w-4 text-slate-600" />
              <span className="hidden xl:inline">Download AWBs</span>
            </a>

            {onSyncAll && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={onSyncAll}
                disabled={syncAllPending}
                aria-label="Sync from Delhivery One"
                title="Sync wallet, orders & live tracking from Delhivery One"
              >
                {syncAllPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            )}
            <ImportDelhiveryDialog />
            <AddOrderDialog products={products} />
          </div>
        </div>

        {/* Sticky Horizontal Pill Filter */}
        <nav
          aria-label="Order status quick filters"
          className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5"
        >
          {pills.map((pill) => {
            const isActive = activeFilter === pill.key;
            return (
              <button
                key={pill.key}
                type="button"
                onClick={() => onFilterChange(pill.key)}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold transition-all cursor-pointer",
                  isActive
                    ? "border-slate-950 bg-slate-950 text-white shadow-xs"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                )}
              >
                <span>{pill.label}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-mono",
                    isActive
                      ? "bg-[#D9232A] text-white"
                      : "bg-slate-100 text-slate-600"
                  )}
                >
                  {pill.count}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
