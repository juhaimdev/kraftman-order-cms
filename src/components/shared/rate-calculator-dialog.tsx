"use client";

import * as React from "react";
import { Calculator, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { calculateShippingRatesAction } from "@/actions/delhivery-ops";
import type { ProductPreset, ShippingRateQuote } from "@/lib/db/types";
import { cn, formatINR } from "@/lib/utils";
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

interface RateCalculatorDialogProps {
  products?: ProductPreset[];
  defaultOriginPin?: string;
}

export function RateCalculatorDialog({
  products = [],
  defaultOriginPin = "673602",
}: RateCalculatorDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [selectedPresetId, setSelectedPresetId] = React.useState("");
  const [originPin, setOriginPin] = React.useState(defaultOriginPin);
  const [destPin, setDestPin] = React.useState("400001");
  const [weightGrams, setWeightGrams] = React.useState("500");
  const [lengthCm, setLengthCm] = React.useState("20");
  const [breadthCm, setBreadthCm] = React.useState("15");
  const [heightCm, setHeightCm] = React.useState("10");
  const [packagingType, setPackagingType] = React.useState<"BOX" | "FLYER">(
    "BOX"
  );
  const [paymentMode, setPaymentMode] = React.useState<"Prepaid" | "COD">(
    "Prepaid"
  );
  const [codAmount, setCodAmount] = React.useState("999");
  const [quotes, setQuotes] = React.useState<ShippingRateQuote[]>([]);
  const [pending, startTransition] = React.useTransition();

  function handlePresetChange(id: string) {
    setSelectedPresetId(id);
    const p = products.find((item) => item.id === id);
    if (!p) return;
    setWeightGrams(String(p.weight_grams));
    setLengthCm(String(p.length_cm));
    setBreadthCm(String(p.width_cm));
    setHeightCm(String(p.height_cm));
    if (p.default_price > 0) {
      setCodAmount(String(p.default_price));
    }
  }

  function handleCalculate(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await calculateShippingRatesAction({
        origin_pin: originPin,
        destination_pin: destPin,
        weight_grams: Number(weightGrams) || 500,
        length_cm: Number(lengthCm) || 20,
        breadth_cm: Number(breadthCm) || 15,
        height_cm: Number(heightCm) || 10,
        packaging_type: packagingType,
        payment_method: paymentMode,
        cod_amount: paymentMode === "COD" ? Number(codAmount) || 0 : 0,
      });

      if (res.error) {
        toast.error(res.error);
        return;
      }
      setQuotes(res.data ?? []);
    });
  }

  const volWeightGrams = Math.round(
    ((Number(lengthCm) || 0) *
      (Number(breadthCm) || 0) *
      (Number(heightCm) || 0)) /
      5
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          title="Delhivery One Shipping Price Calculator"
          className="border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
        >
          <Calculator className="h-4 w-4 text-emerald-600" />
          <span className="hidden sm:inline">Price Calc</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl max-h-[88dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <Calculator className="h-4 w-4" />
            </span>
            Kraftman Shipping Price Calculator
          </DialogTitle>
          <DialogDescription>
            Live contract rates from Delhivery One comparing Express vs Surface
            with GST, COD &amp; volumetric weight.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleCalculate} className="space-y-3">
          {products.length > 0 && (
            <label className="block text-xs font-medium text-slate-700">
              Quick-Fill from Saved Product
              <select
                value={selectedPresetId}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="mt-1 flex min-h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="">-- Custom Weight &amp; Dimensions --</option>
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

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <label className="text-xs font-medium text-slate-700">
              Origin PIN *
              <Input
                value={originPin}
                maxLength={6}
                inputMode="numeric"
                onChange={(e) => setOriginPin(e.target.value.replace(/\D/g, ""))}
                required
                className="mt-1 font-mono"
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              Destination PIN *
              <Input
                value={destPin}
                maxLength={6}
                inputMode="numeric"
                onChange={(e) => setDestPin(e.target.value.replace(/\D/g, ""))}
                required
                className="mt-1 font-mono"
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              Dead Weight (g) *
              <Input
                type="number"
                min={10}
                value={weightGrams}
                onChange={(e) => setWeightGrams(e.target.value)}
                required
                className="mt-1 font-mono"
              />
            </label>
            <div className="text-xs font-medium text-slate-700">
              Packaging
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                {(["BOX", "FLYER"] as const).map((pkg) => (
                  <button
                    key={pkg}
                    type="button"
                    onClick={() => setPackagingType(pkg)}
                    className={cn(
                      "min-h-11 rounded-md border text-xs font-semibold cursor-pointer",
                      packagingType === pkg
                        ? "border-[#D9232A] bg-red-50 text-[#B71C22]"
                        : "border-slate-200 bg-white text-slate-600"
                    )}
                  >
                    {pkg}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
            <label className="text-xs font-medium text-slate-700">
              L (cm)
              <Input
                type="number"
                min={1}
                value={lengthCm}
                onChange={(e) => setLengthCm(e.target.value)}
                className="mt-1 font-mono"
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              B (cm)
              <Input
                type="number"
                min={1}
                value={breadthCm}
                onChange={(e) => setBreadthCm(e.target.value)}
                className="mt-1 font-mono"
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              H (cm)
              <Input
                type="number"
                min={1}
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className="mt-1 font-mono"
              />
            </label>
            <div className="text-xs font-medium text-slate-700">
              Payment Mode
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                {(["Prepaid", "COD"] as const).map((pm) => (
                  <button
                    key={pm}
                    type="button"
                    onClick={() => setPaymentMode(pm)}
                    className={cn(
                      "min-h-11 rounded-md border text-xs font-semibold cursor-pointer",
                      paymentMode === pm
                        ? "border-[#D9232A] bg-red-50 text-[#B71C22]"
                        : "border-slate-200 bg-white text-slate-600"
                    )}
                  >
                    {pm}
                  </button>
                ))}
              </div>
            </div>
            <label className="text-xs font-medium text-slate-700">
              COD Value (₹)
              <Input
                type="number"
                min={0}
                disabled={paymentMode !== "COD"}
                value={codAmount}
                onChange={(e) => setCodAmount(e.target.value)}
                className="mt-1 font-mono"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span>
              Volumetric weight: <strong className="font-mono">{volWeightGrams}g</strong> · Billable:{" "}
              <strong className="font-mono">
                {Math.max(Number(weightGrams) || 0, volWeightGrams)}g
              </strong>
            </span>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Calculator className="h-4 w-4" />
              )}
              <span>Estimate Price</span>
            </Button>
          </div>
        </form>

        {quotes.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-1">
            {quotes.map((q) => (
              <div
                key={q.mode}
                className={cn(
                  "rounded-xl border p-4 space-y-2.5",
                  q.mode === "EXPRESS"
                    ? "border-red-200 bg-red-50/30"
                    : "border-slate-200 bg-white"
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider",
                      q.mode === "EXPRESS"
                        ? "bg-[#D9232A] text-white"
                        : "bg-slate-800 text-white"
                    )}
                  >
                    {q.mode}
                  </span>
                  <span className="font-mono text-xs font-semibold text-slate-600">
                    Zone {q.zone} · {q.charged_weight}g billable
                  </span>
                </div>

                <div className="text-2xl font-extrabold text-slate-950 font-mono">
                  {formatINR(q.total_amount)}
                  <span className="ml-1.5 text-xs font-medium text-slate-500 font-sans">
                    (₹{q.total_amount.toFixed(2)} incl. GST)
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5 border-t border-slate-200/70 pt-2 text-[11px] text-slate-600">
                  <span>Base Freight: ₹{q.freight_cost.toFixed(2)}</span>
                  <span>Fuel Surcharge: ₹{q.fuel_surcharge.toFixed(2)}</span>
                  <span>COD Charge: ₹{q.charged_cod.toFixed(2)}</span>
                  <span>DPH / Handling: ₹{q.dph_charge.toFixed(2)}</span>
                  <span className="col-span-2 font-mono text-slate-500">
                    GST: CGST ₹{q.cgst.toFixed(2)} · SGST ₹{q.sgst.toFixed(2)} ·
                    IGST ₹{q.igst.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

