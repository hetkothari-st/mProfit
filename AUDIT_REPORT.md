# PortfolioOS v2 — AUDIT REPORT

**Generated:** 2026-04-21
**Auditor:** Claude Code (Opus 4.7)
**Scope:** Read-only audit of current repository state against CLAUDE.md Section 2 (Step 1).
**Status:** Awaiting Gate G1 approval. No code changes have been made.

---

## 1. Structure inventory

### Monorepo layout

```
D:\het-desktop\mProfit\
├── CLAUDE.md                       (v2 execution plan — current spec)
├── CLAUDE_v1_archive.md            (v1 greenfield spec — reference only)
├── AUDIT_REPORT.md                 (this file)
├── .gitignore
└── portfolioos/                    (actual application root)
    ├── .env.example
    ├── .env                        (gitignored; present in working copy)
    ├── package.json                (workspace root; pnpm)
    ├── pnpm-workspace.yaml
    ├── docker-compose.yml
    ├── apps/
    │   └── web/                    React 18 + TS + Vite + Tailwind + shadcn
    └── packages/
        ├── api/                    Node 20 + Express + Prisma
        └── shared/                 types shared between api & web
```

### Workspace packages

| Package | Purpose | Build OK | Typecheck OK | Tests |
|---|---|---|---|---|
| `@portfolioos/shared` | Shared Zod schemas / DTOs / labels | ✅ | ✅ | no test script |
| `@portfolioos/api` | Backend (Express + Prisma) | ❌ | ❌ | no test files |
| `apps/web` (unnamed workspace) | Frontend (Vite SPA) | ✅ | ✅ | no test files |

### Prisma schema — every model (`packages/api/prisma/schema.prisma`, 759 lines)

```
User, RefreshToken, PasswordResetToken,
BrokerAccount, MailboxAccount,
Client, Portfolio, PortfolioGroup, PortfolioGroupItem,
StockMaster, MutualFundMaster, StockPrice, MutualFundNav,
CorporateAction,
CommodityPrice, CryptoPrice, FXRate,
Holding,
Transaction, CapitalGain, CashFlow,
Account, Voucher, VoucherEntry,
ImportJob,
Alert
```

Enums: `UserRole, PlanTier, BrokerProvider, ConnectorStatus, MailboxProvider, PortfolioType, AssetClass, TransactionType, OptionType, CapitalGainType, CashFlowType, AccountType, VoucherType, ImportType, ImportStatus, AlertType, Exchange, MFCategory`.

### Prisma migrations (`packages/api/prisma/migrations/`)

1. `20260417120146_init`
2. `20260418024125_phase3_commodity_crypto_fx`
3. `20260420064909_phase4_connectors_mailbox`
4. `20260420074424_phase4_gmail_oauth`
5. `20260420084927_add_user_dob`

All additive so far; none of the v2 tables (`CanonicalEvent`, `MonitoredSender`, `LearnedTemplate`, `HoldingProjection`, `IngestionFailure`, `Vehicle`, `Challan`, `RentalProperty`, `Tenancy`, `RentReceipt`, `PropertyExpense`, `InsurancePolicy`, `PremiumPayment`, `InsuranceClaim`, `AuditLog`, `AppSetting`) exist.

### Route files (`packages/api/src/routes/`)

`auth.routes.ts, portfolios.routes.ts, transactions.routes.ts, assets.routes.ts, imports.routes.ts, cas.routes.ts, reports.routes.ts, connectors.routes.ts, mailboxes.routes.ts, gmail.routes.ts, index.ts`

### Controller files (`packages/api/src/controllers/`)

`auth.controller.ts, portfolio.controller.ts, transaction.controller.ts, assets.controller.ts, imports.controller.ts, cas.controller.ts, reports.controller.ts, connectors.controller.ts, mailboxes.controller.ts, gmail.controller.ts`

### Parser files (`packages/api/src/services/imports/parsers/`)

- `types.ts` — `Parser`, `ParserResult`, `ParsedTransaction`, `ParserContext`
- `index.ts` — orchestrator / dispatcher
- `genericCsv.parser.ts`
- `genericExcel.parser.ts`
- `zerodhaContractNote.parser.ts` (PDF)
- `mfCas.parser.ts` (CAMS/KFintech PDF)
- `nsdlCdslCas.parser.ts` (depository eCAS PDF)

### Web pages (`apps/web/src/pages/`)

`auth/{Login,Register,ForgotPassword}Page.tsx`, `dashboard/DashboardPage.tsx`, `portfolios/{PortfolioList,PortfolioDetail,PortfolioFormDialog}.tsx`, `transactions/{TransactionsPage,TransactionFormDialog}.tsx`, `assetClasses/{Stocks,MutualFunds}Page.tsx`, `imports/{ImportPage,ImportDropzone,ImportErrorDialog}.tsx`, `cas/CasPage.tsx`, `connectors/ConnectorsPage.tsx`, `mailboxes/{Mailboxes,GmailCallback}Page.tsx`, `reports/ReportsPage.tsx`, `settings/SettingsPage.tsx`, `PlaceholderPage.tsx`.

---

## 2. Build & test state

| Command | Exit | Notable output |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | "Already up to date" (1.4s). |
| `pnpm --filter @portfolioos/api exec prisma generate` | 0 | Generated client v5.22.0. |
| `pnpm -r run build` | **FAIL** | `packages/api/tsconfig.build.json(5,5): TS5069: Option 'declarationMap' cannot be specified without specifying option 'declaration' or option 'composite'`. `apps/web` and `packages/shared` build OK. |
| `pnpm -r run typecheck` | **FAIL** | `packages/api`: `TS6059: File '…/prisma/seed.ts' is not under 'rootDir' '…/src'`. `apps/web` and `packages/shared` typecheck OK. |
| `pnpm -r run lint` | **FAIL** | `'eslint' is not recognized as an internal or external command` in both `packages/api` and `apps/web` — eslint is not installed as a dev dependency. |
| `pnpm -r run test` | **FAIL** | `No test files found, exiting with code 1` for both `packages/api` and `apps/web`. Vitest configured (v2.1.9) but no `*.test.ts` / `*.spec.ts` files exist anywhere. |

**Takeaway:** API package cannot build or typecheck as-is; lint infra is missing; zero tests exist in the repo. This violates CLAUDE.md §3.9 (parsers must ship with ≥5 fixtures + snapshot tests) and §5.3 (CI gate).

---

## 3. Feature completeness (v1 Phase 1–4)

| v1 deliverable | Status | Evidence |
|---|---|---|
| Auth: register / login / refresh / logout / /me | ✅ Implemented | `auth.service.ts` all flows; bcrypt password hashing; JWT access + rotating refresh tokens; `/me` via `getCurrentUser`. |
| Password reset | ✅ Implemented | `auth.service.ts:148-181` — `PasswordResetToken` model + reset flow. |
| Portfolio CRUD | ✅ Implemented | `portfolio.service.ts`; list / get / create / update / delete + summary, holdings, allocation, cashflows. |
| Manual transaction CRUD (Stocks, MFs) | ✅ Implemented | `transaction.service.ts`; `createTransaction`, `updateTransaction`, `deleteTransaction`, `listTransactions`, `getTransaction`. |
| Holdings engine | ⚠️ Buggy | Present (`holdings.service.ts`) — `recalculateHoldingForKey` replays all txns and writes to `Holding`. Functionally a projection but stored in a mutable table (see BUG-002). |
| Broker contract-note parser | ⚠️ Partial | `zerodhaContractNote.parser.ts` works for plain-text PDFs; heuristic; uses `Number()` on qty/price (BUG-005); no fixtures/tests. |
| CAS PDF parser | ⚠️ Partial | `mfCas.parser.ts` + `nsdlCdslCas.parser.ts` present; text-based; no password-with-DOB fallback; no fixtures/tests. |
| FIFO capital gains calculator | ⚠️ Buggy | `capitalGains.service.ts` — FIFO engine present, CII table through 2024, intraday detection. LTCG threshold uses `months × 30` approximation (BUG-014); Section 112A grandfathering not implemented (TODO comment at line 287-289); equity-vs-debt MF distinction absent (line 77-82). |
| XIRR calculator | ✅ Implemented | `xirr.service.ts` present. |
| PDF / Excel report export | ✅ Implemented | `reports.service.ts` + `export.service.ts` + `reports.controller.ts`; routes mounted. |
| Dashboard | ✅ Implemented | `DashboardPage.tsx` + `portfolio.service.ts:getPortfolioSummary` (returns XIRR hard-coded as `null` — so XIRR is computed on reports only, not dashboard). |
| Import wizard (multi-step preview/confirm) | ❌ **Not implemented** | `ImportPage.tsx` has a single-step upload + history table; no preview step, no confirm step, no server-side wizard state. `v1` §6.5 specified a 4-step wizard. (BUG-010 stronger than described — the wizard simply doesn't exist.) |
| Parser idempotency / dedup on re-upload | ❌ Not implemented | No `sourceHash` column; no dedup check in `createTransaction` or `import.service.ts`. |
| Capital-gains recompute on tx edit/delete | ❌ Not implemented | `transaction.service.ts` edit/delete recompute `Holding` but never touch `CapitalGain`. CASCADE on `CapitalGain.sellTransactionId` means delete cascades cleanup, but edits leave stale rows with wrong basis. |

---

## 4. Bug verification (BUG-001 … BUG-016)

| ID | Severity | Status | Evidence | Notes |
|---|---|---|---|---|
| BUG-001 | P0 | **CONFIRMED** | `schema.prisma:420` — `@@unique([portfolioId, assetClass, stockId, fundId, isin])` | All four FK/ISIN columns are nullable; Postgres treats `NULL ≠ NULL`, so two FDs (stockId/fundId/isin all NULL, same assetClass) will both insert and then silently collide via reads. Confirmed as worded in CLAUDE.md §2B. |
| BUG-002 | P0 | **PARTIAL** | `schema.prisma:394-424` model is `Holding` (mutable, not `HoldingProjection`); however `holdings.service.ts:100-157` `recalculateHoldingForKey` always replays all transactions for that `(portfolio, asset)` and writes the result (delete-if-zero, upsert otherwise). No write path `UPDATE`s holding numbers in place except for price-only refresh (`refreshAllHoldingPrices` at `holdings.service.ts:192-220`, `refreshPortfolioPrices` at `:222-250`). | Semantically projection; structurally mutable table. The v2 spec demands a `HoldingProjection` separate model (§4.4) read on every query, so the fix is still needed. Also: every mutation path **must** call `recalculateHoldingForKey`; if a future path forgets, the mutable table drifts — that's exactly the risk v2 spec addresses. |
| BUG-003 | P0 | **CONFIRMED** | `schema.prisma:459-519` `Transaction` has no `sourceHash` or natural-key unique. `import.service.ts:145-158` loops `createTransaction` per parsed row with no dedup check. Parsers (`zerodhaContractNote.parser.ts:107-117`, `mfCas.parser.ts:137-147`) emit `ParsedTransaction` without any hash. | Re-uploading the same contract note produces N new duplicate transactions. |
| BUG-004 | P1 | **CONFIRMED** | `transaction.service.ts:238-249` (update) and `:251-265` (delete) only call `recalculateHoldingForKey`, never `persistCapitalGainsForPortfolio` or any CG recompute. `schema.prisma:555` has `onDelete: Cascade` on `CapitalGain.sellTransaction` — so delete of a sell tx does clean up its CG rows, but: (a) editing a BUY/SELL silently leaves stale CG, (b) deleting a BUY whose rows were FIFO-consumed by a later SELL doesn't touch those rows (relation is via `sellTransactionId`, not `buyTransactionId`). | Tax reports become subtly wrong after any post-sell edit/delete. |
| BUG-005 | P1 | **CONFIRMED** | 65 `Number(` / `parseFloat` occurrences across 13 files. Systemic hotspots: `transaction.service.ts:356-372` (every Decimal DTO field coerced to JS number at API boundary), `portfolio.service.ts:132-134, 158, 193-198` (summary aggregation in float), `zerodhaContractNote.parser.ts:32-36, 98` and `mfCas.parser.ts:28-32, 127, 131-133` (all qty/price parsed as `Number`), `export.service.ts:1`, `xirr.service.ts:2`. | FIFO engine uses `Decimal` internally (`capitalGains.service.ts`), but everything around it is float. Precision is lost at every API boundary. |
| BUG-006 | P1 | **CONFIRMED** | No `IngestionFailure` table in schema. `import.service.ts:145-158` catches per-row errors into `errorLog JSON` on the `ImportJob` row only; no replayable raw payload kept. If the **parser itself** throws (line 106 `runParser` call), the entire job body throws — no DLQ write — worker catches via Bull's job failure machinery and the import is marked FAILED with no recoverable partial state. | Additional issue: `deleteImportJob` (`import.service.ts:84-88`) catches unlink errors with `} catch {}` — silent. |
| BUG-007 | P2 | **CONFIRMED** | `schema.prisma:459-519` — no `sourceAdapter` / `sourceAdapterVer` columns on `Transaction`. Parsers return `result.transactions` without carrying adapter identity beyond `importJobId`. | Cannot distinguish txns parsed by old vs new parser version. |
| BUG-008 | P1 | **PARTIAL** | Every service manually filters by `userId`. Sampling shows it is enforced — `portfolio.service.ts` via `ensureOwnership`, `transaction.service.ts` via `assertPortfolio`, `listTransactions` via `where: { portfolio: { userId } }`, `imports.controller.ts` calls `getImportJob(userId, id)` which checks owner, `reports.controller.ts:assertOwnedPortfolio`. No obvious missed clause found in this pass. **However:** no Postgres RLS — one forgotten filter anywhere = data breach; defense-in-depth missing. | Not a live leak observed, but the architectural invariant (CLAUDE.md §3.6) is not met. |
| BUG-009 | P2 | **CONFIRMED** | Same root as BUG-005. Money crosses DB→server→client boundaries: Prisma returns `Decimal`; `transaction.service.ts:356-372` calls `Number(…)` on every money field before JSON; client receives float. API contract expected by v2 spec (§3.2) is "money as strings" — currently numbers. |  |
| BUG-010 | P2 | **CONFIRMED (worse)** | `apps/web/src/pages/imports/ImportPage.tsx` — single-page flow: pick portfolio → drop file → list history. No preview / review / confirm step. `ImportJob.status` enum (`schema.prisma:721-727`) has no `PENDING_REVIEW` state. Server-side processing starts immediately via `createImportJob → Bull.add`. | The wizard described in v1 §6.5 and assumed by BUG-010 doesn't exist. This is a missing feature, not just fragile state. |
| BUG-011 | P2 | **NOT_PRESENT** | `importWorker.ts:13-19` job body awaits `processImportJob(importJobId)` which internally does `findUnique → update(PROCESSING) → runParser → loop(createTransaction) → update(COMPLETED)`. No `prisma.$transaction` wraps the job body. | **But:** there is *no* atomicity either — a crash mid-loop leaves the ImportJob in `PROCESSING` and partial rows committed. BUG-011's opposite failure mode exists and is captured in NEW-002 below. |
| BUG-012 | P2 | **CONFIRMED** | No `AuditLog` model in `schema.prisma`. Grep for `auditLog` returns nothing. Auth controllers do not log login/logout. | |
| BUG-013 | P2 | **CONFIRMED** | `portfolioos/.env.example:8` `JWT_SECRET=change-this-to-a-secure-random-string-at-least-32-chars`; `:16` `SMTP_PASS=your-app-password`. No secret-store reference. `env.ts` (`src/config/env.ts:11`) only validates `JWT_SECRET` length ≥32 — provides no rotation, no vault binding. | |
| BUG-014 | P1 | **CONFIRMED** | `capitalGains.service.ts:130` `const thresholdDays = longTermThresholdMonths(ac) * 30;` — a 12-month threshold becomes 360 days, so holdings between days 360–365 may be misclassified. `:287-289` `// TODO: wire FMV lookup when historical BSE/NSE close prices for 31-Jan-2018 become available in MarketData.` — Section 112A grandfathering is explicitly not implemented (actual cost used). `:77-82` — MF debt vs equity distinction absent; all MFs treated as equity-style for thresholds, which is wrong for debt funds (should be 36 months). | Debt-MF indexation **is** partly handled (`qualifiesForIndexation` at `:90-108`), but classification of the underlying (equity vs debt MF) is coarse. |
| BUG-015 | P2 | **CONFIRMED** | `middleware/upload.ts:15-17` — destination is `${UPLOAD_DIR}/imports/${year}-${month}` — **no per-user namespacing**, so user A's upload path is predictable by user B. Line 37-44 — file filter is extension-only, no magic-byte check. No authenticated file-serving endpoint (files are not served at all currently, which reduces the blast radius but means the risk surfaces the moment someone adds a download endpoint). | |
| BUG-016 | P3 | **PARTIAL** | Indexes present: `Transaction @@index([portfolioId, tradeDate])` (:515), `@@index([stockId])`, `@@index([fundId])`, `@@index([importJobId])`; `CapitalGain @@index([portfolioId, financialYear])` (:579); `CashFlow @@index([portfolioId, date])` (:601); `Holding @@index([portfolioId])` (:421). **Missing:** `Holding @@index([portfolioId, assetClass])`, `ImportJob @@index([status])` (for the worker's rescue query in `importWorker.ts:30`). | Not blocking. Defer to Phase 8. |

---

## 5. Newly Discovered issues

Not listed in CLAUDE.md §2B. All require failing regression tests before fix (per §2B.4).

| ID | Severity | Evidence | Description |
|---|---|---|---|
| NEW-001 | P0 | `import.service.ts:91-180` — `processImportJob` loops `createTransaction` then updates job row to COMPLETED. Never calls `persistCapitalGainsForPortfolio`. | After an import introduces new BUY/SELL txns, the stored `CapitalGain` rows are stale. Reports served from `CapitalGain` table (vs recomputed in-flight) will be wrong until next recompute trigger — and there is no such trigger outside manual report regeneration. |
| NEW-002 | P1 | `import.service.ts:145-158` — `for …entries()` each iteration awaits `createTransaction`, then a separate `prisma.transaction.update({ importJobId })`. No `$transaction` wrapping the loop. | A crash/timeout mid-loop leaves partial rows committed without any back-reference to the ImportJob (because the update in step 2 is separate from the create). Restarting the job will **reprocess** and duplicate them, since there is no `sourceHash` dedup (compounds BUG-003). |
| NEW-003 | P2 | `schema.prisma:463-464` — `Transaction.holdingId` / `holding` relation defined. Grep for "holdingId" in services returns no write site — column is never populated. | Dead FK. Misleading — suggests transactions know their holding, they don't. |
| NEW-004 | P2 | `holdings.service.ts:159-170` — `prisma.transaction.findMany({ … distinct: ['assetClass', 'stockId', 'fundId', 'isin'] })`. | Prisma's `distinct` relies on Postgres's `DISTINCT ON` semantics; with nullable columns combined, two asset groups that differ only by a NULL vs a value may deduplicate wrongly. Same family of bug as BUG-001. |
| NEW-005 | P1 | `holdings.service.ts:65-86` `aggregateTransactions`. `BUY_TYPES` contains `BONUS` (but not `SPLIT`). The conditional at `:66-70` treats `BONUS`/`SPLIT` as quantity-only (no cost change) — but `SPLIT` never enters this branch because it isn't in `BUY_TYPES`. It falls to the `else if (tx.transactionType === 'SPLIT')` branch at `:83-85` which adds `qty` to `quantity`. | Corporate-action handling is ambiguous: a 1:2 split stored as a ratio vs stored as a +N delta will produce different results; the current code only works if SPLITs are stored as positive-delta units. Schema/parser convention not documented. Equivalent concern for `SWITCH_IN`/`SWITCH_OUT` (both currently carry full cost). |
| NEW-006 | P1 | `capitalGains.service.ts:232-242` — `computeFIFOGains` filters to BUY/SELL types. **It ignores SPLIT, BONUS-adjustment deltas, and DEMERGER_OUT cost allocation.** Lot quantities are only adjusted via BUY/SELL. | A 1:2 split in the middle of a holding period won't adjust lot `qty` → post-split SELL will under-report quantity and mis-match basis. This is a concrete instance of BUG-014's "corporate actions in the middle of a holding period" concern. |
| NEW-007 | P2 | `gmail.connector.ts:187`, `mailboxPoller.ts:147,225`, `import.service.ts:86`, `genericExcel.parser.ts:34` — 5 bare `} catch {` or `} catch { // ignore }`. | Violates CLAUDE.md §3.10. All silent catches. At least one of these swallows `unlink` of an upload file after job deletion — leaves orphaned files. |
| NEW-008 | P0 (infra) | `packages/api/tsconfig.build.json:5` — `declarationMap: false` set but `declaration` is not set (inherited is `true` from `tsconfig.json` plus `noEmit: true`, but override sets `noEmit: false` + `declaration: false`; `declarationMap: true` inherited). | `pnpm -r run build` fails. Blocks CI, blocks Docker image build. Trivial fix (drop `declarationMap` or set `declaration: true`), but blocking today. |
| NEW-009 | P0 (infra) | `packages/api/tsconfig.json` includes `prisma/**/*.ts`; but `rootDir` is `src/`. `prisma/seed.ts` triggers `TS6059`. | `pnpm -r run typecheck` fails. Trivial fix (add `"exclude": ["prisma/**"]` or move seed to `src/prisma/`). |
| NEW-010 | P1 (infra) | `packages/api/package.json` and `apps/web/package.json` both define `lint` scripts calling `eslint`, but eslint is not in any `devDependencies`. | `pnpm -r run lint` fails immediately. CI gate impossible. |
| NEW-011 | P0 (infra) | Repo-wide: zero `*.test.ts` / `*.spec.ts` files. Vitest runs but finds nothing. | Violates CLAUDE.md §3.9 (parsers need ≥5 fixtures). Violates §5.3 manual QA gate assumption. No regression protection anywhere. |
| NEW-012 | P2 | `import.service.ts:145-157` + `:148-152` — `createTransaction` returns `created`, then a **separate** `prisma.transaction.update({ where: { id: created.id }, data: { importJobId } })`. If that update throws, the tx is committed without its import link. | Combined with no sourceHash, this produces orphan transactions that look manual. |
| NEW-013 | P2 | `imports.controller.ts:86-92` — `reprocess` endpoint calls `processImportJob(job.id)` **synchronously inline** in the HTTP request. | A reprocess of a 500-row CAS can run for minutes, holds the HTTP request, and risks timeout. Should enqueue to Bull like the initial processing does. |
| NEW-014 | P2 | `portfolio.service.ts:109-112` — `deletePortfolio` is hard delete; schema `Portfolio` has `onDelete: Cascade` on `Holding`, `Transaction`, `CashFlow`, `CapitalGain` (via Transaction), `ImportJob.portfolio` is `SetNull`-style via `portfolioId?`. | No soft-delete, no confirmation boundary, no audit trail (BUG-012). One errant DELETE wipes multi-year history irrecoverably. |
| NEW-015 | P2 | `apps/web/src/pages/imports/ImportPage.tsx` — no preview/confirm step (mirrors BUG-010); also no indication in UI when a parser returned warnings vs errors vs partial success — warnings are buried inside `errorLog.parserWarnings`. |  |
| NEW-016 | P2 | `reports.service.ts` + `capitalGains.service.ts:369-396` — `persistCapitalGainsForPortfolio` does `deleteMany` → `createMany`. If the transaction that spawned this call dies between delete and create, the user has zero CG rows persisted and the dashboard will read empty. Not wrapped in `$transaction`. | Data-loss window on crash. |
| NEW-017 | P3 | `middleware/upload.ts:37-44` — accepts `.html` / `.htm` file extensions, but no HTML parser is wired in `packages/api/src/services/imports/parsers/index.ts` (verified by file list). | Users uploading HTML contract notes will see them run through the generic CSV parser or fail. |

---

## 6. Prioritized red-flags

### P0 (blocks 4.5 entirely)

1. **NEW-008 — API build broken.** `tsconfig.build.json` TS5069.
2. **NEW-009 — API typecheck broken.** seed.ts outside rootDir.
3. **NEW-011 — Zero tests.** Cannot land any bug-fix with a failing-test-first discipline until test infra works.
4. **BUG-001 — Holding uniqueness.** Has to be fixed via Section 4.10 migration before any new asset class work.
5. **BUG-002 (partial) + BUG-003 (idempotency) + NEW-001 (stale CG after import) + NEW-002 (non-atomic import loop) — the import pipeline's state invariants are unsound.** Every re-upload duplicates; every import leaves stale capital gains; mid-import crash leaves partial rows with no link back to the job. These must be addressed together.

### P1 (block phase 4.5 exit)

6. **BUG-005 / BUG-009 — float precision at API boundary.** 65 `Number(` occurrences systemic; fix via `shared/src/decimal.ts` + branded `Money` type + serializer change.
7. **BUG-004 — CG cascade on tx edit/delete.** Edit of a post-sell BUY silently leaves stale capital gains. Test-first, then fix in `transaction.service.ts`.
8. **BUG-006 — no DLQ.** Import crashes swallow the raw input.
9. **BUG-008 — no RLS.** Defense-in-depth missing; a single missed `where: { userId }` = cross-tenant leak.
10. **BUG-014 / NEW-005 / NEW-006 — capital gains + corporate actions engine is incorrect.** 30-day-per-month threshold, no grandfathering, no equity-vs-debt-MF distinction, no split/bonus adjustment to lot quantities.
11. **NEW-010 — lint infra missing.** Blocks CI gate.

### P2 (during or just after phase 4.5)

12. BUG-007 — parser versioning.
13. BUG-010 — import wizard missing (real UX deficit).
14. BUG-012 — AuditLog.
15. BUG-013 — secrets in .env placeholder (low urgency; real risk is a developer committing a real `.env`).
16. BUG-015 — upload namespacing + magic-byte check.
17. NEW-003 — dead `Transaction.holdingId` FK.
18. NEW-004 — NULL-distinct in `prisma.transaction.findMany({ distinct })`.
19. NEW-007 — 5 silent catches.
20. NEW-012 — orphan tx on partial import-link update.
21. NEW-013 — reprocess runs in HTTP request.
22. NEW-014 — hard-delete of portfolio with no audit.
23. NEW-015 — no warnings/errors surfacing nuance in UI.
24. NEW-016 — CG persist is non-atomic replace.

### P3 (backlog)

25. BUG-016 — missing indexes.
26. NEW-017 — HTML contract notes accepted but not parsed.

---

## 7. Recommendations for Phase 4.5 ordering

CLAUDE.md §5.1 prescribes the order. Given the discovered infra issues, propose one adjustment:

**Insert Task 0 — repair build/test/lint infra — before Task 1:**

- Fix `packages/api/tsconfig.build.json` (drop `declarationMap` override or set `declaration: true`).
- Exclude `prisma/**` from the api `tsconfig.json` include, or move seed under `src/`.
- Install ESLint + plugins in both api and web (CLAUDE.md §5.1 task 13 needs this as well; pulling it forward lets us gate everything).
- Create `packages/api/vitest.config.ts` + one smoke test so `pnpm -r run test` exits 0.

Only after Task 0 does the rest of §5.1 (invariant tests → decimal → schema migration → projections → idempotency → FIFO repairs → DLQ → fixtures → cascade → RLS → atomic workers) become executable with confidence.

---

## Gate G1

Per CLAUDE.md §16, this audit is the deliverable for Gate G1. **No code has been modified, no migrations run, no data touched.** Claude Code is pausing here and awaiting explicit user approval before starting Phase 4.5.

The user should review this report and respond with one of:

- **"Approved — proceed with Phase 4.5"** → Claude Code will start with Task 0 (infra repair) if accepted, otherwise CLAUDE.md §5.1 Task 1.
- **"Not yet — investigate X further"** → call out items and Claude Code will expand the relevant sections.
- **"Reject — priorities are different"** → provide the revised plan.
