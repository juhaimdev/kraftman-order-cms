"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  createOrderSchema,
  type CreateOrderInput,
} from "@/lib/validations/shipping";

export async function createOrderAction(input: CreateOrderInput): Promise<{
  data?: { id: string; orderNumber: string };
  error?: string;
}> {
  const parsed = createOrderSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid order details",
    };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      error:
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  const data = parsed.data;
  const orderNumber =
    data.order_number && data.order_number.length >= 3
      ? data.order_number
      : `ORD-${Math.floor(100000 + Math.random() * 900000)}`;

  const id = crypto.randomUUID();

  const { error } = await supabase.from("orders").insert({
    id,
    order_number: orderNumber,
    customer_name: data.customer_name,
    customer_phone: data.customer_phone,
    address: data.address,
    city: data.city,
    state: data.state,
    pincode: data.pincode,
    payment_method: data.payment_method,
    total_amount: data.total_amount,
    status: "Unfulfilled",
    ...(data.product_id ? { product_id: data.product_id } : {}),
    ...(data.item_description ? { item_description: data.item_description } : {}),
  });

  if (error) {
    if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
      return { error: `Order number ${orderNumber} already exists` };
    }
    return { error: error.message };
  }

  revalidatePath("/");
  return { data: { id, orderNumber } };
}
