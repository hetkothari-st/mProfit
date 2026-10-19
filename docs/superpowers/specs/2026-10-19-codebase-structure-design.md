# Codebase Structure Cleanup — Design

Date: 2026-10-19
Status: reviewed, awaiting user approval

## Intent

A new developer who has never seen this repo should be able to open it and
understand the folder structure: what each folder is for, and where the code
for a given feature lives. Today they can't — the API's `services/` folder has
~145 entries mixing every feature, five folders overlap in meaning
(`adapters/`, `connectors/`, `integrations/`, `ingestion/`, `priceFeeds/`),
and the docs that describe the project overlap and contradict each other.

## Goals

1. One entry document (`ARCHITECTURE.md`) that explains the layout, the
   request flow, and where each feature lives.
2. Backend code grouped by feature so related files sit together.
3. Overlapping folder names collapsed into clearly named homes.
4. Docs consolidated: one current source of truth, history archived.
5. No stray files at the repo root or outside the package they belong to.

## Non-goals

- No behaviour changes. Every slice is move/rename + import updates only.
- No refactoring of logic, splitting of big files, or renaming of functions,
  types, DB tables, env vars, routes or URLs.
- Frontend `pages/` is already grouped by feature — not reorganised, only
  documented (and aligned if a feature name differs between web and API).
- `extension/` internals are not reorganised.

## Anti-goals (would be a failure even if it "works")

- A big-bang move that breaks the 19 worktrees / open branches all at once.
- Any change to public API paths, Prisma schema, migrations, or deploy config
  (`start.sh`, `railway-*.toml`, Dockerfile) behaviour.
- A slice merged with red typecheck, build or tests.
- New abstraction layers (barrel files everywhere, DI containers, "modules"
  frameworks) that make the code *harder* to follow.

## Constraints

- Many concurrent agents work in this repo; branch work happens in isolated
  git worktrees off `origin/main`, never in the shared checkout.
- The repo auto-merges PRs fast; one slice = one PR, pushed as a single
  commit set, verified merged before the next slice starts.
- Merge is gated on `pnpm -r run typecheck && pnpm -r run build && pnpm -r
  run test` with `&&` (never `;`).
- Deploys run `prisma migrate deploy` on boot — slices must not touch
  `prisma/`.
- API imports are relative paths (no alias); tests live in a mirrored tree
  under `packages/api/test/`. Moving a source file means updating imports in
  `src/`, `test/`, and `packages/api/scripts/`.

## Decided by the user

- Files and folders may be moved and renamed.
- Work proceeds in small slices now, accepting some merge pain on open
  branches, rather than waiting for a quiet period.
- Order of work: map/docs first → stragglers → overlapping folders
  (ingestion side) → backend feature grouping → frontend alignment.
- **Open branches:** move anyway. Features with in-flight work are not
  skipped or held back. The builder does not rebase or fix other branches;
  their owners resolve conflicts. Each slice PR description lists the moved
  paths (old → new) so owners can fix imports quickly.
- **`CLAUDE.md`:** rewritten. The old v2 phase plan moves to
  `docs/history/CLAUDE_v2_plan.md` (alongside `CLAUDE_v1_archive.md`). The
  new root `CLAUDE.md` is a short, current guide: what the project is, where
  to start (`ARCHITECTURE.md`), how to build/test, the working rules that
  still apply (Decimal for money, idempotent ingestion, RLS, no silent catch,
  worktrees for branch work, gate merges on tests, deploy runs migrations),
  and the placement rule below. `AGENTS.md` gets the same pointer to
  `ARCHITECTURE.md`; its content is otherwise left alone.

## Placement rule (my call)

One rule decides where every backend file goes, so nothing moves twice:

- **`src/ingestion/<source>/`** — code that *talks to an outside source and
  turns its data into our shapes*: fetching, scraping, OAuth clients,
  parsing, adapters. Sources: `gmail/`, `zerodha/`, `finfactor/`, `pf/`,
  `mfcentral/`, `mfMailback/`, `casparser/`, `vehicle/`, `fileImport/`,
  `fno/`, `llm/`, etc. Shared pipeline pieces (`hash`, `pii`, `projection`,
  `templates`, `types.ts`) sit at `src/ingestion/` root.
- **`src/services/<feature>/`** — what the app *does* with data: business
  logic, DB reads/writes, maths, workflows (approvals, sessions, nudges).
- **`src/priceFeeds/`** — unchanged; market-data fetchers stay where they are.

Because of this rule, the overlapping-folders slice runs **before** the
backend feature slices (it fixes the ingestion side first), and the grouping
table below covers only the business-logic side.

## Docs home (my call)

- Single docs home: **repo-root `docs/`** (where the tools already write
  specs/plans). `portfolioos/docs/*` moves into it; `portfolioos/docs/`
  is removed.
- History goes to `docs/history/`.
- `SECURITY.md`, `CLAUDE.md`, `AGENTS.md`, `README.md` stay where tools and
  GitHub expect them.

## The plan, in slices

### Slice 1 — Map (docs only, no code moves)

- New `portfolioos/ARCHITECTURE.md`:
  - What each top-level folder is (`apps/web`, `packages/api`,
    `packages/shared`, `eslint-plugin-everypaisa`, `extension/`, `scripts/`,
    `test/`, `docs/`).
  - Request flow: web page → `apps/web/src/api/*` client → API
    `routes/*.routes.ts` → `controllers/*.controller.ts` →
    `services/**` → Prisma; background work via `jobs/` (Bull).
  - Where tests live and how to run them.
  - **Feature index table**: feature → route file → controller → service
    folder → jobs → web page folder. This table is the main "where does X
    live" answer and is updated by every later slice.
- `README.md` "Repository layout" section points to `ARCHITECTURE.md`.
- Docs consolidation:
  - `CONTEXT.md`, `PROGRESS.md`, `INTELLIGENCE_LAYER_AUDIT.md`,
    `AUDIT_REPORT.md`, `CLAUDE_v1_archive.md` → `docs/history/` (kept, not
    deleted), each with a one-line header saying it is historical.
  - `docs/superpowers/` exists in two places (repo root and `portfolioos/`) —
    merge into one location.
  - `CLAUDE.md` rewritten as described under "Decided by the user";
    `CLAUDE.md` and `AGENTS.md` stay at the root (tools look for them there).

### Slice 2 — Stragglers

- Any tracked file sitting outside the package it belongs to moves in (e.g.
  the root-level `packages/api/test/split` seen in a local checkout — verify
  whether it is tracked on `main`).
- One-off scripts at `portfolioos/` root move to `portfolioos/scripts/`.
- Test-adjacent `*.test.ts` files inside `src/` stay where they are for now
  (moving them is a separate decision; noted, not done).

### Slices 3…N — Backend feature grouping (one feature per slice)

Group the loose files in `packages/api/src/services/` into feature folders.
Proposed grouping (builder may adjust names after reading the code):

| Folder | Loose files that move in (examples) |
|---|---|
| `auth/` | auth, jwt, password, twoFactor |
| `security/` | appKeyRotation, secretRotation, securityAlerts, piiAtRest |
| `holdings/` | holdings, holdingsAsOf, holdingsProjection, assetKey, transaction, portfolio, portfolioGroup |
| `tax/` | tax, taxComputation, advanceTax*, capitalGains, taxHarvestMath, fmvOverride |
| `analytics/` | analytics.*, xirr*, twr, netWorthHistory, healthScore*, riskProfileMath, whatIf* |
| `insights/` | deterministicInsights*, insightActions |
| `fo/` | foBrokerSync, foExpiry, foPnl, derivativePosition |
| `gmail/` | gmailAutoApproveRules, gmailDiscoveredDocs, gmailDocApproval, gmailScanJobs, monitoredSenders |
| `ingestion/` | canonicalEvents, ingestionFailures, sourceHash, templateSeeds, duplicates, duplicateMatch |
| `pf/` (exists) | pfAccounts, pfCanonicalize, pfCredentials, pfFetchSessions, pfNudges |
| `realEstate/` | realEstate, realEstateAlerts, propertyCapitalGain, propertyLocation, propertyPhotos |
| `rental/` | rental, rental.reminders, rentalLedger* |
| `insurance/` | insurance, insuranceCoverage, insuranceExtras |
| `loans/` | loans, loansGiven, loanMath + existing loanChecks/, loanRates/, emi/ |
| `banking/` | bankAccounts, creditCards, ifscLookup, depositReminders, cashDirection |
| `family/` (exists) | family, familyScope |
| `account/` | accountDeletion, userPreferences, extensionPairing |
| `reports/` (exists) | reports, specialReports, export, excelCells, corporateActionsReport |
| `mf/` | mfOverlap + existing mfAnalytics/, mfCasMailback/, mfCasparser/, mfcentral/ as subfolders |

Rules per slice:
- `git mv` so history follows the file.
- Update every import in `src/`, `test/`, `scripts/`, and `vitest` config.
- Matching test files under `packages/api/test/services/` move to the
  mirrored path.
- Update the feature index in `ARCHITECTURE.md`.
- Each folder gets a short `README.md` (3–10 lines): what the feature is,
  entry points, related jobs/routes.

Controllers, routes and jobs stay flat in their layer folders (their names
already say the feature); the feature index links them.

### Slice — Overlapping folders

Decide one meaning per folder and move accordingly:
- `priceFeeds/` → market data fetchers (keep name; it's clear).
- `adapters/`, `connectors/`, `integrations/`, `ingestion/` → collapse into
  `ingestion/` (bringing data in from external sources), with sub-folders per
  source (`gmail/`, `zerodha/`, `finfactor/`, `pf/`, `vehicle/`, …).
- Exact target layout decided by the builder after reading imports; written
  into the slice's PR description and `ARCHITECTURE.md`.

### Slice — Frontend alignment

- `apps/web/src/api/` (55 files) grouped to match feature names used by
  `pages/`.
- Where a feature has different names on web vs API (e.g. `mutualFunds` vs
  `mf`), the doc records the mapping; renaming is optional and only if cheap.

## Tooling

Builder's call. Suggested: a small one-off script (ts-morph or similar) that
moves a file and rewrites relative imports across `src/`, `test/`, and
`scripts/`, kept in the scratchpad, not committed. Manual `git mv` + search
is fine for small slices.

## Verification per slice

- `pnpm -r run typecheck && pnpm -r run build && pnpm -r run test` green.
- `git diff --stat -M` shows renames, not delete+add.
- No change in any file's contents beyond import paths (spot check with
  `git diff -M --stat` and a grep of the diff for non-import lines).
- Before merging, a fresh worktree needs `prisma:generate` and a build of
  `@everypaisa/shared` before typecheck errors can be trusted.

## Left to the builder

- Final folder names in the grouping table.
- Slice order among the backend features (suggest smallest first to prove
  the tooling).
- Whether a tiny feature (1–2 files) is worth its own folder or stays loose.
