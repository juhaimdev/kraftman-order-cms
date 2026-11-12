import { Suspense } from "react";
import {
  getSalesDashboardData,
  listOrdersWithShipments,
  listProducts,
} from "@/lib/db/queries";
import { getWalletDetailsCached } from "@/lib/delhivery/one-mcp";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import type { FilterKey } from "@/components/dashboard/quick-filters";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function normalizeFilter(raw?: string): FilterKey {
  if (raw === "pending" || raw === "ofd" || raw === "ndr") return raw;
  return "all";
}

async function OrdersFeed({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const params = await searchParams;
  const filter = normalizeFilter(params.filter);
  const query = params.q?.trim() ?? "";

  const [
    { orders, counts, sales, dbReady, dbReason },
    products,
    wallet,
    analytics,
  ] = await Promise.all([
    listOrdersWithShipments({ filter, q: query }),
    listProducts(),
    getWalletDetailsCached(),
    getSalesDashboardData(14),
  ]);

  return (
    <DashboardShell
      orders={orders}
      products={products}
      wallet={wallet}
      counts={counts}
      sales={sales}
      dailySeries={analytics.dailySeries}
      dbReady={dbReady}
      dbReason={dbReason}
      initialFilter={filter}
      initialQuery={query}
    />
  );
}

function DashboardSkeleton() {
  return (
    <div className="min-h-dvh bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto max-w-7xl space-y-3">
          <div className="h-11 w-full animate-pulse rounded-lg bg-slate-200/70" />
          <div className="flex gap-2">
            <div className="h-11 w-20 animate-pulse rounded-full bg-slate-200/70" />
            <div className="h-11 w-28 animate-pulse rounded-full bg-slate-200/70" />
            <div className="h-11 w-32 animate-pulse rounded-full bg-slate-200/70" />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-7xl space-y-3 p-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white"
          />
        ))}
      </div>
    </div>
  );
}

export default function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <OrdersFeed searchParams={searchParams} />
    </Suspense>
  );
}
