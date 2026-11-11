-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('EN_ATTENTE', 'TRAITEMENT_CONSULTANT', 'COTÉ', 'VALIDÉ_ADMIN', 'SIGNÉ_CLIENT', 'REJETÉ', 'A_REVOIR_CONSULTANT', 'A_REVOIR_CLIENT');

-- CreateEnum
CREATE TYPE "QuoteType" AS ENUM ('CONSULTATION', 'ABONNEMENT');

-- CreateEnum
CREATE TYPE "QuoteActorRole" AS ENUM ('CLIENT', 'CONSULTANT', 'ADMIN');

-- CreateEnum
CREATE TYPE "DocumentVisibleTo" AS ENUM ('ALL', 'ADMIN', 'CONSULTANT', 'CLIENT', 'SPECIFIC');

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "parentQuoteId" UUID,
    "isSubquote" BOOLEAN NOT NULL DEFAULT false,
    "requestNumber" TEXT NOT NULL,
    "type" "QuoteType" NOT NULL,
    "title" TEXT,
    "description" TEXT NOT NULL,
    "price" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" "QuoteStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "adminNotes" TEXT,
    "adminNotesToConsultant" TEXT,
    "adminNotesToClient" TEXT,
    "consultantNotes" TEXT,
    "rejectedReason" TEXT,
    "quotedById" UUID,
    "submittedAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "adminDeadline" TIMESTAMP(3),
    "consultantDeadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_consultants" (
    "quoteId" UUID NOT NULL,
    "consultantId" UUID NOT NULL,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_consultants_pkey" PRIMARY KEY ("quoteId","consultantId")
);

-- CreateTable
CREATE TABLE "quote_documents" (
    "id" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "uploadedById" UUID NOT NULL,
    "uploadedByRole" "QuoteActorRole" NOT NULL,
    "label" TEXT,
    "path" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER NOT NULL,
    "comment" TEXT,
    "visibleTo" "DocumentVisibleTo" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_document_visibilities" (
    "documentId" UUID NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "quote_document_visibilities_pkey" PRIMARY KEY ("documentId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotes_requestNumber_key" ON "quotes"("requestNumber");

-- CreateIndex
CREATE INDEX "quotes_clientId_idx" ON "quotes"("clientId");

-- CreateIndex
CREATE INDEX "quotes_status_idx" ON "quotes"("status");

-- CreateIndex
CREATE INDEX "quotes_parentQuoteId_idx" ON "quotes"("parentQuoteId");

-- CreateIndex
CREATE INDEX "quotes_createdAt_idx" ON "quotes"("createdAt");

-- CreateIndex
CREATE INDEX "quote_consultants_consultantId_idx" ON "quote_consultants"("consultantId");

-- CreateIndex
CREATE INDEX "quote_documents_quoteId_idx" ON "quote_documents"("quoteId");

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_parentQuoteId_fkey" FOREIGN KEY ("parentQuoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_quotedById_fkey" FOREIGN KEY ("quotedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_consultants" ADD CONSTRAINT "quote_consultants_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_consultants" ADD CONSTRAINT "quote_consultants_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_documents" ADD CONSTRAINT "quote_documents_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_documents" ADD CONSTRAINT "quote_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_document_visibilities" ADD CONSTRAINT "quote_document_visibilities_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "quote_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_document_visibilities" ADD CONSTRAINT "quote_document_visibilities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one lead consultant per quote (CDC §9.2).
CREATE UNIQUE INDEX "quote_consultants_one_lead_per_quote" ON "quote_consultants"("quoteId") WHERE "isLead";

-- A subquote always has a parent, a main quote never has one.
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_subquote_parent_check"
  CHECK (("isSubquote" AND "parentQuoteId" IS NOT NULL) OR (NOT "isSubquote" AND "parentQuoteId" IS NULL));

-- Price is strictly positive when set.
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_price_positive_check" CHECK ("price" IS NULL OR "price" > 0);
