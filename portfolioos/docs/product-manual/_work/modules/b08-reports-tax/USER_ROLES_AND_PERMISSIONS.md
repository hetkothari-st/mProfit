# User Roles and Permissions — Reports, Tax, Analytics, Portfolio Score (B08)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Reports, Tax Planning, Analytics, Portfolio Score, nightly data-integrity job

Role definitions are global (see `_work/global/roles.md`); headings are repeated here for traceability.

## Roles
### Signed-out visitor <!-- R-VISITOR -->
### Free user <!-- R-FREE -->
### Plus subscriber <!-- R-PLUS -->
### Family subscriber <!-- R-FAMILY -->
### Pro/Advisor subscriber <!-- R-PRO -->
### Administrator <!-- R-ADMIN -->
### Family owner <!-- R-FAMOWNER -->
### Family contributor <!-- R-FAMCONTRIB -->
### Family viewer <!-- R-FAMVIEWER -->
### Managing a family member's account <!-- R-MANAGER -->
### Professional acting for a client <!-- R-PROF -->
### AI chatbot connection <!-- R-AICONN -->
### Succession nominee <!-- R-NOMINEE -->

## Permission matrix
<!-- BEGIN MATRIX -->
| Page / feature / action | R-VISITOR | R-FREE | R-PLUS | R-FAMILY | R-PRO | R-ADMIN | R-FAMOWNER | R-FAMCONTRIB | R-FAMVIEWER | R-MANAGER | R-PROF | R-AICONN | R-NOMINEE | Enforced by |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Reports on-screen tabs, data checks, Fix now (F-REPORT-001–F-REPORT-009, F-REPORT-003) | Denied (to /login) | Allowed (own portfolios) | Allowed | Allowed | Allowed | Per own plan | Own figures only on screen | Own figures only on screen | Own figures only on screen | Managed person's data | n/a | Denied | Denied | `apps/web/src/components/layout/ProtectedRoute.tsx:13`, `packages/api/src/controllers/reports.controller.ts:93` |
| Tab Excel/PDF, statements, free catalog reports, Download Report dialog (F-REPORT-010–F-REPORT-012, F-REPORT-016) | Denied | Allowed | Allowed | Allowed | Allowed | Per own plan | Self, any member, or whole family | Same as owner if uncapped; self only if capped | Same as contributor | Managed person's data | n/a | Denied | Denied | `packages/api/src/services/reports/reportSubjects.ts:94`, `packages/api/src/services/reports/reportSubjects.ts:199` |
| Tax & CA Report Catalog, 34 reports (F-REPORT-013) | Denied | Denied (combined lock card) | Allowed | Allowed | Allowed | Per own plan | Per own plan; subjects as above | Per own plan; subjects as above | Per own plan; subjects as above | Manager's plan | n/a | Denied | Denied | `packages/api/src/routes/reports.routes.ts:85` |
| Accounting reports, Export to Tally (F-REPORT-014) | Denied | Denied | Denied (lock) | Denied (lock) | Allowed | Per own plan | Per own plan; Tally one member at a time | Per own plan | Per own plan | Manager's plan | n/a | Denied | Denied | `packages/api/src/routes/reports.routes.ts:86`, `packages/api/src/services/reports/reportSubjects.ts:432` |
| Inbox imports tab (F-REPORT-015) | Denied | Allowed (Gmail connected) | Allowed | Allowed | Allowed | Per own plan | Same as base plan | Same as base plan | Same as base plan | Denied ("Switch back to your own account to do this.") | n/a | Denied | Denied | `packages/api/src/middleware/authenticate.ts:48` |
| Nightly integrity alert (F-REPORT-017) | n/a | n/a | n/a | n/a | n/a | Receives alert (oldest active admin) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | `packages/api/src/jobs/dataIntegrityJob.ts:140` |
| Tax Planning tabs except F&O; CA Tax Report; CSVs; FMV overrides (F-TAX-001–F-TAX-006, F-TAX-008–F-TAX-010) | Denied | Allowed | Allowed | Allowed | Allowed | Per own plan | Tables own; PDF for one member | Tables own; PDF for one member if uncapped | Same as contributor | Managed person's data and overrides | n/a | Denied | Denied | `packages/api/src/controllers/tax.controller.ts:38` |
| F&O (Sec. 43(5)) tab (F-TAX-007) | Denied | Denied (blank tab) | Denied (blank tab) | Denied (blank tab) | Allowed | Per own plan | Per own plan | Per own plan | Per own plan | Manager's plan | n/a | Denied | Denied | `packages/api/src/routes/tax.routes.ts:39` |
| Analytics cards, tax block, what-if (F-ANLYT-001–F-ANLYT-003, F-ANLYT-005–F-ANLYT-013) | Denied | Allowed | Allowed | Allowed | Allowed | Per own plan | Own portfolios only | Own portfolios only | Own portfolios only | Managed person's data | n/a | Denied | Denied | `packages/api/src/controllers/analytics.controller.ts:67` |
| AI Portfolio Insights (F-ANLYT-004) | Denied | Denied (blurred lock card) | Allowed | Allowed | Allowed | Per own plan | Per own plan | Per own plan | Per own plan | Manager's plan | n/a | Denied | Denied | `packages/api/src/routes/analytics.routes.ts:32`, `apps/web/src/pages/analytics/AnalyticsPage.tsx:177` |
| Portfolio Score (F-INTEL-001, F-INTEL-002) | Denied | Allowed | Allowed | Allowed | Allowed | Per own plan | Own score | Own score | Own score | Managed person's score | n/a | Denied | Denied | `packages/api/src/controllers/intelligence.controller.ts:12` |
<!-- END MATRIX -->

Legend: Allowed · Denied · Conditional (see note)

## Notes and mismatches
<!-- BEGIN ROLE-NOTES -->
- **F&O tab shown, API denies.** The **F&O (Sec. 43(5))** tab is visible on every plan, but `/api/tax/schedule-43` answers 403 below Pro/Advisor and the page renders nothing — no lock card or message (`apps/web/src/pages/tax/TaxPage.tsx:44`, `apps/web/src/pages/tax/TaxPage.tsx:368`, `packages/api/src/routes/tax.routes.ts:39`). Meanwhile the ungated Tax Summary computes and shows F&O net P&L and tax for every plan (`packages/api/src/services/tax/tax.service.ts:270`).
- **AI Insights panel mounted for Free users.** The locked panel is rendered blurred behind the lock card, so its queries still run and `/api/analytics/insights` and `/insights/deterministic` answer 403 (`apps/web/src/components/common/LockedFeature.tsx:99`, `packages/api/src/routes/analytics.routes.ts:32`).
- **Family view portfolio pickers.** On Reports, Analytics and the Download Report dialog the portfolio list follows the family view (includes other members' portfolios), but these APIs accept only the caller's own portfolios and return 403 for others (`packages/api/src/services/holdings/portfolio.service.ts:51`, `packages/api/src/controllers/reports.controller.ts:93`, `packages/api/src/controllers/analytics.controller.ts:67`, `packages/api/src/controllers/reports.controller.ts:411`).
- **Capped family members** (R-FAMCONTRIB / R-FAMVIEWER without every asset class and category) see only **Me** in **Report for**; the server refuses other subjects with "Your view of this family is limited to certain categories, and reports cannot yet be produced in a limited form. You can download your own reports; ask a family owner for anything covering other members." (`apps/web/src/components/reports/useReportSubject.ts:90`, `packages/api/src/services/reports/reportSubjects.ts:199`).
- **Reports and analytics do not use family-view scope on screen.** Unlike the dashboard, these pages show only the caller's own (or managed person's) figures even in family view; household figures are available only as downloads.
- **Tax-page CSV and grandfathering endpoints ignore the subject.** `/api/tax/grandfathering` and `/api/tax/grandfathering.csv` read `req.user` directly, so **Download reports for** has no effect on the two CSV buttons (`packages/api/src/controllers/fmv.controller.ts:59`, `packages/api/src/controllers/fmv.controller.ts:117`).
- **Plan check in the browser** uses the effective plan from the session (`apps/web/src/pages/reports/TaxMisDownloads.tsx:529`, `packages/api/src/services/auth/auth.service.ts:65`).
- R-PROF: client report downloads go through the CA workspace (B09) using a client id; the subject resolver treats a client id as one person and refuses it together with a family view ("Choose either a family view or a client, not both — a professional grant covers one person.") (`packages/api/src/services/reports/reportSubjects.ts:106`).
- R-AICONN: chatbot reads use `/mcp` (B06); none of these endpoints accept the connector token.
<!-- END ROLE-NOTES -->
