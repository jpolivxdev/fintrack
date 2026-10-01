-- Bank ids for imported transactions (idempotent re-imports).

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "transactions_accountId_externalId_key" ON "transactions"("accountId", "externalId");

