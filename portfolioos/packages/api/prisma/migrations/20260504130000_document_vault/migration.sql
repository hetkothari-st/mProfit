-- Document vault — per-user file storage with polymorphic owner reference
-- and OnlyOffice DocumentServer integration key.
--
-- Files live under ${UPLOAD_DIR}/user_${userId}/${storageKey} (BUG-015).
-- Reads/writes always go through the authenticated download endpoint that
-- joins this row back to the requesting user before streaming bytes.

CREATE TYPE "DocumentOwnerType" AS ENUM (
  'RENTAL_PROPERTY',
  'TENANCY',
  'VEHICLE',
  'INSURANCE_POLICY',
  'PORTFOLIO',
  'OTHER'
);

CREATE TABLE "Document" (
  "id"              TEXT PRIMARY KEY,
  "userId"          TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "ownerType"       "DocumentOwnerType" NOT NULL,
  "ownerId"         TEXT NOT NULL,
  "category"        TEXT,
  "fileName"        TEXT NOT NULL,
  "mimeType"        TEXT NOT NULL,
  "sizeBytes"       INTEGER NOT NULL,
  "storageKey"      TEXT NOT NULL,
  "externalEditKey" TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");
CREATE UNIQUE INDEX "Document_externalEditKey_key" ON "Document"("externalEditKey");
CREATE INDEX "Document_userId_ownerType_ownerId_idx"
  ON "Document"("userId", "ownerType", "ownerId");
CREATE INDEX "Document_userId_createdAt_idx" ON "Document"("userId", "createdAt");

-- §3.6 RLS: Document carries userId directly.
-- Functions app_is_system() / app_current_user_id() are created by
-- 20260421140000_phase_4_5_rls. Wrap in DO so this migration is also safe
-- on managed Postgres (Neon) where that earlier migration may have been
-- applied out-of-band and the helper functions might not exist yet.
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'app_current_user_id'
  ) THEN
    EXECUTE 'ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE "Document" FORCE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY document_owner ON "Document"
      USING (app_is_system() OR "userId" = app_current_user_id())
      WITH CHECK (app_is_system() OR "userId" = app_current_user_id())';
  END IF;
END
$do$;

-- Skip GRANT when running on a managed DB that doesn't have the
-- portfolioos_app role (e.g. Neon). Default privileges from the earlier
-- ALTER DEFAULT PRIVILEGES would have covered it anyway.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolioos_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "Document" TO portfolioos_app';
  END IF;
END
$do$;
