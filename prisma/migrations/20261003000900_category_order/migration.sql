ALTER TABLE "Category" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
WITH ranked AS (SELECT id, ROW_NUMBER() OVER (PARTITION BY "restaurantId" ORDER BY name) - 1 AS position FROM "Category") UPDATE "Category" SET position = ranked.position FROM ranked WHERE "Category".id = ranked.id;
