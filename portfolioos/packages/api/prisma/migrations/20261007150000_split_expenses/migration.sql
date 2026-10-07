-- CreateEnum
CREATE TYPE "SplitGroupType" AS ENUM ('TRIP', 'HOME', 'COUPLE', 'OTHER', 'DIRECT');

-- CreateEnum
CREATE TYPE "SplitMode" AS ENUM ('EQUAL', 'EXACT', 'PERCENT', 'SHARES');

-- CreateEnum
CREATE TYPE "SplitSource" AS ENUM ('MANUAL', 'RECEIPT_OCR', 'EMAIL', 'SMS', 'PASTE');

-- CreateEnum
CREATE TYPE "SplitSettleMethod" AS ENUM ('CASH', 'UPI', 'OTHER');

-- CreateEnum
CREATE TYPE "SplitDetectionSource" AS ENUM ('EMAIL', 'SMS', 'PASTE', 'RECEIPT');

-- CreateEnum
CREATE TYPE "SplitDetectionStatus" AS ENUM ('NEW', 'SPLIT', 'SETTLED', 'DISMISSED');

-- CreateTable
CREATE TABLE "SplitContact" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "emailEnc" TEXT,
    "emailHash" TEXT,
    "phone" TEXT,
    "phoneEnc" TEXT,
    "phoneHash" TEXT,
    "upiId" TEXT,
    "linkedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SplitContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SplitGroupType" NOT NULL DEFAULT 'OTHER',
    "baseCurrency" TEXT NOT NULL DEFAULT 'INR',
    "simplifyDebts" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SplitGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "contactId" TEXT,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SplitMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitExpense" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "fxRate" DECIMAL(18,8) NOT NULL,
    "baseAmount" DECIMAL(18,4) NOT NULL,
    "splitMode" "SplitMode" NOT NULL,
    "createdById" TEXT NOT NULL,
    "receiptBlobId" TEXT,
    "sourceType" "SplitSource" NOT NULL DEFAULT 'MANUAL',
    "detectionId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SplitExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitPayer" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "baseAmount" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "SplitPayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitShare" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "baseAmount" DECIMAL(18,4) NOT NULL,
    "rawInput" DECIMAL(18,6),

    CONSTRAINT "SplitShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitLabel" (
    "id" TEXT NOT NULL,
    "groupId" TEXT,
    "ownerUserId" TEXT,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,

    CONSTRAINT "SplitLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitExpenseLabel" (
    "expenseId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,

    CONSTRAINT "SplitExpenseLabel_pkey" PRIMARY KEY ("expenseId","labelId")
);

-- CreateTable
CREATE TABLE "SplitComment" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SplitComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitSettlement" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "fromMemberId" TEXT NOT NULL,
    "toMemberId" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "fxRate" DECIMAL(18,8) NOT NULL,
    "baseAmount" DECIMAL(18,4) NOT NULL,
    "method" "SplitSettleMethod" NOT NULL,
    "date" DATE NOT NULL,
    "createdById" TEXT NOT NULL,
    "detectionId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SplitSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitActivity" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SplitActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitDetection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "SplitDetectionSource" NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "direction" TEXT NOT NULL,
    "merchant" TEXT,
    "payeeVpa" TEXT,
    "date" DATE NOT NULL,
    "rawRedactedEnc" TEXT,
    "canonicalEventId" TEXT,
    "status" "SplitDetectionStatus" NOT NULL DEFAULT 'NEW',
    "expenseId" TEXT,
    "settlementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SplitDetection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitShareLink" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cashFlowId" TEXT NOT NULL,

    CONSTRAINT "SplitShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitSettings" (
    "userId" TEXT NOT NULL,
    "upiId" TEXT,
    "homeCurrency" TEXT NOT NULL DEFAULT 'INR',
    "defaultPortfolioId" TEXT,
    "detectEmail" BOOLEAN NOT NULL DEFAULT false,
    "detectPaste" BOOLEAN NOT NULL DEFAULT true,
    "detectReceipt" BOOLEAN NOT NULL DEFAULT true,
    "detectSms" BOOLEAN NOT NULL DEFAULT false,
    "emailOnActivity" BOOLEAN NOT NULL DEFAULT true,
    "weeklyDigest" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SplitSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "SplitContact_ownerUserId_idx" ON "SplitContact"("ownerUserId");

-- CreateIndex
CREATE INDEX "SplitContact_emailHash_idx" ON "SplitContact"("emailHash");

-- CreateIndex
CREATE INDEX "SplitContact_phoneHash_idx" ON "SplitContact"("phoneHash");

-- CreateIndex
CREATE INDEX "SplitGroup_createdById_idx" ON "SplitGroup"("createdById");

-- CreateIndex
CREATE INDEX "SplitMember_userId_idx" ON "SplitMember"("userId");

-- CreateIndex
CREATE INDEX "SplitMember_groupId_idx" ON "SplitMember"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "SplitMember_groupId_userId_key" ON "SplitMember"("groupId", "userId");

-- CreateIndex
CREATE INDEX "SplitExpense_groupId_date_idx" ON "SplitExpense"("groupId", "date");

-- CreateIndex
CREATE INDEX "SplitPayer_expenseId_idx" ON "SplitPayer"("expenseId");

-- CreateIndex
CREATE INDEX "SplitShare_expenseId_idx" ON "SplitShare"("expenseId");

-- CreateIndex
CREATE INDEX "SplitComment_expenseId_createdAt_idx" ON "SplitComment"("expenseId", "createdAt");

-- CreateIndex
CREATE INDEX "SplitSettlement_groupId_date_idx" ON "SplitSettlement"("groupId", "date");

-- CreateIndex
CREATE INDEX "SplitActivity_groupId_createdAt_idx" ON "SplitActivity"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "SplitDetection_userId_status_date_idx" ON "SplitDetection"("userId", "status", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SplitDetection_userId_sourceHash_key" ON "SplitDetection"("userId", "sourceHash");

-- CreateIndex
CREATE UNIQUE INDEX "SplitShareLink_expenseId_userId_key" ON "SplitShareLink"("expenseId", "userId");

-- AddForeignKey
ALTER TABLE "SplitContact" ADD CONSTRAINT "SplitContact_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitMember" ADD CONSTRAINT "SplitMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SplitGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitMember" ADD CONSTRAINT "SplitMember_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "SplitContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitMember" ADD CONSTRAINT "SplitMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitExpense" ADD CONSTRAINT "SplitExpense_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SplitGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitPayer" ADD CONSTRAINT "SplitPayer_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "SplitExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitShare" ADD CONSTRAINT "SplitShare_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "SplitExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitLabel" ADD CONSTRAINT "SplitLabel_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SplitGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitExpenseLabel" ADD CONSTRAINT "SplitExpenseLabel_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "SplitExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitExpenseLabel" ADD CONSTRAINT "SplitExpenseLabel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "SplitLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitComment" ADD CONSTRAINT "SplitComment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "SplitExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitSettlement" ADD CONSTRAINT "SplitSettlement_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SplitGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitActivity" ADD CONSTRAINT "SplitActivity_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SplitGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitDetection" ADD CONSTRAINT "SplitDetection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitShareLink" ADD CONSTRAINT "SplitShareLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitSettings" ADD CONSTRAINT "SplitSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Split Expenses RLS ───────────────────────────────────────────────
-- A group's rows are visible to its current linked members. Membership checks
-- go through SECURITY DEFINER helpers so SplitMember's own policy can consult
-- SplitMember without re-entering itself (42P17; see
-- 20260903090000_fix_familymember_policy_recursion). Each helper answers only
-- about app_current_user_id(), so EXECUTE leaks nothing about other users.

CREATE OR REPLACE FUNCTION app_is_split_member(target_group_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM "SplitMember" m
    WHERE m."groupId" = target_group_id
      AND m."userId" = app_current_user_id()
      AND m."leftAt" IS NULL);
$$;

CREATE OR REPLACE FUNCTION app_is_split_group_creator(target_group_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM "SplitGroup" g
    WHERE g.id = target_group_id AND g."createdById" = app_current_user_id());
$$;

CREATE OR REPLACE FUNCTION app_split_expense_group(target_expense_id TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT e."groupId" FROM "SplitExpense" e WHERE e.id = target_expense_id;
$$;

-- True while a group has no member rows at all (the instant between the
-- group INSERT and the creator's member INSERT). SECURITY DEFINER so the
-- count is not filtered by SplitMember's own policy — under that policy a
-- creator who had left would see zero members and wrongly regain access.
CREATE OR REPLACE FUNCTION app_split_group_is_empty(target_group_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT NOT EXISTS (SELECT 1 FROM "SplitMember" m WHERE m."groupId" = target_group_id);
$$;

GRANT EXECUTE ON FUNCTION app_is_split_member(TEXT) TO portfolioos_app;
GRANT EXECUTE ON FUNCTION app_is_split_group_creator(TEXT) TO portfolioos_app;
GRANT EXECUTE ON FUNCTION app_split_expense_group(TEXT) TO portfolioos_app;
GRANT EXECUTE ON FUNCTION app_split_group_is_empty(TEXT) TO portfolioos_app;

-- SplitGroup. The creator clause exists because Prisma's INSERT … RETURNING
-- must satisfy the SELECT policy before the creator's member row exists.
ALTER TABLE "SplitGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SplitGroup" FORCE ROW LEVEL SECURITY;
CREATE POLICY splitgroup_access ON "SplitGroup"
  USING (app_is_system() OR app_is_split_member(id)
         OR ("createdById" = app_current_user_id() AND app_split_group_is_empty(id)))
  WITH CHECK (app_is_system() OR app_is_split_member(id)
         OR ("createdById" = app_current_user_id() AND app_split_group_is_empty(id)));

-- SplitMember. A user may insert their OWN row only into a group they created
-- (bootstrap); every other insert needs an existing membership. Knowing a
-- group id is not enough to join it. The own-row USING clause is needed for
-- the creator's INSERT … RETURNING: the STABLE helper runs on the statement's
-- starting snapshot and cannot see the row being inserted. It reveals only the
-- caller's own membership row, never the group's other rows.
ALTER TABLE "SplitMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SplitMember" FORCE ROW LEVEL SECURITY;
CREATE POLICY splitmember_access ON "SplitMember"
  USING (app_is_system() OR "userId" = app_current_user_id() OR app_is_split_member("groupId"))
  WITH CHECK (app_is_system() OR app_is_split_member("groupId")
              OR ("userId" = app_current_user_id() AND app_is_split_group_creator("groupId")));

-- Tables carrying groupId directly.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['SplitExpense','SplitSettlement','SplitActivity'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %s ON %I USING (app_is_system() OR app_is_split_member("groupId")) WITH CHECK (app_is_system() OR app_is_split_member("groupId"))', lower(t) || '_access', t);
  END LOOP;
END $$;

-- Tables hanging off an expense.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['SplitPayer','SplitShare','SplitExpenseLabel','SplitComment'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %s ON %I USING (app_is_system() OR app_is_split_member(app_split_expense_group("expenseId"))) WITH CHECK (app_is_system() OR app_is_split_member(app_split_expense_group("expenseId")))', lower(t) || '_access', t);
  END LOOP;
END $$;

-- Labels: group label (members) or personal label (owner).
ALTER TABLE "SplitLabel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SplitLabel" FORCE ROW LEVEL SECURITY;
CREATE POLICY splitlabel_access ON "SplitLabel"
  USING (app_is_system() OR ("groupId" IS NOT NULL AND app_is_split_member("groupId"))
         OR ("groupId" IS NULL AND "ownerUserId" = app_current_user_id()))
  WITH CHECK (app_is_system() OR ("groupId" IS NOT NULL AND app_is_split_member("groupId"))
         OR ("groupId" IS NULL AND "ownerUserId" = app_current_user_id()));

-- Owner-only tables.
ALTER TABLE "SplitContact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SplitContact" FORCE ROW LEVEL SECURITY;
CREATE POLICY splitcontact_owner ON "SplitContact"
  USING (app_is_system() OR "ownerUserId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "ownerUserId" = app_current_user_id());

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['SplitDetection','SplitShareLink','SplitSettings'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %s ON %I USING (app_is_system() OR "userId" = app_current_user_id()) WITH CHECK (app_is_system() OR "userId" = app_current_user_id())', lower(t) || '_owner', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "SplitContact","SplitGroup","SplitMember","SplitExpense","SplitPayer","SplitShare",
  "SplitLabel","SplitExpenseLabel","SplitComment","SplitSettlement","SplitActivity",
  "SplitDetection","SplitShareLink","SplitSettings"
TO portfolioos_app;
