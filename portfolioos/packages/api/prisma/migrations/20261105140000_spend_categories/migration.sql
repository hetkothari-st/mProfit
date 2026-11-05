-- Spending categories (PIR pipeline step 4). Additive only.

ALTER TABLE "SpendTxn" ADD COLUMN "eventType" TEXT;
ALTER TABLE "SpendTxn" ADD COLUMN "category" TEXT;
ALTER TABLE "SpendTxn" ADD COLUMN "categorySrc" TEXT;
CREATE INDEX "SpendTxn_userId_category_idx" ON "SpendTxn"("userId", "category");

CREATE TABLE "SpendPayeeTag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payeeKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "SpendPayeeTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpendPayeeTag_userId_payeeKey_key" ON "SpendPayeeTag"("userId", "payeeKey");
ALTER TABLE "SpendPayeeTag" ADD CONSTRAINT "SpendPayeeTag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SpendPayeeTag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpendPayeeTag" FORCE ROW LEVEL SECURITY;
CREATE POLICY spendpayeetag_owner ON "SpendPayeeTag"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolioos_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "SpendPayeeTag" TO portfolioos_app';
  END IF;
END
$do$;
