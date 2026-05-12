-- Phase 5-E: Bank Accounts.
--
-- First-class entity (parallel to CreditCard). Stores bank metadata,
-- optional joint holders, nominee, linked debit card last 4, and a
-- current-balance snapshot. Historical balances live in
-- BankBalanceSnapshot for the detail page's balance chart.
--
-- CashFlow gains an optional bankAccountId attribution column so
-- Gmail-derived UPI/NEFT/INTEREST events can be linked to the right
-- account (matching on accountLast4 from CanonicalEvent metadata).
--
-- RLS: both new tables follow the §3.6 pattern used by all other
-- user-scoped tables.

-- ── BankAccount ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "BankAccount" (
  "id"              TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "portfolioId"     TEXT,
  "bankName"        TEXT NOT NULL,
  "accountType"     TEXT NOT NULL,
  "accountHolder"   TEXT NOT NULL,
  "last4"           TEXT NOT NULL,
  "ifsc"            TEXT,
  "branch"          TEXT,
  "nickname"        TEXT,
  "jointHolders"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "nomineeName"     TEXT,
  "nomineeRelation" TEXT,
  "debitCardLast4"  TEXT,
  "debitCardExpiry" TEXT,
  "currentBalance"  DECIMAL(14,2),
  "balanceAsOf"     TIMESTAMP(3),
  "balanceSource"   TEXT,
  "status"          TEXT NOT NULL DEFAULT 'ACTIVE',
  "openedOn"        DATE,
  "closedOn"        DATE,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BankAccount_userId_bankName_last4_key" UNIQUE ("userId", "bankName", "last4"),
  CONSTRAINT "BankAccount_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BankAccount_portfolioId_fkey"
    FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "BankAccount_userId_status_idx" ON "BankAccount"("userId", "status");

ALTER TABLE "BankAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankAccount" FORCE  ROW LEVEL SECURITY;
CREATE POLICY bankaccount_owner ON "BankAccount"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "BankAccount" TO portfolioos_app;

-- ── BankBalanceSnapshot ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "BankBalanceSnapshot" (
  "id"               TEXT NOT NULL,
  "accountId"        TEXT NOT NULL,
  "asOfDate"         DATE NOT NULL,
  "balance"          DECIMAL(14,2) NOT NULL,
  "source"           TEXT NOT NULL,
  "canonicalEventId" TEXT,
  "note"             TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BankBalanceSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BankBalanceSnapshot_accountId_asOfDate_key" UNIQUE ("accountId", "asOfDate"),
  CONSTRAINT "BankBalanceSnapshot_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "BankBalanceSnapshot_accountId_asOfDate_idx"
  ON "BankBalanceSnapshot"("accountId", "asOfDate");

-- Snapshot RLS rides on BankAccount ownership via a join. We grant
-- table-level access and rely on the parent's RLS to filter; an
-- explicit USING clause keeps things tight in case some query
-- bypasses the join.
ALTER TABLE "BankBalanceSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankBalanceSnapshot" FORCE  ROW LEVEL SECURITY;
CREATE POLICY bankbalancesnapshot_owner ON "BankBalanceSnapshot"
  USING (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "BankAccount" ba
      WHERE ba."id" = "BankBalanceSnapshot"."accountId"
        AND ba."userId" = app_current_user_id()
    )
  )
  WITH CHECK (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "BankAccount" ba
      WHERE ba."id" = "BankBalanceSnapshot"."accountId"
        AND ba."userId" = app_current_user_id()
    )
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON "BankBalanceSnapshot" TO portfolioos_app;

-- ── CashFlow: add bankAccountId attribution column ──────────────────
ALTER TABLE "CashFlow" ADD COLUMN IF NOT EXISTS "bankAccountId" TEXT;
ALTER TABLE "CashFlow"
  ADD CONSTRAINT "CashFlow_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "CashFlow_bankAccountId_date_idx"
  ON "CashFlow"("bankAccountId", "date");
