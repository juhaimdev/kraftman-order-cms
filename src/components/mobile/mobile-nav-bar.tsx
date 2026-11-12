"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Loader2, Package, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileNavBarProps {
  ndrCount?: number;
  refreshPending?: boolean;
  onRefresh?: () => void;
  refreshLabel?: string;
}

export function MobileNavBar({
  ndrCount = 0,
  refreshPending = false,
  onRefresh,
  refreshLabel = "Live Sync",
}: MobileNavBarProps) {
  const pathname = usePathname();
  const isSales = pathname?.startsWith("/sales");

  return (
    <nav
      aria-label="Mobile app navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(15,23,42,0.06)]"
    >
      <div className="grid grid-cols-3 gap-1 px-2 py-1.5">
        <Link
          href="/"
          className={cn(
            "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold transition-colors",
            !isSales
              ? "bg-red-50 text-[#D9232A]"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          )}
        >
          <span className="relative">
            <Package className="h-4.5 w-4.5" />
            {ndrCount > 0 && (
              <span className="absolute -right-2.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D9232A] px-1 text-[9px] font-bold text-white">
                {ndrCount}
              </span>
            )}
          </span>
          <span>Orders</span>
        </Link>

        <Link
          href="/sales"
          className={cn(
            "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold transition-colors",
            isSales
              ? "bg-red-50 text-[#D9232A]"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          )}
        >
          <BarChart3 className="h-4.5 w-4.5" />
          <span>Sales &amp; Graphs</span>
        </Link>

        <button
          type="button"
          onClick={onRefresh}
          disabled={!onRefresh || refreshPending}
          className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 cursor-pointer"
        >
          {refreshPending ? (
            <Loader2 className="h-4.5 w-4.5 animate-spin text-[#D9232A]" />
          ) : (
            <RefreshCw className="h-4.5 w-4.5 text-slate-700" />
          )}
          <span>{refreshLabel}</span>
        </button>
      </div>
    </nav>
  );
}

