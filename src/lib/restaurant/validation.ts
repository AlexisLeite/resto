import { z } from "zod";
const id = z.string().min(1).max(100);
const text = z.string().trim().min(1).max(100);
const price = z
  .string()
  .regex(
    /^\d{1,7}(\.\d{1,2})?$/,
    "Ingresá un importe positivo con hasta dos decimales.",
  );
const addon = z.object({ id, name: text, price });
export const varietiesSchema = z
  .array(
    z.object({
      id,
      name: text,
      options: z
        .array(z.object({ id, name: text }))
        .min(2)
        .max(30)
        .refine(
          (a) => new Set(a.map((x) => x.id)).size === a.length,
          "Las opciones no pueden repetirse.",
        )
        .refine(
          (a) =>
            new Set(a.map((x) => x.name.toLocaleLowerCase())).size === a.length,
          "Los nombres de opciones no pueden repetirse.",
        ),
    }),
  )
  .max(10)
  .refine(
    (a) => new Set(a.map((x) => x.id)).size === a.length,
    "Las variedades no pueden repetirse.",
  )
  .refine(
    (a) => new Set(a.map((x) => x.name.toLocaleLowerCase())).size === a.length,
    "Los nombres de variedades no pueden repetirse.",
  );
export const selectionsSchema = z
  .array(z.object({ varietyId: id, optionId: id }))
  .max(10)
  .refine(
    (a) => new Set(a.map((x) => x.varietyId)).size === a.length,
    "Elegí una opción por variedad.",
  );
const orderItemSchema = z.object({
  productId: id,
  quantity: z.number().int().min(1).max(50),
  notes: z.string().trim().max(300),
  varieties: selectionsSchema.default([]),
  addonIds: z
    .array(id)
    .max(10)
    .refine((a) => new Set(a).size === a.length),
});
export const commandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("payment.prepare"),
    sessionId: id,
    requestKey: z.string().uuid(),
    draftRequestKey: z.string().uuid(),
    decision: z.enum(["DISCARD", "CHARGE"]),
    pendingIds: z.array(id).max(1000),
    items: z.array(orderItemSchema).max(50),
  }),
  z.object({
    type: z.literal("restaurant.settings"),
    waitersCanCharge: z.boolean(),
  }),
  z.object({
    type: z.literal("table.save"),
    id: id.optional(),
    name: text,
    seats: z.number().int().min(1).max(30),
    active: z.boolean(),
  }),
  z.object({
    type: z.literal("table.open"),
    tableId: id,
    guests: z.number().int().min(1).max(30),
  }),
  z.object({ type: z.literal("table.delete"), id }),
  z.object({ type: z.literal("table.closeEmpty"), sessionId: id }),
  z.object({
    type: z.literal("category.reorder"),
    ids: z
      .array(id)
      .min(1)
      .max(1000)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Las categorías no pueden repetirse.",
      ),
  }),
  z.object({ type: z.literal("category.save"), id: id.optional(), name: text }),
  z.object({
    type: z.literal("product.save"),
    id: id.optional(),
    categoryId: id,
    name: text,
    description: z.string().trim().max(500),
    imageUrl: z
      .string()
      .trim()
      .max(2000)
      .refine(
        (url) =>
          !url ||
          /^\/images\/[a-zA-Z0-9/_.-]+$/.test(url) ||
          (() => {
            try {
              return new URL(url).protocol === "https:";
            } catch {
              return false;
            }
          })(),
        "Usá una URL HTTPS o una imagen local.",
      )
      .optional(),
    price: price.refine(
      (v) => Number(v) > 0,
      "El precio debe ser mayor a cero.",
    ),
    station: z.enum(["KITCHEN", "BAR"]),
    available: z.boolean(),
    active: z.boolean(),
    varieties: varietiesSchema.optional(),
    addons: z
      .array(addon)
      .max(10)
      .refine(
        (a) => new Set(a.map((x) => x.id)).size === a.length,
        "Los adicionales no pueden repetirse.",
      ),
  }),
  z.object({
    type: z.literal("product.availability"),
    id,
    available: z.boolean(),
  }),
  z.object({
    type: z.literal("order.create"),
    sessionId: id,
    requestKey: z.string().uuid(),
    items: z.array(orderItemSchema).min(1).max(50),
  }),
  z.object({
    type: z.literal("item.advance"),
    id,
    expectedStatus: z.enum(["PENDING", "PREPARING", "READY"]),
    targetStatus: z.literal("READY").optional(),
  }),
  z.object({
    type: z.literal("item.cancel"),
    id,
    reason: z.string().trim().min(3).max(300),
  }),
  z.object({ type: z.literal("shift.open"), openingCash: price }),
  z.object({
    type: z.literal("shift.close"),
    id,
    closingCash: price,
    notes: z.string().trim().max(500),
  }),
  z.object({
    type: z.literal("sale.create"),
    requestKey: z.string().uuid(),
    items: z.array(orderItemSchema).min(1).max(50),
    serviceAmount: price.optional(),
    method: z.enum(["CASH", "CARD", "TRANSFER"]),
    expectedTotal: price,
  }),
  z.object({
    type: z.literal("payment.create"),
    serviceAmount: price.optional(),
    sessionId: id,
    method: z.enum(["CASH", "CARD", "TRANSFER"]),
    expectedTotal: price,
  }),
  z.object({
    type: z.literal("user.save"),
    id: id.optional(),
    name: text,
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        /^[a-z0-9._-]{3,40}$/,
        "Usuario: 3–40 letras, números, puntos o guiones.",
      ),
    role: z.enum(["ADMIN", "WAITER", "KITCHEN", "CASHIER"]),
    roles: z
      .array(z.enum(["ADMIN", "WAITER", "KITCHEN", "CASHIER"]))
      .min(1)
      .max(4)
      .optional(),
    active: z.boolean(),
    password: z.string().min(10).max(128).optional(),
  }),
  z.object({
    type: z.literal("password.change"),
    currentPassword: z.string().min(1).max(128),
    password: z.string().min(10).max(128),
  }),
]);
export type Command = z.infer<typeof commandSchema>;
