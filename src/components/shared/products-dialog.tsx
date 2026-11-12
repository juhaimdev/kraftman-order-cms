"use client";

import * as React from "react";
import { Boxes, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createProductAction, deleteProductAction } from "@/actions/products";
import type { ProductPreset } from "@/lib/db/types";
import { formatINR } from "@/lib/utils";
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

interface ProductsDialogProps {
  products: ProductPreset[];
  triggerLabel?: string;
}

export function ProductsDialog({
  products,
  triggerLabel,
}: ProductsDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [saving, startSaving] = React.useTransition();
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const [name, setName] = React.useState("");
  const [sku, setSku] = React.useState("");
  const [sizeLabel, setSizeLabel] = React.useState("");
  const [weightGrams, setWeightGrams] = React.useState("500");
  const [lengthCm, setLengthCm] = React.useState("20");
  const [widthCm, setWidthCm] = React.useState("15");
  const [heightCm, setHeightCm] = React.useState("10");
  const [defaultPrice, setDefaultPrice] = React.useState("0");

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    startSaving(async () => {
      const res = await createProductAction({
        name,
        sku,
        size_label: sizeLabel,
        weight_grams: Number(weightGrams),
        length_cm: Number(lengthCm),
        width_cm: Number(widthCm),
        height_cm: Number(heightCm),
        default_price: Number(defaultPrice || 0),
      });

      if (res.error) {
        toast.error(res.error);
        return;
      }

      toast.success(`Saved product preset "${res.data?.name}"`);
      setName("");
      setSku("");
      setSizeLabel("");
    });
  }

  async function handleDelete(id: string, productName: string) {
    setDeletingId(id);
    const res = await deleteProductAction(id);
    setDeletingId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(`Removed "${productName}"`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          title="Saved products with preset size, weight & dimensions"
        >
          <Boxes className="h-4 w-4 text-slate-600" />
          <span className="hidden md:inline">
            {triggerLabel ?? "Products"}
          </span>
          {products.length > 0 && (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700">
              {products.length}
            </span>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Saved Product Presets ({products.length})</DialogTitle>
          <DialogDescription>
            Save item size, weight, and box dimensions once for 1-click AWB generation & smooth manifesting.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleAdd}
          className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Add Product Preset
          </p>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <label className="text-xs font-medium text-slate-700 sm:col-span-2">
              Product Name *
              <Input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Cotton Kurta Set"
                className="mt-1 bg-white"
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              Size / Variant
              <Input
                value={sizeLabel}
                onChange={(e) => setSizeLabel(e.target.value)}
                placeholder="M / Box-1"
                className="mt-1 bg-white"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-6">
            <label className="text-xs font-medium text-slate-700 sm:col-span-2">
              SKU (optional)
              <Input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="KURTA-M"
                className="mt-1 bg-white"
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              Weight (g) *
              <Input
                required
                type="number"
                min={1}
                max={50000}
                value={weightGrams}
                onChange={(e) => setWeightGrams(e.target.value)}
                className="mt-1 bg-white"
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              L (cm) *
              <Input
                required
                type="number"
                min={1}
                max={200}
                value={lengthCm}
                onChange={(e) => setLengthCm(e.target.value)}
                className="mt-1 bg-white"
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              W (cm) *
              <Input
                required
                type="number"
                min={1}
                max={200}
                value={widthCm}
                onChange={(e) => setWidthCm(e.target.value)}
                className="mt-1 bg-white"
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              H (cm) *
              <Input
                required
                type="number"
                min={1}
                max={200}
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className="mt-1 bg-white"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-2.5">
            <label className="w-36 text-xs font-medium text-slate-700">
              Default Price (₹)
              <Input
                type="number"
                min={0}
                step="0.01"
                value={defaultPrice}
                onChange={(e) => setDefaultPrice(e.target.value)}
                className="mt-1 bg-white"
              />
            </label>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span>Save Product</span>
            </Button>
          </div>
        </form>

        <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
          {products.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-500">
              No saved products yet. Add your first box/product preset above.
            </p>
          ) : (
            products.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-slate-900">
                      {p.name}
                    </span>
                    {p.size_label && (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                        {p.size_label}
                      </span>
                    )}
                    {p.sku && (
                      <span className="font-mono text-[10px] text-slate-500">
                        SKU: {p.sku}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-600">
                    {p.weight_grams}g · {p.length_cm}×{p.width_cm}×{p.height_cm} cm
                    {p.default_price > 0 ? ` · ${formatINR(p.default_price)}` : ""}
                  </p>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={deletingId === p.id}
                  onClick={() => handleDelete(p.id, p.name)}
                  aria-label={`Delete ${p.name}`}
                  className="text-slate-400 hover:text-rose-600"
                >
                  {deletingId === p.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

