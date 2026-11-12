"use client";

import type { OrderWithShipment, ProductPreset } from "@/lib/db/types";
import { OrderDetailBody } from "@/components/shared/order-detail-body";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PackageOpen, X } from "lucide-react";

interface SidePanelProps {
  order: OrderWithShipment | null;
  products?: ProductPreset[];
  open: boolean;
  onClose: () => void;
}

export function SidePanel({
  order,
  products = [],
  open,
  onClose,
}: SidePanelProps) {
  return (
    <>
      {/* Desktop (>= lg): Persistent Dual-Pane Right Split Panel */}
      <aside className="hidden lg:flex w-[400px] xl:w-[440px] shrink-0 flex-col rounded-xl border border-slate-200 bg-white shadow-2xs sticky top-[128px] max-h-[calc(100dvh-144px)] overflow-hidden">
        {order ? (
          <>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Shipment Inspector
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close inspector"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <OrderDetailBody order={order} products={products} />
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <PackageOpen className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-800">
              Select an order to inspect
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Click any row to check PIN serviceability, manifest AWB, print 4x6 thermal labels, or resolve NDR exceptions.
            </p>
          </div>
        )}
      </aside>

      {/* Tablet (md only, hidden below md and hidden on lg+): Slide-over Right Sheet */}
      <div className="hidden md:block lg:hidden">
        <Sheet open={open && Boolean(order)} onOpenChange={(v) => !v && onClose()}>
          <SheetContent side="right" className="overflow-hidden">
            <SheetHeader>
              <SheetTitle>
                {order ? `Order ${order.order_number}` : "Order Details"}
              </SheetTitle>
              <SheetDescription>
                Delhivery One shipping & tracking inspector
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto">
              {order && (
                <OrderDetailBody
                  order={order}
                  products={products}
                  onManifestSuccess={onClose}
                />
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

