-- AlterTable
ALTER TABLE "NewHire" ADD COLUMN     "academyReleasedById" TEXT,
ADD COLUMN     "linkedinVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "securityCallAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OnboardingChecklistItem" ADD COLUMN     "dueOffsetDays" INTEGER,
ADD COLUMN     "orderIndex" INTEGER,
ADD COLUMN     "ownerRole" "ChecklistOwnerRole",
ADD COLUMN     "title" TEXT;

-- Existing rows take their template's current values, then the columns become required.
UPDATE "OnboardingChecklistItem" AS i
SET "title" = t."title", "ownerRole" = t."ownerRole", "orderIndex" = t."orderIndex"
FROM "OnboardingChecklistTemplateItem" AS t
WHERE t."id" = i."templateItemId";

ALTER TABLE "OnboardingChecklistItem" ALTER COLUMN "orderIndex" SET NOT NULL,
ALTER COLUMN "ownerRole" SET NOT NULL,
ALTER COLUMN "title" SET NOT NULL;

-- AlterTable
ALTER TABLE "OnboardingModule" ADD COLUMN     "draftBlocks" JSONB;

-- CreateTable
CREATE TABLE "OnboardingNotificationLog" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingNotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingPaymentChangeLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "isFirstSave" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingPaymentChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingNotificationLog_key_key" ON "OnboardingNotificationLog"("key");

-- CreateIndex
CREATE INDEX "OnboardingPaymentChangeLog_userId_createdAt_idx" ON "OnboardingPaymentChangeLog"("userId", "createdAt");

