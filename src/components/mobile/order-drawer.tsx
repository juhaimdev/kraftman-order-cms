"use client";

import { Drawer } from "vaul";
import type { OrderWithShipment, ProductPreset } from "@/lib/db/types";
import { OrderDetailBody } from "@/components/shared/order-detail-body";
import { X } from "lucide-react";

interface OrderDrawerProps {
  order: OrderWithShipment | null;
  products?: ProductPreset[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrderDrawer({
  order,
  products = [],
  open,
  onOpenChange,
}: OrderDrawerProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px]" />
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl focus:outline-none pb-[env(safe-area-inset-bottom)]"
        >
          {/* Swipe Handle */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="w-11" />
            <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-300" />
            <Drawer.Close
              aria-label="Close order details"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <X className="h-5 w-5" />
            </Drawer.Close>
          </div>

          <Drawer.Title className="sr-only">
            {order ? `Order ${order.order_number} details` : "Order details"}
          </Drawer.Title>

          <div className="flex-1 overflow-y-auto overscroll-contain">
            {order && (
              <OrderDetailBody
                order={order}
                products={products}
                onManifestSuccess={() => onOpenChange(false)}
              />
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

