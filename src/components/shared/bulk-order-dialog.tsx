"use client";

import * as React from "react";
import {
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  Layers,
  Loader2,
  Plus,
  Printer,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { createBulkOrdersAction, type BulkCreateResult } from "@/actions/orders";
import { createShipmentsAction } from "@/actions/shipments";
import type { ProductPreset } from "@/lib/db/types";
import type { CreateOrderInput } from "@/lib/validations/shipping";
import { cn, getLabelUrl, triggerLabelDownload } from "@/lib/utils";
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

interface BulkOrderDialogProps {
  products?: ProductPreset[];
  triggerVariant?: "outline" | "primary";
}

interface DraftRow {
  uid: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  payment_method: "COD" | "Prepaid";
  total_amount: string;
  item_description: string;
}

function makeEmptyRow(preset?: ProductPreset | null): DraftRow {
  const itemDesc = preset
    ? preset.size_label
      ? `${preset.name} (${preset.size_label})`
      : preset.name
    : "";
  return {
    uid: Math.random().toString(36).slice(2, 10),
    order_number: "",
    customer_name: "",
    customer_phone: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    payment_method: "COD",
    total_amount: preset && preset.default_price > 0 ? String(preset.default_price) : "999",
    item_description: itemDesc,
  };
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cols.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cols.push(cur.trim());
  return cols;
}

function parseBulkCsvText(
  rawText: string,
  preset?: ProductPreset | null
): Array<DraftRow & { lineNumber: number }> {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const first = lines[0].toLowerCase();
  const hasHeader =
    first.includes("customer") ||
    first.includes("phone") ||
    first.includes("pincode") ||
    first.includes("address");

  const startIndex = hasHeader ? 1 : 0;
  const defaultDesc = preset
    ? preset.size_label
      ? `${preset.name} (${preset.size_label})`
      : preset.name
    : "";
  const defaultAmt =
    preset && preset.default_price > 0 ? String(preset.default_price) : "999";

  const parsed: Array<DraftRow & { lineNumber: number }> = [];

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const delimiter = line.includes("\t") ? "\t" : ",";
    const cols = splitCsvLine(line, delimiter);
    if (cols.length < 4) continue;

    // Supported format:
    // customer_name, customer_phone, address, city, state, pincode, payment_method, total_amount, order_number, item_description
    const payRaw = (cols[6] ?? "COD").toLowerCase();
    const payment_method: "COD" | "Prepaid" = payRaw.includes("prepaid")
      ? "Prepaid"
      : "COD";

    parsed.push({
      uid: `csv-${i}`,
      lineNumber: i + 1,
      customer_name: cols[0] ?? "",
      customer_phone: cols[1] ?? "",
      address: cols[2] ?? "",
      city: cols[3] ?? "",
      state: cols[4] ?? "",
      pincode: cols[5] ?? "",
      payment_method,
      total_amount: cols[7] || defaultAmt,
      order_number: cols[8] ?? "",
      item_description: cols[9] || defaultDesc,
    });
  }

  return parsed;
}

export function BulkOrderDialog({
  products = [],
  triggerVariant = "outline",
}: BulkOrderDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"rows" | "csv">("rows");
  const [selectedProductId, setSelectedProductId] = React.useState("");
  const [rows, setRows] = React.useState<DraftRow[]>(() => [
    makeEmptyRow(null),
    makeEmptyRow(null),
  ]);
  const [csvText, setCsvText] = React.useState("");
  const [autoManifest, setAutoManifest] = React.useState(true);
  const [weightGrams, setWeightGrams] = React.useState("500");
  const [lengthCm, setLengthCm] = React.useState("20");
  const [widthCm, setWidthCm] = React.useState("15");
  const [heightCm, setHeightCm] = React.useState("10");

  const [pending, startTransition] = React.useTransition();
  const [shipLaterPending, startShipLater] = React.useTransition();
  const [result, setResult] = React.useState<BulkCreateResult | null>(null);

  const selectedProduct = React.useMemo(
    () => products.find((p) => p.id === selectedProductId) ?? null,
    [products, selectedProductId]
  );

  const csvPreviewRows = React.useMemo(
    () => parseBulkCsvText(csvText, selectedProduct),
    [csvText, selectedProduct]
  );

  function handlePresetChange(productId: string) {
    setSelectedProductId(productId);
    const p = products.find((item) => item.id === productId) ?? null;
    if (!p) return;

    setWeightGrams(String(p.weight_grams));
    setLengthCm(String(p.length_cm));
    setWidthCm(String(p.width_cm));
    setHeightCm(String(p.height_cm));

    const label = p.size_label ? `${p.name} (${p.size_label})` : p.name;
    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        item_description: row.item_description || label,
        total_amount:
          p.default_price > 0 && (!row.total_amount || row.total_amount === "999")
            ? String(p.default_price)
            : row.total_amount,
      }))
    );
  }

  function updateRow(uid: string, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  }

  function addRow(cloneLast = false) {
    setRows((prev) => {
      if (prev.length >= 100) {
        toast.info("Maximum 100 rows per batch");
        return prev;
      }
      if (cloneLast && prev.length > 0) {
        const last = prev[prev.length - 1];
        return [
          ...prev,
          {
            ...last,
            uid: Math.random().toString(36).slice(2, 10),
            order_number: "",
            customer_name: "",
            customer_phone: "",
          },
        ];
      }
      return [...prev, makeEmptyRow(selectedProduct)];
    });
  }

  function removeRow(uid: string) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.uid !== uid)));
  }

  function handleCsvFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === "string" ? reader.result : "";
      setCsvText(content);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleDownloadTemplate() {
    const header =
      "customer_name,customer_phone,address,city,state,pincode,payment_method,total_amount,order_number,item_description";
    const sample1 =
      "Aarav Nair,9876543210,12 MG Road Indiranagar,Bengaluru,Karnataka,560038,COD,1299,,Kraftman Signature Box";
    const sample2 =
      "Diya Menon,9847012345,45 Marine Drive,Kochi,Kerala,682031,Prepaid,999,,Kraftman Classic Pack";
    const blob = new Blob([[header, sample1, sample2].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kraftman-bulk-orders-template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleLoadSampleCsv() {
    setCsvText(
      [
        "customer_name,customer_phone,address,city,state,pincode,payment_method,total_amount,order_number",
        "Rahul Sharma,9876543210,24 Park Street,Kolkata,West Bengal,700016,COD,1199,",
        "Sneha Nair,9847123456,18 MG Road,Kochi,Kerala,682011,Prepaid,899,",
      ].join("\n")
    );
  }

  function resetDialogState() {
    setResult(null);
    setRows([makeEmptyRow(selectedProduct), makeEmptyRow(selectedProduct)]);
    setCsvText("");
  }

  function handleSubmitBulk(e: React.FormEvent) {
    e.preventDefault();
    const activeRows =
      mode === "csv"
        ? csvPreviewRows
        : rows.filter(
            (r) =>
              r.customer_name.trim() ||
              r.customer_phone.trim() ||
              r.address.trim() ||
              r.pincode.trim()
          );

    if (activeRows.length === 0) {
      toast.error("Fill in at least one complete order row first.");
      return;
    }

    const orderInputs: CreateOrderInput[] = activeRows.map((r) => ({
      order_number: r.order_number.trim(),
      customer_name: r.customer_name.trim(),
      customer_phone: r.customer_phone.trim(),
      address: r.address.trim(),
      city: r.city.trim(),
      state: r.state.trim(),
      pincode: r.pincode.trim(),
      payment_method: r.payment_method,
      total_amount: Number(r.total_amount) || 0,
      product_id: selectedProductId,
      item_description: r.item_description.trim(),
    }));

    startTransition(async () => {
      const desc = selectedProduct
        ? selectedProduct.size_label
          ? `${selectedProduct.name} (${selectedProduct.size_label})`
          : selectedProduct.name
        : undefined;

      const res = await createBulkOrdersAction({
        orders: orderInputs,
        autoManifest,
        weightGrams: Number(weightGrams) || 500,
        dimensions: {
          length: Number(lengthCm) || 20,
          width: Number(widthCm) || 15,
          height: Number(heightCm) || 10,
        },
        productsDesc: desc,
      });

      if (res.error) {
        toast.error(res.error);
        return;
      }

      if (res.data) {
        setResult(res.data);
        toast.success(
          res.data.manifested.length > 0
            ? `Created ${res.data.created.length} orders & generated ${res.data.manifested.length} AWB(s)!`
            : `Created ${res.data.created.length} draft order(s)!`
        );
      }
    });
  }

  function handleManifestCreatedDrafts() {
    if (!result || result.created.length === 0) return;
    startShipLater(async () => {
      const res = await createShipmentsAction({
        orderIds: result.created.map((c) => c.id),
        weightGrams: Number(weightGrams) || 500,
        dimensions: {
          length: Number(lengthCm) || 20,
          width: Number(widthCm) || 15,
          height: Number(heightCm) || 10,
        },
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.data) {
        setResult((prev) =>
          prev
            ? {
                ...prev,
                manifested: res.data!.succeeded,
                manifestFailures: res.data!.failed,
                manifestError: undefined,
              }
            : prev
        );
        if (res.data.succeeded.length > 0) {
          toast.success(
            `Generated ${res.data.succeeded.length} AWB(s) — ready for 1-click label download!`
          );
        }
      }
    });
  }

  const generatedAwbs = result?.manifested.map((m) => m.awb) ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setResult(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={triggerVariant}
          size="sm"
          className="shrink-0"
          title="Create multiple orders at once via Quick Rows or CSV"
        >
          <Layers className="h-4 w-4 text-[#D9232A]" />
          <span>Bulk Order</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-3xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-[#D9232A]" />
            <span>Bulk Order Making</span>
          </DialogTitle>
          <DialogDescription>
            Book up to 100 orders at once using multi-row entry or CSV upload, and
            optionally generate Delhivery AWBs for 1-click label PDF download.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 space-y-2">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-emerald-950">
                    {result.created.length} Order(s) Created Successfully
                  </p>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    {result.manifested.length > 0
                      ? `${result.manifested.length} Delhivery AWB(s) generated — ready for 1-click shipping label download.`
                      : "Saved as Unfulfilled orders ready to ship."}
                  </p>
                </div>
              </div>

              {generatedAwbs.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => triggerLabelDownload(generatedAwbs)}
                  >
                    <Download className="h-4 w-4" />
                    <span>
                      1-Click Download All Labels ({generatedAwbs.length} PDF)
                    </span>
                  </Button>
                  <a
                    href={getLabelUrl(generatedAwbs)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>Open Print View</span>
                  </a>
                </div>
              ) : (
                <div className="pt-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={shipLaterPending}
                    onClick={handleManifestCreatedDrafts}
                  >
                    {shipLaterPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="h-4 w-4" />
                    )}
                    <span>Generate AWBs &amp; Unlock Label Download</span>
                  </Button>
                </div>
              )}
            </div>

            {result.manifestError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <strong>Auto-Ship notice:</strong> {result.manifestError}
              </div>
            )}

            {result.manifested.length > 0 && (
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-56 overflow-y-auto">
                {result.manifested.map((item) => (
                  <div
                    key={item.orderId}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900">
                        {item.orderNumber}
                      </span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700">
                        AWB: {item.awb}
                      </span>
                    </div>
                    <a
                      href={getLabelUrl(item.awb, { download: true })}
                      download
                      className="inline-flex min-h-8 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                    >
                      <Download className="h-3 w-3" />
                      Download Label
                    </a>
                  </div>
                ))}
              </div>
            )}

            {result.failedOrders.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900 space-y-1">
                <p className="font-semibold">
                  {result.failedOrders.length} row(s) skipped:
                </p>
                {result.failedOrders.slice(0, 6).map((f) => (
                  <p key={`${f.row}-${f.customerName}`}>
                    Row {f.row} ({f.customerName}): {f.reason}
                  </p>
                ))}
              </div>
            )}

            {result.manifestFailures.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
                <p className="font-semibold">
                  {result.manifestFailures.length} AWB failure(s) (orders kept as drafts):
                </p>
                {result.manifestFailures.slice(0, 5).map((f) => (
                  <p key={f.orderId}>
                    {f.orderNumber}: {f.reason}
                  </p>
                ))}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={resetDialogState}>
                Create Another Batch
              </Button>
              <Button type="button" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmitBulk} className="space-y-4">
            {/* Preset + Input Mode Switch */}
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:flex-row sm:items-end sm:justify-between">
              <label className="block flex-1 text-xs font-medium text-slate-700">
                Apply Saved Product Preset (auto-fills price, dimensions &amp; description)
                <select
                  value={selectedProductId}
                  onChange={(e) => handlePresetChange(e.target.value)}
                  className="mt-1 flex min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="">-- Optional: Select product preset --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.size_label ? ` (${p.size_label})` : ""} · {p.weight_grams}g · ₹
                      {p.default_price}
                    </option>
                  ))}
                </select>
              </label>

              <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setMode("rows")}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors cursor-pointer",
                    mode === "rows"
                      ? "bg-slate-950 text-white"
                      : "text-slate-600 hover:text-slate-950"
                  )}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Quick Rows ({rows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMode("csv")}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors cursor-pointer",
                    mode === "csv"
                      ? "bg-slate-950 text-white"
                      : "text-slate-600 hover:text-slate-950"
                  )}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  CSV / Paste
                </button>
              </div>
            </div>

            {mode === "rows" ? (
              <div className="space-y-3">
                <div className="space-y-2.5 max-h-[38dvh] overflow-y-auto pr-1">
                  {rows.map((row, idx) => (
                    <div
                      key={row.uid}
                      className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 shadow-2xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Order #{idx + 1}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => removeRow(row.uid)}
                            disabled={rows.length <= 1}
                            aria-label={`Remove order row ${idx + 1}`}
                            className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <Input
                          value={row.customer_name}
                          onChange={(e) =>
                            updateRow(row.uid, { customer_name: e.target.value })
                          }
                          placeholder="Customer Name *"
                          aria-label={`Row ${idx + 1} customer name`}
                        />
                        <Input
                          value={row.customer_phone}
                          onChange={(e) =>
                            updateRow(row.uid, { customer_phone: e.target.value })
                          }
                          placeholder="10-digit Mobile *"
                          inputMode="tel"
                          aria-label={`Row ${idx + 1} mobile phone`}
                        />
                        <Input
                          value={row.pincode}
                          onChange={(e) =>
                            updateRow(row.uid, { pincode: e.target.value })
                          }
                          placeholder="6-digit PIN *"
                          inputMode="numeric"
                          maxLength={6}
                          aria-label={`Row ${idx + 1} pincode`}
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <Input
                          value={row.address}
                          onChange={(e) =>
                            updateRow(row.uid, { address: e.target.value })
                          }
                          placeholder="Street Address / House # *"
                          className="sm:col-span-1"
                          aria-label={`Row ${idx + 1} street address`}
                        />
                        <Input
                          value={row.city}
                          onChange={(e) =>
                            updateRow(row.uid, { city: e.target.value })
                          }
                          placeholder="City *"
                          aria-label={`Row ${idx + 1} city`}
                        />
                        <Input
                          value={row.state}
                          onChange={(e) =>
                            updateRow(row.uid, { state: e.target.value })
                          }
                          placeholder="State *"
                          aria-label={`Row ${idx + 1} state`}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <select
                          value={row.payment_method}
                          onChange={(e) =>
                            updateRow(row.uid, {
                              payment_method: e.target.value as "COD" | "Prepaid",
                            })
                          }
                          aria-label={`Row ${idx + 1} payment method`}
                          className="flex min-h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                        >
                          <option value="COD">COD</option>
                          <option value="Prepaid">Prepaid</option>
                        </select>
                        <Input
                          type="number"
                          min={0}
                          value={row.total_amount}
                          onChange={(e) =>
                            updateRow(row.uid, { total_amount: e.target.value })
                          }
                          placeholder="Amount ₹"
                          aria-label={`Row ${idx + 1} amount`}
                        />
                        <Input
                          value={row.order_number}
                          onChange={(e) =>
                            updateRow(row.uid, { order_number: e.target.value })
                          }
                          placeholder="Order # (optional)"
                          aria-label={`Row ${idx + 1} order number`}
                        />
                        <Input
                          value={row.item_description}
                          onChange={(e) =>
                            updateRow(row.uid, { item_description: e.target.value })
                          }
                          placeholder="Item / Product desc"
                          aria-label={`Row ${idx + 1} item description`}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addRow(false)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Row</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addRow(true)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>Duplicate City/Price</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                      <Upload className="h-3.5 w-3.5 text-[#D9232A]" />
                      <span>Upload .CSV File</span>
                      <input
                        type="file"
                        accept=".csv,.txt"
                        onChange={handleCsvFileUpload}
                        className="sr-only"
                      />
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadTemplate}
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>CSV Template</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleLoadSampleCsv}
                    >
                      <span>Load Sample</span>
                    </Button>
                  </div>
                  <span className="font-mono text-[11px] font-semibold text-slate-600">
                    {csvPreviewRows.length} parsed row(s)
                  </span>
                </div>

                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  rows={5}
                  placeholder="customer_name, customer_phone, address, city, state, pincode, payment_method, total_amount, order_number"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/70 p-3 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                />

                {csvPreviewRows.length > 0 && (
                  <div className="max-h-36 overflow-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-2.5 py-1.5">Customer</th>
                          <th className="px-2.5 py-1.5">Phone</th>
                          <th className="px-2.5 py-1.5">PIN / City</th>
                          <th className="px-2.5 py-1.5">Payment</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {csvPreviewRows.map((r) => (
                          <tr key={r.uid}>
                            <td className="px-2.5 py-1.5 font-medium text-slate-900">
                              {r.customer_name || "—"}
                            </td>
                            <td className="px-2.5 py-1.5 font-mono text-slate-600">
                              {r.customer_phone || "—"}
                            </td>
                            <td className="px-2.5 py-1.5 text-slate-600">
                              {r.pincode} · {r.city}
                            </td>
                            <td className="px-2.5 py-1.5 font-mono">
                              {r.payment_method} ₹{r.total_amount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Auto-Manifest Option for 1-Click Bulk Shipping Labels */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-2.5">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoManifest}
                  onChange={(e) => setAutoManifest(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-[#D9232A]"
                />
                <span className="text-xs font-semibold text-slate-900">
                  Auto-generate Delhivery AWBs immediately (unlocks 1-Click PDF Labels Download)
                </span>
              </label>

              {autoManifest && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 pt-1">
                  <label className="text-[11px] font-medium text-slate-600">
                    Weight (g)
                    <Input
                      type="number"
                      min={1}
                      max={50000}
                      value={weightGrams}
                      onChange={(e) => setWeightGrams(e.target.value)}
                      className="mt-1 h-9 font-mono text-xs bg-white"
                    />
                  </label>
                  <label className="text-[11px] font-medium text-slate-600">
                    Length (cm)
                    <Input
                      type="number"
                      min={1}
                      max={200}
                      value={lengthCm}
                      onChange={(e) => setLengthCm(e.target.value)}
                      className="mt-1 h-9 font-mono text-xs bg-white"
                    />
                  </label>
                  <label className="text-[11px] font-medium text-slate-600">
                    Width (cm)
                    <Input
                      type="number"
                      min={1}
                      max={200}
                      value={widthCm}
                      onChange={(e) => setWidthCm(e.target.value)}
                      className="mt-1 h-9 font-mono text-xs bg-white"
                    />
                  </label>
                  <label className="text-[11px] font-medium text-slate-600">
                    Height (cm)
                    <Input
                      type="number"
                      min={1}
                      max={200}
                      value={heightCm}
                      onChange={(e) => setHeightCm(e.target.value)}
                      className="mt-1 h-9 font-mono text-xs bg-white"
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : autoManifest ? (
                  <Zap className="h-4 w-4" />
                ) : (
                  <Layers className="h-4 w-4" />
                )}
                <span>
                  {autoManifest
                    ? "Create Orders & Generate AWBs"
                    : "Save Bulk Draft Orders"}
                </span>
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

