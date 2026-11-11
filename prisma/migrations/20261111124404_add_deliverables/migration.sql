-- CreateTable
CREATE TABLE "deliverables" (
    "id" UUID NOT NULL,
    "missionId" UUID NOT NULL,
    "consultantId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "fileKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientValidated" BOOLEAN NOT NULL DEFAULT false,
    "clientValidatedAt" TIMESTAMP(3),
    "adminValidated" BOOLEAN NOT NULL DEFAULT false,
    "adminValidatedAt" TIMESTAMP(3),
    "adminValidatedById" UUID,

    CONSTRAINT "deliverables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deliverables_missionId_idx" ON "deliverables"("missionId");

-- CreateIndex
CREATE INDEX "deliverables_consultantId_idx" ON "deliverables"("consultantId");

-- CreateIndex
CREATE INDEX "deliverables_clientId_adminValidated_idx" ON "deliverables"("clientId", "adminValidated");

-- CreateIndex
CREATE INDEX "deliverables_uploadedAt_idx" ON "deliverables"("uploadedAt");

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A validation flag always comes with its date.
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_validation_dates_check"
  CHECK ("clientValidated" = ("clientValidatedAt" IS NOT NULL)
     AND "adminValidated" = ("adminValidatedAt" IS NOT NULL));
