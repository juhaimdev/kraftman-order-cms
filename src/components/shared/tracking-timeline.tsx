import type { OrderStatus, TrackingScan } from "@/lib/db/types";
import {
  cn,
  deriveTransitInsights,
  formatDateTime,
  formatRelativeTime,
} from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MapPin,
  Navigation,
  Route,
} from "lucide-react";

interface TrackingTimelineProps {
  scans: TrackingScan[];
  status?: OrderStatus;
  latestTrackingStatus?: string | null;
  isRto?: boolean;
}

const STAGES = ["Manifested", "In Transit", "Out for Delivery", "Delivered"];

function scanTypeBadge(scanType?: string) {
  const t = (scanType ?? "").trim().toUpperCase();
  if (!t) return null;
  const cls =
    t === "DL"
      ? "bg-emerald-100 text-emerald-800"
      : t === "RT"
        ? "bg-rose-100 text-rose-800"
        : t === "NDR"
          ? "bg-amber-100 text-amber-800"
          : "bg-slate-100 text-slate-600";
  return (
    <span className={cn("rounded px-1.5 py-0.5 font-mono text-[10px] font-bold", cls)}>
      {t}
    </span>
  );
}

export function TrackingTimeline({
  scans,
  status = "Manifested",
  latestTrackingStatus,
  isRto = false,
}: TrackingTimelineProps) {
  const insights = deriveTransitInsights(scans, status, latestTrackingStatus);

  return (
    <div className="space-y-4">
      {/* 4-Stage Visual Progress Stepper */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-3">
        <div className="grid grid-cols-4 gap-1.5">
          {STAGES.map((label, idx) => {
            const reached = idx <= insights.stageIndex;
            const activeException = (status === "NDR" || isRto) && idx === insights.stageIndex;
            return (
              <div key={label} className="space-y-1.5">
                <div
                  className={cn(
                    "h-1.5 w-full rounded-full transition-colors",
                    activeException
                      ? "bg-[#D9232A]"
                      : reached
                        ? idx === 3
                          ? "bg-emerald-500"
                          : "bg-slate-900"
                        : "bg-slate-200"
                  )}
                />
                <p
                  className={cn(
                    "truncate text-[10px] font-semibold",
                    activeException
                      ? "text-[#D9232A]"
                      : reached
                        ? "text-slate-900"
                        : "text-slate-400"
                  )}
                >
                  {label}
                </p>
              </div>
            );
          })}
        </div>

        {/* Transit Telemetry Metrics */}
        <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
          <div className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-2">
            <p className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <Navigation className="h-3 w-3 text-[#D9232A]" />
              Current Hub
            </p>
            <p className="mt-0.5 truncate font-semibold text-slate-900">
              {insights.currentLocation}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-2">
            <p className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <Clock className="h-3 w-3 text-blue-600" />
              Last Scan
            </p>
            <p className="mt-0.5 truncate font-semibold text-slate-900">
              {insights.lastScanRelative || insights.lastScanTime}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-2">
            <p className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <Route className="h-3 w-3 text-indigo-600" />
              Origin Hub
            </p>
            <p className="mt-0.5 truncate font-medium text-slate-700">
              {insights.originLocation}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-2">
            <p className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              Checkpoints
            </p>
            <p className="mt-0.5 font-mono font-semibold text-slate-900">
              {insights.checkpointCount} scan{insights.checkpointCount === 1 ? "" : "s"}
              {insights.transitDurationLabel !== "—"
                ? ` · ${insights.transitDurationLabel}`
                : ""}
            </p>
          </div>
        </div>

        {insights.latestInstruction && (
          <div
            className={cn(
              "flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs",
              status === "NDR" || isRto
                ? "bg-red-50 text-red-800 border border-red-200"
                : "bg-white text-slate-700 border border-slate-200/80"
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[#D9232A]" />
            <span>{insights.latestInstruction}</span>
          </div>
        )}
      </div>

      {/* Scan History Timeline */}
      {!scans || scans.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-4 text-center text-xs text-slate-500">
          No scan events recorded yet. Tap <strong>Refresh Track</strong> once the shipment is scanned by Delhivery.
        </div>
      ) : (
        <ol className="relative space-y-4 border-l-2 border-slate-200 pl-4 ml-2">
          {scans.map((scan, idx) => {
            const isLatest = idx === 0;
            const rel = formatRelativeTime(scan.ScanDateTime);
            return (
              <li key={`${scan.ScanDateTime}-${idx}`} className="relative">
                <span
                  className={cn(
                    "absolute -left-[23px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full ring-4 ring-white",
                    isLatest
                      ? status === "Delivered"
                        ? "bg-emerald-500"
                        : "bg-[#D9232A]"
                      : "bg-slate-300"
                  )}
                />
                <div className="flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          isLatest ? "text-slate-900" : "text-slate-700"
                        )}
                      >
                        {scan.Scan || scan.ScanType || "Status Update"}
                      </span>
                      {scanTypeBadge(scan.ScanType)}
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 shrink-0 text-right">
                      {formatDateTime(scan.ScanDateTime)}
                      {rel && isLatest ? ` (${rel})` : ""}
                    </span>
                  </div>
                  {scan.Instructions && (
                    <p className="text-xs text-slate-600">{scan.Instructions}</p>
                  )}
                  {scan.ScannedLocation && (
                    <p className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                      {isLatest ? (
                        <Navigation className="h-3 w-3 text-[#D9232A]" />
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
      )}
    </div>
  );
}
