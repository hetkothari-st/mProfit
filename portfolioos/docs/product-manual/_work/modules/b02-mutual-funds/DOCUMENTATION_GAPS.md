# Documentation Gaps — Mutual Funds (B02)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Mutual Funds, Mutual Fund Analytics

## Verification limitations
- UI not visually verified: this run was code-only. Labels, messages and layout come from source; chart interactions and responsive layouts were not seen.
- CASParser, CAMS/KFintech portals and Finfactor need live credentials and third-party services; their responses were not exercised.

## Unverified claims
| ID | Item | What is unknown | Why it couldn't be verified | Suggested owner action |
|---|---|---|---|---|
<!-- BEGIN UNVERIFIED -->
| F-MF-009 | Finvu sandbox behaviour against live Finfactor | Shape of real (non-demo) responses rendered by the views | Needs a live token | Test with a real sandbox token |
| F-MF-010 | Finvu import for a second account using the same identifier | Whether the global `Transaction.sourceHash` unique index makes the second import fail (409 "Duplicate value for unique …") since `findUnique` under RLS cannot see the other user's row | Needs a database run with RLS | Run the import twice from two accounts on a dev DB |
| F-MF-021 | Narrative (prose) on verdicts | Whether narration is enabled in production | Depends on `ENABLE_LLM_ADVISOR_PROSE` and an Anthropic key | Check deployment env |
| F-MF-023 | Research job health | Whether each scheduled MF job runs successfully and covers the full scheme universe in production | Runtime only | Check job logs / ops alert emails |
| F-MF-003 | PDF password auto-try ("We auto-try your PAN, email & phone from Settings") | Which passwords the import pipeline tries | Owned by B07, not traced here | B07 to confirm |
<!-- END UNVERIFIED -->

## Implementation ambiguities and possible defects
| ID | Observation | Evidence (path:line) | Question |
|---|---|---|---|
<!-- BEGIN AMBIGUITIES -->
| F-MF-005 | Defect: the CASParser dialog collects **Portfolio** and **Nickname** but never sends them; the request body is only PAN, email and dates | `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:85`, `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:200`, `packages/api/src/controllers/mfCasparser.controller.ts:34` | Remove the fields or wire them through? |
| F-MF-004 | Defect: **Sync AMFI NAV** loads NAVs but does not reprice holding projections, so the holdings table is unchanged until the 22:00 IST job (which calls `refreshAllHoldingPrices` after the load) | `packages/api/src/controllers/assets.controller.ts:93`, `packages/api/src/priceFeeds/amfi.service.ts:295`, `packages/api/src/jobs/priceJobs.ts:97` | Should the button also reprice the caller's holdings? |
| F-MF-021 | Defect: analysis triggers on holdings change and on new scores (`onMfHoldingsChanged`, `onMfSchemeScoresUpdated`) have no callers, so findings/verdicts only update on manual **Refresh analysis** | `packages/api/src/jobs/mfAnalysisJob.ts:187`, `packages/api/src/jobs/mfAnalysisJob.ts:209` | Wire the triggers into the projection path and the score job? |
| F-MF-010 | Defect (security): any PLUS user can fetch and import Finfactor data for an arbitrary **Unique identifier**; nothing ties the identifier to the caller's consent | `packages/api/src/routes/finfactor.routes.ts:45`, `packages/api/src/ingestion/finfactor/sync.service.ts:135`, `packages/api/src/ingestion/finfactor/mf.service.ts:45` | Restrict to identifiers from the caller's own consent records? |
| F-MF-010 | Defect: the Finvu import upserts the shared `MutualFundMaster` table from upstream payloads (overwriting scheme name, AMC, category for every user; scheme code falls back to the ISIN) | `packages/api/src/ingestion/finfactor/sync.service.ts:171`, `packages/api/src/ingestion/finfactor/sync.service.ts:202` | Should user imports be allowed to rewrite global reference data? |
| F-MF-010 | Defect: after **Import to portfolio** the card invalidates `holdings` and `mutual-funds` cache keys, which the Mutual Funds page does not use (`portfolio-holdings`), so the page does not refresh | `apps/web/src/pages/mutualFunds/FinvuSandboxCard.tsx:145`, `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:65` | Invalidate `portfolio-holdings`? |
| F-MF-010 | Finvu source hash is not user-scoped (`finvu:<txnId>`) while `Transaction.sourceHash` is globally unique | `packages/api/src/ingestion/finfactor/sync.service.ts:224`, `packages/api/prisma/schema.prisma:1116` | Prefix with user id? |
| F-MF-009 | Operator sandbox shown on an end-user page to every plan; exposes env var names and the Finfactor base URL when unconfigured | `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:542`, `apps/web/src/pages/mutualFunds/FinvuSandboxCard.tsx:203` | Hide behind ADMIN or a flag? |
| F-MF-005 | The CASParser credits line shows the operator's shared CASParser account balance/plan to every user | `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:145`, `packages/api/src/controllers/mfCasparser.controller.ts:66` | Intended? |
| F-MF-006 | Portal mailback request records store **Portfolio** / **Nickname**, but nothing reads them; the eventual import is decided by the Gmail pipeline. Unlike CASParser, this flow does not add CAS senders to Gmail monitoring | `packages/api/src/services/mf/mfCasMailback/mfCasMailback.service.ts:68`, `packages/api/src/services/mf/mfCasparser/mfCasparser.service.ts:365` | Should mailback also add senders and honour the portfolio? |
| F-MF-006 | Managing mode: PAN reveal/save hit the account route (manager's PAN) while the mailback runs as the managed person (managed person's PAN used as PDF password) | `apps/web/src/api/client.ts:48`, `apps/web/src/pages/mutualFunds/MFCasMailbackDialog.tsx:96`, `packages/api/src/services/mf/mfCasMailback/mfCasMailback.service.ts:171` | Block the dialog while managing, or reveal the managed PAN? |
| F-MF-002 | The page fetches 200 MF transactions (server cap 200) with no paging; older rows silently missing | `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:72`, `packages/api/src/services/holdings/transaction.service.ts:659` | Add paging or a link to the full list? |
| F-MF-008 | Overlap card includes ETFs and values unpriced holdings at cost, while the page tiles exclude ETFs — "MF value" can differ from **Current value** | `packages/api/src/services/mf/mfOverlap.service.ts:92`, `packages/api/src/services/mf/mfOverlap.service.ts:124`, `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:173` | Align the two? |
| F-MF-019 | Alternative-fund links use a plain `href`, causing a full page reload instead of in-app navigation | `apps/web/src/pages/mf/components/PlainOverview.tsx:1303` | Use router Link? |
| F-MF-005 | The dialog's "Submitting request to KFintech..." step is never shown: the `submitting` phase is never set | `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:246` | Cosmetic |
| F-MF-021 | Break-even on switch cost is always unavailable because `REPLACEMENT_EXPECTED_EDGE` is null, so verdict row 3 (rating-driven Switch candidate) can never fire | `packages/api/src/services/mf/mfAnalytics/constants.ts:121`, `packages/api/src/services/mf/mfAnalytics/mfVerdict.ts:441` | By design until the backtest lands? |
| F-MF-022 | Code comment calls the methodology page "public", but the route sits inside the signed-in shell and the API requires authentication | `packages/api/src/routes/mfPortfolio.routes.ts:56`, `apps/web/src/App.tsx:196` | Make it public? |
| F-MF-010 | Auto-created "Finvu Imports" portfolio is created without the plan's portfolio-cap check | `packages/api/src/ingestion/finfactor/sync.service.ts:117` | Apply the cap? |
<!-- END AMBIGUITIES -->

## Hidden, partial, backend-only, deprecated features
| ID | Feature | Status | Evidence |
|---|---|---|---|
<!-- BEGIN HIDDEN -->
| F-MF-009 | Finvu sandbox explorer — operator tool on a user page, demo payloads | Partial | `apps/web/src/pages/mutualFunds/FinvuSandboxCard.tsx:1` |
| F-MF-010 | Finvu import — no consent ownership check, see ambiguities | Partial | `packages/api/src/ingestion/finfactor/sync.service.ts:135` |
| F-MF-024 | MF qualitative facts admin page (`/admin/mf-qualitative-facts`): no navigation link; ADMIN only, no two-factor. Form: **Fact type** (Regulatory action against the AMC, Front-running finding against the AMC, Strategy capacity cap, AUM shock), **Applies to** (Specific scheme codes / Every ACTIVE scheme of an AMC), **Valid from**, **Valid to (optional)**, **Source (required)** (min 8 characters), **Details (JSON)**, **Record fact**; list with **Scheme code** / **AMC code** filters, **Include expired**, delete with confirm. Entries change every user's scores | Hidden | `apps/web/src/App.tsx:203`, `apps/web/src/pages/mf/QualitativeFactsAdminPage.tsx:204`, `packages/api/src/routes/mfQualitativeFacts.routes.ts:48`, `packages/api/src/controllers/mfQualitativeFacts.controller.ts:135` |
| F-MF-025 | MF Central OTP sync: `MFCentralSyncDialog` is never imported; backend routes remain | Hidden | `apps/web/src/pages/mutualFunds/MFCentralSyncDialog.tsx:52`, `packages/api/src/routes/mfCentral.routes.ts:14` |
| F-MF-026 | CDSL CAS via CASParser OTP: client methods exist but no component calls them | Backend-only | `packages/api/src/routes/mfCasparser.routes.ts:15`, `apps/web/src/api/mf/mfCasparser.api.ts:55` |
| F-MF-027 | CAS mailback job list/detail: no UI | Backend-only | `packages/api/src/routes/mfCasMailback.routes.ts:16` |
| F-MF-028 | Per-scheme reference reads (meta, metrics, score, peers, holdings): client methods unused by pages | Backend-only | `packages/api/src/routes/mfAnalytics.routes.ts:65` |
| F-MF-029 | Qualitative fact PATCH: no edit UI (the page only creates and deletes) | Backend-only | `packages/api/src/routes/mfQualitativeFacts.routes.ts:64` |
| F-MF-030 | Finvu holding by ISIN endpoint: no web caller | Backend-only | `packages/api/src/routes/finfactor.routes.ts:51` |
<!-- END HIDDEN -->

## UI / API permission mismatches
| ID | UI behavior | API behavior | Evidence |
|---|---|---|---|
<!-- BEGIN MISMATCHES -->
| F-MF-009 | Finvu card and buttons shown to Free users | 403 "This feature requires the PLUS plan or higher" | `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:542`, `packages/api/src/routes/finfactor.routes.ts:42` |
| F-MF-024 | Non-admin sees "This page is restricted to administrators." | 401 "Insufficient role" (not 403); admins need no two-factor here unlike other admin tools | `apps/web/src/pages/mf/QualitativeFactsAdminPage.tsx:204`, `packages/api/src/routes/mfQualitativeFacts.routes.ts:48` |
| F-MF-006 | Managing mode dialog shows the manager's PAN | Mailback uses the managed person's PAN | `packages/api/src/services/family/managedProfile.service.ts:37` |
<!-- END MISMATCHES -->

## Choices made without asking
| Choice | Alternatives | Why |
|---|---|---|
<!-- BEGIN CHOICES -->
| Split B02 into two modules: Mutual Funds (holdings and imports) and Mutual Fund Analytics | One module | The analytics pages are plan-gated and conceptually separate |
| Marked the Finvu card and import Partial rather than Live | Live | It is an operator sandbox with demo payloads and no consent binding |
| Marked the admin facts page Hidden (documented in gaps, not taught in the manual); no S- IDs for its controls | Document as a feature | modules.md classifies it Hidden; no nav entry |
| Documented the Scan inbox button as an in-scope trigger and the scan itself as D-MF-004 | Dependency only | The button lives on the MF page |
| Did not document the mailback/import pipeline internals (owned by B07) | Trace fully | Brief assigns import pipeline to B07 |
| Summarised the 33 rule checks by category instead of listing each rule | Full rule list | Rules are internal; the UI shows each finding's own headline and evidence |
<!-- END CHOICES -->

## Audit allow-list
| Literal | Where it appears in source | Why it's not real data |
|---|---|---|
<!-- BEGIN ALLOWLIST -->
<!-- END ALLOWLIST -->
