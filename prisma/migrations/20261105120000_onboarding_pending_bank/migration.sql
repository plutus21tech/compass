-- CreateTable
CREATE TABLE "OnboardingPendingBankDetails" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountTitle" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingPendingBankDetails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingPendingBankDetails_userId_key" ON "OnboardingPendingBankDetails"("userId");

-- AddForeignKey
ALTER TABLE "OnboardingPendingBankDetails" ADD CONSTRAINT "OnboardingPendingBankDetails_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

