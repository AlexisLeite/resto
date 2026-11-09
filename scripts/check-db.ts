import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabaseClient } from "../src/lib/database/client";

const slug = `connection-check-${randomUUID()}`;
const writer = createDatabaseClient();
const reader = createDatabaseClient();

async function main() {
  await writer.restaurant.create({
    data: { slug, name: "Prueba de persistencia" },
  });
  // Una segunda conexión verifica que la escritura fue confirmada en PostgreSQL.
  const persisted = await reader.restaurant.findUniqueOrThrow({
    where: { slug },
  });
  assert.equal(persisted.name, "Prueba de persistencia");
  assert.equal(persisted.currency, "UYU");
  console.log(
    "OK: escritura y lectura persistidas en PostgreSQL mediante Prisma.",
  );
}

main()
  .catch(() => {
    console.error("Falló la verificación de persistencia.");
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await writer.restaurant.deleteMany({ where: { slug } });
    } finally {
      await Promise.all([writer.$disconnect(), reader.$disconnect()]);
    }
  });
