-- CreateEnum
CREATE TYPE "OfficeLocation" AS ENUM ('KARACHI', 'CASABLANCA', 'BOGOTA', 'DALLAS', 'REMOTE');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('OFFICE', 'HYBRID', 'REMOTE');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('PK_EMPLOYMENT', 'INDEPENDENT_CONTRACTOR', 'OTHER_EMPLOYMENT');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('PERMANENT', 'FIXED_TERM', 'INTERN');

-- CreateEnum
CREATE TYPE "CompanyWing" AS ENUM ('CAPITAL', 'PARTNERS');

-- CreateEnum
CREATE TYPE "OnboardingPhase" AS ENUM ('DAY_1', 'WEEK_1');

-- CreateEnum
CREATE TYPE "OnboardingCompletionRule" AS ENUM ('VIDEO_95', 'SCROLL_END', 'BUDDY_HELLO', 'ALL_LINKS_OPENED', 'CHECKLIST_AND_FIELD', 'CHECKLIST_AND_ACK', 'FIELD_SUBMITTED', 'PAYMENT_SETUP', 'LINK_OPENED');

-- CreateEnum
CREATE TYPE "OnboardingProgressSource" AS ENUM ('COURSE', 'SINGLE_ASSIGNMENT', 'REREAD');

-- CreateEnum
CREATE TYPE "AcknowledgementKind" AS ENUM ('SECURITY_SOPS', 'VALUES_CODE_OF_CONDUCT');

-- CreateEnum
CREATE TYPE "LibraryCardKind" AS ENUM ('BENEFIT', 'REIMBURSEMENT');

-- CreateEnum
CREATE TYPE "KeyContactGroup" AS ENUM ('HR', 'SECURITY_IT', 'ACCOUNTS', 'EXECUTION');

-- CreateEnum
CREATE TYPE "ChecklistOwnerRole" AS ENUM ('HR', 'SECURITY', 'OA', 'TEAM_LEAD');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('WISE', 'BANK_TRANSFER', 'PAYONEER', 'OTHER');

-- AlterTable
ALTER TABLE "NewHire" ADD COLUMN     "academyReleasedAt" TIMESTAMP(3),
ADD COLUMN     "clientAccount" TEXT,
ADD COLUMN     "companyWing" "CompanyWing",
ADD COLUMN     "contractType" "ContractType",
ADD COLUMN     "coreHoursEnd" TEXT,
ADD COLUMN     "coreHoursStart" TEXT,
ADD COLUMN     "employmentStatus" "EmploymentStatus",
ADD COLUMN     "hrCallAt" TIMESTAMP(3),
ADD COLUMN     "officeLocation" "OfficeLocation",
ADD COLUMN     "preferredName" TEXT,
ADD COLUMN     "remoteCountry" CHAR(2),
ADD COLUMN     "teamCallAt" TIMESTAMP(3),
ADD COLUMN     "workMode" "WorkMode";

-- AlterTable
ALTER TABLE "OnboardingConfig" ADD COLUMN     "bankLetterTemplate" TEXT,
ADD COLUMN     "blockersCallCt" TEXT NOT NULL DEFAULT 'WED 07:00',
ADD COLUMN     "failAlertThreshold" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "invoiceTemplates" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "links" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "retakeCooldownMinutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "videos" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "OnboardingModule" ADD COLUMN     "completionRule" "OnboardingCompletionRule",
ADD COLUMN     "currentVersionId" TEXT,
ADD COLUMN     "estimatedMinutes" INTEGER,
ADD COLUMN     "headlineAccent" TEXT,
ADD COLUMN     "headlineLead" TEXT,
ADD COLUMN     "heroImageUrl" TEXT,
ADD COLUMN     "icon" TEXT,
ADD COLUMN     "phase" "OnboardingPhase";

-- AlterTable
ALTER TABLE "OnboardingProgress" ADD COLUMN     "assignedById" TEXT,
ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "source" "OnboardingProgressSource" NOT NULL DEFAULT 'COURSE',
ADD COLUMN     "state" JSONB,
ADD COLUMN     "unlockedEarlyById" TEXT,
ADD COLUMN     "versionId" TEXT;

-- AlterTable
ALTER TABLE "OnboardingQuizQuestion" ADD COLUMN     "explanation" TEXT,
ADD COLUMN     "retiredAt" TIMESTAMP(3),
ADD COLUMN     "valueKey" TEXT,
ADD COLUMN     "videoChapterKey" TEXT;

-- AlterTable
ALTER TABLE "PayrollEmployeeProfile" ADD COLUMN     "branch" TEXT,
ADD COLUMN     "iban" TEXT;

-- AlterTable
ALTER TABLE "TeamLeadForm" ADD COLUMN     "day1Goal" TEXT,
ADD COLUMN     "leadInputDueAt" TIMESTAMP(3),
ADD COLUMN     "month1Goal" TEXT,
ADD COLUMN     "month3Goal" TEXT,
ADD COLUMN     "roleExpectations" TEXT,
ADD COLUMN     "teamTools" JSONB,
ADD COLUMN     "tutorials" JSONB,
ADD COLUMN     "week1Goal" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "contractType" "ContractType",
ADD COLUMN     "discordUsername" TEXT,
ADD COLUMN     "employmentStatus" "EmploymentStatus",
ADD COLUMN     "linkedinUrl" TEXT,
ADD COLUMN     "officeLocation" "OfficeLocation",
ADD COLUMN     "remoteCountry" CHAR(2),
ADD COLUMN     "workMode" "WorkMode";

-- CreateTable
CREATE TABLE "NewHireTeamMember" (
    "id" TEXT NOT NULL,
    "newHireId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewHireTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingModuleVersion" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "blocks" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedById" TEXT,
    "changeNote" TEXT,

    CONSTRAINT "OnboardingModuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingProgressHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "versionId" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingProgressHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingAcknowledgement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AcknowledgementKind" NOT NULL,
    "statementText" TEXT NOT NULL,
    "moduleVersionId" TEXT,
    "typedName" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingLibraryCard" (
    "id" TEXT NOT NULL,
    "kind" "LibraryCardKind" NOT NULL,
    "title" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "links" JSONB NOT NULL DEFAULT '[]',
    "countries" TEXT[],
    "workModes" "WorkMode"[],
    "contractTypes" "ContractType"[],
    "employmentStatuses" "EmploymentStatus"[],
    "orderIndex" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingLibraryCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingKeyContact" (
    "id" TEXT NOT NULL,
    "group" "KeyContactGroup" NOT NULL,
    "userId" TEXT,
    "label" TEXT,
    "email" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingKeyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingChecklistTemplateItem" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ownerRole" "ChecklistOwnerRole" NOT NULL,
    "dueOffsetDays" INTEGER NOT NULL,
    "autoTickEvent" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingChecklistTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingChecklistItem" (
    "id" TEXT NOT NULL,
    "newHireId" TEXT NOT NULL,
    "templateItemId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "autoTicked" BOOLEAN NOT NULL DEFAULT false,
    "missReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorPayoutDetails" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "method" "PayoutMethod" NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "payoutEmail" TEXT,
    "bankName" TEXT,
    "accountNumberOrIban" TEXT,
    "swiftBic" TEXT,
    "bankCountry" TEXT,
    "bankAddress" TEXT,
    "instructions" TEXT,
    "currency" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractorPayoutDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorPayoutRevealLog" (
    "id" TEXT NOT NULL,
    "payoutUserId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractorPayoutRevealLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NewHireTeamMember_userId_idx" ON "NewHireTeamMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NewHireTeamMember_newHireId_userId_key" ON "NewHireTeamMember"("newHireId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingModuleVersion_moduleId_version_key" ON "OnboardingModuleVersion"("moduleId", "version");

-- CreateIndex
CREATE INDEX "OnboardingProgressHistory_userId_moduleId_idx" ON "OnboardingProgressHistory"("userId", "moduleId");

-- CreateIndex
CREATE INDEX "OnboardingAcknowledgement_userId_kind_idx" ON "OnboardingAcknowledgement"("userId", "kind");

-- CreateIndex
CREATE INDEX "OnboardingLibraryCard_kind_isActive_orderIndex_idx" ON "OnboardingLibraryCard"("kind", "isActive", "orderIndex");

-- CreateIndex
CREATE INDEX "OnboardingKeyContact_group_orderIndex_idx" ON "OnboardingKeyContact"("group", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingChecklistTemplateItem_key_key" ON "OnboardingChecklistTemplateItem"("key");

-- CreateIndex
CREATE INDEX "OnboardingChecklistItem_dueAt_idx" ON "OnboardingChecklistItem"("dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingChecklistItem_newHireId_templateItemId_key" ON "OnboardingChecklistItem"("newHireId", "templateItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractorPayoutDetails_userId_key" ON "ContractorPayoutDetails"("userId");

-- CreateIndex
CREATE INDEX "ContractorPayoutRevealLog_payoutUserId_createdAt_idx" ON "ContractorPayoutRevealLog"("payoutUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_unlockedEarlyById_fkey" FOREIGN KEY ("unlockedEarlyById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewHireTeamMember" ADD CONSTRAINT "NewHireTeamMember_newHireId_fkey" FOREIGN KEY ("newHireId") REFERENCES "NewHire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewHireTeamMember" ADD CONSTRAINT "NewHireTeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingModuleVersion" ADD CONSTRAINT "OnboardingModuleVersion_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "OnboardingModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingModuleVersion" ADD CONSTRAINT "OnboardingModuleVersion_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingProgressHistory" ADD CONSTRAINT "OnboardingProgressHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingAcknowledgement" ADD CONSTRAINT "OnboardingAcknowledgement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingKeyContact" ADD CONSTRAINT "OnboardingKeyContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingChecklistItem" ADD CONSTRAINT "OnboardingChecklistItem_newHireId_fkey" FOREIGN KEY ("newHireId") REFERENCES "NewHire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingChecklistItem" ADD CONSTRAINT "OnboardingChecklistItem_templateItemId_fkey" FOREIGN KEY ("templateItemId") REFERENCES "OnboardingChecklistTemplateItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingChecklistItem" ADD CONSTRAINT "OnboardingChecklistItem_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorPayoutDetails" ADD CONSTRAINT "ContractorPayoutDetails_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorPayoutRevealLog" ADD CONSTRAINT "ContractorPayoutRevealLog_payoutUserId_fkey" FOREIGN KEY ("payoutUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorPayoutRevealLog" ADD CONSTRAINT "ContractorPayoutRevealLog_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

