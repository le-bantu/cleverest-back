-- CreateEnum
CREATE TYPE "MissionStatus" AS ENUM ('EN_ATTENTE', 'EN_COURS', 'EN_VALIDATION', 'TERMINÉE', 'REJETÉE');

-- CreateEnum
CREATE TYPE "MissionTaskStatus" AS ENUM ('A_FAIRE', 'EN_COURS', 'FAITE');

-- CreateTable
CREATE TABLE "missions" (
    "id" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "MissionStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "deliveryDate" TIMESTAMP(3),
    "contractFileKey" TEXT,
    "contractFileName" TEXT,
    "contractMimeType" TEXT,
    "contractSize" INTEGER,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "missions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mission_consultants" (
    "missionId" UUID NOT NULL,
    "consultantId" UUID NOT NULL,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mission_consultants_pkey" PRIMARY KEY ("missionId","consultantId")
);

-- CreateTable
CREATE TABLE "mission_tasks" (
    "id" UUID NOT NULL,
    "missionId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL,
    "status" "MissionTaskStatus" NOT NULL DEFAULT 'A_FAIRE',
    "assigneeConsultantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mission_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "missions_contractId_idx" ON "missions"("contractId");

-- CreateIndex
CREATE INDEX "missions_clientId_idx" ON "missions"("clientId");

-- CreateIndex
CREATE INDEX "missions_status_idx" ON "missions"("status");

-- CreateIndex
CREATE INDEX "missions_deliveryDate_idx" ON "missions"("deliveryDate");

-- CreateIndex
CREATE INDEX "mission_consultants_consultantId_idx" ON "mission_consultants"("consultantId");

-- CreateIndex
CREATE INDEX "mission_tasks_missionId_order_idx" ON "mission_tasks"("missionId", "order");

-- AddForeignKey
ALTER TABLE "missions" ADD CONSTRAINT "missions_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missions" ADD CONSTRAINT "missions_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missions" ADD CONSTRAINT "missions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission_consultants" ADD CONSTRAINT "mission_consultants_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission_consultants" ADD CONSTRAINT "mission_consultants_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission_tasks" ADD CONSTRAINT "mission_tasks_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission_tasks" ADD CONSTRAINT "mission_tasks_assigneeConsultantId_fkey" FOREIGN KEY ("assigneeConsultantId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- At most one lead consultant per mission.
CREATE UNIQUE INDEX "mission_consultants_one_lead_per_mission"
  ON "mission_consultants"("missionId") WHERE "isLead";

-- Progress is a percentage; task positions are 1-based.
ALTER TABLE "missions" ADD CONSTRAINT "missions_progress_range_check"
  CHECK ("progress" BETWEEN 0 AND 100);
ALTER TABLE "mission_tasks" ADD CONSTRAINT "mission_tasks_order_positive_check"
  CHECK ("order" >= 1);
