"use server";

import { cached } from "@/lib/cache";
import { checkPincode } from "@/lib/delhivery/client";
import type { ServiceabilityResult } from "@/lib/delhivery/types";
import { pincodeSchema } from "@/lib/validations/shipping";

export async function checkServiceabilityAction(pincode: string): Promise<{
  data?: ServiceabilityResult;
  error?: string;
}> {
  const parsed = pincodeSchema.safeParse(pincode);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid 6-digit PIN code",
    };
  }

  try {
    const { value, cacheHit } = await cached(
      `pin:${parsed.data}`,
      () => checkPincode(parsed.data),
      86_400 // 24 hours TTL in warm server cache
    );
    return {
      data: { ...value, cached: cacheHit },
    };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Unable to verify PIN code serviceability",
    };
  }
}

