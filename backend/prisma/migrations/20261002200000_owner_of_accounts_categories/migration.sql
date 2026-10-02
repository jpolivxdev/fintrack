-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "ownerId" UUID;

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "ownerId" UUID;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: in single-member households, everything belongs to that member.
-- In shared households the owner is unknown, so items stay shared (NULL).
UPDATE "accounts" a SET "ownerId" = m."userId"
FROM "household_members" m
WHERE m."householdId" = a."householdId"
  AND (SELECT COUNT(*) FROM "household_members" x WHERE x."householdId" = a."householdId") = 1;

UPDATE "categories" c SET "ownerId" = m."userId"
FROM "household_members" m
WHERE m."householdId" = c."householdId"
  AND (SELECT COUNT(*) FROM "household_members" x WHERE x."householdId" = c."householdId") = 1;
