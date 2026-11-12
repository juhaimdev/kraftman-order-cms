import type {
  DelhiveryCancelResponse,
  DelhiveryCreateResponse,
  DelhiveryNdrResponse,
  DelhiveryPinCodeResponse,
  DelhiveryShipmentInput,
  DelhiveryTrackingResponse,
  ServiceabilityResult,
} from "./types";

const STAGING_BASE = "https://staging-express.delhivery.com";
const PROD_BASE = "https://track.delhivery.com";

export function getDelhiveryBaseUrl(envMode?: string): string {
  return envMode === "production" ? PROD_BASE : STAGING_BASE;
}

async function delhiveryRequest(
  path: string,
  token: string,
  envMode?: string,
  init?: RequestInit
): Promise<Response> {
  if (!token) {
    throw new Error(
      "DELHIVERY_API_TOKEN is not configured. Add it to .env.local locally or in Vercel Environment Variables."
    );
  }

  const baseUrl = getDelhiveryBaseUrl(envMode);
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${token}`,
      Accept: "application/json, application/pdf",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(
      `Delhivery API error (${res.status} ${res.statusText}): ${bodyText.slice(0, 200)}`
    );
  }

  return res;
}

/** WF-1: Check PIN code serviceability */
export async function checkPincodeApi(
  pincode: string,
  token: string,
  envMode?: string
): Promise<ServiceabilityResult> {
  const res = await delhiveryRequest(
    `/c/api/pin-codes/json/?filter_codes=${encodeURIComponent(pincode)}`,
    token,
    envMode
  );
  const data = (await res.json()) as DelhiveryPinCodeResponse;
  const codes = data?.delivery_codes ?? [];

  if (codes.length === 0 || !codes[0]?.postal_code) {
    return {
      pincode,
      serviceable: false,
      express: false,
      cod: false,
      pickup: false,
    };
  }

  const pc = codes[0].postal_code;
  return {
    pincode,
    serviceable: true,
    express: pc.pre_paid === "Y",
    cod: pc.cash === "Y" || pc.cod === "Y",
    pickup: pc.pickup === "Y",
    city: pc.city,
    stateCode: pc.state_code,
  };
}

/** WF-2: Manifest shipments & generate AWB */
export async function createShipmentApi(
  shipments: DelhiveryShipmentInput[],
  pickupLocation: string,
  token: string,
  envMode?: string
): Promise<DelhiveryCreateResponse> {
  const payload = {
    shipments,
    pickup_location: { name: pickupLocation },
  };

  const body = new URLSearchParams();
  body.set("format", "json");
  body.set("data", JSON.stringify(payload));

  const res = await delhiveryRequest("/api/cmu/create.json", token, envMode, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  return (await res.json()) as DelhiveryCreateResponse;
}

/** WF-3: Fetch 4x6 thermal shipping label / packing slip */
export async function fetchPackingSlipApi(
  wbns: string,
  token: string,
  envMode?: string
): Promise<Response> {
  return delhiveryRequest(
    `/api/p/packing_slip?wbns=${encodeURIComponent(wbns)}&pdf=true&pdf_size=4R`,
    token,
    envMode
  );
}

/** WF-4: Live tracking by comma-separated AWBs or Order Reference IDs */
export async function trackShipmentsApi(
  query: { waybills?: string[]; refIds?: string[] },
  token: string,
  envMode?: string
): Promise<DelhiveryTrackingResponse> {
  const params = new URLSearchParams();
  if (query.waybills && query.waybills.length > 0) {
    params.set("waybill", query.waybills.join(","));
  } else if (query.refIds && query.refIds.length > 0) {
    params.set("ref_ids", query.refIds.join(","));
  } else {
    throw new Error("Provide at least one AWB or Order Reference ID");
  }
  params.set("verbose", "2");

  const res = await delhiveryRequest(
    `/api/v1/packages/json/?${params.toString()}`,
    token,
    envMode
  );
  return (await res.json()) as DelhiveryTrackingResponse;
}

/** WF-5a: Asynchronous NDR action (`RE-ATTEMPT`, `DEFER_DLV`, `EDIT_DETAILS`) */
export async function submitNdrActionApi(
  data: {
    waybill: string;
    act: "RE-ATTEMPT" | "DEFER_DLV" | "EDIT_DETAILS";
    deferred_date?: string;
    phone?: string;
    add?: string;
    name?: string;
  },
  token: string,
  envMode?: string
): Promise<DelhiveryNdrResponse> {
  const res = await delhiveryRequest("/api/p/update", token, envMode, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: [data] }),
  });
  return (await res.json()) as DelhiveryNdrResponse;
}

/** WF-5b: Mark as Return to Origin (RTO) / Cancel Shipment */
export async function cancelShipmentApi(
  waybill: string,
  token: string,
  envMode?: string
): Promise<DelhiveryCancelResponse> {
  const res = await delhiveryRequest("/api/p/edit", token, envMode, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ waybill, cancellation: "true" }),
  });
  return (await res.json()) as DelhiveryCancelResponse;
}

