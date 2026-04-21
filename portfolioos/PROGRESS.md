# Phase 4.5 — Hardening Sprint Progress

Tracks every task in CLAUDE.md §5.1. Update when a task flips status (in
particular, when it completes). Each row points at the commits that landed the
work so history is auditable.

**Sprint started:** 2026-04-20
**Gate history:**
- G1 (audit approved) — ✅ passed before task 0
- G2 (pre-migration review) — ✅ passed before task 3 apply
- G3 (production migration) — not yet relevant (no hosted environment)
- G4 (enable RLS on existing tables) — ✅ passed during task 11 (Option A: dedicated non-superuser role)

---

## Task status

| # | Task | Status | Start | End | Commits | Blockers |
|---|---|---|---|---|---|---|
| 0 | Repair build/test/lint infra | ✅ completed | 2026-04-20 | 2026-04-20 | `99ae03e` | — |
| 1 | Invariant tests (failing-by-design) | ✅ completed | 2026-04-20 | 2026-04-20 | `82c70b9` | — |
| 2 | Decimal hardening (decimal.js, Money-as-string) | ✅ completed | 2026-04-20 | 2026-04-20 | `fef0b7c`, `0d7bcb4` | — |
| 3 | Schema migration §4.10 (assetKey, sourceHash, HoldingProjection backfill) | ✅ completed | 2026-04-20 | 2026-04-20 | `593ee70` | — |
| 4 | Holdings as projection | ✅ completed | 2026-04-20 | 2026-04-20 | `d1e25ff` | — |
| 5 | Idempotent importers (sourceHash) | ✅ completed | 2026-04-20 | 2026-04-20 | `e8ed645` | — |
| 6 | Fix Holding uniqueness via assetKey | ✅ completed | 2026-04-20 | 2026-04-20 | rolled into `593ee70` + `d1e25ff` | — |
| 7 | Adapter framework retrofit | ✅ completed | 2026-04-20 | 2026-04-20 | `740a1b5` | — |
| 8 | DLQ + IngestionFailure UI | ✅ completed | 2026-04-21 | 2026-04-21 | `d7dc609` | — |
| 9 | Golden test fixtures (≥5 per parser) | ✅ completed | 2026-04-21 | 2026-04-21 | `b768c28` | — |
| 10 | CG cascade on edit/delete | ✅ completed | 2026-04-20 | 2026-04-20 | `e7e65e0` | — |
| 11 | Postgres RLS on user-scoped tables | ✅ completed | 2026-04-21 | 2026-04-21 | `011f4fa` + `<pending>` | — |
| 12 | Bull worker atomicity (bounded runtime, single tx commit) | ⏳ pending | — | — | — | — |
| 13 | Linter rules + CI (no silent catch, money-type ban) | ⏳ pending | — | — | — | blocked on task 12 |

Legend: ✅ completed · 🔄 in_progress · ⏳ pending · ❌ blocked

---

## Task 11 — done

Landed via `011f4fa` + follow-up:

- `prisma/migrations/20260421140000_phase_4_5_rls/migration.sql` — RLS policies
  + `app_current_user_id()` / `app_is_system()` helpers on all 24 user-scoped
  tables (ENABLE + FORCE so the DB owner can't implicitly bypass).
- `prisma/migrations/20260421150000_phase_4_5_rls_app_role/migration.sql` —
  creates `portfolioos_app` login role (`NOSUPERUSER NOBYPASSRLS`) with
  table/sequence grants + `ALTER DEFAULT PRIVILEGES`. Runtime connects as this
  role via `DATABASE_URL`; migrations run as superuser via `DIRECT_URL`.
- `src/lib/requestContext.ts` — `userContext` AsyncLocalStorage stashed on
  `globalThis` so every test-file module graph observes the same instance
  (vitest's per-file isolation otherwise creates fresh ALS instances while the
  Prisma client stays cached on `globalThis` — the $extends hook then reads
  from the first file's ALS forever). `runAsUser` / `runAsSystem` wrap the
  callback in an inner `async () => await fn()` so the store survives
  Prisma's deferred-promise execution (the hook runs after `.run` has exited
  if fn is non-async).
- `src/lib/prisma.ts` — `$extends.$allOperations` hook opens a short
  interactive transaction and calls `SELECT set_config(…, true)`. `USER_SCOPED_MODELS`
  set lists the 24 tables that get wrapped; reference tables (StockMaster,
  MFNav, FXRate, CII) pass through unchanged.
- `src/middleware/authenticate.ts` — wraps `next()` in `userContext.run`.
- `jobs/startupSync.ts`, `jobs/priceJobs.ts`, `jobs/importWorker.ts`,
  `jobs/mailboxPoller.ts` — wrapped in `runAsSystem` / `runAsUser` at entry.
- `test/helpers/db.ts` — setup + cleanup in `runAsSystem`; tests wrap bodies
  in `scope.runAs(fn)` to opt into user context for the assertion phase.
- `test/invariants/rls-isolation.test.ts` — 7 cross-tenant assertions
  including insert-with-foreign-userId rejection.
- `vitest.config.ts` — `pool: 'forks'`, `singleFork: true`, `fileParallelism:
  false` so the async-context model is deterministic across files.

All 40 tests pass (7 files), typecheck clean, lint clean (0 errors).

## Exit criteria (§5.2)

All invariant tests pass, full test suite green, 50-item manual QA checklist
green. Tracked in `test/manual-qa-phase-4-5.md` (to be filled out before
leaving phase 4.5).
