import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabaseClient } from "../src/lib/database/client";
import { executeCommand } from "../src/lib/restaurant/commands";
import type { Actor } from "../src/lib/auth/session";

test("Cobro: resolución atómica de pendientes, permiso, servicio e idempotencia", async () => {
  const db = createDatabaseClient();
  const r = await db.restaurant.create({
    data: {
      name: "Prueba cobro",
      slug: `pay-${randomUUID()}`,
      waitersCanCharge: true,
    },
  });
  const restaurantId = r.id;
  try {
    const user = await db.user.create({
      data: {
        restaurantId,
        name: "Mozo",
        username: randomUUID(),
        role: "WAITER",
        passwordHash: "no-login",
      },
    });
    const actor: Actor = {
      id: user.id,
      restaurantId,
      name: user.name,
      username: user.username,
      role: "WAITER",
      roles: ["WAITER"],
    };
    const send = (c: unknown) => executeCommand(db, actor, c);
    const category = await db.category.create({
      data: { restaurantId, name: "Carta" },
    });
    const p = await db.product.create({
      data: {
        restaurantId,
        categoryId: category.id,
        name: "Producto",
        price: "100",
      },
    });
    const table = await db.diningTable.create({
      data: { restaurantId, name: "Mesa", seats: 4 },
    });
    const session = await db.tableSession.create({
      data: {
        restaurantId,
        tableId: table.id,
        guests: 2,
        openedBy: actor.name,
      },
    });
    await db.cashShift.create({
      data: { restaurantId, openedBy: "Caja", openingCash: "0" },
    });
    const order = await db.order.create({
      data: {
        sessionId: session.id,
        createdById: user.id,
        requestKey: randomUUID(),
        items: {
          create: ["PENDING", "PREPARING", "READY", "DELIVERED"].map(
            (status) => ({
              productId: p.id,
              name: p.name,
              unitPrice: "100",
              quantity: 1,
              station: "KITCHEN",
              status: status as "PENDING" | "PREPARING" | "READY" | "DELIVERED",
            }),
          ),
        },
      },
      include: { items: true },
    });
    const pending = order.items.filter((i) => i.status !== "DELIVERED");
    const prepare = {
      type: "payment.prepare",
      sessionId: session.id,
      requestKey: randomUUID(),
      draftRequestKey: randomUUID(),
      decision: "CHARGE",
      pendingIds: pending.map((i) => i.id),
      items: [
        {
          productId: p.id,
          quantity: 2,
          notes: "Sin sal",
          addonIds: [],
          varieties: [],
        },
      ],
    };
    await assert.rejects(
      send({ ...prepare, pendingIds: [] }),
      /pendientes cambiaron/,
    );
    await assert.rejects(
      send({
        ...prepare,
        items: [{ ...prepare.items[0], productId: "invalid" }],
      }),
      /disponible/,
    );
    assert.equal(
      await db.orderItem.count({
        where: { status: "DELIVERED", order: { sessionId: session.id } },
      }),
      1,
    );
    await db.restaurant.update({
      where: { id: restaurantId },
      data: { waitersCanCharge: false },
    });
    await assert.rejects(send(prepare), /permiso/);
    await db.restaurant.update({
      where: { id: restaurantId },
      data: { waitersCanCharge: true },
    });
    const result = await send(prepare);
    assert.equal((await send(prepare)).id, result.id);
    assert.equal(await db.order.count({ where: { sessionId: session.id } }), 2);
    const billed = await db.orderItem.findMany({
      where: { status: "DELIVERED", order: { sessionId: session.id } },
    });
    assert.equal(
      billed.reduce((n, i) => n + i.quantity, 0),
      6,
    );
    assert.equal(
      await db.orderItem.count({
        where: { status: "DELIVERED", order: { sessionId: session.id } },
      }),
      5,
    );
    await assert.rejects(
      send({ ...prepare, decision: "DISCARD" }),
      /repetida inválida/,
    );
    await assert.rejects(
      send({ type: "item.advance", id: billed[0].id, expectedStatus: "READY" }),
      /actualizó/,
    );
    const payment = {
      type: "payment.create",
      sessionId: session.id,
      method: "CASH",
      expectedTotal: "600",
      serviceAmount: "37.50",
    };
    await assert.rejects(send({ ...payment, serviceAmount: "-1" }));
    await assert.rejects(
      send({ ...payment, expectedTotal: "500" }),
      /total cambió/,
    );
    const payments = await Promise.all([send(payment), send(payment)]);
    assert.equal(payments[0].id, payments[1].id);
    const saved = await db.payment.findUniqueOrThrow({
      where: { sessionId: session.id },
    });
    assert.equal(saved.amount.toFixed(2), "637.50");
    assert.equal(saved.serviceAmount.toFixed(2), "37.50");
    await assert.rejects(
      send({ ...payment, serviceAmount: "38" }),
      /otro cobro/,
    );
    // Descartar excluye pendientes pero conserva los consumos entregados.
    const s2 = await db.tableSession.create({
      data: {
        restaurantId,
        tableId: table.id,
        guests: 1,
        openedBy: actor.name,
      },
    });
    const o2 = await db.order.create({
      data: {
        sessionId: s2.id,
        createdById: user.id,
        requestKey: randomUUID(),
        items: {
          create: [
            {
              productId: p.id,
              name: p.name,
              unitPrice: "100",
              quantity: 1,
              station: "KITCHEN",
              status: "READY",
            },
            {
              productId: p.id,
              name: p.name,
              unitPrice: "100",
              quantity: 1,
              station: "KITCHEN",
              status: "DELIVERED",
            },
          ],
        },
      },
      include: { items: true },
    });
    const discard = {
      ...prepare,
      sessionId: s2.id,
      requestKey: randomUUID(),
      draftRequestKey: randomUUID(),
      decision: "DISCARD",
      pendingIds: o2.items.filter((i) => i.status === "READY").map((i) => i.id),
    };
    await send(discard);
    await send(discard);
    assert.equal(await db.order.count({ where: { sessionId: s2.id } }), 1);
    assert.equal(
      (
        await db.orderItem.findUniqueOrThrow({
          where: { id: discard.pendingIds[0] },
        })
      ).status,
      "CANCELLED",
    );
    await send({
      ...payment,
      sessionId: s2.id,
      expectedTotal: "100",
      serviceAmount: "0",
    });
    assert.equal(
      await db.payment.count({ where: { session: { restaurantId } } }),
      2,
    );
  } finally {
    await db.payment.deleteMany({ where: { session: { restaurantId } } });
    await db.orderItem.deleteMany({
      where: { order: { session: { restaurantId } } },
    });
    await db.order.deleteMany({ where: { session: { restaurantId } } });
    await db.tableSession.deleteMany({ where: { restaurantId } });
    await db.cashShift.deleteMany({ where: { restaurantId } });
    await db.product.deleteMany({ where: { restaurantId } });
    await db.category.deleteMany({ where: { restaurantId } });
    await db.diningTable.deleteMany({ where: { restaurantId } });
    await db.auditEvent.deleteMany({ where: { restaurantId } });
    await db.user.deleteMany({ where: { restaurantId } });
    await db.restaurant.delete({ where: { id: restaurantId } });
    await db.$disconnect();
  }
});
