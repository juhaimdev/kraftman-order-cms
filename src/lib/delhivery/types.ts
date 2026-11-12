export interface ServiceabilityResult {
  pincode: string;
  serviceable: boolean;
  express: boolean;
  cod: boolean;
  pickup: boolean;
  city?: string;
  stateCode?: string;
  cached?: boolean;
}

export interface DelhiveryPinCodeResponse {
  delivery_codes?: Array<{
    postal_code?: {
      pin: number | string;
      pre_paid?: string;
      cash?: string;
      pickup?: string;
      cod?: string;
      city?: string;
      state_code?: string;
      repl?: string;
    };
  }>;
}

export interface DelhiveryShipmentInput {
  name: string;
  add: string;
  pin: string;
  city: string;
  state: string;
  country: "India";
  phone: string;
  order: string;
  payment_mode: "COD" | "Prepaid";
  cod_amount: string;
  weight: string;
  shipment_length: string;
  shipment_width: string;
  shipment_height: string;
  products_desc: string;
}

export interface DelhiveryCreateResponse {
  success?: boolean;
  rmk?: string;
  upload_wbn?: string;
  packages?: Array<{
    status?: string;
    waybill?: string;
    refnum?: string;
    remarks?: string[];
    serviceable?: boolean;
  }>;
}

export interface DelhiveryTrackingShipment {
  AWB: string;
  ReferenceNo?: string;
  OrderType?: string;
  InvoiceAmount?: number | string;
  CODAmount?: number | string;
  ChargedWeight?: number | string;
  Weight?: number | string;
  PickUpDate?: string;
  PickedupDate?: string;
  ExpectedDeliveryDate?: string;
  Origin?: string;
  Destination?: string;
  Status?: {
    Status?: string;
    SubStatus?: string;
    StatusType?: string;
    StatusCode?: string;
    StatusDateTime?: string;
    StatusLocation?: string;
    Time?: string;
    Instructions?: string;
    Remarks?: string;
  };
  Scans?: Array<{
    ScanDetail?: {
      ScanDateTime?: string;
      ScanTime?: string;
      ScanType?: string;
      Scan?: string;
      Instructions?: string;
      ScannedLocation?: string;
    };
  }>;
  Consignee?: {
    Name?: string;
    Address1?: string;
    Address2?: string;
    Address3?: string;
    City?: string;
    State?: string;
    PinCode?: number | string;
    Telephone1?: string[] | string;
    Telephone2?: string[] | string;
  };
}

export interface DelhiveryTrackingResponse {
  Success?: boolean;
  Error?: string;
  rmk?: string;
  ShipmentData?: Array<{
    Shipment?: DelhiveryTrackingShipment;
  }>;
}

export interface DelhiveryNdrResponse {
  success?: boolean;
  upl_id?: string;
  request_id?: string;
  message?: string;
  error?: string;
}

export interface DelhiveryCancelResponse {
  status?: boolean;
  success?: boolean;
  waybill?: string;
  order_id?: string;
  remark?: string;
  error?: string;
}
