"use client";

import * as React from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { createOrderAction } from "@/actions/orders";
import { checkServiceabilityAction } from "@/actions/serviceability";
import type { ProductPreset } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface AddOrderDialogProps {
  products?: ProductPreset[];
}

export function AddOrderDialog({ products = [] }: AddOrderDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [checkingPin, startPinTransition] = React.useTransition();

  const [selectedProductId, setSelectedProductId] = React.useState("");
  const [itemDescription, setItemDescription] = React.useState("");
  const [orderNumber, setOrderNumber] = React.useState("");
  const [customerName, setCustomerName] = React.useState("");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [city, setCity] = React.useState("");
  const [state, setState] = React.useState("");
  const [pincode, setPincode] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState<"COD" | "Prepaid">("COD");
  const [totalAmount, setTotalAmount] = React.useState("999");
  const [pinMsg, setPinMsg] = React.useState<string | null>(null);

  function handleSelectProduct(productId: string) {
    setSelectedProductId(productId);
    const product = products.find((p) => p.id === productId);
    if (!product) {
      setItemDescription("");
      return;
    }
    const label = product.size_label
      ? `${product.name} (${product.size_label})`
      : product.name;
    setItemDescription(label);
    if (product.default_price > 0) {
      setTotalAmount(String(product.default_price));
    }
  }

  function handleCheckPin() {
    setPinMsg(null);
    startPinTransition(async () => {
      const res = await checkServiceabilityAction(pincode);
      if (res.error) {
        setPinMsg(res.error);
        return;
      }
      if (res.data) {
        if (!res.data.serviceable) {
          setPinMsg("Unserviceable PIN code");
        } else {
          setPinMsg(
            `Serviceable · Express: ${res.data.express ? "Yes" : "No"} · COD: ${res.data.cod ? "Yes" : "No"}`
          );
          if (res.data.city && !city) setCity(res.data.city);
        }
      }
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createOrderAction({
        order_number: orderNumber,
        customer_name: customerName,
        customer_phone: customerPhone,
        address,
        city,
        state,
        pincode,
        payment_method: paymentMethod,
        total_amount: Number(totalAmount),
        product_id: selectedProductId,
        item_description: itemDescription,
      });

      if (res.error) {
        toast.error(res.error);
        return;
      }

      toast.success(`Order ${res.data?.orderNumber} created`);
      setOpen(false);
      setSelectedProductId("");
      setItemDescription("");
      setOrderNumber("");
      setCustomerName("");
      setCustomerPhone("");
      setAddress("");
      setCity("");
      setState("");
      setPincode("");
      setPinMsg(null);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="primary" size="sm" className="shrink-0">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Order</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Order</DialogTitle>
          <DialogDescription>
            Validated for Indian 10-digit mobile numbers and 6-digit PIN codes.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          {products.length > 0 && (
            <label className="block text-xs font-medium text-slate-700">
              Saved Product Preset (auto-fills size, weight & price)
              <select
                value={selectedProductId}
                onChange={(e) => handleSelectProduct(e.target.value)}
                className="mt-1 flex min-h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="">-- Custom / Select saved product --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.size_label ? ` (${p.size_label})` : ""} · {p.weight_grams}g ·{" "}
                    {p.length_cm}×{p.width_cm}×{p.height_cm} cm
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-700">
              Order # (optional)
              <Input
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="Auto-generated if blank"
                className="mt-1"
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              Customer Name *
              <Input
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Priya Sharma"
                className="mt-1"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-700">
              10-Digit Phone *
              <Input
                required
                type="tel"
                inputMode="numeric"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="9876543210"
                className="mt-1"
              />
            </label>
            <div className="text-xs font-medium text-slate-700">
              PIN Code *
              <div className="mt-1 flex gap-1.5">
                <Input
                  required
                  inputMode="numeric"
                  maxLength={6}
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  placeholder="560038"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCheckPin}
                  disabled={checkingPin || pincode.length !== 6}
                >
                  {checkingPin ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check"}
                </Button>
              </div>
              {pinMsg && <p className="mt-1 text-[11px] text-slate-600">{pinMsg}</p>}
            </div>
          </div>

          <label className="block text-xs font-medium text-slate-700">
            Street Address *
            <Input
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="42, 100 Feet Road, Indiranagar"
              className="mt-1"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-slate-700">
              City *
              <Input
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Bengaluru"
                className="mt-1"
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              State *
              <Input
                required
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="Karnataka"
                className="mt-1"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-slate-700">
              Payment Mode
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as "COD" | "Prepaid")}
                className="mt-1 flex min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="COD">COD</option>
                <option value="Prepaid">Prepaid</option>
              </select>
            </label>
            <label className="text-xs font-medium text-slate-700">
              Order Amount (₹)
              <Input
                required
                type="number"
                min={0}
                step="0.01"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                className="mt-1"
              />
            </label>
          </div>

          <Button type="submit" variant="default" disabled={pending} className="w-full">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>Save Order</span>
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

