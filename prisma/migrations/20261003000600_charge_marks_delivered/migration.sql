UPDATE "OrderItem" SET "status" = 'DELIVERED', "updatedAt" = CURRENT_TIMESTAMP WHERE "status" = 'BILLABLE';
