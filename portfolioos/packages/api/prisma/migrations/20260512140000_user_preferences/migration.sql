-- Add UI preferences column to User.
--
-- Stores the per-user sidebar asset-class order + visibility (and other
-- frontend prefs over time) as JSONB so the schema stays open-ended. Was
-- introduced by commit 862a7a0 ("feat(db): add User.preferences Json
-- column for sidebar prefs") but the migration file was never created,
-- which broke production: `prisma migrate deploy` ran cleanly with
-- nothing to apply, the Prisma client expected the column, and every
-- `SELECT * FROM "User"` (including /api/auth/login) returned a 500
-- because Postgres said the column didn't exist.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferences" JSONB;
