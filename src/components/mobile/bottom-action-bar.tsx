"use client";

import { Loader2, MapPin, PackagePlus, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileNavBar } from "./mobile-nav-bar";

interface BottomActionBarProps {
  selectedCount: number;
  unfulfilledSelectedCount: number;
  manifestedSelectedCount: number;
  trackingPending: boolean;
  ndrCount?: number;
  syncPending?: boolean;
  onGenerateAwb: () => void;
  onPrintLabels: () => void;
  onSyncTracking: () => void;
  onSyncAll?: () => void;
  onClearSelection?: () => void;
}

export function BottomActionBar({
  selectedCount,
  unfulfilledSelectedCount,
  manifestedSelectedCount,
  trackingPending,
  ndrCount = 0,
  syncPending = false,
  onGenerateAwb,
  onPrintLabels,
  onSyncTracking,
  onSyncAll,
  onClearSelection,
}: BottomActionBarProps) {
  return (
    <>
      {selectedCount > 0 && (
        <div
          aria-label="Selected orders bulk actions"
          className="fixed inset-x-3 bottom-[72px] z-40 rounded-2xl border border-slate-700/80 bg-slate-950/95 p-2 text-white shadow-2xl backdrop-blur-md md:hidden"
        >
          <div className="mb-1.5 flex items-center justify-between px-1.5">
            <span className="text-[11px] font-semibold text-slate-300">
              {selectedCount} {selectedCount === 1 ? "order" : "orders"} selected
            </span>
            {onClearSelection && (
              <button
                type="button"
                onClick={onClearSelection}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <Button
              type="button"
              variant="primary"
              size="lg"
              onClick={onGenerateAwb}
              className="min-h-11 px-2 text-xs font-semibold"
            >
              <PackagePlus className="h-4 w-4 shrink-0" />
              <span className="truncate">
                AWB
                {unfulfilledSelectedCount > 0 ? ` (${unfulfilledSelectedCount})` : ""}
              </span>
            </Button>

            <Button
              type="button"
              variant="default"
              size="lg"
              onClick={onPrintLabels}
              className="min-h-11 bg-white text-slate-950 hover:bg-slate-100 px-2 text-xs font-semibold"
            >
              <Printer className="h-4 w-4 shrink-0" />
              <span className="truncate">
                Label
                {manifestedSelectedCount > 0 ? ` (${manifestedSelectedCount})` : ""}
              </span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={onSyncTracking}
              disabled={trackingPending}
              className="min-h-11 border-slate-700 bg-slate-900 text-white hover:bg-slate-800 px-2 text-xs font-semibold"
            >
              {trackingPending ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <MapPin className="h-4 w-4 shrink-0 text-blue-400" />
              )}
              <span className="truncate">Track ({manifestedSelectedCount})</span>
            </Button>
          </div>
        </div>
      )}

      <MobileNavBar
        ndrCount={ndrCount}
        refreshPending={syncPending}
        onRefresh={onSyncAll}
      />
    </>
  );
}

