import type { Metadata } from "next";
import { Suspense } from "react";
import { getSalesDashboardData, listProducts } from "@/lib/db/queries";
import { getWalletDetailsCached } from "@/lib/delhivery/one-mcp";
import { SalesDashboardClient } from "@/components/sales/sales-dashboard-client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const metadata: Metadata = {
  title: "Live Sales & Graphs · Kraftman Delhivery One",
  description:
    "Real-time revenue charts, COD vs Prepaid analytics, fulfillment funnel, and top shipping cities for Kraftman.",
};

async function SalesFeed() {
  const [salesData, wallet, products] = await Promise.all([
    getSalesDashboardData(30),
    getWalletDetailsCached(),
    listProducts(),
  ]);

  return (
    <SalesDashboardClient
      initialData={{ ...salesData, wallet }}
      products={products}
    />
  );
}

function SalesSkeleton() {
  return (
    <div className="min-h-dvh bg-slate-50 p-4 space-y-4">
      <div className="h-14 animate-pulse rounded-xl bg-slate-200/80" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl bg-white border border-slate-200"
          />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="h-72 lg:col-span-8 animate-pulse rounded-2xl bg-white border border-slate-200" />
        <div className="h-72 lg:col-span-4 animate-pulse rounded-2xl bg-white border border-slate-200" />
      </div>
    </div>
  );
}

export default function SalesPage() {
  return (
    <Suspense fallback={<SalesSkeleton />}>
      <SalesFeed />
    </Suspense>
  );
}

