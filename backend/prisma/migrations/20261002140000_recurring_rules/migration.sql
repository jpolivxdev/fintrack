-- Recurring rules; transactions remember the rule that generated them.

-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "recurringRuleId" UUID;

-- CreateTable
CREATE TABLE "recurring_rules" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "type" "TransactionType" NOT NULL,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "categoryId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "notes" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "nextRunDate" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_rules_householdId_active_nextRunDate_idx" ON "recurring_rules"("householdId", "active", "nextRunDate");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_recurringRuleId_date_key" ON "transactions"("recurringRuleId", "date");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurringRuleId_fkey" FOREIGN KEY ("recurringRuleId") REFERENCES "recurring_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

