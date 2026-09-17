-- Loans the user has given to others (receivables). Separate tables from Loan,
-- which every existing reader treats as a liability.

ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'LOAN_GIVEN_DUE';
ALTER TYPE "DocumentOwnerType" ADD VALUE IF NOT EXISTS 'LOAN_GIVEN';

CREATE TABLE "LoanGiven" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "borrowerName" TEXT NOT NULL,
    "borrowerContact" TEXT,
    "relationship" TEXT,
    "principalAmount" DECIMAL(14,2) NOT NULL,
    "lentOn" DATE NOT NULL,
    "interestRate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "dueDate" DATE,
    "repaymentMode" TEXT NOT NULL DEFAULT 'FLEXIBLE',
    "emiAmount" DECIMAL(12,2),
    "tenureMonths" INTEGER,
    "firstEmiDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "closedOn" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoanGiven_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoanGivenEntry" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoanGivenEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoanGiven_userId_status_idx" ON "LoanGiven"("userId", "status");
CREATE INDEX "LoanGivenEntry_loanId_date_idx" ON "LoanGivenEntry"("loanId", "date");

ALTER TABLE "LoanGiven" ADD CONSTRAINT "LoanGiven_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoanGivenEntry" ADD CONSTRAINT "LoanGivenEntry_loanId_fkey"
  FOREIGN KEY ("loanId") REFERENCES "LoanGiven"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same row-level security as Loan (20260903180000_rls_remaining_user_tables).
ALTER TABLE "LoanGiven" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoanGiven" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS loangiven_owner ON "LoanGiven";
CREATE POLICY loangiven_owner ON "LoanGiven"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "LoanGiven" TO portfolioos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "LoanGivenEntry" TO portfolioos_app;
