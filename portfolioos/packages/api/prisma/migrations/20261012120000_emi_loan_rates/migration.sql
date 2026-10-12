-- CreateTable
CREATE TABLE "LoanRateSource" (
    "id" TEXT NOT NULL,
    "lender" TEXT NOT NULL,
    "loanType" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "adapter" TEXT,
    "adapterVer" TEXT,
    "lastSuccessAt" TIMESTAMPTZ(3),
    "lastErrorAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanRateSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanRate" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "tenor" TEXT,
    "minRatePct" DECIMAL(6,3) NOT NULL,
    "maxRatePct" DECIMAL(6,3),
    "effectiveDate" DATE,
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origin" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "sourceAdapter" TEXT,
    "sourceAdapterVer" TEXT,

    CONSTRAINT "LoanRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkRate" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "lender" TEXT,
    "tenor" TEXT,
    "ratePct" DECIMAL(6,3) NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenchmarkRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoanRateSource_loanType_idx" ON "LoanRateSource"("loanType");

-- CreateIndex
CREATE INDEX "LoanRate_sourceId_status_fetchedAt_idx" ON "LoanRate"("sourceId", "status", "fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkRate_kind_lender_tenor_effectiveDate_key" ON "BenchmarkRate"("kind", "lender", "tenor", "effectiveDate");

-- AddForeignKey
ALTER TABLE "LoanRate" ADD CONSTRAINT "LoanRate_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "LoanRateSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
