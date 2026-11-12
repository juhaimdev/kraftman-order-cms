"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { checkServiceabilityAction } from "@/actions/serviceability";
import { createShipmentsAction } from "@/actions/shipments";
import { syncDelhiveryOneAction } from "@/actions/sync-delhivery-one";
import {
  syncAllActiveShipmentsAction,
  syncTrackingAction,
} from "@/actions/tracking";
import type {
  DashboardCounts,
  OrderWithShipment,
  ProductPreset,
  SalesSummary,
} from "@/lib/db/types";
import { formatINR } from "@/lib/utils";
import { BatchToolbar } from "@/components/desktop/batch-toolbar";
import { OrdersTable } from "@/components/desktop/orders-table";
import { SidePanel } from "@/components/desktop/side-panel";
import { BottomActionBar } from "@/components/mobile/bottom-action-bar";
import { OrderCard } from "@/components/mobile/order-card";
import { OrderDrawer } from "@/components/mobile/order-drawer";
import { AddOrderDialog } from "@/components/shared/add-order-dialog";
import { BulkManifestDialog } from "@/components/shared/bulk-manifest-dialog";
import { ImportDelhiveryDialog } from "@/components/shared/import-delhivery-dialog";
import { Button } from "@/components/ui/button";
import { QuickFilters, type FilterKey } from "./quick-filters";
import { SalesSummarySection } from "./sales-summary";
import { Database, Inbox, Loader2, RefreshCw } from "lucide-react";

interface DashboardShellProps {
  orders: OrderWithShipment[];
  products: ProductPreset[];
  counts: DashboardCounts;
  sales: SalesSummary;
  dbReady: boolean;
  dbReason?: "missing_env" | "missing_schema";
  initialFilter: FilterKey;
  initialQuery: string;
}

export function DashboardShell({
  orders,
  products,
  counts,
  sales,
  dbReady,
  dbReason,
  initialFilter,
  initialQuery,
}: DashboardShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filter, setFilter] = React.useState<FilterKey>(initialFilter);
  const [search, setSearch] = React.useState(initialQuery);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [activeOrderId, setActiveOrderId] = React.useState<string | null>(
    orders[0]?.id ?? null
  );
  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);
  const [tabletSheetOpen, setTabletSheetOpen] = React.useState(false);
  const [bulkManifestOpen, setBulkManifestOpen] = React.useState(false);

  const [trackingPending, startTracking] = React.useTransition();
  const [trackAllPending, startTrackAll] = React.useTransition();
  const [serviceabilityPending, startServiceability] = React.useTransition();
  const [syncAllPending, startSyncAll] = React.useTransition();
  const [quickShipPendingId, setQuickShipPendingId] = React.useState<
    string | null
  >(null);

  const defaultProduct = products[0] ?? null;

  const exportUrl = React.useMemo(() => {
    const p = new URLSearchParams();
    if (filter !== "all") p.set("filter", filter);
    if (search.trim()) p.set("q", search.trim());
    const qs = p.toString();
    return qs ? `/api/export/awbs?${qs}` : "/api/export/awbs";
  }, [filter, search]);

  // Keep activeOrder in sync after Server Action revalidation
  const activeOrder = React.useMemo(
    () => orders.find((o) => o.id === activeOrderId) ?? null,
    [orders, activeOrderId]
  );

  // Sync URL query params cleanly
  const updateUrlParams = React.useCallback(
    (nextFilter: FilterKey, nextQuery: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (nextFilter === "all") next.delete("filter");
      else next.set("filter", nextFilter);

      if (!nextQuery.trim()) next.delete("q");
      else next.set("q", nextQuery.trim());

      const qs = next.toString();
      router.replace(qs ? `/?${qs}` : "/", { scroll: false });
    },
    [router, searchParams]
  );

  // Debounce search updates
  React.useEffect(() => {
    if (search === initialQuery) return;
    const timer = setTimeout(() => {
      updateUrlParams(filter, search);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, initialQuery, filter, updateUrlParams]);

  function handleFilterChange(nextFilter: FilterKey) {
    setFilter(nextFilter);
    updateUrlParams(nextFilter, search);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    if (!checked) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(orders.map((o) => o.id)));
    }
  }

  function openMobileDetail(order: OrderWithShipment) {
    setActiveOrderId(order.id);
    setMobileDrawerOpen(true);
  }

  function openDesktopDetail(order: OrderWithShipment) {
    setActiveOrderId(order.id);
    setTabletSheetOpen(true);
  }

  const selectedOrders = React.useMemo(
    () => orders.filter((o) => selectedIds.has(o.id)),
    [orders, selectedIds]
  );

  const selectedUnfulfilled = React.useMemo(
    () => selectedOrders.filter((o) => o.status === "Unfulfilled" && !o.awb_number),
    [selectedOrders]
  );

  const selectedWithAwb = React.useMemo(
    () => selectedOrders.filter((o) => Boolean(o.awb_number)),
    [selectedOrders]
  );

  // Fallback targets for mobile sticky bottom bar when no checkbox is selected
  function getActionOrdersForManifest(): OrderWithShipment[] {
    if (selectedUnfulfilled.length > 0) return selectedUnfulfilled;
    if (activeOrder && activeOrder.status === "Unfulfilled" && !activeOrder.awb_number) {
      return [activeOrder];
    }
    return orders.filter((o) => o.status === "Unfulfilled" && !o.awb_number);
  }

  function handleGenerateAwbClick() {
    const targets = getActionOrdersForManifest();
    if (targets.length === 0) {
      toast.info("No pending Unfulfilled orders to manifest");
      return;
    }
    // Select those targets if none were explicitly selected so the dialog uses them
    if (selectedUnfulfilled.length === 0) {
      setSelectedIds(new Set(targets.map((t) => t.id)));
    }
    setBulkManifestOpen(true);
  }

  function handlePrintLabelsClick() {
    const targets =
      selectedWithAwb.length > 0
        ? selectedWithAwb
        : activeOrder?.awb_number
          ? [activeOrder]
          : [];

    if (targets.length === 0) {
      toast.info("Select at least one manifested order to print 4x6 labels");
      return;
    }

    const wbns = targets.map((o) => o.awb_number!).join(",");
    window.open(`/api/labels?wbns=${encodeURIComponent(wbns)}`, "_blank", "noopener,noreferrer");
  }

  function handleSyncTrackingClick() {
    const targets =
      selectedWithAwb.length > 0
        ? selectedWithAwb
        : activeOrder?.awb_number
          ? [activeOrder]
          : orders.filter((o) => Boolean(o.awb_number) && o.status !== "Delivered");

    const awbs = targets.map((o) => o.awb_number!).filter(Boolean);
    if (awbs.length === 0) {
      toast.info("No active shipments with AWBs to track");
      return;
    }

    startTracking(async () => {
      const res = await syncTrackingAction(awbs, true);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Updated tracking for ${res.data?.updated ?? 0} shipment(s)`);
    });
  }

  function handleBatchServiceability() {
    const pins = Array.from(new Set(selectedOrders.map((o) => o.pincode)));
    if (pins.length === 0) return;

    startServiceability(async () => {
      let serviceableCount = 0;
      let codCount = 0;
      let firstError: string | null = null;

      for (const pin of pins) {
        const res = await checkServiceabilityAction(pin);
        if (res.error) {
          firstError = res.error;
          break;
        }
        if (res.data?.serviceable) serviceableCount++;
        if (res.data?.cod) codCount++;
      }

      if (firstError) {
        toast.error(firstError);
        return;
      }
      toast.success(
        `Checked ${pins.length} PIN(s): ${serviceableCount} Express OK, ${codCount} COD OK`
      );
    });
  }

  function handleExportSelectedAwbs() {
    if (selectedWithAwb.length === 0) {
      toast.info("Select at least one shipped order to export AWBs");
      return;
    }
    const wbns = selectedWithAwb.map((o) => o.awb_number!).join(",");
    const link = document.createElement("a");
    link.href = `/api/export/awbs?wbns=${encodeURIComponent(wbns)}`;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function handleTrackAllOrders() {
    startTrackAll(async () => {
      const res = await syncAllActiveShipmentsAction(true);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const updated = res.data?.updated ?? 0;
      const total = res.data?.totalChecked ?? 0;
      if (total === 0) {
        toast.info("No orders with AWBs found to track yet");
        return;
      }
      toast.success(`Live-tracked ${updated} of ${total} shipped order(s)`);
    });
  }

  async function handleQuickShip(order: OrderWithShipment) {
    const preset =
      products.find((p) => p.id === order.product_id) ?? defaultProduct;
    if (!preset) {
      openDesktopDetail(order);
      return;
    }

    setQuickShipPendingId(order.id);
    const res = await createShipmentsAction({
      orderIds: [order.id],
      weightGrams: preset.weight_grams,
      dimensions: {
        length: preset.length_cm,
        width: preset.width_cm,
        height: preset.height_cm,
      },
      productsDesc: preset.size_label
        ? `${preset.name} (${preset.size_label})`
        : preset.name,
    });
    setQuickShipPendingId(null);

    if (res.error) {
      toast.error(res.error);
      return;
    }
    const ok = res.data?.succeeded[0];
    const err = res.data?.failed[0];
    if (ok) {
      toast.success(`Shipped ${ok.orderNumber}! AWB: ${ok.awb}`, {
        action: {
          label: "Print 4x6",
          onClick: () =>
            window.open(
              `/api/labels?wbns=${encodeURIComponent(ok.awb)}`,
              "_blank",
              "noopener,noreferrer"
            ),
        },
      });
    } else if (err) {
      toast.error(`${err.orderNumber}: ${err.reason}`);
    }
  }

  function handleSyncAllActive() {
    startSyncAll(async () => {
      const mcpRes = await syncDelhiveryOneAction();
      if (!mcpRes.error && mcpRes.data) {
        const { syncedOrders, syncedShipments, walletBalance } = mcpRes.data;
        const walletMsg =
          walletBalance !== null ? ` · Wallet: ${formatINR(walletBalance)}` : "";
        toast.success(
          `Synced ${syncedOrders} order(s) & ${syncedShipments} shipment(s)${walletMsg}`
        );
        return;
      }

      const trackRes = await syncAllActiveShipmentsAction();
      if (trackRes.error) {
        toast.error(mcpRes.error || trackRes.error);
        return;
      }
      toast.success(
        `Synced ${trackRes.data?.updated ?? 0} of ${trackRes.data?.totalChecked ?? 0} active shipment(s)`
      );
    });
  }

  return (
    <div className="min-h-dvh bg-slate-50 pb-24 md:pb-8">
      <QuickFilters
        activeFilter={filter}
        searchQuery={search}
        counts={counts}
        products={products}
        exportUrl={exportUrl}
        syncAllPending={syncAllPending}
        trackAllPending={trackAllPending}
        onSyncAll={handleSyncAllActive}
        onTrackAll={handleTrackAllOrders}
        onFilterChange={handleFilterChange}
        onSearchChange={setSearch}
      />

      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 space-y-4">
        {!dbReady && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <Database className="h-5 w-5 shrink-0 text-amber-700 mt-0.5" />
            <div>
              <p className="font-semibold">
                {dbReason === "missing_env"
                  ? "Connect your Supabase project to activate live persistence"
                  : "Supabase database schema not applied yet"}
              </p>
              <p className="mt-1 text-xs text-amber-900">
                {dbReason === "missing_env" ? (
                  <>
                    Add{" "}
                    <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono">
                      NEXT_PUBLIC_SUPABASE_URL
                    </code>{" "}
                    and{" "}
                    <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono">
                      SUPABASE_SERVICE_ROLE_KEY
                    </code>{" "}
                    in <code className="font-mono">.env.local</code> (or Vercel Environment Variables).
                  </>
                ) : (
                  <>
                    Run the SQL migration{" "}
                    <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono">
                      supabase/migrations/0001_init.sql
                    </code>{" "}
                    in your Supabase SQL Editor to create{" "}
                    <code className="font-mono">orders</code>,{" "}
                    <code className="font-mono">shipments</code>, and{" "}
                    <code className="font-mono">products</code>.
                  </>
                )}
              </p>
            </div>
          </div>
        )}

        {dbReady && (
          <SalesSummarySection
            sales={sales}
            visibleOrders={orders}
            isFiltered={filter !== "all" || Boolean(search.trim())}
            onSelectFilter={handleFilterChange}
          />
        )}

        <BatchToolbar
          selectedCount={selectedOrders.length}
          unfulfilledCount={selectedUnfulfilled.length}
          awbCount={selectedWithAwb.length}
          trackingPending={trackingPending}
          serviceabilityPending={serviceabilityPending}
          onCheckServiceability={handleBatchServiceability}
          onGenerateAwb={handleGenerateAwbClick}
          onPrintLabels={handlePrintLabelsClick}
          onExportAwbs={handleExportSelectedAwbs}
          onSyncTracking={handleSyncTrackingClick}
          onClearSelection={() => setSelectedIds(new Set())}
        />

        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-14 px-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <Inbox className="h-6 w-6" />
            </div>
            <h2 className="mt-3 text-base font-semibold text-slate-900">
              {search || filter !== "all"
                ? "No matching orders"
                : "No live orders in workspace yet"}
            </h2>
            <p className="mt-1 max-w-md text-xs text-slate-500">
              {search || filter !== "all"
                ? "Try clearing your search or switching status filters."
                : "Fetch live shipments directly from your Delhivery One API by AWB or Order ID, or create a new order to manifest."}
            </p>
            {!search && filter === "all" && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                <Button
                  type="button"
                  variant="primary"
                  disabled={syncAllPending}
                  onClick={handleSyncAllActive}
                >
                  {syncAllPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  <span>Sync Delhivery One</span>
                </Button>
                <ImportDelhiveryDialog
                  triggerLabel="Fetch by AWB"
                  triggerVariant="outline"
                />
                <AddOrderDialog products={products} />
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Mobile Card List (< md) */}
            <section
              aria-label="Mobile orders list"
              className="space-y-3 md:hidden"
            >
              {orders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  selected={selectedIds.has(order.id)}
                  defaultProduct={
                    products.find((p) => p.id === order.product_id) ??
                    defaultProduct
                  }
                  quickShipPending={quickShipPendingId === order.id}
                  onQuickShip={handleQuickShip}
                  onToggleSelect={toggleSelect}
                  onOpenDetail={openMobileDetail}
                />
              ))}
            </section>

            {/* Desktop Dual-Pane Command Center (>= md) */}
            <section
              aria-label="Desktop orders command center"
              className="hidden md:flex items-start gap-4"
            >
              <OrdersTable
                orders={orders}
                selectedIds={selectedIds}
                activeOrderId={activeOrderId}
                products={products}
                quickShipPendingId={quickShipPendingId}
                onQuickShip={handleQuickShip}
                onToggleSelect={toggleSelect}
                onToggleAll={toggleAll}
                onOpenDetail={openDesktopDetail}
              />
              <SidePanel
                order={activeOrder}
                products={products}
                open={tabletSheetOpen}
                onClose={() => {
                  setTabletSheetOpen(false);
                  setActiveOrderId(null);
                }}
              />
            </section>
          </>
        )}
      </main>

      {/* Mobile Sticky Bottom Action Bar */}
      <BottomActionBar
        selectedCount={selectedOrders.length}
        unfulfilledSelectedCount={selectedUnfulfilled.length}
        manifestedSelectedCount={selectedWithAwb.length}
        trackingPending={trackingPending}
        onGenerateAwb={handleGenerateAwbClick}
        onPrintLabels={handlePrintLabelsClick}
        onSyncTracking={handleSyncTrackingClick}
      />

      {/* Mobile Bottom Sheet Drawer */}
      <OrderDrawer
        order={activeOrder}
        products={products}
        open={mobileDrawerOpen}
        onOpenChange={setMobileDrawerOpen}
      />

      {/* Bulk Manifest Modal */}
      <BulkManifestDialog
        open={bulkManifestOpen}
        onOpenChange={setBulkManifestOpen}
        orders={selectedOrders}
        products={products}
        onCompleted={() => setSelectedIds(new Set())}
      />
    </div>
  );
}

