"use client";

import * as React from "react";
import { CloudDownload, Loader2, Radio, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { importFromDelhiveryAction } from "@/actions/import-delhivery";
import { syncDelhiveryOneAction } from "@/actions/sync-delhivery-one";
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
import { CopyButton } from "./copy-button";

interface ImportDelhiveryDialogProps {
  triggerLabel?: string;
  triggerVariant?: "outline" | "primary" | "default";
  triggerClassName?: string;
}

export function ImportDelhiveryDialog({
  triggerLabel = "Fetch Live",
  triggerVariant = "outline",
  triggerClassName,
}: ImportDelhiveryDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"waybill" | "ref_ids">("waybill");
  const [identifiers, setIdentifiers] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [autoSyncPending, startAutoSync] = React.useTransition();

  const webhookUrl = React.useSyncExternalStore(
    () => () => {},
    () => `${window.location.origin}/api/webhooks/delhivery`,
    () => "/api/webhooks/delhivery"
  );

  function handleAutoSync() {
    startAutoSync(async () => {
      const res = await syncDelhiveryOneAction();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.data) {
        const { syncedOrders, syncedShipments, walletBalance } = res.data;
        const walletMsg =
          walletBalance !== null ? ` · Wallet: ${formatINR(walletBalance)}` : "";
        toast.success(
          `Synced ${syncedOrders} order(s) & ${syncedShipments} shipment(s) from Delhivery One${walletMsg}`
        );
        setOpen(false);
      }
    });
  }

  function handleImport(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await importFromDelhiveryAction({
        mode,
        identifiers,
      });

      if (res.error) {
        toast.error(res.error);
        return;
      }

      if (res.data) {
        const { importedCount, updatedCount, returnedCount } = res.data;
        toast.success(
          `Synced ${returnedCount} shipment(s) (${importedCount} added, ${updatedCount} updated)`
        );
        setIdentifiers("");
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={triggerVariant}
          size="sm"
          className={triggerClassName}
        >
          <CloudDownload className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">{triggerLabel}</span>
          <span className="sm:hidden">Fetch</span>
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sync Live Data from Delhivery One</DialogTitle>
          <DialogDescription>
            Pull real orders, shipments, box dimensions, and tracking timelines directly from your Delhivery One account.
          </DialogDescription>
        </DialogHeader>

        {/* Primary: Auto-sync via Delhivery One MCP / OAuth2 */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 space-y-2.5">
          <div className="text-xs text-blue-950">
            <p className="font-semibold">Auto-Sync All Delhivery One Orders</p>
            <p className="mt-0.5 text-[11px] text-blue-800">
              No webhook UI needed — fetches your live sale orders, AWBs, pickup warehouses, and scan history directly via Delhivery One MCP OAuth2.
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            disabled={autoSyncPending}
            onClick={handleAutoSync}
            className="w-full"
          >
            {autoSyncPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span>Sync All Orders from Delhivery One</span>
          </Button>
        </div>

        <div className="relative flex items-center py-0.5">
          <div className="flex-grow border-t border-slate-200" />
          <span className="mx-3 shrink text-[11px] font-medium uppercase text-slate-400">
            Or Fetch Specific AWBs
          </span>
          <div className="flex-grow border-t border-slate-200" />
        </div>

        <form onSubmit={handleImport} className="space-y-3">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setMode("waybill")}
              className={`min-h-11 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                mode === "waybill"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              By AWB / Waybill(s)
            </button>
            <button
              type="button"
              onClick={() => setMode("ref_ids")}
              className={`min-h-11 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                mode === "ref_ids"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              By Order ID(s)
            </button>
          </div>

          <textarea
            required
            rows={3}
            value={identifiers}
            onChange={(e) => setIdentifiers(e.target.value)}
            placeholder={
              mode === "waybill"
                ? "Paste AWB number(s), e.g. 74031410000011"
                : "Paste Order Reference ID(s), e.g. 1, 2"
            }
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          />

          <Button
            type="submit"
            variant="default"
            disabled={pending || !identifiers.trim()}
            className="w-full"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CloudDownload className="h-4 w-4" />
            )}
            <span>Fetch Specific Shipment(s)</span>
          </Button>
        </form>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
            <Radio className="h-3.5 w-3.5 text-emerald-600" />
            <span>Push Webhook Endpoint (Optional)</span>
          </div>
          <p className="text-[11px] text-slate-600">
            Delhivery One hides self-serve webhook tabs on standard accounts. If you request Push API activation from Delhivery Support/KAM, provide this URL:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-mono text-slate-700">
              {webhookUrl}
            </code>
            <CopyButton
              value={webhookUrl}
              compact
              toastText="Webhook URL copied"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
