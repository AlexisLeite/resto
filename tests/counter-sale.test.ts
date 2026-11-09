import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createDatabaseClient } from "../src/lib/database/client";
import { executeCommand } from "../src/lib/restaurant/commands";
import type { Actor } from "../src/lib/auth/session";

test("Venta sin mesa: cobro atómico, variedades, permisos, turno e idempotencia; categorías y cocina directa", async () => {
  const db = createDatabaseClient();
  const restaurant = await db.restaurant.create({
    data: { slug: randomUUID(), name: "Prueba venta" },
  });
  const restaurantId = restaurant.id;
  try {
    const user = await db.user.create({
      data: {
        restaurantId,
        username: randomUUID(),
        name: "Caja",
        role: "CASHIER",
        roles: ["ADMIN", "CASHIER", "WAITER", "KITCHEN"],
        passwordHash: "test",
      },
    });
    const actor: Actor = {
      id: user.id,
      restaurantId,
      name: user.name,
      username: user.username,
      role: "CASHIER",
      roles: ["ADMIN", "CASHIER", "WAITER", "KITCHEN"],
    };
    const send = (input: unknown, role: Actor["role"] = "CASHIER") =>
      executeCommand(db, { ...actor, role }, input);
    const a = await db.category.create({
      data: { restaurantId, name: "A", position: 0 },
    });
    const b = await db.category.create({
      data: { restaurantId, name: "B", position: 1 },
    });
    const p = await db.product.create({
      data: {
        restaurantId,
        categoryId: a.id,
        name: "Agua",
        price: "110",
        varieties: [
          { id: "v", name: "Línea", options: [{ id: "o", name: "Sin gas" }] },
        ],
      },
    });
    const sale = {
      type: "sale.create",
      requestKey: randomUUID(),
      method: "CASH",
      expectedTotal: "220",
      serviceAmount: "0",
      items: [
        {
          productId: p.id,
          quantity: 2,
          notes: "",
          addonIds: [],
          varieties: [{ varietyId: "v", optionId: "o" }],
        },
      ],
    };
    await assert.rejects(send(sale), /turno/);
    await assert.rejects(send(sale, "WAITER"), /permiso/);
    await send({ type: "shift.open", openingCash: "0" });
    await assert.rejects(
      send({ ...sale, items: [{ ...sale.items[0], varieties: [] }] }),
      /variedad/,
    );
    await assert.rejects(send({ ...sale, expectedTotal: "1" }), /precio/);
    assert.equal(await db.tableSession.count({ where: { restaurantId } }), 0);
    const results = await Promise.all([send(sale), send(sale)]);
    assert.equal(results[0]?.id, results[1]?.id);
    const session = await db.tableSession.findFirstOrThrow({
      where: { restaurantId },
      include: { payment: true, orders: { include: { items: true } } },
    });
    assert.equal(session.tableId, null);
    assert.ok(session.closedAt);
    assert.equal(session.payment?.amount.toFixed(2), "220.00");
    assert.equal(session.orders[0].items[0].quantity, 2);
    assert.equal(await db.diningTable.count({ where: { restaurantId } }), 0);
    await assert.rejects(send({ ...sale, method: "CARD" }), /otra venta/);
    const shift = await db.cashShift.findFirstOrThrow({
      where: { restaurantId, closedAt: null },
    });
    assert.equal(session.payment?.shiftId, shift.id);
    await send({
      type: "shift.close",
      id: shift.id,
      closingCash: "220",
      notes: "",
    });
    await send(sale);
    await assert.rejects(send({ ...sale, requestKey: randomUUID() }), /turno/);
    assert.equal(
      await db.payment.count({ where: { session: { restaurantId } } }),
      1,
    );
    await assert.rejects(
      send({ type: "category.reorder", ids: [b.id, a.id] }),
      /permiso/,
    );
    await send({ type: "category.reorder", ids: [b.id, a.id] }, "ADMIN");
    assert.deepEqual(
      (
        await db.category.findMany({
          where: { restaurantId },
          orderBy: { position: "asc" },
        })
      ).map((c) => c.id),
      [b.id, a.id],
    );
    await send({ type: "category.save", name: "C" }, "ADMIN");
    assert.equal(
      (
        await db.category.findFirstOrThrow({
          where: { restaurantId, name: "C" },
        })
      ).position,
      2,
    );
    const table = await db.diningTable.create({
      data: { restaurantId, name: "Mesa" },
    });
    await send({ type: "table.open", tableId: table.id, guests: 1 });
    const account = await db.tableSession.findFirstOrThrow({
      where: { restaurantId, closedAt: null },
    });
    await send({
      type: "order.create",
      sessionId: account.id,
      requestKey: randomUUID(),
      items: sale.items,
    });
    const item = await db.orderItem.findFirstOrThrow({
      where: { order: { sessionId: account.id } },
    });
    await assert.rejects(
      send(
        {
          type: "item.advance",
          id: item.id,
          expectedStatus: "PENDING",
          targetStatus: "READY",
        },
        "WAITER",
      ),
      /cocina/,
    );
    await send(
      {
        type: "item.advance",
        id: item.id,
        expectedStatus: "PENDING",
        targetStatus: "READY",
      },
      "KITCHEN",
    );
    assert.equal(
      (await db.orderItem.findUniqueOrThrow({ where: { id: item.id } })).status,
      "READY",
    );
  } finally {
    await db.payment.deleteMany({ where: { session: { restaurantId } } });
    await db.cashShift.deleteMany({ where: { restaurantId } });
    await db.orderItem.deleteMany({
      where: { order: { session: { restaurantId } } },
    });
    await db.order.deleteMany({ where: { session: { restaurantId } } });
    await db.tableSession.deleteMany({ where: { restaurantId } });
    await db.product.deleteMany({ where: { restaurantId } });
    await db.category.deleteMany({ where: { restaurantId } });
    await db.diningTable.deleteMany({ where: { restaurantId } });
    await db.auditEvent.deleteMany({ where: { restaurantId } });
    await db.user.deleteMany({ where: { restaurantId } });
    await db.restaurant.delete({ where: { id: restaurantId } });
    await db.$disconnect();
  }
});
