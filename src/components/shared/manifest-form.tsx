"use client";

import * as React from "react";
import { Boxes, Calculator, Loader2, PackagePlus, Zap } from "lucide-react";
import { toast } from "sonner";
import { calculateShippingRatesAction } from "@/actions/delhivery-ops";
import { createShipmentsAction } from "@/actions/shipments";
import type { ProductPreset, ShippingRateQuote } from "@/lib/db/types";
import { cn, triggerLabelDownload } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ManifestFormProps {
  orderIds: string[];
  products?: ProductPreset[];
  defaultProductId?: string | null;
  defaultDesc?: string | null;
  defaultWeight?: number;
  orderPincode?: string;
  paymentMethod?: "COD" | "Prepaid";
  orderAmount?: number;
  onSuccess?: () => void;
  submitLabel?: string;
}

export function ManifestForm({
  orderIds,
  products = [],
  defaultProductId,
  defaultDesc,
  defaultWeight = 500,
  orderPincode,
  paymentMethod = "Prepaid",
  orderAmount = 0,
  onSuccess,
  submitLabel,
}: ManifestFormProps) {
  const initialProduct = React.useMemo(
    () => products.find((p) => p.id === defaultProductId) ?? null,
    [products, defaultProductId]
  );

  const [selectedPresetId, setSelectedPresetId] = React.useState<string>(
    initialProduct?.id ?? ""
  );
  const [weight, setWeight] = React.useState(
    String(initialProduct?.weight_grams ?? defaultWeight)
  );
  const [length, setLength] = React.useState(
    String(initialProduct?.length_cm ?? 20)
  );
  const [width, setWidth] = React.useState(
    String(initialProduct?.width_cm ?? 15)
  );
  const [height, setHeight] = React.useState(
    String(initialProduct?.height_cm ?? 10)
  );
  const [productsDesc, setProductsDesc] = React.useState(
    defaultDesc ??
      (initialProduct
        ? `${initialProduct.name}${initialProduct.size_label ? ` (${initialProduct.size_label})` : ""}`
        : "")
  );
  const [quotes, setQuotes] = React.useState<ShippingRateQuote[]>([]);
  const [rateLoading, setRateLoading] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  async function handleEstimatePrice() {
    if (!orderPincode || !/^\d{6}$/.test(orderPincode)) {
      toast.error("Valid 6-digit customer PIN code required to check rate.");
      return;
    }
    setRateLoading(true);
    try {
      const res = await calculateShippingRatesAction({
        origin_pin: "673602",
        destination_pin: orderPincode,
        weight_grams: Math.max(10, Number(weight) || 500),
        length_cm: Math.max(1, Number(length) || 20),
        breadth_cm: Math.max(1, Number(width) || 15),
        height_cm: Math.max(1, Number(height) || 10),
        packaging_type: "BOX",
        payment_method: paymentMethod,
        cod_amount: paymentMethod === "COD" ? orderAmount : 0,
      });
      if (res.error) {
        toast.error(res.error);
      } else {
        setQuotes(res.data ?? []);
      }
    } finally {
      setRateLoading(false);
    }
  }

  function runManifest(params: {
    weightGrams: number;
    length: number;
    width: number;
    height: number;
    desc?: string;
  }) {
    startTransition(async () => {
      const res = await createShipmentsAction({
        orderIds,
        weightGrams: params.weightGrams,
        dimensions: {
          length: params.length,
          width: params.width,
          height: params.height,
        },
        productsDesc: params.desc,
      });

      if (res.error) {
        toast.error(res.error);
        return;
      }

      if (res.data) {
        const { succeeded, failed } = res.data;
        if (succeeded.length > 0) {
          const wbns = succeeded.map((s) => s.awb);
          toast.success(
            succeeded.length === 1
              ? `Manifested! AWB: ${succeeded[0].awb}`
              : `Manifested ${succeeded.length} shipment(s)`,
            {
              action: {
                label: "Download Label",
                onClick: () => triggerLabelDownload(wbns),
              },
            }
          );
        }
        if (failed.length > 0) {
          toast.error(
            `${failed.length} failed: ${failed[0].orderNumber} — ${failed[0].reason}`
          );
        }
        if (succeeded.length > 0) {
          onSuccess?.();
        }
      }
    });
  }

  function applyPreset(preset: ProductPreset, manifestImmediately = false) {
    const desc = preset.size_label
      ? `${preset.name} (${preset.size_label})`
      : preset.name;
    setSelectedPresetId(preset.id);
    setWeight(String(preset.weight_grams));
    setLength(String(preset.length_cm));
    setWidth(String(preset.width_cm));
    setHeight(String(preset.height_cm));
    setProductsDesc(desc);

    if (manifestImmediately) {
      runManifest({
        weightGrams: preset.weight_grams,
        length: preset.length_cm,
        width: preset.width_cm,
        height: preset.height_cm,
        desc,
      });
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    runManifest({
      weightGrams: Number(weight),
      length: Number(length),
      width: Number(width),
      height: Number(height),
      desc: productsDesc,
    });
  }

  const activePreset = products.find((p) => p.id === selectedPresetId) ?? null;

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5"
    >
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Package Specs & Manifest
        </h4>
        <span className="text-xs text-slate-500">
          {orderIds.length} order{orderIds.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Saved Product 1-Click Presets */}
      {products.length > 0 && (
        <div className="space-y-2 rounded-lg border border-blue-200/80 bg-blue-50/50 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-900">
              <Boxes className="h-3.5 w-3.5 text-blue-600" />
              Saved Products (tap to fill)
            </span>
            {activePreset && (
              <button
                type="button"
                disabled={pending}
                onClick={() => applyPreset(activePreset, true)}
                className="inline-flex min-h-8 items-center gap-1 rounded-md bg-blue-600 px-2.5 text-[11px] font-semibold text-white shadow-2xs hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
              >
                <Zap className="h-3 w-3" />
                <span>1-Click Process</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {products.map((preset) => {
              const selected = selectedPresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset, false)}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-left text-xs transition-colors cursor-pointer",
                    selected
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/40"
                  )}
                >
                  <span className="font-semibold">
                    {preset.name}
                    {preset.size_label ? ` (${preset.size_label})` : ""}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[10px]",
                      selected ? "text-blue-100" : "text-slate-500"
                    )}
                  >
                    {preset.weight_grams}g · {preset.length_cm}×{preset.width_cm}×{preset.height_cm}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Weight (g)
          <Input
            type="number"
            min={1}
            max={50000}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Length (cm)
          <Input
            type="number"
            min={1}
            max={200}
            value={length}
            onChange={(e) => setLength(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Width (cm)
          <Input
            type="number"
            min={1}
            max={200}
            value={width}
            onChange={(e) => setWidth(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Height (cm)
          <Input
            type="number"
            min={1}
            max={200}
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            required
          />
        </label>
      </div>

      {orderPincode && /^\d{6}$/.test(orderPincode) && (
        <div className="space-y-2 rounded-lg border border-emerald-200/80 bg-emerald-50/40 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-950">
              <Calculator className="h-3.5 w-3.5 text-emerald-600" />
              Estimated Shipping Cost (to {orderPincode})
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={rateLoading}
              onClick={() => void handleEstimatePrice()}
              className="min-h-8 h-8 text-[11px] bg-white"
            >
              {rateLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Calculator className="h-3 w-3" />
              )}
              <span>{quotes.length > 0 ? "Refresh Rate" : "Check Price"}</span>
            </Button>
          </div>
          {quotes.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {quotes.map((q) => (
                <div
                  key={q.mode}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px]"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{q.mode}</span>
                    <span className="font-mono text-slate-500">Zone {q.zone}</span>
                  </div>
                  <p className="font-mono text-sm font-bold text-slate-950">
                    ₹{q.total_amount.toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        disabled={pending || orderIds.length === 0}
        className="w-full"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <PackagePlus className="h-4 w-4" />
        )}
        <span>{submitLabel ?? "Generate AWB & Manifest"}</span>
      </Button>
    </form>
  );
}
