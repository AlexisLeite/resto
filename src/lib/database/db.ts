import "server-only";
import { createDatabaseClient } from "./client";

const globalForDb = globalThis as unknown as {
  restoDb?: ReturnType<typeof createDatabaseClient>;
};

// Inicialización diferida: el build no necesita conectarse a PostgreSQL.
export function getDb() {
  return (globalForDb.restoDb ??= createDatabaseClient());
}
