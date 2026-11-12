"use client";

import * as React from "react";
import { CheckCircle2, Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { checkServiceabilityAction } from "@/actions/serviceability";
import type { ServiceabilityResult } from "@/lib/delhivery/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ServiceabilityBadgeProps {
  pincode: string;
  paymentMethod: "COD" | "Prepaid";
  onChecked?: (result: ServiceabilityResult) => void;
}

export function ServiceabilityBadge({
  pincode,
  paymentMethod,
  onChecked,
}: ServiceabilityBadgeProps) {
  const [loading, startTransition] = React.useTransition();
  const [result, setResult] = React.useState<ServiceabilityResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function handleCheck() {
    setError(null);
    startTransition(async () => {
      const res = await checkServiceabilityAction(pincode);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.data) {
        setResult(res.data);
        onChecked?.(res.data);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCheck}
          disabled={loading}
          className="text-xs"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 text-blue-600" />
          )}
          <span>Check Serviceability ({pincode})</span>
        </Button>

        {result && (
          <div className="flex flex-wrap items-center gap-1.5">
            {result.serviceable ? (
              <>
                <Badge variant={result.express ? "emerald" : "red"}>
                  {result.express ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <ShieldAlert className="h-3 w-3" />
                  )}
                  <span>Express {result.express ? "OK" : "N/A"}</span>
                </Badge>
                <Badge variant={result.cod ? "emerald" : "amber"}>
                  {result.cod ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <ShieldAlert className="h-3 w-3" />
                  )}
                  <span>COD {result.cod ? "OK" : "Unavailable"}</span>
                </Badge>
                {result.cached && (
                  <span className="text-[10px] font-mono text-slate-400">
                    KV HIT
                  </span>
                )}
              </>
            ) : (
              <Badge variant="red">
                <ShieldAlert className="h-3 w-3" />
                <span>Unserviceable PIN</span>
              </Badge>
            )}
          </div>
        )}
      </div>

      {result && paymentMethod === "COD" && !result.cod && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Warning: COD is not supported on PIN {pincode}. Confirm with consignee or convert payment mode before manifesting.
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
