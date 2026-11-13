-- HR's "Mark watched" for a hire whose video won't load (R5): who, when and why. Additive and nullable.
-- AlterTable
ALTER TABLE "OnboardingProgress" ADD COLUMN     "markedWatchedAt" TIMESTAMP(3),
ADD COLUMN     "markedWatchedById" TEXT,
ADD COLUMN     "markedWatchedReason" TEXT;

-- AddForeignKey
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_markedWatchedById_fkey" FOREIGN KEY ("markedWatchedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

