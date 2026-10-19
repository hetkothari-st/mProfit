# Codebase Structure Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganise the EveryPaisa repo so a new developer can find any feature's code from one map, with backend code grouped by feature and one meaning per folder, without changing behaviour.

**Architecture:** First a committed move tool (`git mv` + rewrite of every relative/alias import, `vi.mock` and dynamic `import()` specifier). Then a docs PR (`ARCHITECTURE.md`, rewritten `CLAUDE.md`, one `docs/` home). Then small move-only PRs: ingestion side first, then backend feature folders, then the web `api/` client. Every PR is move + import-path changes + docs only.

**Tech Stack:** pnpm 9 workspaces, TypeScript (API: `NodeNext`, relative imports with `.js` suffix; web: Vite with `@/` alias, no suffix), Vitest, `tsx`, `gh` CLI.

**Spec:** `docs/superpowers/specs/2026-10-19-codebase-structure-design.md`

## Global Constraints

- No behaviour changes: only file moves, import specifier changes, path-string fixes that moves force, and docs.
- Never touch `packages/api/prisma/`, migrations, env var names, route URLs, DB names.
- Branch work only in a fresh worktree off `origin/main` (`git worktree add -b <branch> ../mProfit-structure-<slug> origin/main`), never in the shared checkout at `C:\Users\ST269\Desktop\mProfit - Copy`.
- Before trusting typecheck in a fresh worktree: `pnpm install`, `pnpm --filter @everypaisa/api prisma:generate`, `pnpm --filter @everypaisa/shared build`.
- Local gate: `pnpm -r run lint && pnpm -r run typecheck && pnpm -r run build` — chained with `&&`, never `;`.
- Test gate: CI (`portfolioos/.github/workflows/ci.yml` runs Postgres 15 + Redis 7 + `pnpm -r run test`). Merge only after `gh pr checks <n> --watch --fail-fast` exits 0: `gh pr checks <n> --watch --fail-fast && gh pr merge <n> --squash --delete-branch`.
- Push each PR's commits in a single push; after merge confirm with `git fetch origin && git merge-base --is-ancestor <last-commit> origin/main` (repo auto-merge can orphan later pushes).
- Open branches are not skipped or fixed by us. Every PR description has a `## Moved paths` section listing `old → new`, one per line.
- One feature folder = one commit. A PR groups 2–4 related features (plan call, to keep CI round-trips down; still small and reviewable).
- `git diff -M --stat origin/main` for every PR shows renames (`=>`), never delete + add of the same file.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. PR body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Review Focus

1. **Path strings outside import syntax** (Dockerfile `cp packages/api/src/adapters/vehicle/fixtures/dev.json`, `__dirname`/`import.meta.url` reads in `adapters/vehicle/mparivahan.ts`, `services/will/willFonts.ts`, `scripts/seedFmv.ts`, `jobs/mfReconciliationJob.ts`, `package.json` `tsx src/...` scripts) — the tool cannot see these. Every move task has a "leftover path grep" step that must return nothing.
2. **`vi.mock('…')` / `await import('…')` in tests** point at moved files. If they are left stale, the mock silently stops applying and the tests pass or fail for the wrong reason. Pinned by tool tests `rewrites vi.mock and dynamic import`.
3. **Destination already exists** (e.g. moving `reports.service.ts` into `services/reports/` where a same-named file may exist) → the tool must refuse, never overwrite. Pinned by tool test `throws when destination exists`.
4. **Test drift hidden by a red baseline.** If `main` CI is already red, a move PR can't prove anything. Before each PR, check `gh run list --branch main --workflow ci.yml -L 1`. If it's red, record the failing tests and require the PR's failing set to be identical.
5. **Files with the same basename in two moved folders** (e.g. `types.ts`, `chain.ts`) → resolution must use full paths, not basenames. Pinned by tool test `resolves by full path not basename`.

---

### Task 1: Move tool

**Files:**
- Create: `portfolioos/packages/api/scripts/moveFiles.ts`
- Test: `portfolioos/packages/api/test/scripts/moveFiles.test.ts`

**Interfaces:**
- Produces:
  - `export type Move = { from: string; to: string }` — paths relative to `--root`. A file or a directory.
  - `export function expandMoves(moves: Move[], listFiles: (dir: string) => string[]): Map<string, string>` — absolute old file path → absolute new file path. Directories expand to every file under them. Throws `Error('destination exists: <path>')` if a destination is an existing file not itself being moved away, and `Error('duplicate destination: <path>')` if two sources map to one destination.
  - `export function rewriteSpecifiers(code: string, opts: { importerOld: string; importerNew: string; fileMap: Map<string, string>; exists: (absPath: string) => boolean; aliases?: Record<string, string> }): string`
  - CLI: `pnpm --filter @everypaisa/api exec tsx scripts/moveFiles.ts --root <dir> --map <moves.json> --scan <comma-separated dirs> [--alias @/=src/]`. It runs `git mv` for each file (creating parent dirs), then rewrites every `.ts/.tsx/.mts/.cts` file under `--scan`, then prints `moved N files, rewrote M files`.
- Specifier forms rewritten: `from '…'`, `import '…'`, `import('…')`, `require('…')`, `vi.mock('…'`, `vi.doMock('…'`, `vi.importActual('…')`, `export … from '…'`. Only relative (`./`, `../`) or configured-alias specifiers. Quote style and extension style are preserved (`.js` stays `.js`; no extension stays none). Resolution order for `x.js`: `x.ts`, `x.tsx`, `x.js`. For no extension: `x.ts`, `x.tsx`, `x/index.ts`, `x/index.tsx`, `x` (json etc.). A specifier that resolves to nothing is left unchanged.

- [ ] **Step 1: Write the failing tests** (pure functions, absolute paths under a fake root `/r`):

```ts
describe('rewriteSpecifiers', () => {
  const map = new Map([
    ['/r/src/services/foPnl.service.ts', '/r/src/services/fo/foPnl.service.ts'],
    ['/r/src/services/foExpiry.service.ts', '/r/src/services/fo/foExpiry.service.ts'],
  ]);
  const exists = (p: string) => ['/r/src/lib/prisma.ts', ...map.keys()].includes(p);
  it('updates importer pointing at moved file', () => {
    expect(rewriteSpecifiers(`import { a } from '../services/foPnl.service.js';`,
      { importerOld: '/r/src/routes/fo.routes.ts', importerNew: '/r/src/routes/fo.routes.ts', fileMap: map, exists }))
      .toBe(`import { a } from '../services/fo/foPnl.service.js';`);
  });
  it('updates moved importer pointing at unmoved file', () => { /* '../lib/prisma.js' -> '../../lib/prisma.js' for importer foPnl moved */ });
  it('keeps sibling import when both move together', () => { /* './foExpiry.service.js' unchanged */ });
  it('rewrites vi.mock and dynamic import', () => { /* test/services/foPnl.test.ts: vi.mock('../../src/services/foPnl.service.js', …) and await import('../../src/services/foPnl.service.js') -> '../../src/services/fo/foPnl.service.js' */ });
  it('leaves package and unresolvable specifiers alone', () => { /* 'express', '@everypaisa/shared', './missing.js' unchanged */ });
  it('rewrites alias specifiers keeping alias form', () => { /* aliases {'@/': '/r/src/'}; '@/api/mfCentral.api' with move src/api/mfCentral.api.ts -> src/api/mf/mfCentral.api.ts => '@/api/mf/mfCentral.api' */ });
  it('resolves by full path not basename', () => { /* two moved files /r/src/adapters/pf/types.ts and /r/src/adapters/vehicle/types.ts; './types.js' from each resolves to its own new location */ });
});
describe('expandMoves', () => {
  it('expands a directory move to every file under it', () => { /* adapters/pf -> ingestion/pf with listFiles returning ['a.ts','epf/b.ts'] */ });
  it('throws when destination exists', () => { /* listFiles shows destination present */ });
});
```

Fill each commented case as a real assertion with the exact strings given.

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @everypaisa/api exec vitest run test/scripts/moveFiles.test.ts`
Expected: FAIL, cannot resolve `../../scripts/moveFiles.js`.

- [ ] **Step 3: Implement `expandMoves`, `rewriteSpecifiers`, CLI in `scripts/moveFiles.ts`**

Use one regex pass over the string-literal positions of the forms listed above (no AST dependency). CLI guard: `if (import.meta.url === pathToFileURL(process.argv[1]).href) main()`. `git mv` via `execFileSync('git', ['mv', from, to])`. Top-of-file comment (one sentence): why it exists and that it is regex-based so it also catches `vi.mock` strings an AST mover would miss.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @everypaisa/api exec vitest run test/scripts/moveFiles.test.ts && pnpm --filter @everypaisa/api typecheck`
Expected: all tests PASS; typecheck exit 0 (scripts are covered by `tsconfig.scripts.json`).

- [ ] **Step 5: Dry run on a throwaway branch** — move `src/services/foPnl.service.ts` → `src/services/fo/foPnl.service.ts` with `--scan src,test,scripts`. Run `pnpm --filter @everypaisa/api typecheck` and expect exit 0. Then `git reset --hard && git clean -fd` that dry run (it's on the tool branch's worktree; nothing else lives there).

- [ ] **Step 6: Commit, PR, gate, merge**

```bash
git add packages/api/scripts/moveFiles.ts packages/api/test/scripts/moveFiles.test.ts
git commit -m "chore(tooling): add moveFiles script for import-safe file moves"
```
Push, open PR `chore(tooling): import-safe file move script`, then run the merge gate from Global Constraints.

---

### Task 2: Map and docs (slice 1)

**Files:**
- Create: `portfolioos/ARCHITECTURE.md`, `docs/history/README.md`
- Rewrite: `CLAUDE.md` (repo root)
- Modify: `portfolioos/README.md` (layout section), `AGENTS.md` (add pointer near top)
- Move (`git mv`): `CLAUDE.md` (old content) → `docs/history/CLAUDE_v2_plan.md`; `CLAUDE_v1_archive.md`, `AUDIT_REPORT.md` → `docs/history/`; `portfolioos/CONTEXT.md`, `portfolioos/PROGRESS.md`, `portfolioos/INTELLIGENCE_LAYER_AUDIT.md` → `docs/history/`; `portfolioos/docs/*` → `docs/*` (merge `portfolioos/docs/superpowers/{plans,specs}` into `docs/superpowers/{plans,specs}`); `portfolioos/test/manual-qa-*.md` and `portfolioos/packages/api/test/manual-qa-*.md` → `docs/qa/`.

**Interfaces:**
- Produces: `portfolioos/ARCHITECTURE.md` with a `## Feature index` table, columns `Feature | Routes | Controllers | Services | Ingestion | Jobs | Web page | Web api`. Every later task updates this table.

- [ ] **Step 1: Move history docs** with `git mv` exactly as listed. Do `CLAUDE.md` first: `git mv CLAUDE.md docs/history/CLAUDE_v2_plan.md`. Prepend one line to each moved history file: `> Historical document — superseded by ARCHITECTURE.md / CLAUDE.md as of 2026-10-19. Kept for reference.`

- [ ] **Step 2: Merge `portfolioos/docs/` into `docs/`** with `git mv`. On a name collision, stop and list it in the PR. Remove the then-empty `portfolioos/docs/`.

- [ ] **Step 3: Write `portfolioos/ARCHITECTURE.md`** with these sections, in this order:
  1. *What this is* (2–3 lines).
  2. *Top-level folders*: `apps/web`, `packages/api`, `packages/shared`, `eslint-plugin-everypaisa`, `scripts`, repo-root `extension/`, repo-root `docs/` — one line each.
  3. *Request flow*: page (`apps/web/src/pages/<feature>`) → client (`apps/web/src/api/*.api.ts`) → `packages/api/src/routes/*.routes.ts` (mounted in `routes/index.ts`) → `controllers/*.controller.ts` → `services/**` → Prisma (`lib/prisma.ts`, RLS context via `lib/requestContext.ts`). Background: `jobs/*` on Bull (`lib/queue.ts`).
  4. *API `src/` folders*: one line each for `routes, controllers, services, ingestion, adapters, connectors, integrations, priceFeeds, jobs, lib, middleware, ai, config, schemas, scripts, types, data`. Mark `adapters/connectors/integrations` as "being merged into `ingestion/`".
  5. *Placement rule* — copy from the spec verbatim.
  6. *Tests*: colocated `src/**/*.test.ts` plus mirrored `packages/api/test/**`; how to run them (point to `packages/api/TESTING.md`).
  7. *Feature index* table: one row per backend `routes/*.routes.ts` file, filled from the current paths.
  8. *Moving files*: how to use `scripts/moveFiles.ts`.

- [ ] **Step 4: Rewrite root `CLAUDE.md`** (≤ 120 lines) with these sections:
  - What EveryPaisa is.
  - Start here: `portfolioos/ARCHITECTURE.md`.
  - Build/test commands.
  - Placement rule.
  - Rules still in force, one line each: Decimal (never `Number`) for money, with money serialised as strings at the API; idempotent ingestion via `sourceHash`; parser `{adapter id, version}` on every row; DLQ (`IngestionFailure`) instead of crashing; Postgres RLS (tests as `portfolioos_app`); `AuditLog` for sensitive operations; no secrets in code or `.env.example`; no silent `catch`.
  - Workflow, one line each: worktree per branch; gate merges on tests with `&&`; deploy runs `prisma migrate deploy` on boot, so merging means migrating; history lives in `docs/history/`.

- [ ] **Step 5: Pointers.** In `portfolioos/README.md`, replace the "Repository layout" tree with one line linking `ARCHITECTURE.md`. In `AGENTS.md`, add one line near the top: `Start with portfolioos/ARCHITECTURE.md for the folder map.`

- [ ] **Step 6: Fix references.** Run `git grep -nE "CLAUDE_v1_archive|AUDIT_REPORT\.md|CONTEXT\.md|PROGRESS\.md|INTELLIGENCE_LAYER_AUDIT|portfolioos/docs/|manual-qa-" -- ':!docs/history'` and update each hit to the new path. Expected after: no hits outside `docs/history/`.

- [ ] **Step 7: Verify, commit, PR, merge.** Run the local gate (docs-only, but proves nothing references a moved file). Commit: `docs: add ARCHITECTURE map, rewrite CLAUDE.md, consolidate docs`. Then run the merge gate.

---

### Move-slice procedure (used by Tasks 3–9)

Every move task follows these steps; each task only supplies its mapping.

- [ ] **P1** Make a fresh worktree off `origin/main` (Global Constraints), then install, generate and build shared. Check main CI per Review Focus 4.
- [ ] **P2** Write the task's mapping as `moves.json` in the scratchpad (`[{ "from": "...", "to": "..." }]`, relative to `portfolioos/packages/api`, or `portfolioos/apps/web` for Task 9).
- [ ] **P3** Run the tool: `pnpm --filter @everypaisa/api exec tsx scripts/moveFiles.ts --root . --map <moves.json> --scan src,test,scripts`. Expected: `moved N files, rewrote M files`, with N equal to the number of files in the mapping.
- [ ] **P4** Mirrored tests: for each moved `src/services/<x>.ts`, if `test/services/<x-stem>.test.ts` exists, move it to `test/services/<newFolder>/` (a second tool run with `--scan test`). Do the same for whole directories (`test/adapters/<d>` → `test/ingestion/<d>`).
- [ ] **P5** Leftover path grep. For each `from` in the mapping: `git grep -nF "<from without extension>" -- . ':!docs/history'` from the repo root. Expected: no hits. Any hit (Dockerfile, `package.json` scripts, `__dirname` joins, docs) gets fixed by hand.
- [ ] **P6** Folder README: create `<newFolder>/README.md` (3–10 lines) covering what the feature is, its entry-point file(s), and its related route, controller and job files.
- [ ] **P7** Update the `ARCHITECTURE.md` feature index rows for the moved features.
- [ ] **P8** Local gate (Global Constraints). Expected: exit 0.
- [ ] **P9** Diff check. `git diff -M --stat origin/main` shows renames. Then `git diff -M origin/main -- '*.ts' '*.tsx' | grep -E '^[+-][^+-]' | grep -vE "^[+-]\s*(import|export|\} from|from |vi\.(mock|doMock|importActual)|.*\bimport\()"` should print nothing. Any remaining line must be a P5 path fix; list those in the PR.
- [ ] **P10** Commit once per feature folder, as `refactor(structure): group <feature> files under <newFolder>`. Push once. Open a PR whose body has `## Moved paths` (old → new). Run the merge gate, confirm `merge-base`, then remove the worktree.

---

### Task 3: Ingestion — `adapters/` → `ingestion/`

**Mapping (`from` → `to`, under `src/`):** `adapters/fileImport` → `ingestion/fileImport`; `adapters/fno` → `ingestion/fno`; `adapters/mfcentral` → `ingestion/mfcentral`; `adapters/mfFactsheet` → `ingestion/mfFactsheet`; `adapters/mfMailback` → `ingestion/mfMailback`; `adapters/otpDriven` → `ingestion/otpDriven`; `adapters/pf` → `ingestion/pf`; `adapters/valuation` → `ingestion/valuation`; `adapters/vehicle` → `ingestion/vehicle`; `adapters/types.ts` → `ingestion/types.ts`. Tests: `test/adapters/*` → `test/ingestion/*` (`amfiCostAndSize.test.ts` too).

- [ ] Run P1–P10. P5 must fix `packages/api/Dockerfile` line 28: `src/adapters/vehicle/fixtures/` → `src/ingestion/vehicle/fixtures/`, and `dist/adapters/…` → `dist/ingestion/…`. Also check the `__dirname` read in `mparivahan.ts`; it's relative to the file, so it should still work. Confirm by running `pnpm --filter @everypaisa/api build` and then `ls packages/api/dist/ingestion/vehicle`. Delete the empty `src/adapters/` and `test/adapters/`.

### Task 4: Ingestion — connectors, integrations, source clients, parsers

**Mapping:** `connectors/gmail.connector.ts` → `ingestion/gmail/gmail.connector.ts`; `connectors/zerodha.connector.ts` → `ingestion/zerodha/zerodha.connector.ts`; `integrations/finfactor` → `ingestion/finfactor`; `lib/gmailClassifier.ts` → `ingestion/gmail/gmailClassifier.ts`; `lib/gmailMessageLister.ts` → `ingestion/gmail/gmailMessageLister.ts`; `lib/casparserClient.ts` → `ingestion/casparser/casparserClient.ts`; `services/imports/parsers` → `ingestion/fileImport/parsers`; `services/brokerOauth` → `ingestion/fno/brokerOauth`. Mirrored tests: `test/services/brokerOauth.test.ts` → `test/ingestion/fno/brokerOauth.test.ts`. Also move any `test/**` file whose name matches a moved stem.

- [ ] Run P1–P10. Delete the empty `src/connectors/` and `src/integrations/`. In `ARCHITECTURE.md`, remove the "being merged" note.

### Tasks 5–8: Backend feature folders

Each row is one commit. `.test.ts` files beside a source move with it. Every row is under `src/services/`. The destination for a row is `services/<folder>/<same filename>`.

**Task 5 PR — identity & core portfolio**

| Folder | Files |
|---|---|
| `auth/` | auth.service, jwt.service, password.service, twoFactor.service |
| `security/` | appKeyRotation.service, secretRotation.service, securityAlerts.service, piiAtRest.service |
| `account/` | accountDeletion.service, userPreferences.service, extensionPairing.service |
| `holdings/` | holdings.service, holdingsAsOf.service, holdingsProjection, assetKey, transaction.service, portfolio.service, portfolioGroup.service, priceStaleness(+test), valuationMethod(+test), masterData.service |

**Task 6 PR — tax, analytics, insights**

| Folder | Files |
|---|---|
| `tax/` | tax.service, taxComputation, advanceTax.service, advanceTaxMath(+test), capitalGains.service, taxHarvestMath(+test), fmvOverride.service |
| `analytics/` | analytics.service, analytics.benchmark, analytics.insights, analytics.priceBackfill, analytics.risk, xirr.service, xirr.reliability(+test), twr.test, netWorthHistory.service, healthScore.service, healthScoreMath(+test), riskProfileMath, whatIf.service, whatIfMath(+test), dashboard.service, cashflowForecast.service |
| `insights/` | deterministicInsights, deterministicInsightsRules(+test), insightActions(+test) |
| `goals/` | goals.service, goalMath(+test) |
| `corporateActions/` | corporateActionApply.service, corporateActionsReport.service |

**Task 7 PR — ingestion workflows & markets**

| Folder | Files |
|---|---|
| `imports/` (exists) | canonicalEvents.service, ingestionFailures.service, sourceHash, templateSeeds.service, duplicates.service, duplicateMatch |
| `gmail/` | gmailAutoApproveRules.service, gmailDiscoveredDocs.service, gmailDocApproval.service, gmailScanJobs.service, monitoredSenders.service |
| `pf/` (exists) | pfAccounts.service, pfCanonicalize.service, pfCredentials.service, pfFetchSessions.service, pfNudges.service |
| `fo/` | foBrokerSync.service, foExpiry.service, foPnl.service, derivativePosition.service |
| `forex/` | forex.service(+test) |
| `mf/` | mfOverlap.service; dirs `mfAnalytics`, `mfCasMailback`, `mfCasparser`, `mfcentral` → `mf/<same>` |

**Task 8 PR — assets, banking, family, docs**

| Folder | Files |
|---|---|
| `realEstate/` | realEstate.service, realEstateAlerts, propertyCapitalGain, propertyLocation.service, propertyPhotos.service |
| `rental/` | rental.service, rental.reminders.service, rentalLedger.service, rentalLedgerMath(+test) |
| `insurance/` | insurance.service, insuranceCoverage.service, insuranceExtras.service |
| `loans/` | loans.service, loansGiven.service, loanMath.test; dirs `loanChecks`, `loanRates`, `emi` → `loans/<same>` |
| `banking/` | bankAccounts.service, creditCards.service, ifscLookup.service, depositReminders.service, cashDirection |
| `family/` (exists) | family.service, familyScope.service |
| `reports/` (exists) | reports.service, specialReports.service, export.service, excelCells |
| `accounting/` | accounting.service; dir `tally` → `accounting/tally` |
| `documents/` | document.service; dir `docSorter` → `documents/docSorter` |
| `income/` | income.service, investmentIncome.service |
| `vehicles/` | vehicles.service, challans.service |
| `notifications/` (exists) | alerts.service |

- [ ] For each of Tasks 5–8: run P1–P10. If the tool throws `destination exists` (Review Focus 3), keep the existing file, give the incoming one a `<folder>.`-prefixed name, and note it in the PR.
- [ ] After Task 8, `ls packages/api/src/services/*.ts` should print nothing. Any file a parallel branch adds later is placed with this same procedure in a follow-up.

### Task 9: Web `api/` client grouping

Root `portfolioos/apps/web`, scan `src`, alias `--alias @/=src/`. Only multi-file features get a folder. Core files (`client.ts`, `baseUrl.ts`, `sessionRefresh.test.ts`, `decodeBlobError.test.ts`) and single-file features stay in `src/api/`.

| Folder under `src/api/` | Files |
|---|---|
| `mf/` | mfAnalytics.api, mfAnalyticsKeys, mfCasMailback.api, mfCasparser.api, mfCentral.api, mfMethodology.api, mfQualitativeFacts.api |
| `imports/` | imports.api, ingestion.api, ingestionFailures.api, canonicalEvents.api, cas.api |
| `gmail/` | gmail.api, gmailScan.api, monitoredSenders.api |
| `loans/` | loans.api, loansGiven.api, loanRates.api, emi.api(+test) |
| `insurance/` | insurance.api, insuranceCoverage.api |
| `family/` | families.api, familyDashboard.api, managedProfiles.api |
| `realEstate/` | realEstate.api, propertyMedia.api |
| `rental/` | rental.api, rentalCache |
| `legacy/` | legacy.api(+test), legacyPublic.api(+test) |

- [ ] Run P1–P10 with web paths. P8 also needs `pnpm --filter @everypaisa/web build` (Vite) to exit 0. Add the `Web api` column values to the feature index.

### Task 10: Final pass

- [ ] Read `ARCHITECTURE.md` against the tree. Every `src/` folder should be described, every `services/` subfolder should have a `README.md`, and every feature-index path should exist. Check the paths with a short loop: `for p in $(grep -oE '\`[^`]+\.(ts|tsx)\`' ARCHITECTURE.md | tr -d '\`'); do test -e "$p" || echo MISSING $p; done`, run from the folder the paths are relative to. Expected: no `MISSING`.
- [ ] Commit `docs: final ARCHITECTURE pass`, then PR and merge gate.
