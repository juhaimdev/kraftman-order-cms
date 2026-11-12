"use client";

import * as React from "react";
import {
  Download,
  Loader2,
  PackagePlus,
  Printer,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface BatchToolbarProps {
  selectedCount: number;
  unfulfilledCount: number;
  awbCount: number;
  trackingPending: boolean;
  serviceabilityPending: boolean;
  onCheckServiceability: () => void;
  onGenerateAwb: () => void;
  onPrintLabels: () => void;
  onDownloadLabels: () => void;
  onExportAwbs: () => void;
  onSyncTracking: () => void;
  onClearSelection: () => void;
}

export function BatchToolbar({
  selectedCount,
  unfulfilledCount,
  awbCount,
  trackingPending,
  serviceabilityPending,
  onCheckServiceability,
  onGenerateAwb,
  onPrintLabels,
  onDownloadLabels,
  onExportAwbs,
  onSyncTracking,
  onClearSelection,
}: BatchToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="hidden md:flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-900/15 bg-slate-900 px-4 py-2.5 text-white shadow-sm">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-7 items-center rounded-full bg-white/15 px-3 text-xs font-semibold">
          {selectedCount} selected
        </span>
        <button
          type="button"
          onClick={onClearSelection}
          className="inline-flex items-center gap-1 text-xs text-slate-300 hover:text-white cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
          <span>Clear</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={serviceabilityPending}
          onClick={onCheckServiceability}
          className="bg-white/10 text-white hover:bg-white/20 border-0"
        >
          {serviceabilityPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          <span>Check Serviceability</span>
        </Button>

        <Button
          type="button"
          size="sm"
          variant="primary"
          disabled={unfulfilledCount === 0}
          onClick={onGenerateAwb}
        >
          <PackagePlus className="h-3.5 w-3.5" />
          <span>Bulk Generate AWB ({unfulfilledCount})</span>
        </Button>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={awbCount === 0}
          onClick={onDownloadLabels}
          className="bg-emerald-600 text-white hover:bg-emerald-700"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Download Labels PDF ({awbCount})</span>
        </Button>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={awbCount === 0}
          onClick={onPrintLabels}
          className="bg-white text-slate-900 hover:bg-slate-100"
        >
          <Printer className="h-3.5 w-3.5" />
          <span>Print 4x6 ({awbCount})</span>
        </Button>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={awbCount === 0}
          onClick={onExportAwbs}
          className="bg-white/10 text-white hover:bg-white/20 border-0"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Export AWBs ({awbCount})</span>
        </Button>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={awbCount === 0 || trackingPending}
          onClick={onSyncTracking}
          className="bg-white/10 text-white hover:bg-white/20 border-0"
        >
          {trackingPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          <span>Sync Track ({awbCount})</span>
        </Button>
      </div>
    </div>
  );
}

