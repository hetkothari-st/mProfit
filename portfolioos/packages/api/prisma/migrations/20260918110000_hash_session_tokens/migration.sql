-- Store refresh tokens as SHA-256 digests. Additive only.
--
-- RefreshToken.token held the raw bearer value, so a database dump or backup
-- yielded a directly usable session for every user, with no cracking step.
-- ExtensionPairing in this same schema already stores only SHA-256(bearer).
--
-- PasswordResetToken is deliberately NOT touched: since 20260917110000
-- (PR #91) its `token` column already holds an HMAC of the emailed reset
-- code, never the code itself. Hashing it again here would double-hash those
-- values and break every reset in flight.
--
-- Plain SHA-256 (not a keyed HMAC) is correct here. Unlike a PAN or a phone
-- number, these tokens are 32 random bytes, so there is no low-entropy input
-- space to brute-force, and hashing in SQL avoids any dependency on an
-- application key at migration time.
--
-- Existing sessions keep working: every live token is hashed in place, and
-- the new code looks tokens up by digest. The migration runs in the same
-- container immediately before the new code starts (packages/api/start.sh).
--
-- What this deliberately does NOT do: clear or drop the plaintext `token`
-- column. Per CLAUDE.md §0.4, dropping a column or running a mass data
-- operation needs explicit approval first. New tokens are never written in
-- plaintext from this release on, and every pre-existing one expires on its
-- own within 30 days, after which a plaintext value is inert.
-- The follow-up that clears and drops the column is prepared separately and
-- waits for that approval.

ALTER TABLE "RefreshToken"       ADD COLUMN "tokenHash" TEXT;

UPDATE "RefreshToken"
   SET "tokenHash" = encode(sha256(convert_to("token", 'UTF8')), 'hex')
 WHERE "token" IS NOT NULL;

ALTER TABLE "RefreshToken"       ALTER COLUMN "tokenHash" SET NOT NULL;

CREATE UNIQUE INDEX "RefreshToken_tokenHash_key"       ON "RefreshToken"("tokenHash");

-- New rows no longer carry plaintext, so the column must accept NULL.
ALTER TABLE "RefreshToken"       ALTER COLUMN "token" DROP NOT NULL;
