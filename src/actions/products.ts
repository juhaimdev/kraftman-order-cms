"use server";

import { revalidatePath } from "next/cache";
import type { ProductPreset } from "@/lib/db/types";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  productPresetSchema,
  type ProductPresetInput,
} from "@/lib/validations/shipping";

export async function createProductAction(input: ProductPresetInput): Promise<{
  data?: ProductPreset;
  error?: string;
}> {
  const parsed = productPresetSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid product preset",
    };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      error:
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  const d = parsed.data;
  const { data, error } = await supabase
    .from("products")
    .insert({
      name: d.name,
      sku: d.sku ? d.sku : null,
      size_label: d.size_label ?? "",
      weight_grams: d.weight_grams,
      length_cm: d.length_cm,
      width_cm: d.width_cm,
      height_cm: d.height_cm,
      default_price: d.default_price,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505" || /unique/i.test(error.message)) {
      return { error: `SKU "${d.sku}" already exists` };
    }
    return { error: error.message };
  }

  revalidatePath("/");
  return {
    data: {
      ...(data as unknown as ProductPreset),
      length_cm: Number(data.length_cm),
      width_cm: Number(data.width_cm),
      height_cm: Number(data.height_cm),
      default_price: Number(data.default_price ?? 0),
    },
  };
}

export async function deleteProductAction(productId: string): Promise<{
  ok?: boolean;
  error?: string;
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { error: "Supabase is not configured." };
  }

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  return { ok: true };
}

