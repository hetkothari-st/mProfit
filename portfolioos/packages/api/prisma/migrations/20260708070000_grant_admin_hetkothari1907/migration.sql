-- One-time data grant, not a schema change: founder/QA account needs
-- ADMIN role to bypass plan-tier gates for billing QA (see
-- requireFeature / dev-set-plan). Landed as a migration rather than a
-- manual DB write because manual writes only reached the local/dev
-- Postgres — this app's actual production database is only reachable
-- from inside Railway's network, and `prisma migrate deploy` (run
-- automatically by packages/api/start.sh on every boot) is the one
-- proven path that touches it. Idempotent — safe to no-op if already
-- applied or if the row doesn't exist.
UPDATE "User" SET role = 'ADMIN' WHERE email = 'hetkothari1907@gmail.com';
