-- Spending store: one normalised row per bank or card movement, rebuilt from
-- its sources (bank-alert events now; statements and Finvu later). Additive.

CREATE TABLE "SpendTxn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceAdapter" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "accountKey" TEXT,
    "txnDate" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "direction" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "narration" TEXT,
    "counterparty" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "duplicateOfId" TEXT,
    "excludeReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "SpendTxn_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpendTxn_userId_source_sourceRef_key" ON "SpendTxn"("userId", "source", "sourceRef");
CREATE INDEX "SpendTxn_userId_txnDate_idx" ON "SpendTxn"("userId", "txnDate");

ALTER TABLE "SpendTxn" ADD CONSTRAINT "SpendTxn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security: each user sees only their own rows.
ALTER TABLE "SpendTxn" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpendTxn" FORCE ROW LEVEL SECURITY;
CREATE POLICY spendtxn_owner ON "SpendTxn"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolioos_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "SpendTxn" TO portfolioos_app';
  END IF;
END
$do$;
