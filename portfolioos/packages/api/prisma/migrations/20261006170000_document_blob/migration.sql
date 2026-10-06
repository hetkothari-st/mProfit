-- Vault file bytes move from the API container's disk (wiped by every
-- Railway deploy) into Postgres. One row per Document.storageKey.

CREATE TABLE "DocumentBlob" (
    "storageKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentBlob_pkey" PRIMARY KEY ("storageKey")
);

CREATE INDEX "DocumentBlob_userId_idx" ON "DocumentBlob"("userId");

ALTER TABLE "DocumentBlob" ADD CONSTRAINT "DocumentBlob_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Owner-only, the same policy as "Document".
ALTER TABLE "DocumentBlob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentBlob" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS documentblob_owner ON "DocumentBlob";
CREATE POLICY documentblob_owner ON "DocumentBlob"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "DocumentBlob" TO portfolioos_app;
