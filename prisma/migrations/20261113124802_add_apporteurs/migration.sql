-- CreateEnum
CREATE TYPE "ProspectStatus" AS ENUM ('EN_ATTENTE', 'CONVERTI', 'REJETÉ');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('EN_ATTENTE', 'VALIDÉE', 'PAYÉE');

-- CreateTable
CREATE TABLE "prospects" (
    "id" UUID NOT NULL,
    "apporteurId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "documentKey" TEXT,
    "documentName" TEXT,
    "documentMimeType" TEXT,
    "documentSize" INTEGER,
    "status" "ProspectStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "rejectedReason" TEXT,
    "clientId" UUID,
    "missionId" UUID,
    "processedAt" TIMESTAMP(3),
    "processedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prospects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissions" (
    "id" UUID NOT NULL,
    "apporteurId" UUID NOT NULL,
    "prospectId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "missionId" UUID NOT NULL,
    "clientName" TEXT NOT NULL,
    "missionTitle" TEXT NOT NULL,
    "amount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" "CommissionStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "validatedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prospects_apporteurId_idx" ON "prospects"("apporteurId");

-- CreateIndex
CREATE INDEX "prospects_status_idx" ON "prospects"("status");

-- CreateIndex
CREATE INDEX "prospects_createdAt_idx" ON "prospects"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "commissions_prospectId_key" ON "commissions"("prospectId");

-- CreateIndex
CREATE UNIQUE INDEX "commissions_missionId_key" ON "commissions"("missionId");

-- CreateIndex
CREATE INDEX "commissions_apporteurId_idx" ON "commissions"("apporteurId");

-- CreateIndex
CREATE INDEX "commissions_status_idx" ON "commissions"("status");

-- AddForeignKey
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_apporteurId_fkey" FOREIGN KEY ("apporteurId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_apporteurId_fkey" FOREIGN KEY ("apporteurId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Business invariants
ALTER TABLE "commissions"
  ADD CONSTRAINT "commissions_amount_positive_check" CHECK ("amount" IS NULL OR "amount" > 0),
  ADD CONSTRAINT "commissions_status_consistency_check" CHECK (
    ("status" = 'EN_ATTENTE')
    OR ("status" = 'VALIDÉE' AND "amount" IS NOT NULL AND "validatedAt" IS NOT NULL)
    OR ("status" = 'PAYÉE' AND "amount" IS NOT NULL AND "validatedAt" IS NOT NULL AND "paidAt" IS NOT NULL)
  );
ALTER TABLE "prospects"
  ADD CONSTRAINT "prospects_conversion_consistency_check" CHECK (
    ("status" = 'CONVERTI') = ("clientId" IS NOT NULL AND "missionId" IS NOT NULL)
  );
