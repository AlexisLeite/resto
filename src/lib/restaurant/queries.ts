import { getDb } from "@/lib/database/db";
import type { Actor } from "@/lib/auth/session";
import { Prisma } from "@/generated/prisma/client";
import { sumItems } from "./commands";
import {
  assignedRoles,
  canManage,
  type Addon,
  type Variety,
  type SelectedVariety,
} from "./shared";

export async function getSnapshot(actor: Actor) {
  const db = getDb();
  const restaurantId = actor.restaurantId;
  const restaurant = await db.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
  });
  const management = canManage(actor.role);
  const [
    tables,
    categories,
    products,
    sessions,
    shifts,
    users,
    events,
    payments,
  ] = await Promise.all([
    db.diningTable.findMany({
      where: { restaurantId, deletedAt: null },
      orderBy: { name: "asc" },
    }),
    db.category.findMany({
      where: { restaurantId },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    }),
    db.product.findMany({
      where: {
        restaurantId,
        ...(actor.role === "ADMIN" ? {} : { active: true }),
      },
      orderBy: { name: "asc" },
    }),
    db.tableSession.findMany({
      where: { restaurantId, closedAt: null },
      orderBy: { openedAt: "asc" },
      include: {
        table: true,
        orders: {
          orderBy: { createdAt: "asc" },
          include: { createdBy: { select: { name: true } }, items: true },
        },
      },
    }),
    management
      ? db.cashShift.findMany({
          where: { restaurantId },
          orderBy: { openedAt: "desc" },
          take: 20,
          include: {
            payments: {
              include: { session: { include: { table: true } } },
              orderBy: { createdAt: "desc" },
            },
          },
        })
      : [],
    actor.role === "ADMIN"
      ? db.user.findMany({
          where: { restaurantId },
          select: {
            id: true,
            name: true,
            username: true,
            role: true,
            roles: true,
            active: true,
          },
          orderBy: { name: "asc" },
        })
      : [],
    management
      ? db.auditEvent.findMany({
          where: { restaurantId },
          orderBy: { createdAt: "desc" },
          take: 100,
        })
      : [],
    management
      ? db.payment.findMany({
          where: {
            session: { restaurantId },
            createdAt: { gte: new Date(Date.now() - 48 * 3600000) },
          },
          include: {
            session: { include: { orders: { include: { items: true } } } },
          },
        })
      : [],
  ]);
  const localDay = (d: Date) =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: restaurant.timezone }).format(
      d,
    );
  const today = localDay(new Date());
  const daily = payments.filter((p) => localDay(p.createdAt) === today);
  const sales = daily.reduce(
    (sum, p) => sum.plus(p.amount),
    new Prisma.Decimal(0),
  );
  const top = new Map<
    string,
    { name: string; quantity: number; total: Prisma.Decimal }
  >();
  for (const payment of daily)
    for (const item of payment.session.orders.flatMap((o) => o.items)) {
      if (item.status === "CANCELLED") continue;
      const row = top.get(item.name) ?? {
        name: item.name,
        quantity: 0,
        total: new Prisma.Decimal(0),
      };
      row.quantity += item.quantity;
      row.total = row.total.plus(item.unitPrice.mul(item.quantity));
      top.set(item.name, row);
    }
  return {
    user: {
      id: actor.id,
      name: actor.name,
      role: actor.role,
      roles: actor.roles,
      restaurantId: actor.restaurantId,
      username: actor.username,
    },
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      currency: restaurant.currency,
      timezone: restaurant.timezone,
      waitersCanCharge: restaurant.waitersCanCharge,
      cashOpen:
        management || (actor.role === "WAITER" && restaurant.waitersCanCharge)
          ? Boolean(
              await db.cashShift.findFirst({
                where: { restaurantId, closedAt: null },
                select: { id: true },
              }),
            )
          : false,
    },
    tables: tables.map((t) => ({
      id: t.id,
      name: t.name,
      seats: t.seats,
      active: t.active,
    })),
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      categoryId: p.categoryId,
      description: p.description,
      imageUrl: p.imageUrl,
      price: p.price.toFixed(2),
      station: p.station,
      active: p.active,
      available: p.available,
      addons: p.addons as Addon[],
      varieties: p.varieties as Variety[],
    })),
    sessions: sessions.map((s) => ({
      id: s.id,
      tableId: s.tableId,
      tableName: s.table?.name ?? "Venta directa",
      guests: s.guests,
      openedBy: s.openedBy,
      openedAt: s.openedAt.toISOString(),
      total: sumItems(s.orders.flatMap((o) => o.items)).toFixed(2),
      orders: s.orders.map((o) => ({
        id: o.id,
        createdAt: o.createdAt.toISOString(),
        createdBy: o.createdBy.name,
        items: o.items.map((i) => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice.toFixed(2),
          extras: i.extras,
          varieties: i.varieties as SelectedVariety[],
          notes: i.notes,
          station: i.station,
          status: i.status,
          cancellationReason: i.cancellationReason,
        })),
      })),
    })),
    shifts: shifts.map((s) => ({
      id: s.id,
      openedAt: s.openedAt.toISOString(),
      closedAt: s.closedAt?.toISOString() ?? null,
      openedBy: s.openedBy,
      closedBy: s.closedBy,
      openingCash: s.openingCash.toFixed(2),
      closingCash: s.closingCash?.toFixed(2) ?? null,
      notes: s.notes,
      expectedCash: (
        s.expectedCash ??
        s.payments
          .filter((p) => p.method === "CASH")
          .reduce((sum, p) => sum.plus(p.amount), s.openingCash)
      ).toFixed(2),
      payments: s.payments.map((p) => ({
        id: p.id,
        tableName: p.session.table?.name ?? "Venta directa",
        amount: p.amount.toFixed(2),
        serviceAmount: p.serviceAmount.toFixed(2),
        method: p.method,
        receivedBy: p.receivedBy,
        createdAt: p.createdAt.toISOString(),
      })),
    })),
    users: users.map((u) => ({ ...u, roles: assignedRoles(u) })),
    events: events.map((e) => ({
      id: e.id,
      action: e.action,
      detail: e.detail,
      actorName: e.actorName,
      createdAt: e.createdAt.toISOString(),
    })),
    report: management
      ? {
          day: today,
          sales: sales.toFixed(2),
          tickets: daily.length,
          average: daily.length ? sales.div(daily.length).toFixed(2) : "0.00",
          products: [...top.values()]
            .sort((a, b) => b.quantity - a.quantity)
            .map((p) => ({ ...p, total: p.total.toFixed(2) })),
          methods: ["CASH", "CARD", "TRANSFER"].map((method) => ({
            method: method as "CASH" | "CARD" | "TRANSFER",
            total: daily
              .filter((p) => p.method === method)
              .reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0))
              .toFixed(2),
          })),
        }
      : null,
  };
}
export type Snapshot = Awaited<ReturnType<typeof getSnapshot>>;
export type ProductView = Snapshot["products"][number];
export type SessionView = Snapshot["sessions"][number];
export type ItemView = SessionView["orders"][number]["items"][number];
