# Phase 4.5 — Hardening Sprint Progress

Tracks every task in CLAUDE.md §5.1. Update when a task flips status (in
particular, when it completes). Each row points at the commits that landed the
work so history is auditable.

**Sprint started:** 2026-04-20
**Gate history:**
- G1 (audit approved) — ✅ passed before task 0
- G2 (pre-migration review) — ✅ passed before task 3 apply
- G3 (production migration) — not yet relevant (no hosted environment)
- G4 (enable RLS on existing tables) — ⏳ **PENDING** (currently blocking task 11)

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
| 11 | Postgres RLS on user-scoped tables | 🔄 **in_progress** | 2026-04-21 | — | `011f4fa` (WIP) | **Gate G4** — user approval before `prisma migrate dev` |
| 12 | Bull worker atomicity (bounded runtime, single tx commit) | ⏳ pending | — | — | — | blocked on task 11 |
| 13 | Linter rules + CI (no silent catch, money-type ban) | ⏳ pending | — | — | — | blocked on task 12 |

Legend: ✅ completed · 🔄 in_progress · ⏳ pending · ❌ blocked

---

## Task 11 — current step

- Code written (pre-commit `011f4fa`):
  - `prisma/migrations/20260421140000_phase_4_5_rls/migration.sql` with RLS
    policies + `app_current_user_id()` / `app_is_system()` helpers on all 24
    user-scoped tables.
  - `src/lib/requestContext.ts` — AsyncLocalStorage `userContext`,
    `runAsUser`, `runAsSystem`, `enterUserContext`.
  - `src/lib/prisma.ts` — `$extends.$allOperations` hook that opens a short
    interactive transaction and calls `SELECT set_config(…, true)`.
  - `src/middleware/authenticate.ts` — wraps `next()` in `userContext.run`.
  - `jobs/startupSync.ts`, `jobs/priceJobs.ts`, `jobs/importWorker.ts`,
    `jobs/mailboxPoller.ts` — wrapped in `runAsSystem` / `runAsUser` at the
    right boundaries.
  - `test/helpers/db.ts` — setup/cleanup in `runAsSystem`, auto-enters user
    context for the scope.
  - `test/invariants/rls-isolation.test.ts` — new cross-tenant invariant (7
    assertions including insert-with-foreign-userId rejection).
- **Remaining before task 11 closes:**
  1. Typecheck clean (`pnpm -C packages/api exec tsc --noEmit`).
  2. Pre-migration test suite green (confirms no regression from the
     extension + context wiring on the current DB).
  3. Gate G4 approval.
  4. `pnpm -C packages/api exec prisma migrate dev` to apply the RLS
     migration.
  5. Re-run test suite under RLS; confirm `rls-isolation.test.ts` passes and
     the other invariant suites still pass.
  6. Replace WIP commit with a proper `feat(security): Postgres RLS …`
     commit (either `--amend` if still just `011f4fa`, or a follow-up).

## Exit criteria (§5.2)

All invariant tests pass, full test suite green, 50-item manual QA checklist
green. Tracked in `test/manual-qa-phase-4-5.md` (to be filled out before
leaving phase 4.5).
