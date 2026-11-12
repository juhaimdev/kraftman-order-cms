"use client";

import * as React from "react";
import {
  AlertTriangle,
  Building2,
  Calculator,
  CalendarClock,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import {
  calculateShippingRatesAction,
  getPickupLocationsAction,
  listDelhiveryExceptionsAction,
  listPickupRequestsAction,
  resolveExceptionAction,
  schedulePickupAction,
} from "@/actions/delhivery-ops";
import { submitNdrResolutionAction } from "@/actions/ndr";
import type {
  DelhiveryExceptionItem,
  OrderWithShipment,
  PickupLocationInfo,
  PickupRequestInfo,
  ShippingRateQuote,
} from "@/lib/db/types";
import { cn, formatINR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface OperationsHubDialogProps {
  orders: OrderWithShipment[];
  ndrCount: number;
}

type HubTab = "pickups" | "rates" | "exceptions";

export function OperationsHubDialog({
  orders,
  ndrCount,
}: OperationsHubDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<HubTab>("pickups");

  const [locations, setLocations] = React.useState<PickupLocationInfo[]>([]);
  const [pickupRequests, setPickupRequests] = React.useState<
    PickupRequestInfo[]
  >([]);
  const [exceptions, setExceptions] = React.useState<DelhiveryExceptionItem[]>(
    []
  );
  const [exceptionsNote, setExceptionsNote] = React.useState<string | null>(
    null
  );
  const [loadingPickups, setLoadingPickups] = React.useState(false);
  const [loadingExceptions, setLoadingExceptions] = React.useState(false);

  // Schedule Pickup Form State
  const [selectedFacilityId, setSelectedFacilityId] = React.useState("");
  const [pickupDate, setPickupDate] = React.useState(() => {
    const tomorrow = new Date(Date.now() + 86400_000);
    return tomorrow.toISOString().slice(0, 10);
  });
  const [startTime, setStartTime] = React.useState("14:00:00");
  const [endTime, setEndTime] = React.useState("18:00:00");
  const [selectedAwbs, setSelectedAwbs] = React.useState<Set<string>>(
    () => new Set()
  );
  const [schedulePending, startScheduleTransition] = React.useTransition();

  // Rate Calculator State
  const [originPin, setOriginPin] = React.useState("673602");
  const [destPin, setDestPin] = React.useState("400001");
  const [weightGrams, setWeightGrams] = React.useState("500");
  const [lengthCm, setLengthCm] = React.useState("20");
  const [breadthCm, setBreadthCm] = React.useState("15");
  const [heightCm, setHeightCm] = React.useState("10");
  const [packagingType, setPackagingType] = React.useState<"BOX" | "FLYER">(
    "BOX"
  );
  const [paymentMode, setPaymentMode] = React.useState<"Prepaid" | "COD">(
    "Prepaid"
  );
  const [codAmount, setCodAmount] = React.useState("0");
  const [quotes, setQuotes] = React.useState<ShippingRateQuote[]>([]);
  const [ratePending, startRateTransition] = React.useTransition();

  const [ndrPendingAwb, setNdrPendingAwb] = React.useState<string | null>(null);

  const pickupReadyOrders = React.useMemo(
    () =>
      orders.filter(
        (o) =>
          Boolean(o.awb_number) &&
          (o.status === "Manifested" || o.status === "In Transit")
      ),
    [orders]
  );

  const localExceptionOrders = React.useMemo(
    () =>
      orders.filter(
        (o) => Boolean(o.awb_number) && (o.status === "NDR" || o.is_rto)
      ),
    [orders]
  );

  const loadPickupsData = React.useCallback(async () => {
    setLoadingPickups(true);
    try {
      const [locRes, reqRes] = await Promise.all([
        getPickupLocationsAction(),
        listPickupRequestsAction(),
      ]);
      if (locRes.data && locRes.data.length > 0) {
        setLocations(locRes.data);
        const first = locRes.data[0];
        setSelectedFacilityId((prev) => prev || first.facility_id);
        setOriginPin((prev) => first.pin_code || prev);
        if (first.preferred_slots[0]) {
          setStartTime(first.preferred_slots[0].start_time);
          setEndTime(first.preferred_slots[0].end_time);
        }
      } else if (locRes.error) {
        toast.error(locRes.error);
      }

      if (reqRes.data) {
        setPickupRequests(reqRes.data);
      }
    } finally {
      setLoadingPickups(false);
    }
  }, []);

  const loadExceptionsData = React.useCallback(async () => {
    setLoadingExceptions(true);
    try {
      const res = await listDelhiveryExceptionsAction();
      setExceptions(res.data ?? []);
      setExceptionsNote(res.note ?? null);
    } finally {
      setLoadingExceptions(false);
    }
  }, []);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setSelectedAwbs(
        new Set(
          pickupReadyOrders
            .map((o) => o.awb_number)
            .filter((a): a is string => Boolean(a))
        )
      );
      void loadPickupsData();
      void loadExceptionsData();
    }
  }

  function handleFacilityChange(facilityId: string) {
    setSelectedFacilityId(facilityId);
    const match = locations.find((l) => l.facility_id === facilityId);
    if (match) {
      if (match.pin_code) setOriginPin(match.pin_code);
      if (match.preferred_slots[0]) {
        setStartTime(match.preferred_slots[0].start_time);
        setEndTime(match.preferred_slots[0].end_time);
      }
    }
  }

  function toggleAwb(awb: string) {
    setSelectedAwbs((prev) => {
      const next = new Set(prev);
      if (next.has(awb)) next.delete(awb);
      else next.add(awb);
      return next;
    });
  }

  function handleSchedulePickup(e: React.FormEvent) {
    e.preventDefault();
    const facility = locations.find((l) => l.facility_id === selectedFacilityId);
    const awbList = Array.from(selectedAwbs);
    if (awbList.length === 0) {
      toast.error("Select at least one manifested AWB to schedule pickup.");
      return;
    }

    startScheduleTransition(async () => {
      const res = await schedulePickupAction({
        facility_id: selectedFacilityId,
        facility_code: facility?.facility_code ?? undefined,
        pincode: facility?.pin_code || undefined,
        pickup_date: pickupDate,
        start_time: startTime,
        end_time: endTime,
        awb_numbers: awbList,
        expected_package_count: awbList.length,
      });

      if (res.error) {
        toast.error(res.error);
        return;
      }

      toast.success(
        `Pickup #${res.data?.pickupId} scheduled at ${res.data?.locationName}`
      );
      void loadPickupsData();
    });
  }

  function handleCalculateRates(e: React.FormEvent) {
    e.preventDefault();
    startRateTransition(async () => {
      const res = await calculateShippingRatesAction({
        origin_pin: originPin,
        destination_pin: destPin,
        weight_grams: Number(weightGrams) || 500,
        length_cm: Number(lengthCm) || 20,
        breadth_cm: Number(breadthCm) || 15,
        height_cm: Number(heightCm) || 10,
        packaging_type: packagingType,
        payment_method: paymentMode,
        cod_amount: paymentMode === "COD" ? Number(codAmount) || 0 : 0,
        facility_id: selectedFacilityId || undefined,
      });

      if (res.error) {
        toast.error(res.error);
        return;
      }
      setQuotes(res.data ?? []);
    });
  }

  async function handleQuickReattempt(awb: string) {
    setNdrPendingAwb(awb);
    try {
      const res = await submitNdrResolutionAction({
        waybill: awb,
        action: "RE-ATTEMPT",
      });
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`Requested Re-attempt for AWB ${awb}`);
      }
    } finally {
      setNdrPendingAwb(null);
    }
  }

  async function handleResolveRemoteException(
    ex: DelhiveryExceptionItem,
    cta: { actionable_id: string; bucket_id: string; label: string }
  ) {
    setNdrPendingAwb(ex.awb);
    try {
      const res = await resolveExceptionAction({
        exception_id: ex.exception_id,
        actionable_id: cta.actionable_id,
        bucket_id: cta.bucket_id,
        waybill: ex.awb,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Executed "${cta.label}" for AWB ${ex.awb}`);
      void loadExceptionsData();
    } finally {
      setNdrPendingAwb(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          title="Delhivery One Operations Hub: Pickups, Rates & Exceptions"
          className="relative border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
        >
          <Truck className="h-4 w-4 text-[#D9232A]" />
          <span className="hidden md:inline">Ops Hub</span>
          {ndrCount > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D9232A] px-1 text-[10px] font-bold text-white">
              {ndrCount}
            </span>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-3xl max-h-[88dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#D9232A] text-white">
              <Truck className="h-4 w-4" />
            </span>
            Kraftman × Delhivery One Operations Hub
          </DialogTitle>
          <DialogDescription>
            Schedule courier pickups, compare live Express &amp; Surface shipping
            rates, and manage NDR/exception queues.
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setTab("pickups")}
            className={cn(
              "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
              tab === "pickups"
                ? "bg-white text-slate-950 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <CalendarClock className="h-3.5 w-3.5 text-[#D9232A]" />
            <span>Pickups &amp; Warehouses</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("rates")}
            className={cn(
              "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
              tab === "rates"
                ? "bg-white text-slate-950 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <Calculator className="h-3.5 w-3.5 text-emerald-600" />
            <span>Rate Calculator</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("exceptions")}
            className={cn(
              "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
              tab === "exceptions"
                ? "bg-white text-slate-950 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            <span>Exceptions ({localExceptionOrders.length})</span>
          </button>
        </div>

        {/* TAB 1: PICKUPS & WAREHOUSES */}
        {tab === "pickups" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Active Delhivery Warehouses ({locations.length})
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={loadingPickups}
                onClick={() => void loadPickupsData()}
              >
                {loadingPickups ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                <span>Refresh</span>
              </Button>
            </div>

            {locations.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {locations.map((loc) => {
                  const isActive = loc.facility_id === selectedFacilityId;
                  return (
                    <button
                      key={loc.facility_id}
                      type="button"
                      onClick={() => handleFacilityChange(loc.facility_id)}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-all cursor-pointer",
                        isActive
                          ? "border-[#D9232A] bg-red-50/40 ring-1 ring-[#D9232A]"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900">
                          <Building2 className="h-4 w-4 text-[#D9232A]" />
                          {loc.facility_name}
                        </span>
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                          {loc.status}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                        {loc.address_line}
                      </p>
                      <p className="mt-1 font-mono text-[11px] font-semibold text-slate-700">
                        {loc.city}, {loc.state} · PIN {loc.pin_code} ·{" "}
                        {loc.phone}
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : loadingPickups ? (
              <div className="flex items-center justify-center rounded-xl border border-slate-200 p-6 text-xs text-slate-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading Delhivery One warehouses...
              </div>
            ) : null}

            {/* Schedule Pickup Form */}
            <form
              onSubmit={handleSchedulePickup}
              className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900">
                  Schedule Courier Pickup Request
                </h4>
                <span className="text-xs font-semibold text-slate-600">
                  {selectedAwbs.size} AWB(s) selected
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <div>
                  <label className="text-[11px] font-medium text-slate-500">
                    Pickup Date
                  </label>
                  <Input
                    type="date"
                    value={pickupDate}
                    onChange={(e) => setPickupDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-500">
                    Slot Start (HH:mm:ss)
                  </label>
                  <Input
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    placeholder="14:00:00"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-500">
                    Slot End (HH:mm:ss)
                  </label>
                  <Input
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    placeholder="18:00:00"
                    required
                  />
                </div>
              </div>

              {pickupReadyOrders.length > 0 ? (
                <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                  {pickupReadyOrders.map((o) => {
                    const awb = o.awb_number!;
                    const checked = selectedAwbs.has(awb);
                    return (
                      <label
                        key={o.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-slate-50"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAwb(awb)}
                            className="h-4 w-4 accent-[#D9232A]"
                          />
                          <span className="font-mono font-bold text-slate-900">
                            {o.order_number}
                          </span>
                          <span className="truncate text-slate-600">
                            {o.customer_name} ({o.pincode})
                          </span>
                        </div>
                        <span className="font-mono text-[11px] text-slate-500 shrink-0">
                          {awb}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-500">
                  No manifested AWBs ready for pickup yet. Generate an AWB first,
                  then schedule pickup here.
                </p>
              )}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={
                    schedulePending ||
                    !selectedFacilityId ||
                    selectedAwbs.size === 0
                  }
                >
                  {schedulePending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Truck className="h-4 w-4" />
                  )}
                  <span>Schedule Delhivery Pickup</span>
                </Button>
              </div>
            </form>

            {/* Recent Pickup Requests */}
            {pickupRequests.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Recent Pickup Requests
                </p>
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                  {pickupRequests.map((req) => (
                    <div
                      key={req.pickup_id}
                      className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs"
                    >
                      <div>
                        <span className="font-mono font-bold text-slate-900">
                          PR #{req.pickup_id}
                        </span>
                        <span className="ml-2 text-slate-600">
                          {req.pickup_location_name} ({req.pincode})
                        </span>
                        {req.nsl_remark && (
                          <p className="mt-0.5 text-[11px] text-amber-700">
                            {req.nsl_remark}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-600">
                          {req.expected_packages_count} pkg
                        </span>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-800">
                          {req.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: RATE CALCULATOR */}
        {tab === "rates" && (
          <div className="space-y-4">
            <form
              onSubmit={handleCalculateRates}
              className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4"
            >
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div>
                  <label className="text-[11px] font-medium text-slate-500">
                    Origin PIN
                  </label>
                  <Input
                    value={originPin}
                    maxLength={6}
                    onChange={(e) =>
                      setOriginPin(e.target.value.replace(/\D/g, ""))
                    }
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-500">
                    Destination PIN
                  </label>
                  <Input
                    value={destPin}
                    maxLength={6}
                    onChange={(e) =>
                      setDestPin(e.target.value.replace(/\D/g, ""))
                    }
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-500">
                    Weight (grams)
                  </label>
                  <Input
                    type="number"
                    min={10}
                    value={weightGrams}
                    onChange={(e) => setWeightGrams(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-500">
                    Packaging
                  </label>
                  <div className="mt-1 grid grid-cols-2 gap-1.5">
                    {(["BOX", "FLYER"] as const).map((pkg) => (
                      <button
                        key={pkg}
                        type="button"
                        onClick={() => setPackagingType(pkg)}
                        className={cn(
                          "min-h-10 rounded-md border text-xs font-semibold",
                          packagingType === pkg
                            ? "border-[#D9232A] bg-red-50 text-[#B71C22]"
                            : "border-slate-200 bg-white text-slate-600"
                        )}
                      >
                        {pkg}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
                <div>
                  <label className="text-[11px] font-medium text-slate-500">
                    Length (cm)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={lengthCm}
                    onChange={(e) => setLengthCm(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-500">
                    Breadth (cm)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={breadthCm}
                    onChange={(e) => setBreadthCm(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-500">
                    Height (cm)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-500">
                    Payment
                  </label>
                  <div className="mt-1 grid grid-cols-2 gap-1.5">
                    {(["Prepaid", "COD"] as const).map((pm) => (
                      <button
                        key={pm}
                        type="button"
                        onClick={() => setPaymentMode(pm)}
                        className={cn(
                          "min-h-10 rounded-md border text-xs font-semibold",
                          paymentMode === pm
                            ? "border-[#D9232A] bg-red-50 text-[#B71C22]"
                            : "border-slate-200 bg-white text-slate-600"
                        )}
                      >
                        {pm}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-500">
                    COD Amount (₹)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    disabled={paymentMode !== "COD"}
                    value={codAmount}
                    onChange={(e) => setCodAmount(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" variant="primary" disabled={ratePending}>
                  {ratePending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Calculator className="h-4 w-4" />
                  )}
                  <span>Calculate Express &amp; Surface Rates</span>
                </Button>
              </div>
            </form>

            {quotes.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {quotes.map((q) => (
                  <div
                    key={q.mode}
                    className={cn(
                      "rounded-xl border p-4 space-y-2.5",
                      q.mode === "EXPRESS"
                        ? "border-red-200 bg-red-50/30"
                        : "border-slate-200 bg-white"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider",
                          q.mode === "EXPRESS"
                            ? "bg-[#D9232A] text-white"
                            : "bg-slate-800 text-white"
                        )}
                      >
                        {q.mode}
                      </span>
                      <span className="font-mono text-xs font-semibold text-slate-600">
                        Zone {q.zone} · {q.charged_weight}g billable
                      </span>
                    </div>

                    <div className="text-2xl font-extrabold text-slate-950 font-mono">
                      {formatINR(q.total_amount)}
                      <span className="ml-1.5 text-xs font-medium text-slate-500 font-sans">
                        incl. GST
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 border-t border-slate-200/70 pt-2 text-[11px] text-slate-600">
                      <span>Base Freight: {formatINR(q.freight_cost)}</span>
                      <span>Fuel Surcharge: {formatINR(q.fuel_surcharge)}</span>
                      <span>COD Charge: {formatINR(q.charged_cod)}</span>
                      <span>DPH / Handling: {formatINR(q.dph_charge)}</span>
                      <span className="col-span-2 font-mono text-slate-500">
                        GST: CGST ₹{q.cgst.toFixed(2)} · SGST ₹{q.sgst.toFixed(2)} ·
                        IGST ₹{q.igst.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: EXCEPTIONS & NDR QUEUE */}
        {tab === "exceptions" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Actionable NDR / Exception Queue
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={loadingExceptions}
                onClick={() => void loadExceptionsData()}
              >
                {loadingExceptions ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                <span>Refresh</span>
              </Button>
            </div>

            {exceptions.length > 0 && (
              <div className="space-y-2">
                {exceptions.map((ex) => (
                  <div
                    key={ex.exception_id || ex.awb}
                    className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="font-mono font-bold text-slate-900">
                          AWB {ex.awb}
                        </span>
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                          {ex.bucket} · {ex.status}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {ex.cta_list.map((cta) => (
                          <Button
                            key={`${cta.bucket_id}-${cta.actionable_id}`}
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={ndrPendingAwb === ex.awb}
                            onClick={() =>
                              void handleResolveRemoteException(ex, cta)
                            }
                          >
                            {cta.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-slate-600">{ex.reason}</p>
                  </div>
                ))}
              </div>
            )}

            {localExceptionOrders.length > 0 ? (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {localExceptionOrders.map((o) => (
                  <div
                    key={o.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900">
                          {o.order_number}
                        </span>
                        <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                          {o.is_rto ? "RTO" : o.status}
                        </span>
                        <span className="font-mono text-slate-500">
                          AWB {o.awb_number}
                        </span>
                      </div>
                      <p className="font-medium text-slate-800">
                        {o.customer_name} · +91{" "}
                        {o.customer_phone.replace(/^\+?91/, "")}
                      </p>
                      <p className="truncate text-slate-500">
                        {o.address}, {o.city} {o.pincode}
                      </p>
                    </div>
                    {!o.is_rto && o.awb_number && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={ndrPendingAwb === o.awb_number}
                        onClick={() => void handleQuickReattempt(o.awb_number!)}
                      >
                        {ndrPendingAwb === o.awb_number ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        )}
                        <span>Re-attempt</span>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500">
                <CheckCircle2 className="mx-auto mb-1.5 h-6 w-6 text-emerald-600" />
                <p className="font-semibold text-slate-800">
                  Zero open NDR / RTO exceptions
                </p>
                {exceptionsNote && <p className="mt-1">{exceptionsNote}</p>}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
