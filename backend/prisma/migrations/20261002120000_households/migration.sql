-- Households: financial data moves from "owned by a user" to "owned by a household".
-- Hand-written so existing data is migrated, not dropped:
-- every existing user gets a household whose id equals the user's id, which
-- makes the backfill a plain `householdId = userId`.

-- 1. New tables ---------------------------------------------------------------
CREATE TYPE "HouseholdRole" AS ENUM ('OWNER', 'MEMBER');

CREATE TABLE "households" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "household_members" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "HouseholdRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "household_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "household_invites" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "household_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "household_members_userId_key" ON "household_members"("userId");
CREATE INDEX "household_members_householdId_idx" ON "household_members"("householdId");
CREATE UNIQUE INDEX "household_invites_codeHash_key" ON "household_invites"("codeHash");
CREATE INDEX "household_invites_householdId_idx" ON "household_invites"("householdId");

ALTER TABLE "household_members" ADD CONSTRAINT "household_members_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "household_invites" ADD CONSTRAINT "household_invites_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "household_invites" ADD CONSTRAINT "household_invites_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. One personal household per existing user (id = user id) -------------------
INSERT INTO "households" ("id", "name", "createdAt", "updatedAt")
SELECT "id", 'Casa de ' || split_part("name", ' ', 1), "createdAt", CURRENT_TIMESTAMP FROM "users";

INSERT INTO "household_members" ("id", "householdId", "userId", "role", "joinedAt")
SELECT gen_random_uuid(), "id", "id", 'OWNER', "createdAt" FROM "users";

-- 3. Re-own the data: add nullable columns, backfill, then enforce NOT NULL -----
ALTER TABLE "categories" ADD COLUMN "householdId" UUID;
UPDATE "categories" SET "householdId" = "userId";
ALTER TABLE "categories" ALTER COLUMN "householdId" SET NOT NULL;

ALTER TABLE "budgets" ADD COLUMN "householdId" UUID;
UPDATE "budgets" SET "householdId" = "userId";
ALTER TABLE "budgets" ALTER COLUMN "householdId" SET NOT NULL;

ALTER TABLE "transactions" ADD COLUMN "householdId" UUID, ADD COLUMN "createdById" UUID;
UPDATE "transactions" SET "householdId" = "userId", "createdById" = "userId";
ALTER TABLE "transactions" ALTER COLUMN "householdId" SET NOT NULL;

-- 4. Drop the old ownership ---------------------------------------------------
ALTER TABLE "budgets" DROP CONSTRAINT "budgets_userId_fkey";
ALTER TABLE "categories" DROP CONSTRAINT "categories_userId_fkey";
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_userId_fkey";
DROP INDEX "budgets_userId_categoryId_year_month_key";
DROP INDEX "budgets_userId_year_month_idx";
DROP INDEX "categories_userId_name_type_key";
DROP INDEX "categories_userId_type_idx";
DROP INDEX "transactions_userId_categoryId_idx";
DROP INDEX "transactions_user_date_covering_idx";
ALTER TABLE "budgets" DROP COLUMN "userId";
ALTER TABLE "categories" DROP COLUMN "userId";
ALTER TABLE "transactions" DROP COLUMN "userId";

-- 5. New constraints ----------------------------------------------------------
CREATE INDEX "budgets_householdId_year_month_idx" ON "budgets"("householdId", "year", "month");
CREATE UNIQUE INDEX "budgets_householdId_categoryId_year_month_key" ON "budgets"("householdId", "categoryId", "year", "month");
CREATE INDEX "categories_householdId_type_idx" ON "categories"("householdId", "type");
CREATE UNIQUE INDEX "categories_householdId_name_type_key" ON "categories"("householdId", "name", "type");
CREATE INDEX "transactions_household_date_covering_idx" ON "transactions"("householdId", "date", "type", "categoryId", "amount");
CREATE INDEX "transactions_householdId_categoryId_idx" ON "transactions"("householdId", "categoryId");

ALTER TABLE "categories" ADD CONSTRAINT "categories_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
