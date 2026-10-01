-- DropIndex
DROP INDEX "transactions_userId_date_idx";

-- CreateIndex
CREATE INDEX "transactions_user_date_covering_idx" ON "transactions"("userId", "date", "type", "categoryId", "amount");
