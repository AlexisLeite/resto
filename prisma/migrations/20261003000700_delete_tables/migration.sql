ALTER TABLE "DiningTable" ADD COLUMN "deletedAt" TIMESTAMPTZ(3);
DROP INDEX "DiningTable_restaurantId_name_key";
CREATE INDEX "DiningTable_restaurantId_name_idx" ON "DiningTable"("restaurantId", "name");
CREATE UNIQUE INDEX "DiningTable_live_name_key" ON "DiningTable"("restaurantId", "name") WHERE "deletedAt" IS NULL;
