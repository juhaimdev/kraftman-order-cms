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

export type CreateShipmentsInput = z.infer<typeof createShipmentsSchema>;
export type NdrUpdateInput = z.infer<typeof ndrUpdateSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ProductPresetInput = z.infer<typeof productPresetSchema>;

