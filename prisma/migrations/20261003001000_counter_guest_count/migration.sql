ALTER TABLE "TableSession" DROP CONSTRAINT "session_guests_positive";
ALTER TABLE "TableSession" ADD CONSTRAINT "session_guests_positive" CHECK (("tableId" IS NOT NULL AND guests > 0) OR ("tableId" IS NULL AND guests = 0));
