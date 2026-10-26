# Documentation Gaps — Reports, Tax, Analytics, Portfolio Score (B08)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Reports, Tax Planning, Analytics, Portfolio Score, nightly data-integrity job

## Verification limitations
- UI not visually verified: this run was code-only. Labels, messages and layout come from source; charts, PDF/Excel layouts and responsive views were not seen.
- The 42 catalog reports were documented from their card descriptions and route gates; the contents of each generated file were not opened.
- AI Insights depend on server configuration and the Anthropic API; no generation was run.

## Unverified claims
| ID | Item | What is unknown | Why it couldn't be verified | Suggested owner action |
|---|---|---|---|---|
<!-- BEGIN UNVERIFIED -->
| F-REPORT-014 | Export to Tally rule checks | Which Tally rules can block the export and their messages | Tally builder (`services/accounting/tally/`) owned by B11 not traced | B11 to list the blocking rules |
| F-REPORT-015 | Inbox approve/reject server behaviour | Exactly what approve imports, and what the auto-approve rule matches | Gmail scan backend is B07's | B07 to confirm |
| F-REPORT-016 | Section exports (vehicles, insurance, loans, credit cards, rental, real estate) | Columns of each section file | Per-section payload builders not read in full | Check `packages/api/src/controllers/reports.controller.ts:594` onward |
| F-ANLYT-004 | AI Insights in production | Whether `ENABLE_LLM_INSIGHTS` and an API key are set on the live deployment | Runtime configuration | Check deployment env |
<!-- END UNVERIFIED -->

## Implementation ambiguities and possible defects
| ID | Observation | Evidence (path:line) | Question |
|---|---|---|---|
<!-- BEGIN AMBIGUITIES -->
| F-TAX-004 | Confirmed defect: the Tax page's **ITR-portal CSV** and **Schedule 112A CSV (with FMV)** buttons call `/api/tax/grandfathering.csv`, which uses `req.user!.id` and ignores `subject`. With **Download reports for** set to a member, the file contains the caller's own data but is named after the member. `/api/tax/schedule-112a.csv` (which honours the subject) is unused. | `apps/web/src/pages/tax/TaxPage.tsx:215`, `apps/web/src/pages/tax/TaxPage.tsx:222`, `packages/api/src/controllers/fmv.controller.ts:117`, `packages/api/src/controllers/tax.controller.ts:119` | Point the buttons at `/api/tax/schedule-112a.csv` or make the grandfathering endpoints subject-aware? |
| F-REPORT-001 | Confirmed defect: in a family view the Reports and Analytics portfolio selectors list portfolios of other members (list follows family scope), but report/analytics endpoints reject any portfolio the caller does not own with 403; the page then shows an empty tab with no message. | `packages/api/src/services/holdings/portfolio.service.ts:51`, `packages/api/src/controllers/reports.controller.ts:93`, `packages/api/src/controllers/analytics.controller.ts:67`, `apps/web/src/pages/reports/ReportsPage.tsx:311` | Filter the selectors to own portfolios, or make the endpoints family-aware? |
| F-REPORT-016 | Confirmed defect: Download Report dialog (holdings) with **All portfolios** sends every id in the portfolio list. In a family view, or with a member chosen in **Report for**, those ids are not all owned by the subject and the export fails with "Forbidden". | `apps/web/src/components/reports/DownloadReportButton.tsx:98`, `packages/api/src/controllers/reports.controller.ts:411` | Send `all` (supported by the server) instead of the list? |
| F-REPORT-011 | Confirmed defect: Statements tab with a single **Portfolio** and **Report for** = a member sends the caller's portfolio id for the member's statement → 403 "Forbidden". | `apps/web/src/pages/reports/ReportsPage.tsx:1025`, `packages/api/src/controllers/reports.controller.ts:912` | Send `all` when the subject is not self? |
| F-TAX-007 | Confirmed defect: the F&O tab is shown on every plan; below Pro/Advisor the API returns 403 and the page shows a blank tab with no lock card. | `apps/web/src/pages/tax/TaxPage.tsx:44`, `apps/web/src/pages/tax/TaxPage.tsx:762`, `packages/api/src/routes/tax.routes.ts:39` | Wrap in `LockedFeature` or hide? |
| F-TAX-002 | Summary footnote says estimates exclude "any FMV adjustment for pre-31-Jan-2018 equity (grandfathering)", but the 112A computation uses `taxableGain`, which carries grandfathering. | `apps/web/src/pages/tax/TaxPage.tsx:617`, `packages/api/src/services/tax/taxComputation.ts:17` | Update the footnote? |
| F-TAX-002 | Tax summary computes and shows F&O net P&L/tax for every plan although the F&O schedule is a Pro/Advisor feature. | `packages/api/src/services/tax/tax.service.ts:270`, `packages/api/src/routes/tax.routes.ts:39` | Intended? |
| F-TAX-009 | Harvest footnote says classification "uses the oldest BUY in the lot", but the server classifies by remaining FIFO lots; "Days to LTCG" uses fixed 365/730/1095 days in the browser, not the rules table (24 months for non-equity funds after 23-Jul-2024). The code comment says ≤7 days is "red" but it is styled with the positive (green) colour. | `apps/web/src/pages/tax/TaxPage.tsx:1048`, `apps/web/src/pages/tax/TaxPage.tsx:119`, `apps/web/src/pages/tax/TaxPage.tsx:1018`, `packages/api/src/services/tax/tax.service.ts:568` | Align text and thresholds with the server? |
| F-TAX-010 | FMV save/delete have no error handling: a failed save throws an unhandled rejection with no message; delete does not refresh the Schedule 112A tab. Invalid input is silently ignored. | `apps/web/src/pages/tax/TaxPage.tsx:1082`, `apps/web/src/pages/tax/TaxPage.tsx:1093` | Add error toast and invalidate `tax-112a` on delete? |
| F-ANLYT-008 | With one portfolio selected, the harvest card filters only the candidate list; totals and estimated saving are for all portfolios. | `packages/api/src/services/analytics/analytics.service.ts:847`, `packages/api/src/services/analytics/analytics.service.ts:852` | Scope totals to the portfolio? |
| F-ANLYT-005 | Concentration info text says holdings "above 60% is flagged", but the card renders no flag. | `apps/web/src/pages/analytics/infoCopy.ts:115`, `apps/web/src/pages/analytics/widgets/ReturnsWidgets.tsx:100` | Add the flag or change the text? |
| F-ANLYT-006 | Best/worst re-ranks by rupees only the top 10 by percentage from the API, so a large-rupee loser outside those can be missed. | `apps/web/src/pages/analytics/widgets/ReturnsWidgets.tsx:44`, `packages/api/src/services/analytics/analytics.service.ts:342` | Rank by rupees on the server? |
| F-ANLYT-004 | Budget-capped message says "until the cap is raised in settings", but the cap is an operator AppSetting with no user setting. Operator messages ("set ENABLE_LLM_INSIGHTS=true", "ANTHROPIC_API_KEY is not set") are shown to users. Insight cache ignores the period. | `apps/web/src/pages/analytics/widgets/InsightsPanel.tsx:256`, `packages/api/src/services/analytics/analytics.insights.ts:185`, `packages/api/src/services/analytics/analytics.insights.ts:293` | Reword user-facing messages? |
| F-INTEL-001 | Page says "Recalculated automatically every 24 hours"; no scheduled job computes it — the stored score is reused for 24 h and recomputed on the next visit. **Recalculate** has no error handling. | `apps/web/src/pages/intelligence/HealthScorePage.tsx:128`, `apps/web/src/pages/intelligence/HealthScorePage.tsx:118`, `packages/api/src/services/analytics/healthScore.service.ts:15` | Reword to "refreshed when older than 24 hours"? |
| F-REPORT-010 | All Reports/Tax download errors are shown with `alert()` containing the raw server response body (JSON). | `apps/web/src/pages/reports/ReportsPage.tsx:286`, `apps/web/src/pages/reports/TaxMisDownloads.tsx:577`, `apps/web/src/hooks/useDownloadReport.ts:43` | Parse and show the message? |
| F-REPORT-015 | `STATUS_OPTIONS` (incl. Rejected, Not financial, Already imported) is defined but unused; only five chips are rendered. | `apps/web/src/pages/reports/InboxImportsTab.tsx:15`, `apps/web/src/pages/reports/InboxImportsTab.tsx:122` | Dead code or missing chips? |
| F-REPORT-013 | Catalog Schedule 112A download accepts **Whole family** (one section per member), while the Tax page refuses a combined Schedule 112A as "not a valid filing". | `packages/api/src/controllers/reports.controller.ts:1185`, `packages/api/src/services/reports/reportSubjects.ts:432` | Apply `requireSingleSubject` to the catalog Schedule 112A? |
| — | Family roles: capped vs uncapped contributors/viewers behave differently for report subjects; the global roles do not split them. | `apps/web/src/components/reports/useReportSubject.ts:90` | None — documented as a condition |
<!-- END AMBIGUITIES -->

## Hidden, partial, backend-only, deprecated features
| ID | Feature | Status | Evidence |
|---|---|---|---|
<!-- BEGIN HIDDEN -->
| F-REPORT-018 | `POST /api/reports/rebuild-capital-gains`, JSON `/api/reports/grandfathering`, `/demat-holdings`, `/m2m`, and `/statement/provident-fund`, `/fy-bundle` (called only from the CA workspace, D-REPORT-006) | Backend-only (in this scope) | `packages/api/src/routes/reports.routes.ts:97`, `packages/api/src/routes/reports.routes.ts:114`, `packages/api/src/routes/reports.routes.ts:117` |
| F-TAX-011 | `GET /api/tax/schedule-112a.csv` (subject-aware; the URL helper exists but no button uses it) and `GET /api/tax/fmv-overrides` | Backend-only | `packages/api/src/routes/tax.routes.ts:42`, `apps/web/src/api/tax.api.ts:270` |
| F-ANLYT-014 | `GET /api/analytics/benchmark` (NIFTY 50 + Sensex rebased to 100) — the web client has no caller | Backend-only | `packages/api/src/routes/analytics.routes.ts:25` |
| — | `GET /api/reports/xirr/user` is used by the dashboard (B10), not by these pages | Out of scope | `apps/web/src/pages/dashboard/DashboardPage.tsx:414` |
<!-- END HIDDEN -->

## UI / API permission mismatches
| ID | UI behavior | API behavior | Evidence |
|---|---|---|---|
<!-- BEGIN MISMATCHES -->
| F-TAX-007 | F&O tab visible on all plans | 403 below PRO_ADVISOR; blank tab | `packages/api/src/routes/tax.routes.ts:39` |
| F-ANLYT-004 | Insights panel rendered (blurred) for Free | 403 on insights endpoints | `apps/web/src/components/common/LockedFeature.tsx:99`, `packages/api/src/routes/analytics.routes.ts:32` |
| F-REPORT-001 | Family-view portfolio list offers other members' portfolios | 403 for portfolios not owned by caller | `packages/api/src/controllers/reports.controller.ts:93` |
<!-- END MISMATCHES -->

## Choices made without asking
| Choice | Alternatives | Why |
|---|---|---|
<!-- BEGIN CHOICES -->
| Documented the shared **Download Report** dialog (F-REPORT-016) here, though it renders on other batches' pages | Leave to each page's batch | B02 already cites it as a B08 dependency; one description avoids 15 copies |
| Grouped the 34 Plus catalog reports into one feature (F-REPORT-013) and the 6 accounting reports into another | One feature per report | They share inputs, gate and download behaviour; each is named with its on-screen description |
| Treated `/api/intelligence/net-worth/*` as B10's (dashboard) and listed them as a dependency | Document here | Brief assigns net-worth snapshot job to B10 |
| Inbox imports tab documented here (it renders on `/reports`) with backend as a B07 dependency | Leave to B07 | Route ownership rule |
| Used the role "Same as base plan / Own figures only" for family overlays on screen | Mark as family data | Reports/analytics endpoints read the caller's own data only |
<!-- END CHOICES -->

## Audit allow-list
| Literal | Where it appears in source | Why it's not real data |
|---|---|---|
<!-- BEGIN ALLOWLIST -->
<!-- END ALLOWLIST -->
