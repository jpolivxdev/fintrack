-- Accounts, transfers and installment purchases.

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CHECKING', 'SAVINGS', 'CREDIT_CARD', 'CASH', 'INVESTMENT');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "accountId" UUID,
ADD COLUMN     "installmentGroupId" UUID,
ADD COLUMN     "installmentNumber" INTEGER,
ADD COLUMN     "installmentTotal" INTEGER;

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "color" TEXT,
    "icon" TEXT,
    "initialBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "fromAccountId" UUID NOT NULL,
    "toAccountId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounts_householdId_idx" ON "accounts"("householdId");

-- CreateIndex
CREATE INDEX "transfers_householdId_date_idx" ON "transfers"("householdId", "date");

-- CreateIndex
CREATE INDEX "transfers_fromAccountId_idx" ON "transfers"("fromAccountId");

-- CreateIndex
CREATE INDEX "transfers_toAccountId_idx" ON "transfers"("toAccountId");

-- CreateIndex
CREATE INDEX "transactions_householdId_accountId_idx" ON "transactions"("householdId", "accountId");

-- CreateIndex
CREATE INDEX "transactions_installmentGroupId_idx" ON "transactions"("installmentGroupId");

-- Backfill (hand-written): one "Conta principal" per existing household, and
-- every existing transaction is attached to it before the column becomes NOT NULL.
INSERT INTO "accounts" ("id", "householdId", "name", "type", "color", "icon", "updatedAt")
SELECT gen_random_uuid(), "id", 'Conta principal', 'CHECKING', '#8b5cf6', 'landmark', CURRENT_TIMESTAMP FROM "households";

UPDATE "transactions" t SET "accountId" = a."id"
FROM "accounts" a WHERE a."householdId" = t."householdId";

ALTER TABLE "transactions" ALTER COLUMN "accountId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

