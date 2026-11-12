"use client";

import { Loader2, MapPin, PackagePlus, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BottomActionBarProps {
  selectedCount: number;
  unfulfilledSelectedCount: number;
  manifestedSelectedCount: number;
  trackingPending: boolean;
  onGenerateAwb: () => void;
  onPrintLabels: () => void;
  onSyncTracking: () => void;
}

export function BottomActionBar({
  selectedCount,
  unfulfilledSelectedCount,
  manifestedSelectedCount,
  trackingPending,
  onGenerateAwb,
  onPrintLabels,
  onSyncTracking,
}: BottomActionBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-3 gap-2 px-3 py-2">
        <Button
          type="button"
          variant="primary"
          size="lg"
          onClick={onGenerateAwb}
          className="h-12 px-2 text-xs font-semibold"
        >
          <PackagePlus className="h-4 w-4 shrink-0" />
          <span className="truncate">
            Generate AWB
            {unfulfilledSelectedCount > 0 ? ` (${unfulfilledSelectedCount})` : ""}
          </span>
        </Button>

        <Button
          type="button"
          variant="default"
          size="lg"
          onClick={onPrintLabels}
          className="h-12 px-2 text-xs font-semibold"
        >
          <Printer className="h-4 w-4 shrink-0" />
          <span className="truncate">
            Print Label
            {manifestedSelectedCount > 0 ? ` (${manifestedSelectedCount})` : ""}
          </span>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onSyncTracking}
          disabled={trackingPending}
          className="h-12 px-2 text-xs font-semibold"
        >
          {trackingPending ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <MapPin className="h-4 w-4 shrink-0 text-blue-600" />
          )}
          <span className="truncate">
            Track{selectedCount > 0 ? ` (${manifestedSelectedCount})` : ""}
          </span>
        </Button>
      </div>
    </div>
  );
}

