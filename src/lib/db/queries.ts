import "server-only";
import {
  getSupabaseAdmin,
  isMissingTableError,
  isSupabaseConfigured,
} from "../supabase/server";
import type {
  CitySalesItem,
  DashboardCounts,
  OrderStatus,
  OrderWithShipment,
  PaymentMethod,
  ProductPreset,
  SalesSummary,
  TrackingScan,
} from "./types";

interface SupabaseShipmentRel {
  id: string;
  awb_number: string | null;
  label_url: string | null;
  label_storage_path: string | null;
  weight_grams: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  latest_tracking_status: string | null;
  tracking_scans: unknown;
  ndr_upl_id: string | null;
  is_rto: boolean | null;
  updated_at: string | null;
}

interface SupabaseOrderRow {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  payment_method: PaymentMethod;
  total_amount: number | string;
  status: OrderStatus;
  product_id?: string | null;
  item_description?: string | null;
  created_at: string;
  shipments: SupabaseShipmentRel | SupabaseShipmentRel[] | null;
}

const EMPTY_COUNTS: DashboardCounts = {
  total: 0,
  pending: 0,
  ofd: 0,
  ndr: 0,
};

const EMPTY_SALES: SalesSummary = {
  total_revenue: 0,
  total_orders: 0,
  avg_order_value: 0,
  cod_revenue: 0,
  cod_count: 0,
  prepaid_revenue: 0,
  prepaid_count: 0,
  delivered_revenue: 0,
  delivered_count: 0,
  in_pipeline_revenue: 0,
  in_pipeline_count: 0,
  ndr_revenue: 0,
  ndr_count: 0,
  unfulfilled_revenue: 0,
  unfulfilled_count: 0,
  manifested_revenue: 0,
  manifested_count: 0,
  in_transit_revenue: 0,
  in_transit_count: 0,
  top_cities: [],
};

function parseScans(raw: unknown): TrackingScan[] {
  if (Array.isArray(raw)) return raw as TrackingScan[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as TrackingScan[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function unwrapShipment(
  rel: SupabaseShipmentRel | SupabaseShipmentRel[] | null
): SupabaseShipmentRel | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

function mapSupabaseOrderRow(row: SupabaseOrderRow): OrderWithShipment {
  const s = unwrapShipment(row.shipments);
  return {
    id: row.id,
    order_number: row.order_number,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    address: row.address,
    city: row.city || "",
    state: row.state || "",
    pincode: row.pincode,
    payment_method: row.payment_method,
    total_amount: Number(row.total_amount ?? 0),
    status: row.status,
    product_id: row.product_id ?? null,
    item_description: row.item_description ?? null,
    created_at: row.created_at,
    shipment_id: s?.id ?? null,
    awb_number: s?.awb_number ?? null,
    label_url: s?.label_url ?? null,
    label_r2_key: s?.label_storage_path ?? null,
    weight_grams: s?.weight_grams ?? null,
    length_cm: s?.length_cm != null ? Number(s.length_cm) : null,
    width_cm: s?.width_cm != null ? Number(s.width_cm) : null,
    height_cm: s?.height_cm != null ? Number(s.height_cm) : null,
    latest_tracking_status: s?.latest_tracking_status ?? null,
    tracking_scans: parseScans(s?.tracking_scans),
    ndr_upl_id: s?.ndr_upl_id ?? null,
    is_rto: Boolean(s?.is_rto),
    shipment_updated_at: s?.updated_at ?? null,
  };
}

function computeAggregatesFallback(rows: SupabaseOrderRow[]): {
  counts: DashboardCounts;
  sales: SalesSummary;
} {
  let totalRevenue = 0;
  let codRevenue = 0;
  let codCount = 0;
  let prepaidRevenue = 0;
  let prepaidCount = 0;
  let deliveredRevenue = 0;
  let deliveredCount = 0;
  let inPipelineRevenue = 0;
  let inPipelineCount = 0;
  let ndrRevenue = 0;
  let ndrCount = 0;
  let unfulfilledRevenue = 0;
  let unfulfilledCount = 0;
  let manifestedRevenue = 0;
  let manifestedCount = 0;
  let inTransitRevenue = 0;
  let inTransitCount = 0;
  let ofdCount = 0;

  const cityMap = new Map<string, CitySalesItem>();

  for (const row of rows) {
    const amount = Number(row.total_amount ?? 0);
    const s = unwrapShipment(row.shipments);
    totalRevenue += amount;

    if (row.payment_method === "COD") {
      codRevenue += amount;
      codCount++;
    } else {
      prepaidRevenue += amount;
      prepaidCount++;
    }

    if (row.status === "Delivered") {
      deliveredRevenue += amount;
      deliveredCount++;
    } else if (row.status === "NDR") {
      ndrRevenue += amount;
      ndrCount++;
    } else {
      inPipelineRevenue += amount;
      inPipelineCount++;
    }

    if (row.status === "Unfulfilled") {
      unfulfilledRevenue += amount;
      unfulfilledCount++;
    } else if (row.status === "Manifested") {
      manifestedRevenue += amount;
      manifestedCount++;
    } else if (row.status === "In Transit") {
      inTransitRevenue += amount;
      inTransitCount++;
    }

    const latest = s?.latest_tracking_status ?? "";
    if (/out for delivery|dispatched/i.test(latest)) {
      ofdCount++;
    }

    const cityKey = row.city?.trim() || "Unspecified";
    const prev = cityMap.get(cityKey) ?? {
      city: cityKey,
      order_count: 0,
      revenue: 0,
    };
    prev.order_count += 1;
    prev.revenue += amount;
    cityMap.set(cityKey, prev);
  }

  const total = rows.length;
  const topCities = Array.from(cityMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return {
    counts: {
      total,
      pending: unfulfilledCount,
      ofd: ofdCount,
      ndr: ndrCount,
    },
    sales: {
      total_revenue: totalRevenue,
      total_orders: total,
      avg_order_value: total > 0 ? totalRevenue / total : 0,
      cod_revenue: codRevenue,
      cod_count: codCount,
      prepaid_revenue: prepaidRevenue,
      prepaid_count: prepaidCount,
      delivered_revenue: deliveredRevenue,
      delivered_count: deliveredCount,
      in_pipeline_revenue: inPipelineRevenue,
      in_pipeline_count: inPipelineCount,
      ndr_revenue: ndrRevenue,
      ndr_count: ndrCount,
      unfulfilled_revenue: unfulfilledRevenue,
      unfulfilled_count: unfulfilledCount,
      manifested_revenue: manifestedRevenue,
      manifested_count: manifestedCount,
      in_transit_revenue: inTransitRevenue,
      in_transit_count: inTransitCount,
      top_cities: topCities,
    },
  };
}

const ORDER_WITH_SHIPMENT_SELECT = `
  id,
  order_number,
  customer_name,
  customer_phone,
  address,
  city,
  state,
  pincode,
  payment_method,
  total_amount,
  status,
  product_id,
  item_description,
  created_at,
  shipments (
    id,
    awb_number,
    label_url,
    label_storage_path,
    weight_grams,
    length_cm,
    width_cm,
    height_cm,
    latest_tracking_status,
    tracking_scans,
    ndr_upl_id,
    is_rto,
    updated_at
  )
`;

export async function listOrdersWithShipments(options?: {
  filter?: string;
  q?: string;
}): Promise<{
  orders: OrderWithShipment[];
  counts: DashboardCounts;
  sales: SalesSummary;
  dbReady: boolean;
  dbReason?: "missing_env" | "missing_schema";
}> {
  if (!isSupabaseConfigured()) {
    return {
      orders: [],
      counts: EMPTY_COUNTS,
      sales: EMPTY_SALES,
      dbReady: false,
      dbReason: "missing_env",
    };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      orders: [],
      counts: EMPTY_COUNTS,
      sales: EMPTY_SALES,
      dbReady: false,
      dbReason: "missing_env",
    };
  }

  const filter = options?.filter;
  const search = options?.q?.trim() ?? "";

  try {
    // 1. Run filtered orders fetch & single-roundtrip analytics RPC in parallel
    let orderQuery = supabase
      .from("orders")
      .select(ORDER_WITH_SHIPMENT_SELECT)
      .order("created_at", { ascending: false })
      .limit(150);

    if (filter === "pending") {
      orderQuery = orderQuery.eq("status", "Unfulfilled");
    } else if (filter === "ndr") {
      orderQuery = orderQuery.eq("status", "NDR");
    }

    const [ordersResult, rpcResult] = await Promise.all([
      orderQuery,
      supabase.rpc("get_dashboard_sales_summary"),
    ]);

    if (ordersResult.error) {
      if (isMissingTableError(ordersResult.error)) {
        return {
          orders: [],
          counts: EMPTY_COUNTS,
          sales: EMPTY_SALES,
          dbReady: false,
          dbReason: "missing_schema",
        };
      }
      throw new Error(ordersResult.error.message);
    }

    let mappedOrders = (
      (ordersResult.data ?? []) as unknown as SupabaseOrderRow[]
    ).map(mapSupabaseOrderRow);

    if (filter === "ofd") {
      mappedOrders = mappedOrders.filter((o) =>
        /out for delivery|dispatched/i.test(o.latest_tracking_status ?? "")
      );
    }

    if (search) {
      const needle = search.toLowerCase();
      mappedOrders = mappedOrders.filter(
        (o) =>
          o.order_number.toLowerCase().includes(needle) ||
          o.customer_name.toLowerCase().includes(needle) ||
          o.customer_phone.toLowerCase().includes(needle) ||
          o.pincode.toLowerCase().includes(needle) ||
          (o.awb_number ?? "").toLowerCase().includes(needle)
      );
    }

    // 2. Use RPC result when available; fall back seamlessly if user only applied table DDL
    if (!rpcResult.error && rpcResult.data) {
      const rpcPayload = rpcResult.data as {
        counts?: DashboardCounts;
        sales?: SalesSummary;
      };
      return {
        orders: mappedOrders,
        counts: rpcPayload.counts ?? EMPTY_COUNTS,
        sales: rpcPayload.sales ?? EMPTY_SALES,
        dbReady: true,
      };
    }

    const fallbackRowsRes = await supabase
      .from("orders")
      .select("total_amount, payment_method, status, city, shipments(latest_tracking_status)")
      .limit(2000);

    const { counts, sales } = computeAggregatesFallback(
      (fallbackRowsRes.data ?? []) as unknown as SupabaseOrderRow[]
    );

    return {
      orders: mappedOrders,
      counts,
      sales,
      dbReady: true,
    };
  } catch (err) {
    console.error("Supabase query failed:", err);
    return {
      orders: [],
      counts: EMPTY_COUNTS,
      sales: EMPTY_SALES,
      dbReady: false,
      dbReason: "missing_schema",
    };
  }
}

export async function getOrdersByAwbs(
  awbs: string[]
): Promise<OrderWithShipment[]> {
  if (awbs.length === 0) return [];
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("shipments")
    .select(
      `
      id,
      awb_number,
      label_url,
      label_storage_path,
      weight_grams,
      length_cm,
      width_cm,
      height_cm,
      latest_tracking_status,
      tracking_scans,
      ndr_upl_id,
      is_rto,
      updated_at,
      orders!inner (
        id,
        order_number,
        customer_name,
        customer_phone,
        address,
        city,
        state,
        pincode,
        payment_method,
        total_amount,
        status,
        product_id,
        item_description,
        created_at
      )
    `
    )
    .in("awb_number", awbs);

  if (error || !data) return [];

  type ShipmentWithOrder = SupabaseShipmentRel & {
    orders: Omit<SupabaseOrderRow, "shipments"> | Omit<SupabaseOrderRow, "shipments">[];
  };

  return (data as unknown as ShipmentWithOrder[]).map((row) => {
    const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    return {
      id: order.id,
      order_number: order.order_number,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      address: order.address,
      city: order.city || "",
      state: order.state || "",
      pincode: order.pincode,
      payment_method: order.payment_method,
      total_amount: Number(order.total_amount ?? 0),
      status: order.status,
      product_id: order.product_id ?? null,
      item_description: order.item_description ?? null,
      created_at: order.created_at,
      shipment_id: row.id,
      awb_number: row.awb_number,
      label_url: row.label_url,
      label_r2_key: row.label_storage_path ?? null,
      weight_grams: row.weight_grams,
      length_cm: row.length_cm != null ? Number(row.length_cm) : null,
      width_cm: row.width_cm != null ? Number(row.width_cm) : null,
      height_cm: row.height_cm != null ? Number(row.height_cm) : null,
      latest_tracking_status: row.latest_tracking_status,
      tracking_scans: parseScans(row.tracking_scans),
      ndr_upl_id: row.ndr_upl_id,
      is_rto: Boolean(row.is_rto),
      shipment_updated_at: row.updated_at,
    };
  });
}

export async function listProducts(): Promise<ProductPreset[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error || !data) return [];

    return (data as unknown as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      sku: row.sku ? String(row.sku) : null,
      name: String(row.name ?? ""),
      size_label: String(row.size_label ?? ""),
      weight_grams: Number(row.weight_grams ?? 500),
      length_cm: Number(row.length_cm ?? 15),
      width_cm: Number(row.width_cm ?? 12),
      height_cm: Number(row.height_cm ?? 8),
      default_price: Number(row.default_price ?? 0),
      created_at: String(row.created_at ?? ""),
      updated_at: String(row.updated_at ?? ""),
    }));
  } catch {
    return [];
  }
}
