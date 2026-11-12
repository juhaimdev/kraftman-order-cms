"use server";

import { getSalesDashboardData } from "@/lib/db/queries";
import { getWalletDetailsCached } from "@/lib/delhivery/one-mcp";
import type { SalesDashboardData } from "@/lib/db/types";

/**
 * Fetches fresh sales analytics + daily time-series + Delhivery wallet balance
 * for the live `/sales` dashboard polling & manual refresh controls.
 */
export async function getLiveSalesDashboardAction(
  days = 30
): Promise<{ data?: SalesDashboardData; error?: string }> {
  try {
    const [salesData, wallet] = await Promise.all([
      getSalesDashboardData(days),
      getWalletDetailsCached(true),
    ]);
    return {
      data: {
        ...salesData,
        wallet,
        updatedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to refresh live sales analytics",
    };
  }
}

