-- A reopen keeps HR's Mark watched (R5) in history: who, when and why. Additive and nullable.
-- AlterTable
ALTER TABLE "OnboardingProgressHistory" ADD COLUMN     "markedWatchedAt" TIMESTAMP(3),
ADD COLUMN     "markedWatchedById" TEXT,
ADD COLUMN     "markedWatchedReason" TEXT;

