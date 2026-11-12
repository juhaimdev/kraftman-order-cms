import type { TrackingScan } from "@/lib/db/types";
import { formatDateTime } from "@/lib/utils";
import { MapPin, Navigation } from "lucide-react";

export function TrackingTimeline({ scans }: { scans: TrackingScan[] }) {
  if (!scans || scans.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-4 text-center text-xs text-slate-500">
        No scan events recorded yet. Tap <strong>Refresh Track</strong> once the shipment is scanned by Delhivery.
      </div>
    );
  }

  return (
    <ol className="relative space-y-4 border-l-2 border-slate-200 pl-4 ml-2">
      {scans.map((scan, idx) => {
        const isLatest = idx === 0;
        return (
          <li key={`${scan.ScanDateTime}-${idx}`} className="relative">
            <span
              className={`absolute -left-[23px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full ring-4 ring-white ${
                isLatest ? "bg-blue-600" : "bg-slate-300"
              }`}
            />
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-sm font-semibold ${
                    isLatest ? "text-slate-900" : "text-slate-700"
                  }`}
                >
                  {scan.Scan || scan.ScanType || "Status Update"}
                </span>
                <span className="text-[11px] font-mono text-slate-500 shrink-0">
                  {formatDateTime(scan.ScanDateTime)}
                </span>
              </div>
              {scan.Instructions && (
                <p className="text-xs text-slate-600">{scan.Instructions}</p>
              )}
              {scan.ScannedLocation && (
                <p className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                  {isLatest ? (
                    <Navigation className="h-3 w-3 text-blue-600" />
                  ) : (
                    <MapPin className="h-3 w-3 text-slate-400" />
                  )}
                  <span>{scan.ScannedLocation}</span>
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

