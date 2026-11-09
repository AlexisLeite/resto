ALTER TABLE "TableSession" ALTER COLUMN "tableId" DROP NOT NULL;
ALTER TABLE "TableSession" ADD COLUMN "saleRequest" JSONB;
