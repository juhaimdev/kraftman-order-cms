"use client";

import * as React from "react";
import {
  Ban,
  ExternalLink,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Printer,
  RefreshCw,
  Scale,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  cancelOrDeleteOrderAction,
  updateOrderAction,
} from "@/actions/orders";
import { syncTrackingAction } from "@/actions/tracking";
import type { OrderWithShipment, ProductPreset } from "@/lib/db/types";
import {
  formatDateTime,
  formatINR,
  formatPhoneDisplay,
  getDelhiveryTrackingUrl,
} from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [editPending, startEditTransition] = React.useTransition();
  const [cancelPending, startCancelTransition] = React.useTransition();

  const [editingOrderId, setEditingOrderId] = React.useState<string | null>(
    null
  );
  const [confirmCancelOrderId, setConfirmCancelOrderId] = React.useState<
    string | null
  >(null);

  const editing = editingOrderId === order.id;
  const confirmCancel = confirmCancelOrderId === order.id;

  const [customerName, setCustomerName] = React.useState(order.customer_name);
  const [customerPhone, setCustomerPhone] = React.useState(order.customer_phone);
  const [address, setAddress] = React.useState(order.address);
  const [city, setCity] = React.useState(order.city);
  const [state, setState] = React.useState(order.state);
  const [pincode, setPincode] = React.useState(order.pincode);
  const [paymentMethod, setPaymentMethod] = React.useState<"COD" | "Prepaid">(
    order.payment_method
  );
  const [totalAmount, setTotalAmount] = React.useState(
    String(order.total_amount)
  );
  const [itemDescription, setItemDescription] = React.useState(
    order.item_description ?? ""
  );

  function toggleEdit() {
    if (editing) {
      setEditingOrderId(null);
      return;
    }
    setCustomerName(order.customer_name);
    setCustomerPhone(order.customer_phone);
    setAddress(order.address);
    setCity(order.city);
    setState(order.state);
    setPincode(order.pincode);
    setPaymentMethod(order.payment_method);
    setTotalAmount(String(order.total_amount));
    setItemDescription(order.item_description ?? "");
    setEditingOrderId(order.id);
  }

  const isOfd = Boolean(
    order.latest_tracking_status?.toLowerCase().includes("out for delivery") ||
      order.latest_tracking_status?.toLowerCase().includes("dispatched")
  );

  const canEditOrCancel =
    order.status !== "Delivered" && order.status !== "Cancelled";

  const fullFormattedAddress = `${order.address}, ${[order.city, order.state]
    .filter(Boolean)
    .join(", ")} - ${order.pincode}`;

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

  function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    startEditTransition(async () => {
      const res = await updateOrderAction({
        order_id: order.id,
        customer_name: customerName,
        customer_phone: customerPhone,
        address,
        city,
        state,
        pincode,
        payment_method: paymentMethod,
        total_amount: Number(totalAmount) || 0,
        product_id: order.product_id ?? "",
        item_description: itemDescription,
      });

      if (res.error) {
        toast.error(res.error);
        return;
      }

      toast.success(
        res.data?.syncedToDelhivery
          ? "Updated customer details locally & in Delhivery One"
          : `Updated order ${order.order_number}`
      );
      setEditingOrderId(null);
    });
  }

  function handleCancelOrDelete(mode: "cancel_shipment" | "delete_draft") {
    startCancelTransition(async () => {
      const res = await cancelOrDeleteOrderAction({
        orderId: order.id,
        mode,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(res.data?.message ?? "Order updated");
      setConfirmCancelOrderId(null);
      onManifestSuccess?.();
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

      {/* Complete Customer & Order Details Block */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Customer Complete Details
            </p>
            <p className="mt-0.5 text-base font-bold text-slate-950">
              {order.customer_name}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {(() => {
                const ph = formatPhoneDisplay(order.customer_phone);
                if (!ph.text) {
                  return (
                    <span className="text-xs font-medium text-amber-700">
                      No mobile number saved — click Edit to add
                    </span>
                  );
                }
                return (
                  <>
                    <span className="font-mono text-xs font-semibold text-slate-700">
                      {ph.text}
                    </span>
                    {ph.isMasked && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                        Masked by Delhivery
                      </span>
                    )}
                    {ph.isValid && (
                      <CopyButton
                        value={order.customer_phone}
                        label="Copy Phone"
                        toastText="Copied customer phone"
                        className="min-h-7 h-7 px-2 text-[11px]"
                      />
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <CallButton
              phone={order.customer_phone}
              customerName={order.customer_name}
              showNumber
            />
            {canEditOrCancel && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={toggleEdit}
                className="min-h-11 gap-1.5"
              >
                {editing ? (
                  <>
                    <X className="h-3.5 w-3.5" />
                    <span>Close</span>
                  </>
                ) : (
                  <>
                    <Pencil className="h-3.5 w-3.5" />
                    <span>Edit</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {!editing ? (
          <>
            {/* Address Box */}
            <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 text-xs text-slate-700">
                  <MapPin className="h-4 w-4 shrink-0 text-[#D9232A] mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="leading-relaxed font-medium text-slate-800">
                      {order.address}
                    </p>
                    <p className="text-slate-600">
                      City: <strong className="text-slate-900">{order.city || "—"}</strong>{" "}
                      · State: <strong className="text-slate-900">{order.state || "—"}</strong>{" "}
                      · PIN:{" "}
                      <span className="font-mono font-bold text-slate-950">
                        {order.pincode}
                      </span>
                    </p>
                  </div>
                </div>
                <CopyButton
                  value={fullFormattedAddress}
                  label="Copy Address"
                  toastText="Full customer address copied"
                  className="min-h-8 h-8 shrink-0 px-2 text-[11px]"
                />
              </div>

              {(order.item_description || order.weight_grams) && (
                <div className="flex flex-wrap items-center gap-3 border-t border-slate-200/80 pt-2 text-xs text-slate-600">
                  {order.item_description && (
                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                      <Package className="h-3.5 w-3.5 text-slate-400" />
                      {order.item_description}
                    </span>
                  )}
                  <span className="font-mono text-[11px] font-semibold text-slate-700">
                    {order.payment_method} · {formatINR(order.total_amount)}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <ServiceabilityBadge
                key={order.id}
                pincode={order.pincode}
                paymentMethod={order.payment_method}
              />
              {!order.awb_number && <WhatsAppButton order={order} label="WhatsApp Customer" />}
            </div>
          </>
        ) : (
          <form
            onSubmit={handleSaveEdit}
            className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3"
          >
            <p className="text-xs font-semibold text-slate-700">
              {order.awb_number
                ? "Edit Consignee Details (syncs live to Delhivery One)"
                : "Edit Customer & Order Details"}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="text-[11px] font-medium text-slate-500">
                  Customer Name
                </label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500">
                  Mobile Number
                </label>
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-500">
                Full Street Address
              </label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] font-medium text-slate-500">
                  City
                </label>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={Boolean(order.awb_number)}
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500">
                  State
                </label>
                <Input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  disabled={Boolean(order.awb_number)}
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500">
                  PIN Code
                </label>
                <Input
                  value={pincode}
                  maxLength={6}
                  onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
                  disabled={Boolean(order.awb_number)}
                  required
                />
              </div>
            </div>

            {!order.awb_number && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div>
                  <label className="text-[11px] font-medium text-slate-500">
                    Payment Mode
                  </label>
                  <div className="mt-1 grid grid-cols-2 gap-1.5">
                    {(["Prepaid", "COD"] as const).map((pm) => (
                      <button
                        key={pm}
                        type="button"
                        onClick={() => setPaymentMethod(pm)}
                        className={`min-h-10 rounded-md border text-xs font-semibold ${
                          paymentMethod === pm
                            ? "border-[#D9232A] bg-red-50 text-[#B71C22]"
                            : "border-slate-200 bg-white text-slate-600"
                        }`}
                      >
                        {pm}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-500">
                    Amount (₹)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-500">
                    Item Description
                  </label>
                  <Input
                    value={itemDescription}
                    onChange={(e) => setItemDescription(e.target.value)}
                    placeholder="Product name / SKU"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingOrderId(null)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={editPending}>
                {editPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Save Details</span>
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* Shipment & Courier Actions */}
      {order.status === "Unfulfilled" && !order.awb_number ? (
        <ManifestForm
          orderIds={[order.id]}
          products={products}
          defaultProductId={order.product_id}
          defaultDesc={order.item_description}
          defaultWeight={order.weight_grams ?? 500}
          orderPincode={order.pincode}
          paymentMethod={order.payment_method}
          orderAmount={order.total_amount}
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
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#D9232A] px-3 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-[#B71C22] active:scale-[0.98]"
            >
              <Printer className="h-4 w-4" />
              <span>Print 4x6 Label</span>
              <ExternalLink className="h-3 w-3 opacity-80" />
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

      {/* Cancel Shipment / Delete Draft Order Controls */}
      {canEditOrCancel && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          {!confirmCancel ? (
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-slate-600">
                <p className="font-semibold text-slate-800">
                  {order.awb_number
                    ? "Cancel Shipment in Delhivery One"
                    : "Remove Draft Order"}
                </p>
                <p className="text-[11px] text-slate-500">
                  {order.awb_number
                    ? "Cancels live AWB via Delhivery /api/p/edit before pickup"
                    : "Permanently removes this unfulfilled order from Kraftman"}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmCancelOrderId(order.id)}
                className="min-h-10 shrink-0 border-rose-200 text-rose-700 hover:bg-rose-50"
              >
                {order.awb_number ? (
                  <>
                    <Ban className="h-3.5 w-3.5" />
                    <span>Cancel AWB</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete</span>
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-rose-800">
                {order.awb_number
                  ? `Confirm cancelling AWB ${order.awb_number}?`
                  : `Confirm deleting order ${order.order_number}?`}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmCancelOrderId(null)}
                  disabled={cancelPending}
                >
                  Keep
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={cancelPending}
                  onClick={() =>
                    handleCancelOrDelete(
                      order.awb_number ? "cancel_shipment" : "delete_draft"
                    )
                  }
                >
                  {cancelPending && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  <span>
                    {order.awb_number ? "Yes, Cancel AWB" : "Yes, Delete"}
                  </span>
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

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
