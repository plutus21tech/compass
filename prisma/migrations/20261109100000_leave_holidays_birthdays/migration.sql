-- Leave-calendar holidays and employee birthdays. Additive only: two new tables.

-- CreateTable
CREATE TABLE "LeaveHoliday" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "teamTags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeBirthday" (
    "userId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeBirthday_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "LeaveHoliday_date_idx" ON "LeaveHoliday"("date");

-- AddForeignKey
ALTER TABLE "EmployeeBirthday" ADD CONSTRAINT "EmployeeBirthday_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
