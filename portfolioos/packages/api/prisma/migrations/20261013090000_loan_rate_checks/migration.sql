-- EMI plan 3 (spec s6): existing-loan checks. Additive only.
-- No GRANT: the table-level grants on "Loan" and "User" cover added columns
-- (test/invariants/loan-rate-check-columns.test.ts), and Loan's RLS policy is row-based.
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'LOAN_REFINANCE';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'LOAN_BENCHMARK_CHANGE';

ALTER TABLE "Loan" ADD COLUMN "rateType" TEXT NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "rateBenchmark" TEXT,
ADD COLUMN "nextRateResetDate" DATE;

ALTER TABLE "User" ADD COLUMN "loanRateAlerts" BOOLEAN NOT NULL DEFAULT true;
