-- =============================================================================
-- Delhivery One Order Management & Shipping Dashboard
-- Supabase PostgreSQL Initial Schema + Analytics RPC
-- Apply in Supabase SQL Editor or via `supabase db push`
-- =============================================================================

-- 1. Custom Enums (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    CREATE TYPE public.order_status AS ENUM (
      'Unfulfilled',
      'Manifested',
      'In Transit',
      'Delivered',
      'NDR'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method_type') THEN
    CREATE TYPE public.payment_method_type AS ENUM ('COD', 'Prepaid');
  END IF;
END
$$;

-- 2. Saved Products Catalog (for 1-click weight/dimension presets)
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE,
  name TEXT NOT NULL,
  size_label TEXT NOT NULL DEFAULT '',
  weight_grams INTEGER NOT NULL DEFAULT 500 CHECK (weight_grams > 0),
  length_cm NUMERIC(8, 2) NOT NULL DEFAULT 15 CHECK (length_cm > 0),
  width_cm NUMERIC(8, 2) NOT NULL DEFAULT 12 CHECK (width_cm > 0),
  height_cm NUMERIC(8, 2) NOT NULL DEFAULT 8 CHECK (height_cm > 0),
  default_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  pincode TEXT NOT NULL,
  payment_method public.payment_method_type NOT NULL DEFAULT 'Prepaid',
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status public.order_status NOT NULL DEFAULT 'Unfulfilled',
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  item_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Shipments Table (1:1 with orders; supports ON CONFLICT (order_id))
CREATE TABLE IF NOT EXISTS public.shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID UNIQUE NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  awb_number TEXT UNIQUE,
  label_url TEXT,
  label_storage_path TEXT,
  weight_grams INTEGER NOT NULL DEFAULT 500 CHECK (weight_grams > 0),
  length_cm NUMERIC(8, 2),
  width_cm NUMERIC(8, 2),
  height_cm NUMERIC(8, 2),
  latest_tracking_status TEXT,
  tracking_scans JSONB NOT NULL DEFAULT '[]'::jsonb,
  ndr_upl_id TEXT,
  is_rto BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_pincode ON public.orders(pincode);
CREATE INDEX IF NOT EXISTS idx_orders_city ON public.orders(city);
CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON public.shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_awb ON public.shipments(awb_number) WHERE awb_number IS NOT NULL;

-- 5. Automatic updated_at Trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_shipments_updated_at ON public.shipments;
CREATE TRIGGER trg_shipments_updated_at
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 6. Row-Level Security (server routes use SUPABASE_SERVICE_ROLE_KEY)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_products" ON public.products;
CREATE POLICY "authenticated_read_products"
  ON public.products FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "authenticated_read_orders" ON public.orders;
CREATE POLICY "authenticated_read_orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "authenticated_read_shipments" ON public.shipments;
CREATE POLICY "authenticated_read_shipments"
  ON public.shipments FOR SELECT
  TO authenticated
  USING (true);

-- 7. Single-roundtrip Dashboard Counts & Sales Analytics RPC
CREATE OR REPLACE FUNCTION public.get_dashboard_sales_summary()
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH agg AS (
  SELECT
    COUNT(*)::INT AS total,
    COUNT(*) FILTER (WHERE o.status = 'Unfulfilled')::INT AS pending,
    COUNT(*) FILTER (
      WHERE s.latest_tracking_status ILIKE '%Out for Delivery%'
         OR s.latest_tracking_status ILIKE '%Dispatched%'
    )::INT AS ofd,
    COUNT(*) FILTER (WHERE o.status = 'NDR')::INT AS ndr,
    COALESCE(SUM(o.total_amount), 0)::DOUBLE PRECISION AS total_revenue,
    COALESCE(AVG(o.total_amount), 0)::DOUBLE PRECISION AS avg_order_value,
    COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_method = 'COD'), 0)::DOUBLE PRECISION AS cod_revenue,
    COUNT(*) FILTER (WHERE o.payment_method = 'COD')::INT AS cod_count,
    COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_method = 'Prepaid'), 0)::DOUBLE PRECISION AS prepaid_revenue,
    COUNT(*) FILTER (WHERE o.payment_method = 'Prepaid')::INT AS prepaid_count,
    COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'Delivered'), 0)::DOUBLE PRECISION AS delivered_revenue,
    COUNT(*) FILTER (WHERE o.status = 'Delivered')::INT AS delivered_count,
    COALESCE(SUM(o.total_amount) FILTER (WHERE o.status IN ('Unfulfilled', 'Manifested', 'In Transit')), 0)::DOUBLE PRECISION AS in_pipeline_revenue,
    COUNT(*) FILTER (WHERE o.status IN ('Unfulfilled', 'Manifested', 'In Transit'))::INT AS in_pipeline_count,
    COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'NDR'), 0)::DOUBLE PRECISION AS ndr_revenue,
    COUNT(*) FILTER (WHERE o.status = 'NDR')::INT AS ndr_count,
    COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'Unfulfilled'), 0)::DOUBLE PRECISION AS unfulfilled_revenue,
    COUNT(*) FILTER (WHERE o.status = 'Unfulfilled')::INT AS unfulfilled_count,
    COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'Manifested'), 0)::DOUBLE PRECISION AS manifested_revenue,
    COUNT(*) FILTER (WHERE o.status = 'Manifested')::INT AS manifested_count,
    COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'In Transit'), 0)::DOUBLE PRECISION AS in_transit_revenue,
    COUNT(*) FILTER (WHERE o.status = 'In Transit')::INT AS in_transit_count
  FROM public.orders o
  LEFT JOIN public.shipments s ON s.order_id = o.id
),
top_cities AS (
  SELECT
    COALESCE(NULLIF(BTRIM(city), ''), 'Unspecified') AS city,
    COUNT(*)::INT AS order_count,
    COALESCE(SUM(total_amount), 0)::DOUBLE PRECISION AS revenue
  FROM public.orders
  GROUP BY 1
  ORDER BY revenue DESC, order_count DESC
  LIMIT 5
)
SELECT jsonb_build_object(
  'counts', jsonb_build_object(
    'total', agg.total,
    'pending', agg.pending,
    'ofd', agg.ofd,
    'ndr', agg.ndr
  ),
  'sales', jsonb_build_object(
    'total_revenue', agg.total_revenue,
    'total_orders', agg.total,
    'avg_order_value', ROUND(agg.avg_order_value::NUMERIC, 2)::DOUBLE PRECISION,
    'cod_revenue', agg.cod_revenue,
    'cod_count', agg.cod_count,
    'prepaid_revenue', agg.prepaid_revenue,
    'prepaid_count', agg.prepaid_count,
    'delivered_revenue', agg.delivered_revenue,
    'delivered_count', agg.delivered_count,
    'in_pipeline_revenue', agg.in_pipeline_revenue,
    'in_pipeline_count', agg.in_pipeline_count,
    'ndr_revenue', agg.ndr_revenue,
    'ndr_count', agg.ndr_count,
    'unfulfilled_revenue', agg.unfulfilled_revenue,
    'unfulfilled_count', agg.unfulfilled_count,
    'manifested_revenue', agg.manifested_revenue,
    'manifested_count', agg.manifested_count,
    'in_transit_revenue', agg.in_transit_revenue,
    'in_transit_count', agg.in_transit_count,
    'top_cities', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'city', tc.city,
        'order_count', tc.order_count,
        'revenue', tc.revenue
      )) FROM top_cities tc),
      '[]'::jsonb
    )
  )
)
FROM agg;
$$;
