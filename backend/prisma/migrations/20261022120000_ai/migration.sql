-- AlterTable
ALTER TABLE "users" ADD COLUMN     "aiEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ai_category_cache" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "categoryId" UUID NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_category_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "userId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("userId","day")
);

-- CreateTable
CREATE TABLE "ai_monthly_summaries" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_monthly_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_category_cache_householdId_key_key" ON "ai_category_cache"("householdId", "key");

-- CreateIndex
CREATE INDEX "ai_usage_day_idx" ON "ai_usage"("day");

-- CreateIndex
CREATE UNIQUE INDEX "ai_monthly_summaries_householdId_month_key" ON "ai_monthly_summaries"("householdId", "month");

-- AddForeignKey
ALTER TABLE "ai_category_cache" ADD CONSTRAINT "ai_category_cache_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_category_cache" ADD CONSTRAINT "ai_category_cache_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_monthly_summaries" ADD CONSTRAINT "ai_monthly_summaries_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

