"use client";

import * as React from "react";
import {
  Download,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import type { DashboardCounts, ProductPreset } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import { AddOrderDialog } from "@/components/shared/add-order-dialog";
import { ImportDelhiveryDialog } from "@/components/shared/import-delhivery-dialog";
import { ProductsDialog } from "@/components/shared/products-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type FilterKey = "all" | "pending" | "ofd" | "ndr";

interface QuickFiltersProps {
  activeFilter: FilterKey;
  searchQuery: string;
  counts: DashboardCounts;
  products: ProductPreset[];
  exportUrl: string;
  syncAllPending?: boolean;
  trackAllPending?: boolean;
  onSyncAll?: () => void;
  onTrackAll?: () => void;
  onFilterChange: (filter: FilterKey) => void;
  onSearchChange: (q: string) => void;
}

export function QuickFilters({
  activeFilter,
  searchQuery,
  counts,
  products,
  exportUrl,
  syncAllPending = false,
  trackAllPending = false,
  onSyncAll,
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

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-3 pt-3 pb-2.5 sm:px-6 space-y-2.5">
        {/* Top Row: Brand + Search + Quick Tools */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs">
              <Package className="h-5 w-5" />
            </div>
            <div className="hidden lg:block">
              <h1 className="text-sm font-bold leading-tight text-slate-900">
                Delhivery One
              </h1>
              <p className="text-[11px] text-slate-500">Dispatch Command</p>
            </div>
          </div>

          <div className="relative flex-1 min-w-[160px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search Order #, AWB, Customer, PIN..."
              className="pl-9 pr-9 bg-slate-50 border-slate-200 focus-visible:bg-white"
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
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                ) : (
                  <MapPin className="h-4 w-4 text-blue-600" />
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
                title="Sync live orders & tracking from Delhivery One"
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
                  "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold transition-colors cursor-pointer",
                  isActive
                    ? "border-slate-900 bg-slate-900 text-white shadow-2xs"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                )}
              >
                <span>{pill.label}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-mono",
                    isActive
                      ? "bg-white/20 text-white"
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
