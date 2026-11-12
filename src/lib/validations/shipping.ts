import { z } from "zod";

export const pincodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]{5}$/, "Must be a valid 6-digit Indian PIN code");

export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s\-()]/g, "").replace(/^(\+?91|0)/, ""))
  .pipe(
    z
      .string()
      .regex(/^[6-9][0-9]{9}$/, "Must be a valid 10-digit Indian mobile number")
  );

export const weightSchema = z.coerce
  .number()
  .int("Weight must be a whole number in grams")
  .min(1, "Minimum weight is 1g")
  .max(50000, "Maximum parcel weight is 50,000g (50 kg)");

export const dimensionSchema = z.object({
  length: z.coerce.number().min(1, "Min 1 cm").max(200, "Max 200 cm"),
  width: z.coerce.number().min(1, "Min 1 cm").max(200, "Max 200 cm"),
  height: z.coerce.number().min(1, "Min 1 cm").max(200, "Max 200 cm"),
});

export const createShipmentsSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1, "Select at least one order"),
  weightGrams: weightSchema,
  dimensions: dimensionSchema,
  productsDesc: z.string().trim().max(120).optional(),
});

export const ndrUpdateSchema = z
  .discriminatedUnion("action", [
    z.object({
      action: z.literal("RE-ATTEMPT"),
      waybill: z.string().trim().min(5, "Valid AWB is required"),
    }),
    z.object({
      action: z.literal("DEFER_DLV"),
      waybill: z.string().trim().min(5, "Valid AWB is required"),
      deferred_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    }),
    z.object({
      action: z.literal("EDIT_DETAILS"),
      waybill: z.string().trim().min(5, "Valid AWB is required"),
      phone: phoneSchema.optional(),
      add: z.string().trim().min(5, "Address must be at least 5 chars").optional(),
      name: z.string().trim().min(2, "Name must be at least 2 chars").optional(),
    }),
    z.object({
      action: z.literal("RTO"),
      waybill: z.string().trim().min(5, "Valid AWB is required"),
    }),
  ])
  .superRefine((val, ctx) => {
    if (val.action === "EDIT_DETAILS" && !val.phone && !val.add && !val.name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one field (name, phone, or address) to update",
      });
    }
    if (val.action === "DEFER_DLV") {
      const today = new Date().toISOString().slice(0, 10);
      if (val.deferred_date <= today) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Deferred delivery date must be a future date",
          path: ["deferred_date"],
        });
      }
    }
  });

export const createOrderSchema = z.object({
  order_number: z
    .string()
    .trim()
    .min(3, "Order number must be at least 3 chars")
    .max(40, "Order number too long")
    .optional()
    .or(z.literal("")),
  customer_name: z.string().trim().min(2, "Customer name is required"),
  customer_phone: phoneSchema,
  address: z.string().trim().min(5, "Street address is required"),
  city: z.string().trim().min(2, "City is required"),
  state: z.string().trim().min(2, "State is required"),
  pincode: pincodeSchema,
  payment_method: z.enum(["COD", "Prepaid"]),
  total_amount: z.coerce.number().min(0, "Total amount cannot be negative"),
  product_id: z.string().uuid().optional().or(z.literal("")),
  item_description: z.string().trim().max(120).optional().or(z.literal("")),
});

export const productPresetSchema = z.object({
  name: z.string().trim().min(2, "Product name is required").max(80),
  sku: z.string().trim().max(40).optional().or(z.literal("")),
  size_label: z.string().trim().max(40).optional().or(z.literal("")),
  weight_grams: weightSchema,
  length_cm: z.coerce.number().min(1, "Min 1 cm").max(200, "Max 200 cm"),
  width_cm: z.coerce.number().min(1, "Min 1 cm").max(200, "Max 200 cm"),
  height_cm: z.coerce.number().min(1, "Min 1 cm").max(200, "Max 200 cm"),
  default_price: z.coerce.number().min(0, "Price cannot be negative").default(0),
});

export const updateOrderSchema = z.object({
  order_id: z.string().uuid("Valid order ID required"),
  customer_name: z.string().trim().min(2, "Customer name is required"),
  customer_phone: phoneSchema,
  address: z.string().trim().min(5, "Street address is required"),
  city: z.string().trim().min(2, "City is required"),
  state: z.string().trim().min(2, "State is required"),
  pincode: pincodeSchema,
  payment_method: z.enum(["COD", "Prepaid"]),
  total_amount: z.coerce.number().min(0, "Total amount cannot be negative"),
  product_id: z.string().uuid().optional().or(z.literal("")),
  item_description: z.string().trim().max(120).optional().or(z.literal("")),
});

export const rateCheckSchema = z.object({
  origin_pin: pincodeSchema,
  destination_pin: pincodeSchema,
  weight_grams: weightSchema,
  length_cm: z.coerce.number().min(1).max(200).default(20),
  breadth_cm: z.coerce.number().min(1).max(200).default(15),
  height_cm: z.coerce.number().min(1).max(200).default(10),
  payment_method: z.enum(["COD", "Prepaid"]).default("Prepaid"),
  cod_amount: z.coerce.number().min(0).default(0),
  packaging_type: z.enum(["BOX", "FLYER", "CUSTOM"]).default("BOX"),
  facility_id: z.string().optional(),
});

export const schedulePickupSchema = z.object({
  facility_id: z.string().min(2, "Select a pickup warehouse"),
  facility_code: z.string().optional(),
  pincode: pincodeSchema.optional(),
  pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  start_time: z.string().min(4, "Start time required"),
  end_time: z.string().min(4, "End time required"),
  awb_numbers: z.array(z.string().trim().min(5)).min(1, "Select at least one AWB"),
  expected_package_count: z.coerce.number().int().min(1).max(500),
});

export type CreateShipmentsInput = z.infer<typeof createShipmentsSchema>;
export type NdrUpdateInput = z.infer<typeof ndrUpdateSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type ProductPresetInput = z.infer<typeof productPresetSchema>;
export type RateCheckInput = z.infer<typeof rateCheckSchema>;
export type SchedulePickupInput = z.infer<typeof schedulePickupSchema>;

