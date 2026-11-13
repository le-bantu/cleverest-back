-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "missionId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "proofFileKey" TEXT NOT NULL,
    "proofFileName" TEXT NOT NULL,
    "proofMimeType" TEXT,
    "proofSize" INTEGER NOT NULL,
    "validatedAt" TIMESTAMP(3),
    "validatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_invoices" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "missionId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "pdfFileKey" TEXT NOT NULL,
    "pdfFileName" TEXT NOT NULL,
    "pdfSize" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "generatedById" UUID,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultant_invoices" (
    "id" UUID NOT NULL,
    "consultantId" UUID NOT NULL,
    "missionId" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paidById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultant_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_missionId_idx" ON "payments"("missionId");

-- CreateIndex
CREATE INDEX "payments_clientId_idx" ON "payments"("clientId");

-- CreateIndex
CREATE INDEX "payments_validatedAt_idx" ON "payments"("validatedAt");

-- CreateIndex
CREATE INDEX "payments_createdAt_idx" ON "payments"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "client_invoices_paymentId_key" ON "client_invoices"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "client_invoices_invoiceNumber_key" ON "client_invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "client_invoices_clientId_idx" ON "client_invoices"("clientId");

-- CreateIndex
CREATE INDEX "client_invoices_missionId_idx" ON "client_invoices"("missionId");

-- CreateIndex
CREATE INDEX "consultant_invoices_consultantId_quoteId_idx" ON "consultant_invoices"("consultantId", "quoteId");

-- CreateIndex
CREATE INDEX "consultant_invoices_missionId_idx" ON "consultant_invoices"("missionId");

-- CreateIndex
CREATE INDEX "consultant_invoices_paidAt_idx" ON "consultant_invoices"("paidAt");

-- CreateIndex
CREATE INDEX "consultant_invoices_uploadedAt_idx" ON "consultant_invoices"("uploadedAt");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultant_invoices" ADD CONSTRAINT "consultant_invoices_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultant_invoices" ADD CONSTRAINT "consultant_invoices_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Business invariants
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_positive_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "payments_validation_consistency_check"
    CHECK (("validatedAt" IS NULL) = ("validatedById" IS NULL));
ALTER TABLE "client_invoices"
  ADD CONSTRAINT "client_invoices_amount_positive_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "client_invoices_number_format_check"
    CHECK ("invoiceNumber" ~ '^FAC-[0-9]{4}-[0-9]{4,}$');
ALTER TABLE "consultant_invoices"
  ADD CONSTRAINT "consultant_invoices_amount_positive_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "consultant_invoices_paid_consistency_check"
    CHECK (("paidAt" IS NULL) = ("paidById" IS NULL));
