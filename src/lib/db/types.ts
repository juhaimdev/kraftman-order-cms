export type OrderStatus =
  | "Unfulfilled"
  | "Manifested"
  | "In Transit"
  | "Delivered"
  | "NDR";

export type PaymentMethod = "COD" | "Prepaid";

export interface TrackingScan {
  ScanDateTime: string;
  ScanType: string;
  Scan: string;
  Instructions: string;
  ScannedLocation: string;
}

export interface WalletSummary {
  current_balance: number;
  minimum_threshold: number;
  maximum_threshold: number;
  is_active: boolean;
  payment_gateway?: string;
  cached?: boolean;
}

export interface ProductPreset {
  id: string;
  sku: string | null;
  name: string;
  size_label: string;
  weight_grams: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  default_price: number;
  created_at: string;
  updated_at: string;
}

export interface OrderRecord {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  payment_method: PaymentMethod;
  total_amount: number;
  status: OrderStatus;
  product_id?: string | null;
  item_description?: string | null;
  created_at: string;
}

export interface ShipmentRecord {
  id: string;
  order_id: string;
  awb_number: string | null;
  label_url: string | null;
  label_r2_key: string | null;
  weight_grams: number;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  latest_tracking_status: string | null;
  tracking_scans: string;
  ndr_upl_id: string | null;
  is_rto: number;
  updated_at: string;
}

export interface OrderWithShipment extends OrderRecord {
  shipment_id: string | null;
  awb_number: string | null;
  label_url: string | null;
  label_r2_key: string | null;
  weight_grams: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  latest_tracking_status: string | null;
  tracking_scans: TrackingScan[];
  ndr_upl_id: string | null;
  is_rto: boolean;
  shipment_updated_at: string | null;
}

export interface DashboardCounts {
  total: number;
  pending: number;
  ofd: number;
  ndr: number;
}

export interface CitySalesItem {
  city: string;
  order_count: number;
  revenue: number;
}

export interface SalesSummary {
  total_revenue: number;
  total_orders: number;
  avg_order_value: number;
  cod_revenue: number;
  cod_count: number;
  prepaid_revenue: number;
  prepaid_count: number;
  delivered_revenue: number;
  delivered_count: number;
  in_pipeline_revenue: number;
  in_pipeline_count: number;
  ndr_revenue: number;
  ndr_count: number;
  unfulfilled_revenue: number;
  unfulfilled_count: number;
  manifested_revenue: number;
  manifested_count: number;
  in_transit_revenue: number;
  in_transit_count: number;
  top_cities: CitySalesItem[];
}
