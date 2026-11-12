"use client";

import * as React from "react";
import type {
  CitySalesItem,
  DailySalesPoint,
  SalesSummary,
  StateSalesItem,
} from "@/lib/db/types";
import { cn, formatINR } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* 1. Daily Revenue & Order Volume Interactive SVG Chart                      */
/* -------------------------------------------------------------------------- */

interface RevenueTrendChartProps {
  series: DailySalesPoint[];
}

export function RevenueTrendChart({ series }: RevenueTrendChartProps) {
  const [days, setDays] = React.useState<7 | 14 | 30>(14);
  const [metric, setMetric] = React.useState<"revenue" | "orders">("revenue");
  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);

  const visible = React.useMemo(() => {
    if (series.length === 0) return [];
    return series.slice(-days);
  }, [series, days]);

  const width = 640;
  const height = 220;
  const padX = 18;
  const padTop = 18;
  const padBottom = 28;
  const chartW = width - padX * 2;
  const chartH = height - padTop - padBottom;

  const maxVal = React.useMemo(() => {
    if (visible.length === 0) return 100;
    const rawMax = Math.max(
      ...visible.map((p) => (metric === "revenue" ? p.revenue : p.orders)),
      1
    );
    return rawMax * 1.15;
  }, [visible, metric]);

  const points = React.useMemo(() => {
    if (visible.length === 0) return [];
    const step = visible.length > 1 ? chartW / (visible.length - 1) : 0;
    return visible.map((item, idx) => {
      const val = metric === "revenue" ? item.revenue : item.orders;
      const x = visible.length === 1 ? width / 2 : padX + idx * step;
      const y = padTop + chartH - (val / maxVal) * chartH;
      return { x, y, val, item };
    });
  }, [visible, metric, maxVal, chartW, chartH]);

  const linePath = React.useMemo(() => {
    if (points.length === 0) return "";
    return points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");
  }, [points]);

  const areaPath = React.useMemo(() => {
    if (points.length === 0) return "";
    const baselineY = (padTop + chartH).toFixed(1);
    const first = points[0];
    const last = points[points.length - 1];
    return `${linePath} L ${last.x.toFixed(1)} ${baselineY} L ${first.x.toFixed(1)} ${baselineY} Z`;
  }, [points, linePath, chartH]);

  const activePoint =
    hoveredIdx !== null && points[hoveredIdx]
      ? points[hoveredIdx]
      : points[points.length - 1] ?? null;

  const windowTotalRevenue = visible.reduce((a, b) => a + b.revenue, 0);
  const windowTotalOrders = visible.reduce((a, b) => a + b.orders, 0);

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Sales Velocity ({days} Days)
          </p>
          <div className="mt-0.5 flex items-baseline gap-2">
            <h3 className="font-mono text-xl font-extrabold text-slate-950">
              {metric === "revenue"
                ? formatINR(windowTotalRevenue)
                : `${windowTotalOrders} Orders`}
            </h3>
            <span className="text-xs text-slate-500">
              {metric === "revenue"
                ? `across ${windowTotalOrders} orders`
                : formatINR(windowTotalRevenue)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-semibold">
            {(["revenue", "orders"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetric(m)}
                className={cn(
                  "min-h-8 rounded-md px-2.5 capitalize transition-all cursor-pointer",
                  metric === m
                    ? "bg-white text-slate-950 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                {m === "revenue" ? "₹ Sales" : "Orders"}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-semibold">
            {([7, 14, 30] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={cn(
                  "min-h-8 rounded-md px-2 font-mono transition-all cursor-pointer",
                  days === d
                    ? "bg-[#D9232A] text-white shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                {d}D
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Selected Day Readout Strip (Touch & Hover Friendly) */}
      {activePoint && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-2 text-xs">
          <span className="font-semibold text-slate-800">
            {activePoint.item.label} ({activePoint.item.date})
          </span>
          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
            <span className="font-bold text-slate-950">
              {formatINR(activePoint.item.revenue)}
            </span>
            <span className="text-slate-600">
              {activePoint.item.orders} order
              {activePoint.item.orders === 1 ? "" : "s"}
            </span>
            <span className="text-amber-700">
              COD {formatINR(activePoint.item.cod_revenue)}
            </span>
            <span className="text-emerald-700">
              Prepaid {formatINR(activePoint.item.prepaid_revenue)}
            </span>
          </div>
        </div>
      )}

      {/* Responsive SVG Area + Bar Graph */}
      <div className="relative w-full">
        {points.length === 0 ? (
          <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-400">
            No order timeline data yet
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-52 w-full overflow-visible select-none"
            role="img"
            aria-label="Daily sales and order volume trend"
          >
            <defs>
              <linearGradient id="kraftmanSalesGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#D9232A" stopOpacity="0.26" />
                <stop offset="100%" stopColor="#D9232A" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {/* Horizontal dashed guides */}
            {[0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = padTop + chartH * (1 - ratio);
              return (
                <line
                  key={ratio}
                  x1={padX}
                  x2={width - padX}
                  y1={y}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
              );
            })}

            {/* Area Fill */}
            <path d={areaPath} fill="url(#kraftmanSalesGrad)" />

            {/* Subtle Background Daily Bars */}
            {points.map((p, idx) => {
              const barW = Math.max(4, Math.min(18, chartW / points.length - 4));
              const barH = Math.max(2, padTop + chartH - p.y);
              const isSelected = activePoint?.item.date === p.item.date;
              return (
                <rect
                  key={p.item.date}
                  x={p.x - barW / 2}
                  y={p.y}
                  width={barW}
                  height={barH}
                  rx={3}
                  fill={isSelected ? "#D9232A" : "#94a3b8"}
                  opacity={isSelected ? 0.25 : 0.12}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onClick={() => setHoveredIdx(idx)}
                  className="cursor-pointer transition-opacity"
                />
              );
            })}

            {/* Crisp Line */}
            <path
              d={linePath}
              fill="none"
              stroke="#D9232A"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Interactive Nodes + Sparse X Labels */}
            {points.map((p, idx) => {
              const isSelected = activePoint?.item.date === p.item.date;
              const showLabel =
                idx === 0 ||
                idx === points.length - 1 ||
                (points.length <= 14 && idx % 2 === 0) ||
                (points.length > 14 && idx % 5 === 0);

              return (
                <g
                  key={p.item.date}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onClick={() => setHoveredIdx(idx)}
                  className="cursor-pointer"
                >
                  {/* Large invisible touch hit zone */}
                  <rect
                    x={p.x - 14}
                    y={padTop}
                    width={28}
                    height={chartH + 16}
                    fill="transparent"
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isSelected ? 5 : 3}
                    fill={isSelected ? "#D9232A" : "#ffffff"}
                    stroke="#D9232A"
                    strokeWidth={isSelected ? 2.5 : 2}
                  />
                  {showLabel && (
                    <text
                      x={p.x}
                      y={height - 6}
                      textAnchor="middle"
                      fontSize="10"
                      fill="#64748b"
                      fontFamily="ui-monospace, monospace"
                    >
                      {p.item.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. COD vs Prepaid Donut Split Chart                                        */
/* -------------------------------------------------------------------------- */

export function PaymentSplitChart({ sales }: { sales: SalesSummary }) {
  const total = sales.total_revenue;
  const codPct = total > 0 ? Math.round((sales.cod_revenue / total) * 100) : 0;
  const prepaidPct = total > 0 ? 100 - codPct : 0;

  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const prepaidStroke = (prepaidPct / 100) * circumference;
  const codStroke = (codPct / 100) * circumference;

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Payment Mode Mix
        </p>
        <h3 className="text-sm font-bold text-slate-900">
          COD vs Prepaid Revenue Split
        </h3>
      </div>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <div className="relative flex h-36 w-36 shrink-0 items-center justify-center">
          <svg viewBox="0 0 130 130" className="h-full w-full -rotate-90">
            <circle
              cx="65"
              cy="65"
              r={radius}
              fill="none"
              stroke="#f1f5f9"
              strokeWidth="16"
            />
            {total > 0 && (
              <>
                <circle
                  cx="65"
                  cy="65"
                  r={radius}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="16"
                  strokeDasharray={`${prepaidStroke} ${circumference}`}
                  strokeLinecap="butt"
                />
                <circle
                  cx="65"
                  cy="65"
                  r={radius}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="16"
                  strokeDasharray={`${codStroke} ${circumference}`}
                  strokeDashoffset={-prepaidStroke}
                  strokeLinecap="butt"
                />
              </>
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-semibold uppercase text-slate-400">
              Total
            </span>
            <span className="font-mono text-sm font-extrabold text-slate-950">
              {formatINR(total)}
            </span>
          </div>
        </div>

        <div className="w-full space-y-2.5 text-xs">
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-2.5">
            <div className="flex items-center justify-between font-semibold text-amber-950">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                Cash on Delivery (COD)
              </span>
              <span className="font-mono">{codPct}%</span>
            </div>
            <div className="mt-1 flex items-center justify-between font-mono text-[11px] text-amber-900">
              <span className="font-bold">{formatINR(sales.cod_revenue)}</span>
              <span>{sales.cod_count} orders</span>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 p-2.5">
            <div className="flex items-center justify-between font-semibold text-emerald-950">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Prepaid Orders
              </span>
              <span className="font-mono">{prepaidPct}%</span>
            </div>
            <div className="mt-1 flex items-center justify-between font-mono text-[11px] text-emerald-900">
              <span className="font-bold">
                {formatINR(sales.prepaid_revenue)}
              </span>
              <span>{sales.prepaid_count} orders</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Fulfillment Funnel Progress Bars                                        */
/* -------------------------------------------------------------------------- */

export function FulfillmentFunnelChart({ sales }: { sales: SalesSummary }) {
  const rows = [
    {
      label: "Delivered",
      count: sales.delivered_count,
      revenue: sales.delivered_revenue,
      color: "bg-emerald-500",
    },
    {
      label: "In Transit",
      count: sales.in_transit_count,
      revenue: sales.in_transit_revenue,
      color: "bg-indigo-500",
    },
    {
      label: "Manifested (Ready)",
      count: sales.manifested_count,
      revenue: sales.manifested_revenue,
      color: "bg-blue-500",
    },
    {
      label: "Unfulfilled (Draft)",
      count: sales.unfulfilled_count,
      revenue: sales.unfulfilled_revenue,
      color: "bg-amber-500",
    },
    {
      label: "NDR / Action Needed",
      count: sales.ndr_count,
      revenue: sales.ndr_revenue,
      color: "bg-[#D9232A]",
    },
  ];

  const maxRevenue = Math.max(...rows.map((r) => r.revenue), 1);

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3.5">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Shipment Stage Funnel
        </p>
        <h3 className="text-sm font-bold text-slate-900">
          Revenue &amp; Orders by Courier Stage
        </h3>
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const widthPct =
            row.revenue > 0 ? Math.max(4, Math.round((row.revenue / maxRevenue) * 100)) : 0;
          return (
            <div key={row.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">
                  {row.label}{" "}
                  <span className="font-mono text-[11px] text-slate-400">
                    ({row.count})
                  </span>
                </span>
                <span className="font-mono font-bold text-slate-900">
                  {formatINR(row.revenue)}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn("h-full rounded-full transition-all", row.color)}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. Top Cities & States Bar Graph                                           */
/* -------------------------------------------------------------------------- */

export function TopDestinationsChart({
  cities,
  states,
}: {
  cities: CitySalesItem[];
  states: StateSalesItem[];
}) {
  const [group, setGroup] = React.useState<"cities" | "states">("cities");
  const items =
    group === "cities"
      ? cities.map((c) => ({ name: c.city, orders: c.order_count, revenue: c.revenue }))
      : states.map((s) => ({ name: s.state, orders: s.order_count, revenue: s.revenue }));

  const maxRev = Math.max(...items.map((i) => i.revenue), 1);

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Geographic Demand
          </p>
          <h3 className="text-sm font-bold text-slate-900">
            Top Shipping Destinations
          </h3>
        </div>
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-semibold">
          {(["cities", "states"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroup(g)}
              className={cn(
                "min-h-8 rounded-md px-2.5 capitalize transition-all cursor-pointer",
                group === g
                  ? "bg-white text-slate-950 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-400">
          No destination data available yet
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => {
            const pct = Math.max(6, Math.round((item.revenue / maxRev) * 100));
            return (
              <div key={item.name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate font-semibold text-slate-800">
                    <span className="mr-1.5 font-mono text-[11px] text-slate-400">
                      #{idx + 1}
                    </span>
                    {item.name}
                  </span>
                  <span className="shrink-0 font-mono text-slate-700">
                    <strong>{formatINR(item.revenue)}</strong> · {item.orders} ord
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-slate-800 to-[#D9232A] transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

