"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { OrderWithShipment, ProductPreset } from "@/lib/db/types";
import { ManifestForm } from "./manifest-form";

interface BulkManifestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: OrderWithShipment[];
  products?: ProductPreset[];
  onCompleted: () => void;
}

export function BulkManifestDialog({
  open,
  onOpenChange,
  orders,
  products = [],
  onCompleted,
}: BulkManifestDialogProps) {
  const eligible = orders.filter(
    (o) => o.status === "Unfulfilled" && !o.awb_number
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk Generate AWB ({eligible.length})</DialogTitle>
          <DialogDescription>
            Manifest selected unfulfilled orders via Delhivery One CMU API. Already manifested orders are automatically skipped.
          </DialogDescription>
        </DialogHeader>

        {eligible.length === 0 ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            None of the selected orders are in <strong>Unfulfilled</strong> status.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100 text-xs">
              {eligible.map((o) => (
                <div key={o.id} className="flex items-center justify-between px-3 py-2">
                  <span className="font-semibold text-slate-800">{o.order_number}</span>
                  <span className="text-slate-500">
                    {o.customer_name} · {o.pincode} · {o.payment_method}
                  </span>
                </div>
              ))}
            </div>

            <ManifestForm
              orderIds={eligible.map((o) => o.id)}
              products={products}
              submitLabel={`Manifest ${eligible.length} Order${eligible.length === 1 ? "" : "s"}`}
              onSuccess={() => {
                onCompleted();
                onOpenChange(false);
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

