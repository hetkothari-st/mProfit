# CLAUDE.md — EveryPaisa

Instructions for AI coding agents (and a quick orientation for humans) working in this repo.

## What this is

EveryPaisa (code name PortfolioOS) is a web app where Indian investors track their whole net worth: stocks, mutual
funds, F&O, PF/PPF, property, rentals, insurance, loans, vehicles and more. It also covers tax reports,
accounting, family sharing and an AI assistant. It's a pnpm monorepo under `portfolioos/` (React web app, Express +
Prisma API, shared package), with a browser extension in `extension/`.

## Start here

**Read [`portfolioos/ARCHITECTURE.md`](portfolioos/ARCHITECTURE.md) first.** It explains every folder, how a request
flows, where new code goes, and has a feature index mapping every area to its route, controller, service, job,
web page and web client files. Then read [`portfolioos/CONTEXT.md`](portfolioos/CONTEXT.md), the in-depth guide to
the invariants, row-level security, the family layer, billing, the data model and each feature's domain rules.

Older plans and audits (the v1 greenfield spec, the v2 hardening plan, the Phase 4 audit, the progress log) live in
`docs/history/`. They're useful background, but they aren't instructions.

## Commands (run from `portfolioos/`)

```bash
pnpm install
pnpm --filter @everypaisa/api prisma:generate      # after install / schema change
pnpm --filter @everypaisa/shared build             # before trusting typecheck in a fresh checkout
pnpm dev                                           # api + web (needs Postgres + Redis: docker compose up -d)
pnpm -r run lint && pnpm -r run typecheck && pnpm -r run build
pnpm -r run test                                   # API tests need Postgres + Redis; see packages/api/TESTING.md
```

## Where code goes

- `packages/api/src/ingestion/<source>/` holds code that talks to an outside source and turns its data into our
  shapes: fetchers, scrapers, OAuth clients, parsers.
- `packages/api/src/services/<feature>/` holds business logic, DB reads and writes, maths, and workflows.
- `packages/api/src/priceFeeds/` holds market-data fetchers.
- A new API area adds `routes/<feature>.routes.ts`, `controllers/<feature>.controller.ts` and
  `services/<feature>/`, and mounts the router in `routes/index.ts`.
- Move files with `packages/api/scripts/moveFiles.ts` (it fixes imports, including `vi.mock` paths). Then run
  `node scripts/feature-index.mjs --write` to refresh the map.

## Rules still in force

- **Money is `Decimal`, never `Number`.** Use `decimal.js` or `Prisma.Decimal` in code, and send money across the
  API as strings. Lint rule `everypaisa/no-money-coercion`.
- **Holdings are derived.** They're recomputed from transactions and corporate actions; never patch a holding in
  place.
- **Ingestion is idempotent.** Every imported row carries a deterministic `sourceHash`, so re-importing the same
  file or email creates zero new rows.
- **Parsers are versioned.** Every row carries `{sourceAdapter, sourceAdapterVer}`. A format change bumps the
  version; it never rewrites the parser in place.
- **Use the dead-letter queue, don't crash.** Parse failures go to `IngestionFailure` with the raw payload, and
  the job carries on.
- **Row-level security is on.** User-scoped tables have Postgres RLS. Tests run as the non-superuser role
  `portfolioos_app`.
- **Log sensitive actions.** Logins, PII views, exports and OAuth grants each write an `AuditLog` row.
- **No secrets in code or `.env.example`.** Use placeholders only.
- **No silent `catch`.** Handle the error, send it to the DLQ, or rethrow. Lint rule `everypaisa/no-silent-catch`.
- **No `any`.** Use `unknown` and narrow it.
- **Test first for parsers and bug fixes.** Write a failing test, then the fix.

## Workflow

- Many agents work in this repo at once. Do branch work in a separate git worktree off `origin/main`, never by
  switching branches in the shared checkout.
- Gate merges on tests, chaining with `&&` (never `;`). Note: GitHub runs only the security workflows (root
  `.github/`), so you have to run the test suite yourself.
- **Merging to `main` deploys, and deploying runs `prisma migrate deploy` on boot.** A merged migration is a
  production migration.
- Commits follow Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`), one logical
  change per commit.
- Ask before destructive DB operations, auth changes, or anything that touches production.
