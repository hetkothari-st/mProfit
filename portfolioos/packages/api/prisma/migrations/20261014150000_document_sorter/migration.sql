-- Document sorter (docs/superpowers/specs/2026-10-14-document-sorter-design.md).
-- Additive: one new table, nullable columns on "Document".
CREATE TYPE "SortDocType" AS ENUM ('ITR','FORM_16','INCOME_CERTIFICATE','BANK_STATEMENT','SALARY_SLIP','CAS','CONTRACT_NOTE','INSURANCE','FD_CERTIFICATE','ID_PROOF','OTHER');
CREATE TYPE "SortStatus" AS ENUM ('PROCESSING','FILED','NEEDS_REVIEW','NEEDS_PASSWORD','FAILED');

CREATE TABLE "DocumentPerson" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "panLast4" TEXT,
    "linkedUserId" TEXT,
    "autoCreated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentPerson_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentPerson_userId_nameKey_key" ON "DocumentPerson"("userId", "nameKey");
ALTER TABLE "DocumentPerson" ADD CONSTRAINT "DocumentPerson_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Document"
  ADD COLUMN "personId" TEXT,
  ADD COLUMN "docType" "SortDocType",
  ADD COLUMN "docDate" DATE,
  ADD COLUMN "contentHash" TEXT,
  ADD COLUMN "sortStatus" "SortStatus",
  ADD COLUMN "sortReason" TEXT;
ALTER TABLE "Document" ADD CONSTRAINT "Document_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "DocumentPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Document_userId_contentHash_key" ON "Document"("userId", "contentHash");
CREATE INDEX "Document_userId_personId_docType_idx" ON "Document"("userId", "personId", "docType");

-- Owner-only, the same shape as "Will" (20261014120000_will_maker).
ALTER TABLE "DocumentPerson" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentPerson" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS documentperson_owner ON "DocumentPerson";
CREATE POLICY documentperson_owner ON "DocumentPerson"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
