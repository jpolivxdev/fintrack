-- CreateTable
CREATE TABLE "calendar_shares" (
    "id" UUID NOT NULL,
    "userAId" UUID NOT NULL,
    "userBId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_invites" (
    "id" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendar_shares_userBId_idx" ON "calendar_shares"("userBId");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_shares_userAId_userBId_key" ON "calendar_shares"("userAId", "userBId");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_invites_codeHash_key" ON "calendar_invites"("codeHash");

-- CreateIndex
CREATE INDEX "calendar_invites_createdById_idx" ON "calendar_invites"("createdById");

-- AddForeignKey
ALTER TABLE "calendar_shares" ADD CONSTRAINT "calendar_shares_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_shares" ADD CONSTRAINT "calendar_shares_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_invites" ADD CONSTRAINT "calendar_invites_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One row per pair, always ordered, and nobody shares with themselves.
ALTER TABLE "calendar_shares" ADD CONSTRAINT "calendar_shares_order_check" CHECK ("userAId" < "userBId");
