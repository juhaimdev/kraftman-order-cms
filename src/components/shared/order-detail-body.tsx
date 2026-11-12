"use client";

import * as React from "react";
import {
  ExternalLink,
  Loader2,
  MapPin,
  Printer,
  RefreshCw,
  Scale,
} from "lucide-react";
import { toast } from "sonner";
import { syncTrackingAction } from "@/actions/tracking";
import type { OrderWithShipment, ProductPreset } from "@/lib/db/types";
import { formatDateTime, formatINR, getDelhiveryTrackingUrl } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CallButton } from "./call-button";
import { CopyButton } from "./copy-button";
import { ManifestForm } from "./manifest-form";
import { NdrActions } from "./ndr-actions";
import { ServiceabilityBadge } from "./serviceability-badge";
import { StatusBadge } from "./status-badge";
import { TrackingTimeline } from "./tracking-timeline";
import { WhatsAppButton } from "./whatsapp-button";

interface OrderDetailBodyProps {
  order: OrderWithShipment;
  products?: ProductPreset[];
  onManifestSuccess?: () => void;
}

export function OrderDetailBody({
  order,
  products = [],
  onManifestSuccess,
}: OrderDetailBodyProps) {
  const [trackingPending, startTrackTransition] = React.useTransition();

  const isOfd = Boolean(
    order.latest_tracking_status?.toLowerCase().includes("out for delivery") ||
      order.latest_tracking_status?.toLowerCase().includes("dispatched")
  );

  function handleSyncTracking() {
    if (!order.awb_number) return;
    startTrackTransition(async () => {
      const res = await syncTrackingAction([order.awb_number!], true);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Synced tracking for AWB ${order.awb_number}`);
    });
  }

  return (
    <div className="space-y-5 p-5">
      {/* Header Meta */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold tracking-tight text-slate-900">
              {order.order_number}
            </h3>
            <StatusBadge
              status={order.status}
              isOfd={isOfd}
              isRto={order.is_rto}
            />
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Created {formatDateTime(order.created_at)} ·{" "}
            <span className="font-semibold text-slate-700">
              {order.payment_method}
            </span>{" "}
            ({formatINR(order.total_amount)})
          </p>
        </div>

        {order.awb_number && (
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton
              value={order.awb_number}
              label={`AWB: ${order.awb_number}`}
              toastText={`Copied AWB ${order.awb_number}`}
            />
            <CopyButton
              value={getDelhiveryTrackingUrl(order.awb_number)}
              label="Copy Link"
              toastText="Tracking link copied"
            />
          </div>
        )}
      </div>

      {/* Consignee Block */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Consignee
            </p>
            <p className="text-sm font-semibold text-slate-900">
              {order.customer_name}
            </p>
          </div>
          <CallButton
            phone={order.customer_phone}
            customerName={order.customer_name}
            showNumber
          />
        </div>

        <div className="flex items-start gap-2 text-xs text-slate-600">
          <MapPin className="h-4 w-4 shrink-0 text-slate-400 mt-0.5" />
          <div>
            <p>{order.address}</p>
            <p className="font-medium text-slate-800 mt-0.5">
              {[order.city, order.state].filter(Boolean).join(", ")} —{" "}
              <span className="font-mono font-semibold">{order.pincode}</span>
            </p>
          </div>
        </div>

        <ServiceabilityBadge
          key={order.id}
          pincode={order.pincode}
          paymentMethod={order.payment_method}
        />
      </div>

      {/* Shipment & Courier Actions */}
      {order.status === "Unfulfilled" && !order.awb_number ? (
        <ManifestForm
          orderIds={[order.id]}
          products={products}
          defaultProductId={order.product_id}
          defaultDesc={order.item_description}
          defaultWeight={order.weight_grams ?? 500}
          onSuccess={onManifestSuccess}
        />
      ) : order.awb_number ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-slate-400" />
              <span>
                <strong>{order.weight_grams ?? 500}g</strong>
                {order.length_cm && order.width_cm && order.height_cm
                  ? ` · ${order.length_cm}×${order.width_cm}×${order.height_cm} cm`
                  : ""}
              </span>
            </div>
            <span className="font-mono text-[11px] text-slate-500">
              Updated {formatDateTime(order.shipment_updated_at)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <a
              href={`/api/labels?wbns=${encodeURIComponent(order.awb_number)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white shadow-xs transition-colors hover:bg-slate-800 active:scale-[0.98]"
            >
              <Printer className="h-4 w-4" />
              <span>Print 4x6 Label</span>
              <ExternalLink className="h-3 w-3 opacity-70" />
            </a>

            <Button
              type="button"
              variant="outline"
              onClick={handleSyncTracking}
              disabled={trackingPending}
            >
              {trackingPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span>Refresh Track</span>
            </Button>

            <WhatsAppButton
              order={order}
              label="WhatsApp Status"
              className="justify-center text-sm"
            />

            <a
              href={getDelhiveryTrackingUrl(order.awb_number)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 active:scale-[0.98]"
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              <span>Track Link</span>
            </a>
          </div>
        </div>
      ) : null}

      {/* NDR Actions */}
      {order.awb_number && order.status === "NDR" && (
        <NdrActions
          awb={order.awb_number}
          customerName={order.customer_name}
          customerPhone={order.customer_phone}
          address={order.address}
          latestTrackingStatus={order.latest_tracking_status}
          uplId={order.ndr_upl_id}
        />
      )}

      {/* Tracking Timeline & Telemetry */}
      {order.awb_number && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Live Tracking Intelligence
            </h4>
            {order.latest_tracking_status && (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                {order.latest_tracking_status}
              </span>
            )}
          </div>
          <TrackingTimeline
            scans={order.tracking_scans}
            status={order.status}
            latestTrackingStatus={order.latest_tracking_status}
            isRto={order.is_rto}
          />
        </div>
      )}
    </div>
  );
}
