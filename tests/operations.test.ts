import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createDatabaseClient } from "../src/lib/database/client";
import { executeCommand } from "../src/lib/restaurant/commands";
import type { Actor } from "../src/lib/auth/session";

test("Permisos, concurrencia, precios históricos, cobro único y arqueo", async () => {
  const db = createDatabaseClient();
  const restaurant = await db.restaurant.create({
    data: { slug: `test-${randomUUID()}`, name: "Prueba aislada" },
  });
  const restaurantId = restaurant.id;
  try {
    const actors: Record<string, Actor> = {};
    for (const role of ["ADMIN", "WAITER", "KITCHEN", "CASHIER"] as const) {
      const user = await db.user.create({
        data: {
          restaurantId,
          username: randomUUID(),
          name: role,
          role,
          passwordHash: "not-a-login",
        },
      });
      actors[role] = {
        id: user.id,
        restaurantId,
        role,
        roles: [role],
        name: user.name,
        username: user.username,
      };
    }
    const send = (role: string, input: unknown) =>
      executeCommand(db, actors[role], input);
    const table = await db.diningTable.create({
      data: { restaurantId, name: "Mesa test", seats: 4 },
    });
    const category = await db.category.create({
      data: { restaurantId, name: "Carta" },
    });
    const product = await db.product.create({
      data: {
        restaurantId,
        categoryId: category.id,
        name: "Plato",
        price: "100.10",
        addons: [{ id: "extra", name: "Extra", price: "20.20" }],
      },
    });
    await assert.rejects(
      send("WAITER", { type: "shift.open", openingCash: "0" }),
      /permiso/,
    );
    await assert.rejects(
      send("KITCHEN", { type: "table.open", tableId: table.id, guests: 2 }),
      /permiso/,
    );
    await assert.rejects(
      send("ADMIN", { type: "table.open", tableId: table.id, guests: 5 }),
      /capacidad/,
    );
    const openings = await Promise.allSettled([
      send("WAITER", { type: "table.open", tableId: table.id, guests: 2 }),
      send("WAITER", { type: "table.open", tableId: table.id, guests: 2 }),
    ]);
    assert.equal(openings.filter((r) => r.status === "fulfilled").length, 1);
    const session = await db.tableSession.findFirstOrThrow({
      where: { restaurantId, closedAt: null },
    });
    await send("CASHIER", { type: "shift.open", openingCash: "1000.00" });
    let shift = await db.cashShift.findFirstOrThrow({
      where: { restaurantId, closedAt: null },
    });
    const firstShiftId = shift.id;
    await send("CASHIER", {type:"shift.close", id:shift.id, closingCash:"1000", notes:"Cambio de cajero"});
    assert.equal((await db.tableSession.findUniqueOrThrow({where:{id:session.id}})).closedAt, null);
    assert.equal(await db.payment.count({where:{shiftId:firstShiftId}}), 0);
    await send("ADMIN", {type:"shift.open",openingCash:"1000.00"});
    shift = await db.cashShift.findFirstOrThrow({where:{restaurantId,closedAt:null}});
    assert.notEqual(shift.id,firstShiftId);
    const line = {
      productId: product.id,
      quantity: 2,
      notes: "Sin sal",
      addonIds: ["extra"],
    };
    await assert.rejects(
      send("WAITER", {
        type: "order.create",
        sessionId: session.id,
        requestKey: randomUUID(),
        items: [line, { ...line, productId: "does-not-exist" }],
      }),
      /disponible/,
    );
    assert.equal(
      await db.order.count({ where: { sessionId: session.id } }),
      0,
      "Pedido parcial revertido",
    );
    const orderInput = {
      type: "order.create",
      sessionId: session.id,
      requestKey: randomUUID(),
      items: [
        line,
        { ...line, quantity: 1, addonIds: [], notes: "Para anular" },
      ],
    };
    const submitted = await Promise.all([
      send("WAITER", orderInput),
      send("WAITER", orderInput),
    ]);
    assert.equal(submitted[0].id, submitted[1].id);
    assert.equal(await db.order.count({ where: { sessionId: session.id } }), 1);
    const items = await db.orderItem.findMany({
      where: { order: { sessionId: session.id } },
      orderBy: { quantity: "desc" },
    });
    assert.equal(items[0].unitPrice.toFixed(2), "120.30");
    await db.product.update({
      where: { id: product.id },
      data: { price: "999", name: "Nombre nuevo" },
    });
    const saved = await db.orderItem.findUniqueOrThrow({
      where: { id: items[0].id },
    });
    assert.equal(saved.name, "Plato");
    assert.equal(saved.unitPrice.toFixed(2), "120.30");
    await assert.rejects(
      send("CASHIER", {
        type: "payment.create",
        sessionId: session.id,
        method: "CASH",
        expectedTotal: "340.70",
      }),
      /pendientes/,
    );
    await assert.rejects(
      send("WAITER", {
        type: "item.advance",
        id: items[0].id,
        expectedStatus: "PENDING",
      }),
      /cocina/,
    );
    await assert.rejects(
      send("WAITER", { type: "item.cancel", id: items[1].id, reason: "Error" }),
      /permiso/,
    );
    await send("CASHIER", {
      type: "item.cancel",
      id: items[1].id,
      reason: "Cambio del cliente",
    });
    await send("KITCHEN", {
      type: "item.advance",
      id: items[0].id,
      expectedStatus: "PENDING",
    });
    await assert.rejects(
      send("KITCHEN", {
        type: "item.advance",
        id: items[0].id,
        expectedStatus: "PENDING",
      }),
      /actualizó/,
    );
    await send("KITCHEN", {
      type: "item.advance",
      id: items[0].id,
      expectedStatus: "PREPARING",
    });
    await assert.rejects(
      send("KITCHEN", {
        type: "item.advance",
        id: items[0].id,
        expectedStatus: "READY",
      }),
      /mozo/,
    );
    await send("WAITER", {
      type: "item.advance",
      id: items[0].id,
      expectedStatus: "READY",
    });
    await assert.rejects(
      send("CASHIER", {
        type: "payment.create",
        sessionId: session.id,
        method: "CASH",
        expectedTotal: "1.00",
      }),
      /total cambió/,
    );
    const paymentInput = {
      type: "payment.create",
      sessionId: session.id,
      method: "CASH",
      expectedTotal: "240.60",
    };
    await assert.rejects(send("WAITER", paymentInput), /permiso/);
    await assert.rejects(
      send("WAITER", { type: "restaurant.settings", waitersCanCharge: true }),
      /permiso/,
    );
    await send("ADMIN", {
      type: "restaurant.settings",
      waitersCanCharge: true,
    });
    await send("ADMIN", {
      type: "restaurant.settings",
      waitersCanCharge: false,
    });
    await assert.rejects(send("WAITER", paymentInput), /permiso/);
    await send("ADMIN", {
      type: "restaurant.settings",
      waitersCanCharge: true,
    });
    const payments = await Promise.all([
      send("WAITER", paymentInput),
      send("CASHIER", paymentInput),
    ]);
    assert.equal(payments[0].id, payments[1].id);
    assert.equal((await db.payment.findUniqueOrThrow({where:{id:payments[0].id}})).shiftId, shift.id);
    assert.equal(await db.payment.count({where:{shiftId:firstShiftId}}), 0);
    assert.equal(
      await db.payment.count({ where: { sessionId: session.id } }),
      1,
    );
    assert.ok(
      (await db.tableSession.findUniqueOrThrow({ where: { id: session.id } }))
        .closedAt,
    );
    await assert.rejects(
      send("WAITER", { ...orderInput, requestKey: randomUUID() }),
      /cerrada/,
    );
    await assert.rejects(
      send("CASHIER", {
        type: "item.cancel",
        id: items[0].id,
        reason: "Tarde",
      }),
      /cerrada/,
    );
    await send("CASHIER", {
      type: "shift.close",
      id: shift.id,
      closingCash: "1240.60",
      notes: "Sin diferencias",
    });
    const closed = await db.cashShift.findUniqueOrThrow({
      where: { id: shift.id },
    });
    assert.equal(closed.expectedCash?.toFixed(2), "1240.60");
    assert.equal(closed.closingCash?.toFixed(2), "1240.60");
    assert.equal(
      await db.auditEvent.count({
        where: { restaurantId, action: "payment.create" },
      }),
      1,
    );
    const cancel = await db.auditEvent.findFirstOrThrow({
      where: { restaurantId, action: "item.cancel" },
    });
    assert.match(cancel.detail, /Cambio del cliente/);
    await assert.rejects(
      executeCommand(
        db,
        { ...actors.ADMIN, restaurantId: "foreign" },
        {
          type: "table.save",
          id: table.id,
          name: "Intrusión",
          seats: 2,
          active: true,
        },
      ),
      /permisos cambiaron/,
    );
    await db.user.update({
      where: { id: actors.WAITER.id },
      data: { active: false },
    });
    await assert.rejects(
      send("WAITER", { type: "table.open", tableId: table.id, guests: 1 }),
      /permisos cambiaron/,
    );
    console.log("Circuito completo, permisos y concurrencia: OK");
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
