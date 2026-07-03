-- CreateTable
CREATE TABLE "SystemFmvSeed" (
    "isin" TEXT NOT NULL,
    "scripName" TEXT,
    "fmvPerUnit" DECIMAL(18,4) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemFmvSeed_pkey" PRIMARY KEY ("isin")
);
