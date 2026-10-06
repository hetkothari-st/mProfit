-- Per-user data keys (lib/userKeys.ts) and sealed vault files. Additive.
--
-- UserDataKey holds each user's data key wrapped by the KEK; the KEK is
-- derived from APP_ENCRYPTION_KEY and never stored here. DocumentBlob.keyed
-- marks rows whose bytes are sealed with the owner's key; existing rows stay
-- plaintext (keyed = false) until the boot backfill re-writes them.

CREATE TABLE "UserDataKey" (
    "userId"     TEXT NOT NULL,
    "wrappedKey" TEXT NOT NULL,
    "kekVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserDataKey_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "UserDataKey" ADD CONSTRAINT "UserDataKey_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keys are read and written in system context only (lib/userKeys runs every
-- query under runAsSystem); no user may read even their own wrapped key.
ALTER TABLE "UserDataKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserDataKey" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS userdatakey_system ON "UserDataKey";
CREATE POLICY userdatakey_system ON "UserDataKey"
  USING      (app_is_system())
  WITH CHECK (app_is_system());
GRANT SELECT, INSERT, UPDATE, DELETE ON "UserDataKey" TO portfolioos_app;

ALTER TABLE "DocumentBlob" ADD COLUMN "keyed" BOOLEAN NOT NULL DEFAULT false;
