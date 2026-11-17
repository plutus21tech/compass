-- Profile "about me" answers. Additive only: one new table.
-- CreateTable
CREATE TABLE "ProfileDetail" (
    "userId" TEXT NOT NULL,
    "bio" TEXT,
    "hobbies" TEXT,
    "funFact" TEXT,
    "askMeAbout" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileDetail_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "ProfileDetail" ADD CONSTRAINT "ProfileDetail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
