"use client";

import * as React from "react";
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  CreditCard,
  MapPin,
  PackageCheck,
} from "lucide-react";
import type {
  DailySalesPoint,
  DashboardCounts,
  SalesSummary,
} from "@/lib/db/types";
import { cn, formatINR } from "@/lib/utils";
import type { FilterKey } from "./quick-filters";

interface OrdersAnalyticsSectionProps {
  counts: DashboardCounts;
  sales: SalesSummary;
  dailySeries: DailySalesPoint[];
  onSelectFilter: (filter: FilterKey) => void;
}

export function OrdersAnalyticsSection({
  counts,
  sales,
  dailySeries,
  onSelectFilter,
}: OrdersAnalyticsSectionProps) {
  const [expanded, setExpanded] = React.useState(true);
  const [days, setDays] = React.useState<7 | 14>(14);
  const [selectedDayIdx, setSelectedDayIdx] = React.useState<number | null>(
    null
  );

  const visibleDays = React.useMemo(
    () => dailySeries.slice(-days),
    [dailySeries, days]
  );

  const totalOrders = Math.max(sales.total_orders, counts.total, 0);
  const deliveryRate =
    totalOrders > 0 ? Math.round((sales.delivered_count / totalOrders) * 100) : 0;
  const codTotal = sales.cod_count + sales.prepaid_count;
  const codOrderPct =
    codTotal > 0 ? Math.round((sales.cod_count / codTotal) * 100) : 0;
  const prepaidOrderPct = codTotal > 0 ? 100 - codOrderPct : 0;

  const maxDailyOrders = React.useMemo(
    () => Math.max(...visibleDays.map((d) => d.orders), 1),
    [visibleDays]
  );

  const activeDay =
    selectedDayIdx !== null && visibleDays[selectedDayIdx]
      ? visibleDays[selectedDayIdx]
      : visibleDays[visibleDays.length - 1] ?? null;

  const pipelineStages: Array<{
    label: string;
    count: number;
    barClass: string;
    filter?: FilterKey;
  }> = [
    {
      label: "Delivered",
      count: sales.delivered_count,
      barClass: "bg-emerald-500",
      filter: "all",
    },
    {
      label: "In Transit",
      count: sales.in_transit_count,
      barClass: "bg-indigo-500",
    },
    {
      label: "Out for Delivery",
      count: counts.ofd,
      barClass: "bg-violet-500",
      filter: "ofd",
    },
    {
      label: "Manifested",
      count: sales.manifested_count,
      barClass: "bg-blue-500",
    },
    {
      label: "Pending AWB",
      count: counts.pending,
      barClass: "bg-amber-500",
      filter: "pending",
    },
    {
      label: "NDR / Failed",
      count: counts.ndr,
      barClass: "bg-[#D9232A]",
      filter: "ndr",
    },
  ];

  const maxStageCount = Math.max(...pipelineStages.map((s) => s.count), 1);
  const topCities = sales.top_cities.slice(0, 5);
  const maxCityOrders = Math.max(...topCities.map((c) => c.order_count), 1);

  // Donut arc constants (radius 34, circumference ~213.6)
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const codArc = (codOrderPct / 100) * circumference;

  return (
    <section
      aria-label="Orders graph data analytics"
      className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden"
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5 sm:px-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[#D9232A]">
            <BarChart3 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-900">
              Order Analytics Graphs
            </h2>
            <p className="text-[11px] text-slate-500 truncate">
              {totalOrders} orders · {deliveryRate}% delivered · {codOrderPct}% COD
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {expanded && (
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-semibold">
              {([7, 14] as const).map((win) => (
                <button
                  key={win}
                  type="button"
                  onClick={() => {
                    setDays(win);
                    setSelectedDayIdx(null);
                  }}
                  className={cn(
                    "min-h-7 rounded-md px-2 transition-all cursor-pointer",
                    days === win
                      ? "bg-white text-slate-950 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  {win}D
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <span>{expanded ? "Hide Graphs" : "Show Graphs"}</span>
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="grid grid-cols-1 gap-3 p-3.5 sm:p-4 md:grid-cols-2 xl:grid-cols-4">
          {/* 1. Stacked Daily Order Volume Bar Graph */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-3 space-y-2 md:col-span-2 xl:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Daily Order Volume ({days}D)
                </p>
                {activeDay ? (
                  <p className="text-xs font-semibold text-slate-900 mt-0.5">
                    {activeDay.label}:{" "}
                    <span className="font-mono font-bold">
                      {activeDay.orders} orders
                    </span>{" "}
                    <span className="text-emerald-700">
                      ({activeDay.delivered} delivered)
                    </span>
                    {activeDay.ndr > 0 && (
                      <span className="text-[#D9232A]">
                        {" "}
                        · {activeDay.ndr} NDR
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 mt-0.5">No daily data yet</p>
                )}
              </div>

              <div className="flex items-center gap-2.5 text-[10px] font-medium text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-xs bg-emerald-500" />
                  Delivered
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-xs bg-blue-500" />
                  Pipeline
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-xs bg-[#D9232A]" />
                  NDR
                </span>
              </div>
            </div>

            {visibleDays.length === 0 ? (
              <div className="flex h-36 items-center justify-center text-xs text-slate-400">
                Create orders to view daily bar analytics
              </div>
            ) : (
              <div className="w-full overflow-hidden">
                <svg
                  viewBox="0 0 420 148"
                  className="h-36 w-full select-none"
                  role="img"
                  aria-label="Daily orders volume bar graph"
                >
                  {[0.25, 0.5, 0.75, 1].map((frac) => {
                    const y = 118 - frac * 102;
                    return (
                      <line
                        key={frac}
                        x1="8"
                        x2="412"
                        y1={y}
                        y2={y}
                        stroke="#E2E8F0"
                        strokeDasharray="3 3"
                        strokeWidth="1"
                      />
                    );
                  })}

                  {visibleDays.map((day, idx) => {
                    const slotW = 404 / visibleDays.length;
                    const barW = Math.min(22, Math.max(8, slotW * 0.62));
                    const x = 8 + idx * slotW + (slotW - barW) / 2;

                    const totalH = (day.orders / maxDailyOrders) * 100;
                    const delH =
                      day.orders > 0 ? (day.delivered / day.orders) * totalH : 0;
                    const ndrH =
                      day.orders > 0 ? (day.ndr / day.orders) * totalH : 0;
                    const pipeH = Math.max(0, totalH - delH - ndrH);

                    const yBase = 118;
                    const yDel = yBase - delH;
                    const yPipe = yDel - pipeH;
                    const yNdr = yPipe - ndrH;

                    const isSelected =
                      selectedDayIdx === idx ||
                      (selectedDayIdx === null && idx === visibleDays.length - 1);

                    return (
                      <g
                        key={day.date}
                        className="cursor-pointer"
                        onMouseEnter={() => setSelectedDayIdx(idx)}
                        onClick={() => setSelectedDayIdx(idx)}
                      >
                        <rect
                          x={8 + idx * slotW}
                          y={10}
                          width={slotW}
                          height={116}
                          fill={isSelected ? "rgba(15,23,42,0.04)" : "transparent"}
                          rx="4"
                        />
                        {day.orders === 0 ? (
                          <rect
                            x={x}
                            y={yBase - 2}
                            width={barW}
                            height={2}
                            rx="1"
                            fill="#CBD5E1"
                          />
                        ) : (
                          <>
                            {delH > 0 && (
                              <rect
                                x={x}
                                y={yDel}
                                width={barW}
                                height={delH}
                                fill="#10B981"
                                rx={pipeH === 0 && ndrH === 0 ? 3 : 0}
                              />
                            )}
                            {pipeH > 0 && (
                              <rect
                                x={x}
                                y={yPipe}
                                width={barW}
                                height={pipeH}
                                fill="#3B82F6"
                                rx={ndrH === 0 ? 3 : 0}
                              />
                            )}
                            {ndrH > 0 && (
                              <rect
                                x={x}
                                y={yNdr}
                                width={barW}
                                height={ndrH}
                                fill="#D9232A"
                                rx="3"
                              />
                            )}
                          </>
                        )}

                        {(visibleDays.length <= 7 ||
                          idx % 2 === 0 ||
                          idx === visibleDays.length - 1) && (
                          <text
                            x={x + barW / 2}
                            y={136}
                            textAnchor="middle"
                            fontSize="9"
                            fontWeight={isSelected ? "700" : "500"}
                            fill={isSelected ? "#0F172A" : "#64748B"}
                          >
                            {day.label}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}
          </div>

          {/* 2. Interactive Status Pipeline Bars (Click to Filter) */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Status Breakdown
              </p>
              <PackageCheck className="h-3.5 w-3.5 text-slate-400" />
            </div>

            <div className="space-y-2">
              {pipelineStages.map((stage) => {
                const widthPct = Math.round((stage.count / maxStageCount) * 100);
                const sharePct =
                  totalOrders > 0 ? Math.round((stage.count / totalOrders) * 100) : 0;

                const rowContent = (
                  <>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-slate-700">
                        {stage.label}
                      </span>
                      <span className="font-mono font-bold text-slate-900">
                        {stage.count}{" "}
                        <span className="font-normal text-slate-400">
                          ({sharePct}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200/80">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          stage.barClass
                        )}
                        style={{
                          width: `${stage.count > 0 ? Math.max(6, widthPct) : 0}%`,
                        }}
                      />
                    </div>
                  </>
                );

                return stage.filter ? (
                  <button
                    key={stage.label}
                    type="button"
                    onClick={() => onSelectFilter(stage.filter!)}
                    className="block w-full text-left space-y-1 rounded-md p-0.5 hover:bg-white cursor-pointer"
                  >
                    {rowContent}
                  </button>
                ) : (
                  <div key={stage.label} className="space-y-1 p-0.5">
                    {rowContent}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Payment Donut + Top Order Cities */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                COD vs Prepaid &amp; Cities
              </p>
              <CreditCard className="h-3.5 w-3.5 text-slate-400" />
            </div>

            <div className="flex items-center gap-3">
              <svg
                viewBox="0 0 88 88"
                className="h-18 w-18 shrink-0"
                role="img"
                aria-label="COD vs Prepaid orders split"
              >
                <circle
                  cx="44"
                  cy="44"
                  r={radius}
                  fill="none"
                  stroke="#0F172A"
                  strokeWidth="12"
                />
                {codOrderPct > 0 && (
                  <circle
                    cx="44"
                    cy="44"
                    r={radius}
                    fill="none"
                    stroke="#F59E0B"
                    strokeWidth="12"
                    strokeDasharray={`${codArc} ${circumference}`}
                    transform="rotate(-90 44 44)"
                  />
                )}
                <text
                  x="44"
                  y="42"
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="800"
                  fill="#0F172A"
                >
                  {codOrderPct}%
                </text>
                <text
                  x="44"
                  y="54"
                  textAnchor="middle"
                  fontSize="8"
                  fontWeight="600"
                  fill="#64748B"
                >
                  COD
                </text>
              </svg>

              <div className="min-w-0 flex-1 space-y-1 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-slate-700 font-medium">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    COD Orders
                  </span>
                  <span className="font-mono font-bold text-slate-900">
                    {sales.cod_count}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-slate-700 font-medium">
                    <span className="h-2 w-2 rounded-full bg-slate-900" />
                    Prepaid
                  </span>
                  <span className="font-mono font-bold text-slate-900">
                    {sales.prepaid_count} ({prepaidOrderPct}%)
                  </span>
                </div>
                <div className="pt-1 border-t border-slate-200/70 flex items-center justify-between text-[10px] text-slate-500">
                  <span>Avg Order</span>
                  <strong className="font-mono text-slate-800">
                    {formatINR(sales.avg_order_value)}
                  </strong>
                </div>
              </div>
            </div>

            {topCities.length > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-slate-200/70">
                <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <MapPin className="h-3 w-3 text-[#D9232A]" />
                  Top Cities (Orders)
                </p>
                {topCities.slice(0, 3).map((city) => (
                  <div key={city.city} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="truncate font-medium text-slate-700">
                        {city.city}
                      </span>
                      <span className="shrink-0 font-mono font-bold text-slate-900">
                        {city.order_count}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-slate-900"
                        style={{
                          width: `${Math.max(8, Math.round((city.order_count / maxCityOrders) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

