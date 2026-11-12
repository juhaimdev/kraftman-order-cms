"use client";

import * as React from "react";
import {
  AlertTriangle,
  CalendarClock,
  Loader2,
  PhoneCall,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { submitNdrResolutionAction } from "@/actions/ndr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface NdrActionsProps {
  awb: string;
  customerName: string;
  customerPhone: string;
  address: string;
  latestTrackingStatus: string | null;
  uplId: string | null;
}

export function NdrActions({
  awb,
  customerName,
  customerPhone,
  address,
  latestTrackingStatus,
  uplId,
}: NdrActionsProps) {
  const [pending, startTransition] = React.useTransition();
  const [mode, setMode] = React.useState<"none" | "defer" | "edit">("none");
  const [deferDate, setDeferDate] = React.useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [phone, setPhone] = React.useState(customerPhone);
  const [editAddress, setEditAddress] = React.useState(address);

  const isOfd =
    (latestTrackingStatus ?? "").toLowerCase().includes("out for delivery") ||
    (latestTrackingStatus ?? "").toLowerCase().includes("dispatched");

  function runAction(
    payload: Parameters<typeof submitNdrResolutionAction>[0],
    successMsg: string
  ) {
    startTransition(async () => {
      const res = await submitNdrResolutionAction(payload);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.data) {
        toast.success(
          res.data.uplId
            ? `${successMsg} · UPL: ${res.data.uplId}`
            : successMsg
        );
        setMode("none");
      }
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-red-200 bg-red-50/70 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide">
              NDR Exception Actions
            </h4>
            <p className="text-xs text-red-700/90">
              {latestTrackingStatus || "Delivery exception requires action"}
            </p>
          </div>
        </div>
        {uplId && (
          <span className="rounded bg-white px-2 py-0.5 text-[10px] font-mono text-slate-600 border border-red-200">
            UPL: {uplId}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="default"
          disabled={pending}
          onClick={() =>
            runAction(
              { action: "RE-ATTEMPT", waybill: awb },
              "Re-attempt scheduled"
            )
          }
          className="bg-slate-900 hover:bg-slate-800"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="h-4 w-4" />
          )}
          <span>Reattempt</span>
        </Button>

        <Button
          type="button"
          variant="destructive"
          disabled={pending || isOfd}
          title={
            isOfd
              ? "Cannot mark RTO while Out for Delivery"
              : "Cancel & Return to Origin"
          }
          onClick={() =>
            runAction({ action: "RTO", waybill: awb }, "Marked as RTO")
          }
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Undo2 className="h-4 w-4" />
          )}
          <span>Mark RTO</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => setMode(mode === "defer" ? "none" : "defer")}
        >
          <CalendarClock className="h-4 w-4" />
          <span>Defer Date</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => setMode(mode === "edit" ? "none" : "edit")}
        >
          <PhoneCall className="h-4 w-4" />
          <span>Edit Consignee</span>
        </Button>
      </div>

      {isOfd && (
        <p className="text-[11px] text-red-700">
          Note: RTO/cancellation is disabled while shipment is Out for Delivery.
        </p>
      )}

      {mode === "defer" && (
        <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-white p-3">
          <label className="text-xs font-medium text-slate-700">
            Preferred Delivery Date
          </label>
          <div className="flex gap-2">
            <Input
              type="date"
              value={deferDate}
              onChange={(e) => setDeferDate(e.target.value)}
            />
            <Button
              type="button"
              disabled={pending}
              onClick={() =>
                runAction(
                  {
                    action: "DEFER_DLV",
                    waybill: awb,
                    deferred_date: deferDate,
                  },
                  `Deferred to ${deferDate}`
                )
              }
            >
              Confirm
            </Button>
          </div>
        </div>
      )}

      {mode === "edit" && (
        <div className="space-y-2 rounded-lg border border-red-200 bg-white p-3">
          <label className="block text-xs font-medium text-slate-700">
            Updated 10-digit Phone ({customerName})
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1"
              placeholder="9876543210"
            />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            Updated Street Address
            <Input
              value={editAddress}
              onChange={(e) => setEditAddress(e.target.value)}
              className="mt-1"
            />
          </label>
          <Button
            type="button"
            disabled={pending}
            className="w-full"
            onClick={() =>
              runAction(
                {
                  action: "EDIT_DETAILS",
                  waybill: awb,
                  phone,
                  add: editAddress,
                },
                "Consignee details updated"
              )
            }
          >
            Save & Submit Update
          </Button>
        </div>
      )}
    </div>
  );
}

