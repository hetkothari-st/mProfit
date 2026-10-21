-- Insurance documents read from Gmail (with permission). Additive only.

CREATE TYPE "InsuranceDocKind" AS ENUM ('POLICY_DOCUMENT', 'PREMIUM_RECEIPT', 'RENEWAL_NOTICE', 'CLAIM_LETTER', 'OTHER');
CREATE TYPE "InsuranceDocStatus" AS ENUM ('PENDING', 'NEEDS_PASSWORD', 'READ', 'NEEDS_REVIEW', 'FAILED', 'MATCHED', 'SUGGESTED', 'FILED');

CREATE TABLE "InsuranceDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gmailDocId" TEXT,
    "fileName" TEXT NOT NULL,
    "blobKey" TEXT,
    "contentHash" TEXT NOT NULL,
    "fromAddress" TEXT,
    "receivedAt" TIMESTAMPTZ(3),
    "docKind" "InsuranceDocKind",
    "status" "InsuranceDocStatus" NOT NULL DEFAULT 'PENDING',
    "extract" JSONB,
    "problems" JSONB,
    "errorMessage" TEXT,
    "policyId" TEXT,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsuranceDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InsuranceDocument_gmailDocId_key" ON "InsuranceDocument"("gmailDocId");
CREATE UNIQUE INDEX "InsuranceDocument_userId_contentHash_key" ON "InsuranceDocument"("userId", "contentHash");
CREATE INDEX "InsuranceDocument_userId_status_idx" ON "InsuranceDocument"("userId", "status");

ALTER TABLE "InsuranceDocument" ADD CONSTRAINT "InsuranceDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security: a user's insurance documents are theirs alone.
ALTER TABLE "InsuranceDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InsuranceDocument" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS insurancedocument_owner ON "InsuranceDocument";
CREATE POLICY insurancedocument_owner ON "InsuranceDocument"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolioos_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "InsuranceDocument" TO portfolioos_app';
  END IF;
END
$do$;
