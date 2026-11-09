import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabaseClient } from "../src/lib/database/client";
import { executeCommand } from "../src/lib/restaurant/commands";
import type { Actor } from "../src/lib/auth/session";
test("Eliminar mesa conserva historial, bloquea cuentas abiertas y permite reutilizar el nombre", async () => {
  const db = createDatabaseClient();
  const restaurant = await db.restaurant.create({
    data: { slug: randomUUID(), name: "Eliminar mesas" },
  });
  const restaurantId = restaurant.id;
  try {
    const user = await db.user.create({
      data: {
        restaurantId,
        username: randomUUID(),
        name: "Admin",
        role: "ADMIN",
        passwordHash: "not-login",
      },
    });
    const actor: Actor = {
      id: user.id,
      restaurantId,
      username: user.username,
      name: user.name,
      role: "ADMIN",
      roles: ["ADMIN"],
    };
    const table = await db.diningTable.create({
      data: { restaurantId, name: "Mesa prueba" },
    });
    const session = await db.tableSession.create({
      data: { restaurantId, tableId: table.id, guests: 2, openedBy: user.name },
    });
    await assert.rejects(
      executeCommand(db, actor, { type: "table.delete", id: table.id }),
      /Cerrá la cuenta/,
    );
    await assert.rejects(
      executeCommand(
        db,
        { ...actor, role: "WAITER", roles: ["WAITER"] },
        { type: "table.delete", id: table.id },
      ),
    );
    await db.tableSession.update({
      where: { id: session.id },
      data: { closedAt: new Date() },
    });
    await executeCommand(db, actor, { type: "table.delete", id: table.id });
    await executeCommand(db, actor, { type: "table.delete", id: table.id });
    assert.ok(
      (await db.diningTable.findUniqueOrThrow({ where: { id: table.id } }))
        .deletedAt,
    );
    assert.equal(
      (
        await db.tableSession.findUniqueOrThrow({
          where: { id: session.id },
          include: { table: true },
        })
      ).table!.name,
      "Mesa prueba",
    );
    assert.equal(
      await db.auditEvent.count({
        where: { restaurantId, action: "table.delete" },
      }),
      1,
    );
    await assert.rejects(
      executeCommand(db, actor, {
        type: "table.open",
        tableId: table.id,
        guests: 1,
      }),
      /no disponible/,
    );
    await assert.rejects(
      executeCommand(db, actor, {
        type: "table.save",
        id: table.id,
        name: "Restaurada",
        seats: 4,
        active: true,
      }),
      /inexistente/,
    );
    await executeCommand(db, actor, {
      type: "table.save",
      name: "Mesa prueba",
      seats: 4,
      active: true,
    });
    assert.equal(
      await db.diningTable.count({
        where: { restaurantId, name: "Mesa prueba", deletedAt: null },
      }),
      1,
    );
    await assert.rejects(
      executeCommand(
        db,
        { ...actor, restaurantId: randomUUID() },
        { type: "table.delete", id: table.id },
      ),
    );
  } finally {
    await db.tableSession.deleteMany({ where: { restaurantId } });
    await db.diningTable.deleteMany({ where: { restaurantId } });
    await db.auditEvent.deleteMany({ where: { restaurantId } });
    await db.user.deleteMany({ where: { restaurantId } });
    await db.restaurant.delete({ where: { id: restaurantId } });
    await db.$disconnect();
  }
});
