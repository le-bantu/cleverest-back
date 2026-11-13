-- CreateTable
CREATE TABLE "mission_reviews" (
    "id" UUID NOT NULL,
    "missionId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mission_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mission_reviews_clientId_idx" ON "mission_reviews"("clientId");

-- CreateIndex
CREATE INDEX "mission_reviews_rating_idx" ON "mission_reviews"("rating");

-- CreateIndex
CREATE UNIQUE INDEX "mission_reviews_missionId_clientId_key" ON "mission_reviews"("missionId", "clientId");

-- AddForeignKey
ALTER TABLE "mission_reviews" ADD CONSTRAINT "mission_reviews_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission_reviews" ADD CONSTRAINT "mission_reviews_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Business invariants
ALTER TABLE "mission_reviews" ADD CONSTRAINT "mission_reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "mission_reviews" ADD CONSTRAINT "mission_reviews_comment_length" CHECK ("comment" IS NULL OR char_length("comment") BETWEEN 1 AND 2000);
