import "server-only";
import {
  cancelShipmentApi,
  checkPincodeApi,
  createShipmentApi,
  fetchPackingSlipApi,
  submitNdrActionApi,
  trackShipmentsApi,
} from "./api";
import type { DelhiveryShipmentInput } from "./types";

function getDelhiveryConfig() {
  const token = process.env.DELHIVERY_API_TOKEN?.trim() || "";
  const pickupLocation = process.env.DELHIVERY_PICKUP_LOCATION?.trim() || "";
  const envMode = process.env.DELHIVERY_ENV?.trim() || "production";
  return { token, pickupLocation, envMode };
}

export async function checkPincode(pincode: string) {
  const { token, envMode } = getDelhiveryConfig();
  return checkPincodeApi(pincode, token, envMode);
}

export async function createShipment(shipments: DelhiveryShipmentInput[]) {
  const { token, pickupLocation, envMode } = getDelhiveryConfig();
  if (!pickupLocation) {
    throw new Error(
      "DELHIVERY_PICKUP_LOCATION is not set. Add your registered Delhivery One warehouse name in .env.local or Vercel Environment Variables."
    );
  }
  return createShipmentApi(shipments, pickupLocation, token, envMode);
}

export async function fetchPackingSlip(wbns: string) {
  const { token, envMode } = getDelhiveryConfig();
  return fetchPackingSlipApi(wbns, token, envMode);
}

export async function trackShipments(waybills: string[]) {
  const { token, envMode } = getDelhiveryConfig();
  return trackShipmentsApi({ waybills }, token, envMode);
}

export async function trackByRefIds(refIds: string[]) {
  const { token, envMode } = getDelhiveryConfig();
  return trackShipmentsApi({ refIds }, token, envMode);
}

export async function submitNdrAction(data: {
  waybill: string;
  act: "RE-ATTEMPT" | "DEFER_DLV" | "EDIT_DETAILS";
  deferred_date?: string;
  phone?: string;
  add?: string;
  name?: string;
}) {
  const { token, envMode } = getDelhiveryConfig();
  return submitNdrActionApi(data, token, envMode);
}

export async function cancelShipment(waybill: string) {
  const { token, envMode } = getDelhiveryConfig();
  return cancelShipmentApi(waybill, token, envMode);
}
