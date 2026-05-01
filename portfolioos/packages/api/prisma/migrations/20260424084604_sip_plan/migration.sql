-- CreateTable
CREATE TABLE "SipPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fundId" TEXT,
    "assetName" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "frequency" TEXT NOT NULL,
    "dayOfMonth" INTEGER,
    "startDate" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SipPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SipPlan_userId_isActive_idx" ON "SipPlan"("userId", "isActive");

-- AddForeignKey
ALTER TABLE "SipPlan" ADD CONSTRAINT "SipPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
