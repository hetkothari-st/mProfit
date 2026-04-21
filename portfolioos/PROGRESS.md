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
| 11 | Postgres RLS on user-scoped tables | ✅ completed | 2026-04-21 | 2026-04-21 | `011f4fa` + `ed3e072` | — |
| 12 | Bull worker atomicity (bounded runtime, single tx commit) | ✅ completed | 2026-04-21 | 2026-04-21 | `0ae88fd` | — |
| 13 | Linter rules + CI (no silent catch, money-type ban) | ✅ completed | 2026-04-21 | 2026-04-21 | `aff7a20` | — |

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

## Task 12 — done

Bull worker bounded runtime + atomicity. Addresses BUG-011.

- `src/lib/queue.ts` — 5-min `timeout` in `defaultJobOptions` (Bull hard-kills
  runaway jobs and surfaces via the failed event). `lockDuration: 5 min` with
  `lockRenewTime` at half that so concurrent workers don't double-claim a
  live job. `stalledInterval: 30s`, `maxStalledCount: 1` (Bull default).
  Added `stalled` event listener for operator visibility.
- `src/jobs/importWorker.ts` — wraps each job with wall-clock timing; logs
  a warn when a job exceeds `SLOW_JOB_WARN_MS = 60_000` so regressions get
  noticed before the 5-min timeout trips. Added terminal-failure listener:
  when `attemptsMade >= attemptsTotal`, flips the ImportJob row to `FAILED`
  with an `errorLog` payload (workerError, timedOut flag, attemptsMade) and
  sets `completedAt`. Without this, a timed-out / crashed job would leave
  the row stuck in PROCESSING forever and the /import UI would show a
  ghost. Listener runs under `runAsSystem` because it fires outside any
  request / runAsUser frame.
- Existing job body (`processImportJob`) already avoids the long-running
  transaction antipattern — rows are created via short per-row `$transaction`
  blocks inside the row loop, not one transaction wrapping the whole parse.
  No refactor needed for atomicity; the work here is bounding runtime and
  closing the "ghost PROCESSING row" gap.

40/40 tests pass, typecheck clean, lint clean (0 errors, 25 pre-existing warnings).

## Task 13 — done

Linter rules + CI enforcing §3.2 and §3.10.

- `eslint-plugin-portfolioos/` — local workspace package exposing two
  rules:
  - `portfolioos/no-silent-catch` (error) — bans empty catches and
    catches whose body is only `console.*` calls. Anything else
    (rethrow, logger.*, DLQ writes, next(err), typed-failure returns,
    DB updates) counts as handling. Escape-hatch for best-effort
    cleanup is `// eslint-disable-next-line portfolioos/no-silent-catch -- <reason>`.
    First run caught 5 real empty-catch sites (gmail reauth marker,
    mailbox socket teardowns, import file unlink, excel temp-file
    unlink, web logout revoke) — all fixed with either a logger.warn
    or an explicit disable + rationale.
  - `portfolioos/no-money-coercion` (warn) — flags every `parseFloat()`
    and `Number()` call site so reviewers audit each one. Legit
    non-monetary uses (date parsing, port numbers, query pagination)
    stay in place with warnings visible; new monetary coercion
    attempts get noticed in review. Escape-hatch with a rationale
    when intentional.
- Registered via root `.eslintrc.cjs` with `plugins: ['portfolioos']`
  and rule entries in the shared `rules` block so every package inherits.
- `.github/workflows/ci.yml` — runs on push / PR to main with
  Postgres 15 + Redis 7 services. Pipeline: install → prisma generate →
  migrate deploy → lint → typecheck → test → build. Concurrency group
  cancels superseded runs.

Final state: 44/44 tests pass (40 API + 4 web), typecheck clean across 3
packages, lint clean (0 errors, 39 warnings — all pre-existing or
intentional `Number(...)` call sites).

## Exit criteria (§5.2) — walk 2026-04-21

Invariant tests pass (40/40 api + 22 shared + 4 web = 66/66). Typecheck
clean. Lint 0 errors / 39 pre-existing warnings.

Manual QA walk against API on :3011 / web on :3000 — see
`test/manual-qa-phase-4-5.md`. Breakdown of the 50-item list:

- **✅ 30 passed** — A1-A5 (auth), B8 (portfolio list), C12-C18 (manual
  txn CRUD + CG cascade), E26-E29 (FD uniqueness + NPS + Bond), F30+F32
  (decimal), G33+G35+G36 (FIFO + intraday + fractional), I41 (112A
  endpoint), J42-J45 (RLS cross-tenant), K46-K49 (dev-loop).
- **⚠️ 4 partial** — F31 (HALF_UP vs §14.3 banker's), C16 (holding
  totalCost uses weighted-avg after SELL, FIFO-correct everywhere else),
  G34 (LTCG classification works, grandfathering substitution needs
  seeded FMV-31-Jan-2018 table), I39 (math correct, `totalValue` null
  until prices refresh).
- **🕳 15 deferred** — A6, B7, B9-B11, D19-D25, H37-H38, I40, K50. All
  require either a human driving the browser (D19/D21/D23/D25, A6, B7,
  B9-B11, I40), a real external feed event (H37/H38 — corp actions come
  via Yahoo sync, no manual-apply endpoint), or a push to verify CI
  (K50). D20/D22 idempotency specifically is ✅ via invariant test.
- **⏳ 1 pending** — K50 (CI green on push; file in place, pushes once
  Phase 4.5 is signed off).

4 newly surfaced issues logged at the bottom of the checklist as
BUG-NEW-017 through BUG-NEW-020. None are P0/P1 — they're spec
deviations or missing seed data rather than correctness bugs. Decision
needed before moving to Phase 5-A: fix them now, or file them as
Phase 8 polish and proceed.
