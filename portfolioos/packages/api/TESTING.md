# Running the API tests

The suite is green only against an environment that matches production in the
two ways the code depends on.

## 1. A database role that does NOT bypass RLS

Every user-scoped table has a row-level-security policy, and the application
connects as `portfolioos_app` (`NOSUPERUSER NOBYPASSRLS`, created by the
`20260421150000_phase_4_5_rls_app_role` migration).

Connecting the tests as `postgres` silently disables the entire security
layer: superusers bypass RLS, so the isolation invariants pass for the wrong
reason and bugs that only appear under a restricted role stay hidden. A
missing loan-EMI voucher hid there until the suite was first run as the app
role — the query filtered `LoanPayment` through its parent `Loan`, whose
policy matched nothing because no session context is set for a model outside
`USER_SCOPED_MODELS`.

```bash
docker run -d --name ep-test-db -e POSTGRES_PASSWORD=test -e POSTGRES_DB=eptest \
  -p 55502:5432 postgres:15

# Migrations create the app role (dev password) and the policies.
DATABASE_URL=postgresql://postgres:test@localhost:55502/eptest \
DIRECT_URL=postgresql://postgres:test@localhost:55502/eptest \
  npx prisma migrate deploy
```

Then run the suite as the app role, keeping `DIRECT_URL` on the owner so
migrations and the break-glass system context still work:

```bash
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:55502/eptest \
DIRECT_URL=postgresql://postgres:test@localhost:55502/eptest \
  npm test
```

### The app role's password is a local default

`20260421150000_phase_4_5_rls_app_role` creates `portfolioos_app` with the
password `portfolioos_app_dev`, which is fine for a database on your laptop and
unsafe anywhere reachable — it is in this repository, so it is not a secret.
Production ran on it, through the database's public proxy, until 2026-09-21.

Any database that is reachable gets its own password, set by hand after the
migrations run:

```sql
ALTER ROLE portfolioos_app WITH PASSWORD '<generated>';
```

…and `DATABASE_URL` updated to match. The API refuses to boot in production
while either connection string still carries the committed default (see
`collectProductionSecretProblems`), so this cannot be forgotten quietly. The
migration cannot simply be changed: it has been applied, and editing an applied
migration's checksum makes `prisma migrate deploy` refuse to run.

## 2. Redis

The CA import-job test goes through the real ingestion path, which enqueues
work. Without Redis it times out after 30s rather than failing with a
message.

```bash
docker run -d --name ep-test-redis -p 6379:6379 redis:7-alpine
```

## What each layer covers

- `test/invariants` — the architecture rules (RLS isolation and context
  coverage, idempotency, decimal precision, capital-gains recompute).
- `test/services`, `test/adapters`, `test/ingestion` — behaviour, per unit.
- `test/smoke/reportRoutes.smoke.test.ts` — every report route driven in every
  format against a seeded user. Catches reports that compute correctly and
  then fail to render, which unit tests cannot see.
