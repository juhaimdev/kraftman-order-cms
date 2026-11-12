"use client";

import * as React from "react";
import { Calculator, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { calculateShippingRatesAction } from "@/actions/delhivery-ops";
import { createOrderAction } from "@/actions/orders";
import { checkServiceabilityAction } from "@/actions/serviceability";
import type { ProductPreset, ShippingRateQuote } from "@/lib/db/types";
import { cn } from "@/lib/utils";
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
  defaultOriginPin?: string;
}

export function AddOrderDialog({
  products = [],
  defaultOriginPin = "673602",
}: AddOrderDialogProps) {
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
  const [paymentMethod, setPaymentMethod] = React.useState<"COD" | "Prepaid">(
    "COD"
  );
  const [totalAmount, setTotalAmount] = React.useState("999");

  // Package specs for live shipping rate preview while booking order
  const [weightGrams, setWeightGrams] = React.useState("500");
  const [lengthCm, setLengthCm] = React.useState("20");
  const [breadthCm, setBreadthCm] = React.useState("15");
  const [heightCm, setHeightCm] = React.useState("10");

  const [pinMsg, setPinMsg] = React.useState<string | null>(null);
  const [rateQuotes, setRateQuotes] = React.useState<ShippingRateQuote[]>([]);
  const [rateError, setRateError] = React.useState<string | null>(null);
  const [rateLoading, setRateLoading] = React.useState(false);

  const fetchRateEstimate = React.useCallback(
    async (params: {
      destPin: string;
      weight: number;
      l: number;
      b: number;
      h: number;
      pm: "COD" | "Prepaid";
      amount: number;
    }) => {
      if (!/^\d{6}$/.test(params.destPin)) return;
      setRateLoading(true);
      setRateError(null);
      try {
        const res = await calculateShippingRatesAction({
          origin_pin: defaultOriginPin,
          destination_pin: params.destPin,
          weight_grams: Math.max(10, params.weight || 500),
          length_cm: Math.max(1, params.l || 20),
          breadth_cm: Math.max(1, params.b || 15),
          height_cm: Math.max(1, params.h || 10),
          packaging_type: "BOX",
          payment_method: params.pm,
          cod_amount: params.pm === "COD" ? params.amount || 0 : 0,
        });
        if (res.error) {
          setRateError(res.error);
          setRateQuotes([]);
        } else {
          setRateQuotes(res.data ?? []);
        }
      } finally {
        setRateLoading(false);
      }
    },
    [defaultOriginPin]
  );

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
    setWeightGrams(String(product.weight_grams));
    setLengthCm(String(product.length_cm));
    setBreadthCm(String(product.width_cm));
    setHeightCm(String(product.height_cm));
    const nextAmt =
      product.default_price > 0
        ? product.default_price
        : Number(totalAmount) || 0;
    if (product.default_price > 0) {
      setTotalAmount(String(product.default_price));
    }

    if (/^\d{6}$/.test(pincode)) {
      void fetchRateEstimate({
        destPin: pincode,
        weight: product.weight_grams,
        l: product.length_cm,
        b: product.width_cm,
        h: product.height_cm,
        pm: paymentMethod,
        amount: nextAmt,
      });
    }
  }

  function handleCheckPin(targetPin = pincode) {
    const cleanPin = targetPin.replace(/\D/g, "");
    if (cleanPin.length !== 6) return;
    setPinMsg(null);
    startPinTransition(async () => {
      const [pinRes] = await Promise.all([
        checkServiceabilityAction(cleanPin),
        fetchRateEstimate({
          destPin: cleanPin,
          weight: Number(weightGrams) || 500,
          l: Number(lengthCm) || 20,
          b: Number(breadthCm) || 15,
          h: Number(heightCm) || 10,
          pm: paymentMethod,
          amount: Number(totalAmount) || 0,
        }),
      ]);
      if (pinRes.error) {
        setPinMsg(pinRes.error);
        return;
      }
      if (pinRes.data) {
        if (!pinRes.data.serviceable) {
          setPinMsg("Unserviceable PIN code");
        } else {
          setPinMsg(
            `Serviceable · Express: ${pinRes.data.express ? "Yes" : "No"} · COD: ${pinRes.data.cod ? "Yes" : "No"}`
          );
          if (pinRes.data.city && !city) setCity(pinRes.data.city);
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
      setRateQuotes([]);
      setRateError(null);
    });
  }

  const expressQuote = rateQuotes.find((q) => q.mode === "EXPRESS");
  const surfaceQuote = rateQuotes.find((q) => q.mode === "SURFACE");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="primary" size="sm" className="shrink-0">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Order</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl max-h-[88dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Order</DialogTitle>
          <DialogDescription>
            Validated for Indian 10-digit mobile numbers &amp; 6-digit PINs with
            live Delhivery shipping rate estimate.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          {products.length > 0 && (
            <label className="block text-xs font-medium text-slate-700">
              Saved Product Preset (auto-fills size, weight &amp; price)
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
              10-Digit Mobile *
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
                  onChange={(e) => {
                    const next = e.target.value.replace(/\D/g, "");
                    setPincode(next);
                    if (next.length === 6) {
                      handleCheckPin(next);
                    }
                  }}
                  placeholder="560038"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleCheckPin(pincode)}
                  disabled={checkingPin || pincode.length !== 6}
                >
                  {checkingPin ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Check"
                  )}
                </Button>
              </div>
              {pinMsg && (
                <p className="mt-1 text-[11px] text-slate-600">{pinMsg}</p>
              )}
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
                onChange={(e) => {
                  const pm = e.target.value as "COD" | "Prepaid";
                  setPaymentMethod(pm);
                  if (/^\d{6}$/.test(pincode)) {
                    void fetchRateEstimate({
                      destPin: pincode,
                      weight: Number(weightGrams) || 500,
                      l: Number(lengthCm) || 20,
                      b: Number(breadthCm) || 15,
                      h: Number(heightCm) || 10,
                      pm,
                      amount: Number(totalAmount) || 0,
                    });
                  }
                }}
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

          {/* Package Weight & Dimensions for Live Shipping Cost Preview */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <Calculator className="h-3.5 w-3.5 text-emerald-600" />
                Shipping Price Preview (from PIN {defaultOriginPin})
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={rateLoading || pincode.length !== 6}
                onClick={() =>
                  void fetchRateEstimate({
                    destPin: pincode,
                    weight: Number(weightGrams) || 500,
                    l: Number(lengthCm) || 20,
                    b: Number(breadthCm) || 15,
                    h: Number(heightCm) || 10,
                    pm: paymentMethod,
                    amount: Number(totalAmount) || 0,
                  })
                }
                className="min-h-8 h-8 text-[11px]"
              >
                {rateLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Calculator className="h-3 w-3" />
                )}
                <span>Recalculate</span>
              </Button>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <label className="text-[11px] font-medium text-slate-500">
                Wt (g)
                <Input
                  type="number"
                  min={10}
                  value={weightGrams}
                  onChange={(e) => setWeightGrams(e.target.value)}
                  className="mt-0.5 h-9 font-mono text-xs"
                />
              </label>
              <label className="text-[11px] font-medium text-slate-500">
                L (cm)
                <Input
                  type="number"
                  min={1}
                  value={lengthCm}
                  onChange={(e) => setLengthCm(e.target.value)}
                  className="mt-0.5 h-9 font-mono text-xs"
                />
              </label>
              <label className="text-[11px] font-medium text-slate-500">
                B (cm)
                <Input
                  type="number"
                  min={1}
                  value={breadthCm}
                  onChange={(e) => setBreadthCm(e.target.value)}
                  className="mt-0.5 h-9 font-mono text-xs"
                />
              </label>
              <label className="text-[11px] font-medium text-slate-500">
                H (cm)
                <Input
                  type="number"
                  min={1}
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  className="mt-0.5 h-9 font-mono text-xs"
                />
              </label>
            </div>

            {rateLoading ? (
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                Calculating Delhivery shipping price for PIN {pincode}...
              </p>
            ) : rateQuotes.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {expressQuote && (
                  <div className="rounded-lg border border-red-200 bg-white px-2.5 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-[#D9232A] px-1.5 py-0.5 text-[9px] font-bold text-white">
                        EXPRESS
                      </span>
                      <span className="font-mono text-[10px] text-slate-500">
                        Zone {expressQuote.zone} · {expressQuote.charged_weight}g
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-sm font-bold text-slate-950">
                      ₹{expressQuote.total_amount.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Net after ship:{" "}
                      <strong className="text-emerald-700">
                        ₹
                        {(
                          (Number(totalAmount) || 0) -
                          expressQuote.total_amount
                        ).toFixed(2)}
                      </strong>
                    </p>
                  </div>
                )}
                {surfaceQuote && (
                  <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold text-white">
                        SURFACE
                      </span>
                      <span className="font-mono text-[10px] text-slate-500">
                        Zone {surfaceQuote.zone} · {surfaceQuote.charged_weight}g
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-sm font-bold text-slate-950">
                      ₹{surfaceQuote.total_amount.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Net after ship:{" "}
                      <strong className="text-emerald-700">
                        ₹
                        {(
                          (Number(totalAmount) || 0) -
                          surfaceQuote.total_amount
                        ).toFixed(2)}
                      </strong>
                    </p>
                  </div>
                )}
              </div>
            ) : rateError ? (
              <p className="text-[11px] text-amber-700">{rateError}</p>
            ) : (
              <p className={cn("text-[11px] text-slate-500")}>
                Enter a 6-digit customer PIN code above to auto-calculate live
                Delhivery Express &amp; Surface courier cost before booking.
              </p>
            )}
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={pending}
            className="w-full"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>Save Order</span>
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
