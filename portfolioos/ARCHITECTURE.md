# EveryPaisa — Architecture & Folder Map

Start here. This file tells you what every folder is for and where the code for any feature lives.
For setup and run commands see [`README.md`](README.md); for the test environment see
[`packages/api/TESTING.md`](packages/api/TESTING.md). For the in-depth guide (the five invariants, how row-level
security works, the family layer, billing, the data model, and each feature's domain rules) read
[`CONTEXT.md`](CONTEXT.md) next.

## What this is

EveryPaisa is a web app for Indian investors to track their whole net worth: stocks, mutual funds, F&O, PF/PPF,
property, rentals, insurance, loans, vehicles and more. It also covers tax reports, accounting (Tally export), family
sharing and an AI assistant. It's a pnpm monorepo: a React frontend, an Express + Prisma API, and a shared
TypeScript package.

## Top-level folders

Paths are relative to the repo root.

| Path | What it is |
|---|---|
| `portfolioos/apps/web` | React 18 + Vite frontend (Tailwind, shadcn/ui, React Query, Zustand). |
| `portfolioos/packages/api` | Express + Prisma (PostgreSQL) + Bull (Redis) backend. The schema and migrations are in `prisma/`. |
| `portfolioos/packages/shared` | Types and helpers used by both web and api, imported as `@everypaisa/shared`: Decimal money, pricing, tax maths, and similar. |
| `portfolioos/eslint-plugin-everypaisa` | The project's own lint rules, for example no `parseFloat` on money and no silent `catch`. |
| `portfolioos/scripts` | Repo-level scripts: DB backup/restore, logo fetchers, and `feature-index.mjs` (regenerates the table below). |
| `extension/` | Browser extension that fetches PF/PPF passbooks from the user's browser. |
| `docs/` | All project docs. `superpowers/specs` + `superpowers/plans` hold feature designs, `qa/` holds manual QA checklists, `history/` holds superseded plans and audits, and the rest are topic folders. |
| `CLAUDE.md`, `AGENTS.md` | Instructions for AI coding agents working in this repo. |

## How a request flows

```
apps/web/src/pages/<feature>/…            UI page (route table in apps/web/src/App.tsx)
  → apps/web/src/api/<feature>.api.ts     typed HTTP client (shared axios instance in api/client.ts)
  → packages/api/src/routes/<feature>.routes.ts       URL → handler, auth + validation middleware
       (every router is mounted in routes/index.ts; app setup in src/index.ts)
  → packages/api/src/controllers/<feature>.controller.ts   parse request, call service, shape response
  → packages/api/src/services/…           business logic, DB reads/writes
  → Prisma (lib/prisma.ts)                Postgres, with row-level security set per request (lib/requestContext.ts)
```

Background work runs as Bull jobs: `packages/api/src/jobs/*`, queued through `lib/queue.ts`, and started from
`src/index.ts`. Responses use one shape everywhere: `{ success, data }` or `{ success: false, error }` (see
`lib/response.ts`). Money crosses the API as strings and is handled as `Decimal` on both sides.

## API `src/` folders (`portfolioos/packages/api/src`)

| Folder | What goes here |
|---|---|
| `routes/` | One `<feature>.routes.ts` per area: URL definitions only. |
| `controllers/` | One `<feature>.controller.ts` per area: request → service → response. |
| `services/` | Business logic, grouped by feature into sub-folders (`services/<feature>/`). |
| `ingestion/` | Bringing data in from outside: Gmail, LLM parsing, the canonical-event pipeline, and (after the move) every per-source fetcher or parser. See the placement rule. |
| `connectors/`, `integrations/` | **Being merged into `ingestion/`.** Gmail/Zerodha OAuth connectors and the Finfactor (account aggregator) client. |
| `priceFeeds/` | Market-data fetchers: NSE/BSE bhavcopy, AMFI NAV, indices, FX, commodity, crypto. |
| `jobs/` | Bull workers and cron schedules. |
| `ai/` | AI assistant: Claude client, context building, prompts, tools. |
| `lib/` | Infrastructure used everywhere: prisma, queue, logger, errors, secrets, file storage, auth helpers. |
| `middleware/` | Express middleware: authenticate, rate limit, validation, upload, plan gating. |
| `config/` | `env.ts`, which validates environment variables at startup. |
| `schemas/` | Zod request schemas that are shared between routes. |
| `scripts/` | One-off operator scripts run with `tsx` (backfills, coverage reports). More operator scripts live in `packages/api/scripts/`. |
| `data/`, `types/` | Static reference data and ambient type declarations. |

## Where new code goes (placement rule)

- **`src/ingestion/<source>/`** holds code that *talks to an outside source and turns its data into our shapes*: fetching,
  scraping, OAuth clients, parsing, adapters. Sources include `gmail/`, `zerodha/`, `finfactor/`, `pf/`,
  `mfcentral/`, `mfMailback/`, `casparser/`, `vehicle/`, `fileImport/`, `fno/` and `llm/`. Shared pipeline pieces
  (`hash`, `pii`, `projection`, `templates`, `types.ts`) sit at the `src/ingestion/` root.
- **`src/services/<feature>/`** holds what the app *does* with data: business logic, DB reads and writes, maths, and
  workflows such as approvals, sessions and nudges.
- **`src/priceFeeds/`** holds market-data fetchers.
- A new API area adds `routes/<feature>.routes.ts` and `controllers/<feature>.controller.ts`, mounts the router in
  `routes/index.ts`, puts its logic in `services/<feature>/`, and adds a row to the feature index by re-running
  the generator.

## Web `src/` folders (`portfolioos/apps/web/src`)

| Folder | What goes here |
|---|---|
| `pages/<feature>/` | One folder per screen area. These are the route targets in `App.tsx`. |
| `components/` | Reusable UI. `ui/` holds shadcn primitives, `layout/` holds the app shell and sidebar, and the other folders are feature-specific widgets. |
| `api/` | Typed HTTP clients, one per backend area (`<feature>.api.ts`). |
| `stores/` | Zustand stores: auth, theme, privacy, family scope, acting-as. |
| `hooks/`, `lib/`, `context/` | Shared hooks, pure helpers (each with a colocated `.test.ts`), and React context. |
| `styles/`, `data/` | Global CSS and static data. |

## Tests

- **API:** tests live next to their source as `src/**/*.test.ts`, plus a mirrored tree under `packages/api/test/`
  (`test/services/…`, `test/routes/…`, `test/invariants/`, `test/regressions/`). They run against a real Postgres as
  the non-superuser `portfolioos_app` role so row-level security is exercised. See `packages/api/TESTING.md`.
- **Web and shared:** colocated `*.test.ts(x)`, run with Vitest.
- To run everything: `pnpm -r run test` from `portfolioos/`. Run lint, typecheck and build the same way:
  `pnpm -r run lint && pnpm -r run typecheck && pnpm -r run build`.

## Moving or renaming files

Use the move tool. It runs `git mv` and rewrites every import, including `vi.mock(...)` and dynamic `import(...)`
paths that `tsc` doesn't check:

```bash
# moves.json: [{ "from": "src/services/x.service.ts", "to": "src/services/x/x.service.ts" }]   (dirs allowed)
pnpm --filter @everypaisa/api exec tsx scripts/moveFiles.ts --root . --map moves.json --scan src,test,scripts
pnpm --filter @everypaisa/api exec tsx scripts/moveFiles.ts --root . --scan src,test,scripts --check   # 0 = good
node scripts/feature-index.mjs --write      # from portfolioos/, refreshes the table below
```

Also grep for the old path in non-TS files (the Dockerfile, `package.json` scripts, `__dirname` joins, docs).

## Feature index

This table is generated from the import graph by `node scripts/feature-index.mjs --write`. Don't edit it by hand.
There's one row per API route file. A dash means nothing matched by name, and some features use a different web
folder (for example `mf*` routes map to `pages/mf/` and `pages/mutualFunds/`).

<!-- feature-index:start -->
| Feature | Routes (`routes/`) | Controllers (`controllers/`) | Services / ingestion (`src/`) | Jobs (`jobs/`) | Web page (`pages/`) | Web client (`api/`) |
|---|---|---|---|---|---|---|
| accounting | `accounting.routes.ts` | `accounting.controller.ts` | `services/accounting.service.ts`, `services/receipts/` | — | `accounting/` | `accounting.api.ts` |
| adminLoanRates | `adminLoanRates.routes.ts` | `loanRates.controller.ts` | `services/loanRates/` | — | — | — |
| advisor | `advisor.routes.ts` | `advisor.controller.ts` | `services/advisor/` | — | `advisor/` | `advisor.api.ts` |
| aiAssistant | `aiAssistant.routes.ts` | — | `ai/cardStream.ts`, `ai/chatSessions.ts`, `ai/claudeClient.ts`, `ai/contextBuilder.ts`, `ai/conversationStore.ts`, `ai/knowledge/`, `ai/queryClassifier.ts`, `ai/rateLimit.ts`, `ai/suggestedQuestions.ts`, `ai/userFacts.ts` | — | — | `aiAssistant.api.ts` |
| alerts | `alerts.routes.ts` | `alerts.controller.ts` | `services/alerts.service.ts` | `alertJobs.ts` | `alerts/` | `alerts.api.ts` |
| analytics | `analytics.routes.ts` | `analytics.controller.ts` | `ingestion/llm/`, `services/analytics.benchmark.ts`, `services/analytics.insights.ts`, `services/analytics.risk.ts`, `services/analytics.service.ts`, `services/deterministicInsights.ts`, `services/mfOverlap.service.ts`, `services/whatIf.service.ts` | `mfProseJob.ts`, `priceJobs.ts` | `analytics/` | `analytics.api.ts` |
| assets | `assets.routes.ts` | `assets.controller.ts` | `priceFeeds/amfi.service.ts`, `priceFeeds/bseUniverse.service.ts`, `priceFeeds/commodity.service.ts`, `priceFeeds/corporateActions.service.ts`, `priceFeeds/crypto.service.ts`, `priceFeeds/fx.service.ts`, `priceFeeds/nseUniverse.service.ts`, `priceFeeds/router.service.ts`, `priceFeeds/yahoo.service.ts`, `services/holdings.service.ts`, `services/masterData.service.ts` | `priceJobs.ts`, `startupSync.ts` | — | `assets.api.ts` |
| auth | `auth.routes.ts` | `auth.controller.ts` | `services/accountDeletion.service.ts`, `services/auth.service.ts`, `services/piiAtRest.service.ts`, `services/securityAlerts.service.ts`, `services/twoFactor.service.ts` | `accountDeletionJob.ts`, `piiAtRestJobs.ts`, `securityAlertJobs.ts` | `auth/` | `auth.api.ts` |
| bankAccounts | `bankAccounts.routes.ts` | `bankAccounts.controller.ts` | `services/bankAccounts.service.ts`, `services/ifscLookup.service.ts` | — | `bankAccounts/` | `bankAccounts.api.ts` |
| billing | `billing.routes.ts` | — | `services/auth.service.ts`, `services/billing/` | — | — | `billing.api.ts` |
| ca | `ca.routes.ts` | `ca.controller.ts`, `caAccounting.controller.ts` | `services/accounting.service.ts`, `services/ca/`, `services/fmvOverride.service.ts`, `services/holdingsProjection.ts`, `services/imports/`, `services/transaction.service.ts` | `importWorker.ts`, `mailboxPoller.ts`, `pfFetchWorker.ts` | `ca/`, `cas/` | `ca.api.ts` |
| canonicalEvents | `canonicalEvents.routes.ts` | `canonicalEvents.controller.ts` | `services/canonicalEvents.service.ts` | — | — | `canonicalEvents.api.ts` |
| cas | `cas.routes.ts` | `cas.controller.ts` | — | — | `ca/`, `cas/` | `cas.api.ts` |
| cashflows | `cashflows.routes.ts` | `cashflows.controller.ts` | `services/cashflowForecast.service.ts` | — | `cashflows/` | `cashflows.api.ts` |
| connect | `connect.routes.ts` | — | `services/mcp/` | `mcpCleanupJob.ts` | `connect/` | `connect.api.ts` |
| connectors | `connectors.routes.ts` | `connectors.controller.ts` | `connectors/zerodha.connector.ts` | — | `connectors/` | `connectors.api.ts` |
| corporateActions | `corporateActions.routes.ts` | `corporateActions.controller.ts` | `priceFeeds/corporateActions.service.ts`, `services/corporateActionApply.service.ts`, `services/corporateActionsReport.service.ts` | `corporateActionApplyJob.ts`, `priceJobs.ts` | `corporateActions/` | `corporateActions.api.ts` |
| creditCards | `creditCards.routes.ts` | `creditCards.controller.ts` | `services/creditCards.service.ts` | — | `creditCards/` | `creditCards.api.ts` |
| dashboard | `dashboard.routes.ts` | — | `services/dashboard.service.ts` | `netWorthSnapshotJob.ts` | `dashboard/` | `dashboard.api.ts` |
| documentSorter | `documentSorter.routes.ts` | `documentSorter.controller.ts` | `services/docSorter/` | `docSortWorker.ts` | `documentSorter/` | `documentSorter.api.ts` |
| documents | `documents.routes.ts` | `document.controller.ts` | `services/document.service.ts`, `services/reports/` | — | — | `documents.api.ts` |
| emi | `emi.routes.ts` | `emi.controller.ts` | `services/emi/` | — | `emi/` | `emi.api.ts` |
| families | `families.routes.ts` | `familyDashboard.controller.ts` | `services/family.service.ts`, `services/family/`, `services/familyScope.service.ts` | — | — | `families.api.ts` |
| finfactor | `finfactor.routes.ts` | `finfactor.controller.ts` | `integrations/finfactor/` | — | — | `finfactor.api.ts` |
| fo | `fo.routes.ts` | `fo.controller.ts`, `brokerOauth.controller.ts` | `priceFeeds/nseOptionChain.service.ts`, `services/brokerOauth/`, `services/derivativePosition.service.ts`, `services/foBrokerSync.service.ts`, `services/foPnl.service.ts`, `services/reports/` | `priceJobs.ts` | — | `fo.api.ts` |
| forex | `forex.routes.ts` | `forex.controller.ts` | `priceFeeds/fx.service.ts`, `services/forex.service.ts` | `priceJobs.ts`, `startupSync.ts` | `forex/` | `forex.api.ts` |
| gmail | `gmail.routes.ts` | `gmail.controller.ts` | `connectors/gmail.connector.ts`, `ingestion/gmail/` | `mailboxPoller.ts` | — | `gmail.api.ts` |
| gmailScan | `gmailScan.routes.ts` | `gmailScan.controller.ts` | `services/gmailAutoApproveRules.service.ts`, `services/gmailDiscoveredDocs.service.ts`, `services/gmailDocApproval.service.ts`, `services/gmailScanJobs.service.ts` | `gmailScanWorker.ts` | — | `gmailScan.api.ts` |
| goals | `goals.routes.ts` | `goals.controller.ts` | `services/goals.service.ts` | — | `goals/` | `goals.api.ts` |
| imports | `imports.routes.ts` | `imports.controller.ts` | `services/imports/`, `services/ingestionFailures.service.ts`, `services/piiAtRest.service.ts` | `benchmarkPriceJob.ts`, `importWorker.ts`, `loanRatesJob.ts`, `mailboxPoller.ts`, `mfFactsheetJob.ts`, `mfMetadataJob.ts`, `mfMetricsJob.ts`, `mfNavAdjustmentJob.ts`, `mfNavHistoryBackfillJob.ts`, `mfPeerRankJob.ts`, `mfReconciliationJob.ts`, `mfScoreJob.ts`, `pfFetchWorker.ts`, `piiAtRestJobs.ts`, `riskFreeRateJob.ts` | `imports/` | `imports.api.ts` |
| income | `income.routes.ts` | `income.controller.ts` | `services/income.service.ts` | — | `income/` | `income.api.ts` |
| ingestion | `ingestion.routes.ts` | `ingestion.controller.ts` | `ingestion/llm/` | `mfProseJob.ts` | `ingestion/` | `ingestion.api.ts` |
| ingestionFailures | `ingestionFailures.routes.ts` | `ingestionFailures.controller.ts` | `services/ingestionFailures.service.ts` | `benchmarkPriceJob.ts`, `loanRatesJob.ts`, `mfFactsheetJob.ts`, `mfMetadataJob.ts`, `mfMetricsJob.ts`, `mfNavAdjustmentJob.ts`, `mfNavHistoryBackfillJob.ts`, `mfPeerRankJob.ts`, `mfReconciliationJob.ts`, `mfScoreJob.ts`, `pfFetchWorker.ts`, `riskFreeRateJob.ts` | — | `ingestionFailures.api.ts` |
| insurance | `insurance.routes.ts` | `insurance.controller.ts`, `insuranceCoverage.controller.ts` | `services/insurance.service.ts`, `services/insuranceCoverage.service.ts`, `services/insuranceExtras.service.ts` | `insuranceJobs.ts` | `insurance/` | `insurance.api.ts` |
| intelligence | `intelligence.routes.ts` | `intelligence.controller.ts` | `services/healthScore.service.ts`, `services/netWorthHistory.service.ts` | — | `intelligence/` | `intelligence.api.ts` |
| legacy | `legacy.routes.ts` | `legacy.controller.ts` | `services/legacy/`, `services/notifications/` | — | `legacy/` | `legacy.api.ts` |
| loanRates | `loanRates.routes.ts` | `loanRates.controller.ts` | `services/loanRates/` | — | — | `loanRates.api.ts` |
| loans | `loans.routes.ts` | `loans.controller.ts` | `services/loanChecks/`, `services/loans.service.ts` | `loanChecksJob.ts` | `loans/` | `loans.api.ts` |
| loansGiven | `loansGiven.routes.ts` | `loansGiven.controller.ts` | `services/loansGiven.service.ts` | — | — | `loansGiven.api.ts` |
| mailboxes | `mailboxes.routes.ts` | `mailboxes.controller.ts` | `connectors/gmail.connector.ts` | `mailboxPoller.ts` | `mailboxes/` | `mailboxes.api.ts` |
| managedProfiles | `managedProfiles.routes.ts` | — | `services/family/` | — | — | `managedProfiles.api.ts` |
| mcp | `mcp.routes.ts` | — | `services/mcp/` | `mcpCleanupJob.ts` | — | — |
| mcpOAuth | `mcpOAuth.routes.ts` | — | `services/mcp/` | `mcpCleanupJob.ts` | — | — |
| mfAnalytics | `mfAnalytics.routes.ts` | `mfAnalytics.controller.ts`, `mfFindings.controller.ts` | `services/mfAnalytics/` | `mfMetricsJob.ts`, `mfPeerRankJob.ts`, `mfScoreJob.ts` | — | `mfAnalytics.api.ts` |
| mfCasMailback | `mfCasMailback.routes.ts` | `mfCasMailback.controller.ts` | `services/mfCasMailback/` | — | — | `mfCasMailback.api.ts` |
| mfCasparser | `mfCasparser.routes.ts` | `mfCasparser.controller.ts` | `services/mfCasparser/` | — | — | `mfCasparser.api.ts` |
| mfCentral | `mfCentral.routes.ts` | `mfCentral.controller.ts` | `services/mfcentral/` | — | — | `mfCentral.api.ts` |
| mfPortfolio | `mfPortfolio.routes.ts` | `mfPortfolio.controller.ts` | `services/familyScope.service.ts`, `services/mfAnalytics/` | — | — | — |
| mfQualitativeFacts | `mfQualitativeFacts.routes.ts` | `mfQualitativeFacts.controller.ts` | — | — | — | `mfQualitativeFacts.api.ts` |
| monitoredSenders | `monitoredSenders.routes.ts` | `monitoredSenders.controller.ts` | `services/monitoredSenders.service.ts` | — | — | `monitoredSenders.api.ts` |
| notifications | `notifications.routes.ts` | `notificationConfig.controller.ts`, `alertPrefs.controller.ts` | `services/notifications/` | — | — | `notifications.api.ts` |
| pf | `pf.routes.ts` | `pf.controller.ts` | `ingestion/pf/`, `services/extensionPairing.service.ts`, `services/holdingsProjection.ts`, `services/pf/`, `services/pfAccounts.service.ts`, `services/pfCanonicalize.service.ts`, `services/pfCredentials.service.ts`, `services/pfFetchSessions.service.ts`, `services/pfNudges.service.ts` | `pfFetchWorker.ts`, `pfNudgeJob.ts` | `pf/` | `pf.ts` |
| portfolioGroups | `portfolioGroups.routes.ts` | `portfolioGroup.controller.ts` | `services/portfolioGroup.service.ts` | — | — | `portfolioGroups.api.ts` |
| portfolios | `portfolios.routes.ts` | `portfolio.controller.ts` | `services/portfolio.service.ts` | — | `portfolios/` | `portfolios.api.ts` |
| propertyMedia | `propertyMedia.routes.ts` | `propertyMedia.controller.ts` | `services/propertyLocation.service.ts`, `services/propertyPhotos.service.ts` | — | — | `propertyMedia.api.ts` |
| realEstate | `realEstate.routes.ts` | `realEstate.controller.ts` | `services/realEstate.service.ts` | — | `realEstate/` | `realEstate.api.ts` |
| rental | `rental.routes.ts` | `rental.controller.ts`, `rentalReminders.controller.ts` | `services/charts/`, `services/export.service.ts`, `services/rental.reminders.service.ts`, `services/rental.service.ts`, `services/rentalLedger.service.ts` | `rentalJobs.ts` | `rental/` | `rental.api.ts` |
| reports | `reports.routes.ts` | `reports.controller.ts` | `services/ca/`, `services/capitalGains.service.ts`, `services/charts/`, `services/export.service.ts`, `services/piiAtRest.service.ts`, `services/reportBuilder/`, `services/reports.service.ts`, `services/reports/`, `services/specialReports.service.ts`, `services/tally/`, `services/xirr.service.ts` | `piiAtRestJobs.ts` | `reports/` | `reports.api.ts` |
| split | `split.routes.ts` | `split.controller.ts` | `services/split/` | `splitDigestJobs.ts`, `splitShareLinkReconcileJob.ts` | `split/` | `split.api.ts` |
| tax | `tax.routes.ts` | `tax.controller.ts`, `fmv.controller.ts` | `services/advanceTax.service.ts`, `services/charts/`, `services/fmvOverride.service.ts`, `services/piiAtRest.service.ts`, `services/reportBuilder/`, `services/reports/`, `services/tax.service.ts` | `piiAtRestJobs.ts` | `tax/` | `tax.api.ts` |
| transactions | `transactions.routes.ts` | `transaction.controller.ts`, `transactionPhotos.controller.ts` | `services/duplicates.service.ts`, `services/propertyPhotos.service.ts`, `services/transaction.service.ts` | — | `transactions/` | `transactions.api.ts` |
| userPreferences | `userPreferences.routes.ts` | `userPreferences.controller.ts` | `services/userPreferences.service.ts` | — | — | `userPreferences.api.ts` |
| valuation | `valuation.routes.ts` | `valuation.controller.ts` | `services/valuation/` | — | — | `valuation.api.ts` |
| vehicles | `vehicles.routes.ts` | `vehicles.controller.ts` | `ingestion/vehicle/`, `priceFeeds/fuel.service.ts`, `priceFeeds/fuelStates.ts`, `services/challans.service.ts`, `services/piiAtRest.service.ts`, `services/vehicles.service.ts` | `piiAtRestJobs.ts`, `priceJobs.ts`, `vehicleJobs.ts` | `vehicles/` | `vehicles.api.ts` |
| will | `will.routes.ts` | `will.controller.ts` | `services/will/` | `willReviewJob.ts` | `will/` | `will.api.ts` |
<!-- feature-index:end -->
