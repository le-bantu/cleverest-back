-- CreateTable
CREATE TABLE "consultant_contracts" (
    "id" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "rootQuoteId" UUID NOT NULL,
    "consultantId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "createdById" UUID,
    "originalFileKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "originalMimeType" TEXT,
    "originalSize" INTEGER NOT NULL,
    "signedFileKey" TEXT,
    "signedFileName" TEXT,
    "signedMimeType" TEXT,
    "signedSize" INTEGER,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultant_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consultant_contracts_consultantId_rootQuoteId_idx" ON "consultant_contracts"("consultantId", "rootQuoteId");

-- CreateIndex
CREATE INDEX "consultant_contracts_rootQuoteId_idx" ON "consultant_contracts"("rootQuoteId");

-- CreateIndex
CREATE UNIQUE INDEX "consultant_contracts_quoteId_consultantId_key" ON "consultant_contracts"("quoteId", "consultantId");

-- AddForeignKey
ALTER TABLE "consultant_contracts" ADD CONSTRAINT "consultant_contracts_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultant_contracts" ADD CONSTRAINT "consultant_contracts_rootQuoteId_fkey" FOREIGN KEY ("rootQuoteId") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultant_contracts" ADD CONSTRAINT "consultant_contracts_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Business invariants
ALTER TABLE "consultant_contracts"
  ADD CONSTRAINT "consultant_contracts_amount_positive_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "consultant_contracts_signed_consistency_check"
    CHECK (("signedAt" IS NULL) = ("signedFileKey" IS NULL));
