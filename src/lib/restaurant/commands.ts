import { isDeepStrictEqual } from "node:util";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { ensure } from "./errors";
import { commandSchema, type Command } from "./validation";
import { assignedRoles, type Variety, type Addon, type Role } from "./shared";

const access: Record<string, Role[]> = {
  "restaurant.settings": ["ADMIN"],
  "table.save": ["ADMIN"],
  "table.delete": ["ADMIN"],
  "table.open": ["ADMIN", "WAITER", "CASHIER"],
  "table.closeEmpty": ["ADMIN", "WAITER", "CASHIER"],
  "category.reorder": ["ADMIN"],
  "category.save": ["ADMIN"],
  "product.save": ["ADMIN"],
  "product.availability": ["ADMIN", "KITCHEN"],
  "sale.create": ["ADMIN", "CASHIER"],
  "order.create": ["ADMIN", "WAITER", "CASHIER"],
  "item.advance": ["ADMIN", "KITCHEN", "WAITER"],
  "item.cancel": ["ADMIN", "CASHIER"],
  "shift.open": ["ADMIN", "CASHIER"],
  "shift.close": ["ADMIN", "CASHIER"],
  "payment.prepare": ["ADMIN", "CASHIER", "WAITER"],
  "payment.create": ["ADMIN", "CASHIER", "WAITER"],
  "user.save": ["ADMIN"],
  "password.change": ["ADMIN", "WAITER", "KITCHEN", "CASHIER"],
};
export const sumItems = (
  items: { quantity: number; unitPrice: Prisma.Decimal; status: string }[],
) =>
  items.reduce(
    (sum, i) =>
      i.status === "CANCELLED" ? sum : sum.plus(i.unitPrice.mul(i.quantity)),
    new Prisma.Decimal(0),
  );

export async function executeCommand(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const c = commandSchema.parse(input);
  ensure(
    access[c.type]?.includes(actor.role),
    "No tenés permiso para esta operación.",
    403,
  );
  // Un bloqueo por restaurante serializa cambios de cuenta, cocina y caja. Evita
  // que un cobro compita con un pedido o que dos cajeros cierren la misma mesa.
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${actor.restaurantId} FOR UPDATE`;
      const freshUser = await tx.user.findUnique({ where: { id: actor.id } });
      ensure(
        freshUser?.active &&
          freshUser.restaurantId === actor.restaurantId &&
          assignedRoles(freshUser).includes(actor.role),
        "Tus permisos cambiaron. Volvé a ingresar.",
        401,
      );
      if (actor.sessionHash) {
        const freshSession = await tx.authSession.findUnique({
          where: { tokenHash: actor.sessionHash },
        });
        ensure(
          freshSession &&
            freshSession.userId === actor.id &&
            freshSession.expiresAt > new Date() &&
            freshSession.activeRole === actor.role,
          "El rol activo cambió. Actualizá antes de continuar.",
          409,
        );
      }
      const restaurantId = actor.restaurantId;
      const audit = (detail: string) =>
        tx.auditEvent.create({
          data: {
            restaurantId,
            actorId: actor.id,
            actorName: actor.name,
            action: c.type,
            detail,
          },
        });
      const buildItems = async (
        lines: Extract<Command, { type: "order.create" }>["items"],
      ) => {
        const items = [];
        for (const line of lines) {
          const p = await tx.product.findFirst({
            where: {
              id: line.productId,
              restaurantId,
              active: true,
              available: true,
            },
          });
          ensure(
            p,
            "Un producto dejó de estar disponible. Revisá el pedido.",
            409,
          );
          const definitions = p.varieties as Variety[];
          ensure(
            line.varieties.length === definitions.length,
            "Elegí una opción para cada variedad del producto.",
            409,
          );
          const varieties = definitions.map((v) => {
            const selected = line.varieties.find((s) => s.varietyId === v.id);
            const option = v.options.find((o) => o.id === selected?.optionId);
            ensure(
              option,
              "Una variedad cambió. Revisá las opciones del pedido.",
              409,
            );
            return {
              varietyId: v.id,
              optionId: option.id,
              name: v.name,
              option: option.name,
            };
          });
          const addons = p.addons as Addon[];
          const extras = line.addonIds.map((id) =>
            addons.find((a) => a.id === id),
          );
          ensure(
            extras.every(Boolean),
            "Un adicional cambió. Revisá el pedido.",
            409,
          );
          const unitPrice = extras.reduce(
            (price, a) => price.plus(a!.price),
            p.price,
          );
          items.push({
            productId: p.id,
            name: p.name,
            station: p.station,
            quantity: line.quantity,
            varieties,
            unitPrice,
            extras: extras.map((a) => a!.name),
            notes: line.notes,
          });
        }
        return items;
      };
      const ensureChargePermission = async () => {
        if (actor.role === "WAITER") {
          const settings = await tx.restaurant.findUniqueOrThrow({
            where: { id: restaurantId },
          });
          ensure(
            settings.waitersCanCharge,
            "Los mozos no tienen permiso para cobrar.",
            403,
          );
        }
      };
      const session = async (id: string) => {
        const s = await tx.tableSession.findFirst({
          where: { id, restaurantId },
          include: {
            table: true,
            orders: { include: { items: true } },
            payment: true,
          },
        });
        ensure(s, "La cuenta no existe.", 404);
        return s;
      };
      if (c.type === "restaurant.settings") {
        await tx.restaurant.update({
          where: { id: restaurantId },
          data: { waitersCanCharge: c.waitersCanCharge },
        });
        await audit(
          `Cobro por mozos ${c.waitersCanCharge ? "habilitado" : "deshabilitado"}`,
        );
      } else if (c.type === "table.save") {
        const { type, id, ...data } = c;
        void type;
        if (id) {
          ensure(
            await tx.diningTable.findFirst({
              where: { id, restaurantId, deletedAt: null },
            }),
            "Mesa inexistente.",
            404,
          );
          if (!data.active)
            ensure(
              !(await tx.tableSession.findFirst({
                where: { tableId: id, closedAt: null },
              })),
              "Cerrá la cuenta antes de desactivar la mesa.",
            );
          await tx.diningTable.update({ where: { id }, data });
        } else await tx.diningTable.create({ data: { ...data, restaurantId } });
        await audit(`Mesa ${data.name} guardada`);
      } else if (c.type === "table.delete") {
        const table = await tx.diningTable.findFirst({
          where: { id: c.id, restaurantId },
        });
        ensure(table, "Mesa inexistente.", 404);
        if (!table.deletedAt) {
          ensure(
            !(await tx.tableSession.findFirst({
              where: { tableId: table.id, closedAt: null },
            })),
            "Cerrá la cuenta antes de eliminar la mesa.",
            409,
          );
          await tx.diningTable.update({
            where: { id: table.id },
            data: { active: false, deletedAt: new Date() },
          });
          await audit(
            `Mesa ${table.name} eliminada. Se conserva su historial.`,
          );
        }
      } else if (c.type === "table.open") {
        const table = await tx.diningTable.findFirst({
          where: { id: c.tableId, restaurantId, active: true, deletedAt: null },
        });
        ensure(table, "Mesa no disponible.");
        ensure(
          c.guests <= table.seats,
          "La cantidad supera la capacidad de la mesa.",
        );
        ensure(
          !(await tx.tableSession.findFirst({
            where: { tableId: table.id, closedAt: null },
          })),
          "La mesa ya tiene una cuenta abierta.",
          409,
        );
        const s = await tx.tableSession.create({
          data: {
            restaurantId,
            tableId: table.id,
            guests: c.guests,
            openedBy: actor.name,
          },
        });
        await audit(`${table.name}: apertura para ${c.guests} personas`);
        return { id: s.id };
      } else if (c.type === "table.closeEmpty") {
        const s = await session(c.sessionId);
        ensure(!s.closedAt, "La cuenta ya está cerrada.", 409);
        ensure(
          s.orders
            .flatMap((o) => o.items)
            .every((i) => i.status === "CANCELLED"),
          "La cuenta tiene consumos. Registrá el cobro para cerrar.",
        );
        await tx.tableSession.update({
          where: { id: s.id },
          data: { closedAt: new Date() },
        });
        await audit(
          `${s.table?.name ?? "Venta directa"}: cuenta sin consumos cerrada`,
        );
      } else if (c.type === "category.reorder") {
        const categories = await tx.category.findMany({
          where: { restaurantId },
          orderBy: [{ position: "asc" }, { name: "asc" }],
        });
        ensure(
          c.ids.length === categories.length &&
            c.ids.every((id) =>
              categories.some((category) => category.id === id),
            ),
          "Las categorías cambiaron. Actualizá el listado antes de reordenar.",
          409,
        );
        for (const [position, id] of c.ids.entries())
          await tx.category.update({ where: { id }, data: { position } });
        await audit("Orden de categorías actualizado");
      } else if (c.type === "category.save") {
        if (c.id) {
          ensure(
            await tx.category.findFirst({ where: { id: c.id, restaurantId } }),
            "Categoría inexistente.",
          );
          await tx.category.update({
            where: { id: c.id },
            data: { name: c.name },
          });
        } else {
          const last = await tx.category.aggregate({
            where: { restaurantId },
            _max: { position: true },
          });
          await tx.category.create({
            data: {
              restaurantId,
              name: c.name,
              position: (last._max.position ?? -1) + 1,
            },
          });
        }
        await audit(`Categoría ${c.name} guardada`);
      } else if (c.type === "product.save") {
        const { type, id, ...data } = c;
        void type;
        ensure(
          await tx.category.findFirst({
            where: { id: data.categoryId, restaurantId },
          }),
          "Categoría inexistente.",
        );
        if (id) {
          ensure(
            await tx.product.findFirst({ where: { id, restaurantId } }),
            "Producto inexistente.",
          );
          await tx.product.update({ where: { id }, data });
        } else await tx.product.create({ data: { ...data, restaurantId } });
        await audit(`Producto ${data.name} guardado`);
      } else if (c.type === "product.availability") {
        const p = await tx.product.findFirst({
          where: { id: c.id, restaurantId, active: true },
        });
        ensure(p, "Producto inexistente.");
        await tx.product.update({
          where: { id: p.id },
          data: { available: c.available },
        });
        await audit(`${p.name}: ${c.available ? "disponible" : "agotado"}`);
      } else if (c.type === "order.create") {
        const previous = await tx.order.findUnique({
          where: { requestKey: c.requestKey },
          include: { session: true },
        });
        if (previous) {
          ensure(
            previous.session.restaurantId === restaurantId &&
              previous.sessionId === c.sessionId &&
              previous.createdById === actor.id,
            "Solicitud repetida inválida.",
            409,
          );
          return { id: previous.id };
        }
        const s = await session(c.sessionId);
        ensure(!s.closedAt, "La mesa ya fue cerrada. Actualizá el salón.", 409);
        const items = await buildItems(c.items);
        const order = await tx.order.create({
          data: {
            sessionId: s.id,
            requestKey: c.requestKey,
            createdById: actor.id,
            items: { create: items },
          },
        });
        await audit(
          `${s.table?.name ?? "Venta directa"}: pedido de ${items.reduce((n, i) => n + i.quantity, 0)} unidades enviado`,
        );
        return { id: order.id };
      } else if (c.type === "item.advance" || c.type === "item.cancel") {
        const item = await tx.orderItem.findFirst({
          where: { id: c.id, order: { session: { restaurantId } } },
          include: {
            order: { include: { session: { include: { table: true } } } },
          },
        });
        ensure(item, "Comanda inexistente.", 404);
        ensure(!item.order.session.closedAt, "La cuenta ya fue cerrada.", 409);
        if (c.type === "item.cancel") {
          ensure(item.status !== "CANCELLED", "El ítem ya fue anulado.", 409);
          await tx.orderItem.update({
            where: { id: item.id },
            data: { status: "CANCELLED", cancellationReason: c.reason },
          });
          await audit(
            `${item.order.session.table?.name ?? "Venta directa"}: ${item.quantity} × ${item.name} anulados. Motivo: ${c.reason}`,
          );
        } else {
          ensure(
            item.status === c.expectedStatus,
            "Otra persona actualizó la comanda. Revisá su estado.",
            409,
          );
          const next = {
            PENDING: "PREPARING",
            PREPARING: "READY",
            READY: "DELIVERED",
          } as const;
          if (actor.role === "WAITER")
            ensure(
              item.status === "READY",
              "Solo cocina puede preparar o marcar listo.",
              403,
            );
          if (actor.role === "KITCHEN")
            ensure(
              item.status !== "READY",
              "La entrega la registra el mozo.",
              403,
            );
          if (c.targetStatus)
            ensure(
              ["ADMIN", "KITCHEN"].includes(actor.role) &&
                ["PENDING", "PREPARING"].includes(item.status),
              "No se puede marcar listo desde este estado.",
              403,
            );
          const target = c.targetStatus ?? next[c.expectedStatus];
          await tx.orderItem.update({
            where: { id: item.id },
            data: { status: target },
          });
          await audit(
            `${item.order.session.table?.name ?? "Venta directa"}: ${item.name} → ${target}`,
          );
        }
      } else if (c.type === "shift.open") {
        ensure(
          !(await tx.cashShift.findFirst({
            where: { restaurantId, closedAt: null },
          })),
          "Ya hay un turno de caja abierto.",
          409,
        );
        await tx.cashShift.create({
          data: {
            restaurantId,
            openedBy: actor.name,
            openingCash: c.openingCash,
          },
        });
        await audit(`Caja abierta con fondo ${c.openingCash}`);
      } else if (c.type === "payment.prepare") {
        await ensureChargePermission();
        const s = await session(c.sessionId);
        const previous = await tx.paymentPreparation.findUnique({
          where: { requestKey: c.requestKey },
        });
        if (previous) {
          ensure(
            previous.sessionId === s.id &&
              previous.actorId === actor.id &&
              previous.decision === c.decision,
            "Solicitud repetida inválida.",
            409,
          );
          return { id: previous.requestKey };
        }
        ensure(!s.closedAt, "La cuenta ya está cerrada.", 409);
        const pending = s.orders
          .flatMap((o) => o.items)
          .filter((i) => ["PENDING", "PREPARING", "READY"].includes(i.status));
        ensure(
          JSON.stringify(pending.map((i) => i.id).sort()) ===
            JSON.stringify([...c.pendingIds].sort()),
          "Los pendientes cambiaron. Volvé a abrir Pagar para revisarlos.",
          409,
        );
        const existing = await tx.order.findUnique({
          where: { requestKey: c.draftRequestKey },
        });
        if (existing)
          ensure(
            existing.sessionId === s.id && existing.createdById === actor.id,
            "Borrador inválido.",
            409,
          );
        if (c.decision === "CHARGE" && c.items.length && !existing) {
          const items = await buildItems(c.items);
          await tx.order.create({
            data: {
              sessionId: s.id,
              requestKey: c.draftRequestKey,
              createdById: actor.id,
              items: {
                create: items.map((i) => ({
                  ...i,
                  status: "DELIVERED" as const,
                })),
              },
            },
          });
        }
        await tx.orderItem.updateMany({
          where: { id: { in: pending.map((i) => i.id) } },
          data:
            c.decision === "CHARGE"
              ? { status: "DELIVERED" }
              : {
                  status: "CANCELLED",
                  cancellationReason: "Descartado al preparar el cobro",
                },
        });
        await tx.paymentPreparation.create({
          data: {
            requestKey: c.requestKey,
            sessionId: s.id,
            actorId: actor.id,
            decision: c.decision,
          },
        });
        await audit(
          `${s.table?.name ?? "Venta directa"}: ${c.decision === "CHARGE" ? "Incluidos para cobrar y marcados entregados" : "Descartados"}. Pendientes: ${pending.map((i) => `${i.quantity} × ${i.name}`).join(", ")}. Borrador: ${JSON.stringify(c.items)}`,
        );
        return { id: c.requestKey };
      } else if (c.type === "sale.create") {
        const previous = await tx.order.findUnique({
          where: { requestKey: c.requestKey },
          include: { session: { include: { payment: true } } },
        });
        if (previous) {
          ensure(
            previous.session.restaurantId === restaurantId &&
              previous.createdById === actor.id &&
              isDeepStrictEqual(
                previous.session.saleRequest,
                JSON.parse(JSON.stringify(c)),
              ),
            "La solicitud ya pertenece a otra venta.",
            409,
          );
          ensure(
            previous.session.payment,
            "La venta no tiene un cobro registrado.",
            409,
          );
          return { id: previous.session.payment.id };
        }
        const shift = await tx.cashShift.findFirst({
          where: { restaurantId, closedAt: null },
        });
        ensure(shift, "Abrí un turno de caja antes de cobrar.");
        const items = await buildItems(c.items);
        const total = items.reduce(
          (sum, i) => sum.plus(i.unitPrice.mul(i.quantity)),
          new Prisma.Decimal(0),
        );
        ensure(
          total.equals(c.expectedTotal),
          "El precio cambió. Revisá la venta antes de cobrar.",
          409,
        );
        ensure(total.greaterThan(0), "La venta no tiene importe a cobrar.");
        const sale = await tx.tableSession.create({
          data: {
            restaurantId,
            guests: 0,
            openedBy: actor.name,
            closedAt: new Date(),
            saleRequest: c as Prisma.InputJsonValue,
            orders: {
              create: {
                requestKey: c.requestKey,
                createdById: actor.id,
                items: {
                  create: items.map((i) => ({
                    ...i,
                    status: "DELIVERED" as const,
                  })),
                },
              },
            },
          },
        });
        const payment = await tx.payment.create({
          data: {
            sessionId: sale.id,
            shiftId: shift.id,
            amount: total.plus(c.serviceAmount ?? "0"),
            serviceAmount: c.serviceAmount ?? "0",
            method: c.method,
            receivedBy: actor.name,
          },
        });
        await audit(`Venta directa: ${total.toFixed(2)} (${c.method})`);
        return { id: payment.id };
      } else if (c.type === "payment.create") {
        await ensureChargePermission();
        const s = await session(c.sessionId);
        if (s.payment) {
          ensure(
            s.payment.method === c.method &&
              s.payment.amount.equals(
                new Prisma.Decimal(c.expectedTotal).plus(
                  c.serviceAmount ?? "0",
                ),
              ) &&
              s.payment.serviceAmount.equals(c.serviceAmount ?? "0"),
            "La mesa ya tiene otro cobro registrado.",
            409,
          );
          return { id: s.payment.id };
        }
        ensure(!s.closedAt, "La cuenta ya está cerrada.", 409);
        const shift = await tx.cashShift.findFirst({
          where: { restaurantId, closedAt: null },
        });
        ensure(shift, "Abrí un turno de caja antes de cobrar.");
        const items = s.orders.flatMap((o) => o.items);
        ensure(
          items.length &&
            items.every((i) =>
              ["DELIVERED", "CANCELLED", "BILLABLE"].includes(i.status),
            ),
          "Hay ítems pendientes de entregar.",
        );
        const amount = sumItems(items);
        ensure(
          amount.equals(c.expectedTotal),
          "El total cambió. Revisá la cuenta antes de cobrar.",
          409,
        );
        ensure(
          amount.greaterThan(0),
          "La cuenta no tiene importe a cobrar. Cerrala desde el salón.",
        );
        const payment = await tx.payment.create({
          data: {
            sessionId: s.id,
            shiftId: shift.id,
            amount: amount.plus(c.serviceAmount ?? "0"),
            serviceAmount: c.serviceAmount ?? "0",
            method: c.method,
            receivedBy: actor.name,
          },
        });
        await tx.tableSession.update({
          where: { id: s.id },
          data: { closedAt: new Date() },
        });
        await audit(
          `${s.table?.name ?? "Venta directa"}: cobro ${amount.plus(c.serviceAmount ?? "0").toFixed(2)} (${c.method}), servicio ${c.serviceAmount ?? "0"} y cierre`,
        );
        return { id: payment.id };
      } else if (c.type === "shift.close") {
        const shift = await tx.cashShift.findFirst({
          where: { id: c.id, restaurantId, closedAt: null },
          include: { payments: true },
        });
        ensure(shift, "El turno ya fue cerrado.", 409);
        const expectedCash = shift.payments
          .filter((p) => p.method === "CASH")
          .reduce((sum, p) => sum.plus(p.amount), shift.openingCash);
        await tx.cashShift.update({
          where: { id: shift.id },
          data: {
            closedAt: new Date(),
            closedBy: actor.name,
            closingCash: c.closingCash,
            expectedCash,
            notes: c.notes,
          },
        });
        await audit(
          `Caja cerrada. Esperado ${expectedCash.toFixed(2)}, contado ${c.closingCash}. ${c.notes}`,
        );
      } else if (c.type === "user.save") {
        const { type, id, password, roles, ...fields } = c;
        const data = { ...fields, roles: roles ?? [fields.role] };
        ensure(
          data.roles.includes(data.role),
          "El rol inicial debe estar entre los roles asignados.",
        );
        void type;
        if (id) {
          const user = await tx.user.findFirst({ where: { id, restaurantId } });
          ensure(user, "Usuario inexistente.");
          ensure(
            id !== actor.id || (data.active && data.role === "ADMIN"),
            "No podés quitarte el acceso de administrador.",
          );
          const passwordHash = password
            ? await hashPassword(password)
            : undefined;
          await tx.user.update({
            where: { id },
            data: {
              ...data,
              passwordHash,
              ...(password ? { failedAttempts: 0, lockedUntil: null } : {}),
            },
          });
          if (
            password ||
            data.role !== user.role ||
            data.roles.slice().sort().join() !==
              assignedRoles(user).sort().join() ||
            !data.active
          )
            await tx.authSession.deleteMany({ where: { userId: id } });
        } else {
          ensure(password, "Ingresá una contraseña de al menos 10 caracteres.");
          await tx.user.create({
            data: {
              ...data,
              restaurantId,
              passwordHash: await hashPassword(password),
            },
          });
        }
        await audit(
          `Usuario ${data.username} guardado (${data.roles.join(", ")})`,
        );
      } else if (c.type === "password.change") {
        ensure(
          await verifyPassword(c.currentPassword, freshUser.passwordHash),
          "La contraseña actual no es correcta.",
        );
        await tx.user.update({
          where: { id: actor.id },
          data: { passwordHash: await hashPassword(c.password) },
        });
        await tx.authSession.deleteMany({ where: { userId: actor.id } });
        await audit("Contraseña actualizada; sesiones cerradas");
      }
      return { ok: true };
    },
    { timeout: 15000, maxWait: 10000 },
  );
}
