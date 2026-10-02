-- CreateEnum
CREATE TYPE "InvestmentClass" AS ENUM ('FIXED_INCOME', 'TREASURY', 'STOCKS', 'REITS', 'FUNDS', 'CRYPTO', 'PENSION', 'OTHER');

-- CreateEnum
CREATE TYPE "YieldMode" AS ENUM ('CDI_PERCENT', 'FIXED_RATE', 'IPCA_PLUS', 'MANUAL');

-- CreateEnum
CREATE TYPE "MarketSeries" AS ENUM ('CDI', 'IPCA');

-- AlterTable
ALTER TABLE "recurring_rules" ADD COLUMN     "toAccountId" UUID,
ALTER COLUMN "categoryId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "transfers" ADD COLUMN     "recurringRuleId" UUID;

-- CreateTable
CREATE TABLE "investments" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "assetClass" "InvestmentClass" NOT NULL,
    "yieldMode" "YieldMode" NOT NULL,
    "rate" DECIMAL(8,4),
    "startDate" DATE NOT NULL,
    "maturityDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_valuations" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "investmentId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investment_valuations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_rates" (
    "series" "MarketSeries" NOT NULL,
    "date" DATE NOT NULL,
    "rate" DECIMAL(12,8) NOT NULL,

    CONSTRAINT "market_rates_pkey" PRIMARY KEY ("series","date")
);

-- CreateIndex
CREATE UNIQUE INDEX "investments_accountId_key" ON "investments"("accountId");

-- CreateIndex
CREATE INDEX "investments_householdId_idx" ON "investments"("householdId");

-- CreateIndex
CREATE INDEX "investment_valuations_householdId_idx" ON "investment_valuations"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "investment_valuations_investmentId_date_key" ON "investment_valuations"("investmentId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_recurringRuleId_date_key" ON "transfers"("recurringRuleId", "date");

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_recurringRuleId_fkey" FOREIGN KEY ("recurringRuleId") REFERENCES "recurring_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investments" ADD CONSTRAINT "investments_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investments" ADD CONSTRAINT "investments_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_valuations" ADD CONSTRAINT "investment_valuations_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_valuations" ADD CONSTRAINT "investment_valuations_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "investments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_valuations" ADD CONSTRAINT "investment_valuations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A rule is either an income/expense (category) or a transfer (destination account).
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_kind_check"
  CHECK (("categoryId" IS NULL) <> ("toAccountId" IS NULL));
