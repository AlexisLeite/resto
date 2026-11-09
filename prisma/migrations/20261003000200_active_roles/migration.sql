ALTER TABLE "User" ADD COLUMN "roles" "Role"[] NOT NULL DEFAULT ARRAY[]::"Role"[];
UPDATE "User" SET "roles" = ARRAY["role"];
-- La cuenta de administración de ejemplo permite recorrer los cuatro espacios.
UPDATE "User" SET "roles" = ARRAY['ADMIN', 'WAITER', 'KITCHEN', 'CASHIER']::"Role"[]
WHERE "username" = 'admin' AND "restaurantId" IN (SELECT "id" FROM "Restaurant" WHERE "slug" = 'resto-demo');
ALTER TABLE "AuthSession" ADD COLUMN "activeRole" "Role" NOT NULL DEFAULT 'WAITER';
UPDATE "AuthSession" AS s SET "activeRole" = u."role" FROM "User" AS u WHERE s."userId" = u."id";
