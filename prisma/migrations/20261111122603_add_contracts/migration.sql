-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "createdById" UUID,
    "originalFileKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "originalMimeType" TEXT,
    "originalSize" INTEGER NOT NULL,
    "signedFileKey" TEXT,
    "signedFileName" TEXT,
    "signedMimeType" TEXT,
    "signedSize" INTEGER,
    "signed" BOOLEAN NOT NULL DEFAULT false,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contracts_quoteId_key" ON "contracts"("quoteId");

-- CreateIndex
CREATE INDEX "contracts_clientId_idx" ON "contracts"("clientId");

-- CreateIndex
CREATE INDEX "contracts_signed_idx" ON "contracts"("signed");

-- CreateIndex
CREATE INDEX "contracts_createdAt_idx" ON "contracts"("createdAt");

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A signed contract always carries its signed file and date (and vice versa).
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_signed_consistency_check"
  CHECK (("signed" AND "signedFileKey" IS NOT NULL AND "signedAt" IS NOT NULL)
      OR (NOT "signed" AND "signedFileKey" IS NULL AND "signedAt" IS NULL));
