# User Roles and Permissions — Mutual Funds (B02)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Mutual Funds, Mutual Fund Analytics

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
| Page / feature / action | R-VISITOR | R-FREE | R-PLUS | R-FAMILY | R-PRO | R-ADMIN | R-FAMOWNER | R-FAMCONTRIB | R-FAMVIEWER | R-MANAGER | R-PROF | R-AICONN | R-NOMINEE | Enforced by |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
<!-- BEGIN MATRIX -->
| View Mutual Funds page (F-MF-001, F-MF-008) | Denied (to /login) | Allowed | Allowed | Allowed | Allowed | Per own plan | Family data within role | Family data within caps | Family data within caps | Managed person's data | n/a | n/a | Denied | `apps/web/src/components/layout/ProtectedRoute.tsx:13`, `packages/api/src/routes/analytics.routes.ts:47` |
| Delete / edit MF transaction (F-MF-002) | Denied | Allowed | Allowed | Allowed | Allowed | Per own plan | Own + family-shared | Own + family-shared | Own only (no family-shared writes) | Managed person's | n/a | Denied | Denied | `packages/api/src/services/holdings/transaction.service.ts:659` |
| Upload CAS / remove import (F-MF-003) | Denied | Allowed | Allowed | Allowed | Allowed | Per own plan | Same as base plan | Same as base plan | Same as base plan | Into managed person's data | n/a | Denied | Denied | `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:108` |
| Sync AMFI NAV (F-MF-004) | Denied | Allowed | Allowed | Allowed | Allowed | Allowed | Same as base plan | Same as base plan | Same as base plan | Allowed | n/a | Denied | Denied | `packages/api/src/routes/assets.routes.ts:29` |
| CASParser mailback request (F-MF-005) | Denied | Allowed (5/min) | Allowed (5/min) | Allowed (5/min) | Allowed (5/min) | Per own plan | Same as base plan | Same as base plan | Same as base plan | Runs as managed person | n/a | Denied | Denied | `packages/api/src/routes/mfCasparser.routes.ts:17` |
| CAMS / KFintech portal mailback (F-MF-006) | Denied | Allowed | Allowed | Allowed | Allowed | Per own plan | Same as base plan | Same as base plan | Same as base plan | Conditional (PAN mismatch, see notes) | n/a | Denied | Denied | `packages/api/src/routes/mfCasMailback.routes.ts:13` |
| Finvu sandbox calls and import (F-MF-009, F-MF-010) | Denied | Denied (status only) | Allowed | Allowed | Allowed | Per own plan | Same as base plan | Same as base plan | Same as base plan | Manager's plan; imports into managed person's data | n/a | Denied | Denied | `packages/api/src/routes/finfactor.routes.ts:42` |
| Portfolio analysis (F-MF-011–F-MF-017) | Denied | Denied (lock card) | Allowed | Allowed | Allowed | Per own plan | All members, no caps | Within caps (marked partial) | Within caps (marked partial) | Manager's plan, managed person's book | n/a | Denied | Denied | `packages/api/src/routes/mfPortfolio.routes.ts:49`, `apps/web/src/pages/mf/MfPortfolioPage.tsx:63` |
| Fund page and alternatives (F-MF-018–F-MF-020) | Denied | Denied (lock card) | Allowed | Allowed | Allowed | Per own plan | Same as base plan | Same as base plan | Same as base plan | Manager's plan | n/a | Denied | Denied | `packages/api/src/routes/mfAnalytics.routes.ts:61` |
| Findings, verdict, Refresh analysis (F-MF-021) | Denied | Denied | Allowed (1/hour) | Allowed (1/hour) | Allowed (1/hour) | Per own plan | Own analysis only | Own analysis only | Own analysis only | Managed person's analysis | n/a | Denied | Denied | `packages/api/src/jobs/mfAnalysisJob.ts:277` |
| Methodology page (F-MF-022) | Denied (to /login) | Allowed | Allowed | Allowed | Allowed | Allowed | Same as base plan | Same as base plan | Same as base plan | Allowed | n/a | n/a | Denied | `packages/api/src/routes/mfPortfolio.routes.ts:56` |
| MF qualitative facts admin (F-MF-024, F-MF-029) | Denied | Denied ("This page is restricted to administrators."; API 401) | Denied | Denied | Denied | Allowed (no two-factor required) | n/a | n/a | n/a | Denied | Denied | Denied | Denied | `packages/api/src/routes/mfQualitativeFacts.routes.ts:48`, `apps/web/src/pages/mf/QualitativeFactsAdminPage.tsx:204` |
<!-- END MATRIX -->

Legend: Allowed · Denied · Conditional (see note)

## Notes and mismatches
<!-- BEGIN ROLE-NOTES -->
- The Finvu sandbox card is rendered for every user, including R-FREE, but every endpoint except `/status` returns 403 "This feature requires the PLUS plan or higher" for them (`apps/web/src/pages/assetClasses/MutualFundsPage.tsx:542`, `packages/api/src/routes/finfactor.routes.ts:42`). UI shows, API denies.
- The **Portfolio analysis** button is shown to R-FREE; the page then shows a lock card (`apps/web/src/pages/assetClasses/MutualFundsPage.tsx:203`, `apps/web/src/pages/mf/MfPortfolioPage.tsx:90`).
- R-MANAGER in the CAMS / KFintech dialog: the PAN reveal and **Save PAN** go to `/api/auth`, an account route, so they use the **manager's** PAN, while `/api/mf-cas-mailback` runs as the managed person and uses the managed person's saved PAN as the PDF password (or fails with "PAN not set on profile…") (`apps/web/src/api/client.ts:48`, `packages/api/src/services/family/managedProfile.service.ts:37`, `packages/api/src/services/mf/mfCasMailback/mfCasMailback.service.ts:171`).
- The admin MF facts API answers a non-admin with 401 "Insufficient role", not 403 (global note, `packages/api/src/middleware/authenticate.ts:95`); it has no two-factor requirement and no navigation link.
- Sync AMFI NAV is a global write any signed-in user can trigger (`packages/api/src/routes/assets.routes.ts:46`).
- Family view: the analysis aggregates all readable members; R-FAMOWNER is uncapped, R-FAMCONTRIB / R-FAMVIEWER are filtered by their asset-class / category caps and the page shows a restricted notice. Goals and the target allocation use only the caller's own records (`packages/api/src/services/mf/mfAnalytics/mfPortfolioAnalysis.service.ts:1804`).
- R-AICONN: chatbot reads go through `/mcp` (owned by B06); none of this module's endpoints accept the connector token.
<!-- END ROLE-NOTES -->
