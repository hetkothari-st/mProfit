# B02 Mutual Funds — discovery notes

Source commit 9d9025c4 · code-only · scope: routes 31–35 of `_work/global/modules.md`.

## Routes in scope
| Route | Page | Entry |
|---|---|---|
| `/mutual-funds` | `apps/web/src/pages/assetClasses/MutualFundsPage.tsx` | Sidebar Asset Classes → Mutual Funds (`apps/web/src/components/layout/navItems.tsx:60`); dashboard links |
| `/mutual-funds/analysis` | `apps/web/src/pages/mf/MfPortfolioPage.tsx` | **Portfolio analysis** button on `/mutual-funds` |
| `/mutual-funds/:schemeCode` | `apps/web/src/pages/mf/FundDetailPage.tsx` | Scheme links in analysis table and alternatives list |
| `/methodology/mf-score` | `apps/web/src/pages/mf/MethodologyPage.tsx` | **How funds are scored** link on analysis page |
| `/admin/mf-qualitative-facts` | `apps/web/src/pages/mf/QualitativeFactsAdminPage.tsx` | None (typed URL) — Hidden |

## Components rendered
- `pages/mutualFunds/`: MFCasparserDialog (live), MFCasMailbackDialog (live), MfOverlapCard (live), FinvuSandboxCard + `finvu/*` views (live, operator sandbox), MFCentralSyncDialog (dead — never imported).
- `pages/mf/components/*`: analysis + fund detail sections.
- Shared from other batches: TransactionFormDialog (B10), ImportDropzone / ImportErrorDialog / PasswordPromptDialog / ScanContext (B07), DownloadReportButton (B08), LockedFeature (B10), RestrictedNotice (B03).

## Backend
- `/api/mf-analytics` (two routers: `mfPortfolio.routes.ts` per-route gates; `mfAnalytics.routes.ts` router-level `requireFeature('MF_ANALYTICS')`).
- `/api/mf-casparser`, `/api/mf-cas-mailback`, `/api/mf-central` (no UI), `/api/admin/mf-qualitative-facts` (ADMIN, no 2FA).
- `/api/analytics/mf-overlap`, `/api/assets/amfi/sync`, `/api/integrations/finfactor/*` (MF endpoints + `/sync/mf`).
- Jobs: mfNavAdjustment 22:30, mfMetrics 23:15, mfPeerRank 00:30, monthly rating chain 15th 03:30, mfMetadata 1st 02:00, NAV history backfill Sun 03:00, reconciliation 5th 03:00, ops alerts 06:30, benchmark 20:00, risk-free Mon 06:00, analysis (trigger-only), prose (queue), factsheet (manual only).

## Progress
- [x] Holdings page and dialogs
- [x] Portfolio analysis
- [x] Fund detail
- [x] Methodology
- [x] Admin facts (Hidden)
- [x] Backend-only endpoints recorded
- [x] Jobs
