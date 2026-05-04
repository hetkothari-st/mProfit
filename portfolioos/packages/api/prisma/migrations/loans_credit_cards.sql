-- Migration: Add Loans, LoanPayment, CreditCard, CreditCardStatement tables
-- Add LOAN_EMI_DUE and CREDIT_CARD_DUE to AlertType enum

-- Add new enum values (safe: only adds, never removes)
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'LOAN_EMI_DUE';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'CREDIT_CARD_DUE';

-- Create Loan table
CREATE TABLE IF NOT EXISTS "Loan" (
  "id"                 TEXT NOT NULL,
  "userId"             TEXT NOT NULL,
  "portfolioId"        TEXT,
  "lenderName"         TEXT NOT NULL,
  "accountNumber"      TEXT,
  "loanType"           TEXT NOT NULL,
  "borrowerName"       TEXT NOT NULL,
  "principalAmount"    DECIMAL(14,2) NOT NULL,
  "interestRate"       DECIMAL(6,4) NOT NULL,
  "tenureMonths"       INTEGER NOT NULL,
  "emiAmount"          DECIMAL(12,2) NOT NULL,
  "emiDueDay"          INTEGER NOT NULL DEFAULT 1,
  "disbursementDate"   DATE NOT NULL,
  "firstEmiDate"       DATE NOT NULL,
  "prepaymentOption"   TEXT NOT NULL DEFAULT 'REDUCE_TENURE',
  "vehicleId"          TEXT,
  "rentalPropertyId"   TEXT,
  "taxBenefitSection"  TEXT,
  "status"             TEXT NOT NULL DEFAULT 'ACTIVE',
  "closedDate"         DATE,
  "lenderMatchKey"     TEXT,
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "Loan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Loan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "Loan_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id"),
  CONSTRAINT "Loan_rentalPropertyId_fkey" FOREIGN KEY ("rentalPropertyId") REFERENCES "RentalProperty"("id")
);

CREATE INDEX IF NOT EXISTS "Loan_userId_status_idx" ON "Loan"("userId", "status");
CREATE INDEX IF NOT EXISTS "Loan_userId_lenderName_idx" ON "Loan"("userId", "lenderName");

-- Create LoanPayment table
CREATE TABLE IF NOT EXISTS "LoanPayment" (
  "id"               TEXT NOT NULL,
  "loanId"           TEXT NOT NULL,
  "paymentType"      TEXT NOT NULL,
  "paidOn"           DATE NOT NULL,
  "amount"           DECIMAL(12,2) NOT NULL,
  "principalPart"    DECIMAL(12,2),
  "interestPart"     DECIMAL(12,2),
  "forMonth"         TEXT,
  "canonicalEventId" TEXT,
  "notes"            TEXT,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "LoanPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LoanPayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "LoanPayment_loanId_paidOn_idx" ON "LoanPayment"("loanId", "paidOn");

-- Create CreditCard table
CREATE TABLE IF NOT EXISTS "CreditCard" (
  "id"                 TEXT NOT NULL,
  "userId"             TEXT NOT NULL,
  "issuerBank"         TEXT NOT NULL,
  "cardName"           TEXT NOT NULL,
  "last4"              TEXT NOT NULL,
  "network"            TEXT,
  "creditLimit"        DECIMAL(12,2) NOT NULL,
  "outstandingBalance" DECIMAL(12,2),
  "statementDay"       INTEGER NOT NULL,
  "dueDay"             INTEGER NOT NULL,
  "interestRate"       DECIMAL(6,4),
  "annualFee"          DECIMAL(10,2),
  "status"             TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "CreditCard_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreditCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "CreditCard_userId_status_idx" ON "CreditCard"("userId", "status");

-- Create CreditCardStatement table
CREATE TABLE IF NOT EXISTS "CreditCardStatement" (
  "id"               TEXT NOT NULL,
  "cardId"           TEXT NOT NULL,
  "forMonth"         TEXT NOT NULL,
  "statementAmount"  DECIMAL(12,2) NOT NULL,
  "minimumDue"       DECIMAL(12,2),
  "dueDate"          DATE NOT NULL,
  "paidAmount"       DECIMAL(12,2),
  "paidOn"           DATE,
  "status"           TEXT NOT NULL,
  "canonicalEventId" TEXT,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "CreditCardStatement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreditCardStatement_cardId_forMonth_key" UNIQUE ("cardId", "forMonth"),
  CONSTRAINT "CreditCardStatement_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "CreditCardStatement_dueDate_status_idx" ON "CreditCardStatement"("dueDate", "status");
