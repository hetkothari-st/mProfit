# B08 Reports & Tax — discovery notes

Source commit 9d9025c4 · code-only · scope: routes 17, 80, 89, 90 of `_work/global/modules.md` + nightly data-integrity job.

## Routes in scope
| Route | Page | Entry |
|---|---|---|
| `/reports` | `apps/web/src/pages/reports/ReportsPage.tsx` (+ `TaxMisDownloads.tsx`, `InboxImportsTab.tsx`) | Sidebar Tools → Reports (`apps/web/src/components/layout/navItems.tsx:112`); `/reports?tab=inbox-imports` from Gmail scan card and Gmail scan setup |
| `/tax` | `apps/web/src/pages/tax/TaxPage.tsx` | Sidebar Planning → Tax Planning (`apps/web/src/components/layout/navItems.tsx:98`); dashboard tax strip |
| `/analytics` | `apps/web/src/pages/analytics/AnalyticsPage.tsx` + `widgets/*` | Sidebar Overview → Analytics (`apps/web/src/components/layout/navItems.tsx:80`); phone tab bar |
| `/health-score` | `apps/web/src/pages/intelligence/HealthScorePage.tsx` | Sidebar Overview → Portfolio Score (`apps/web/src/components/layout/navItems.tsx:84`); dashboard health card |

## Shared components owned here
- `components/reports/useReportSubject.ts` — "Report for" picker logic (self / family / member).
- `components/reports/DataQualityBanner.tsx` — data checks above report tabs.
- `components/reports/DownloadReportButton.tsx` — **Download** dialog placed on many other batches' pages.
- `components/intelligence/HealthScore.tsx` — dashboard card (rendered by B10; dependency).

## Backend
- `/api/reports` (`packages/api/src/routes/reports.routes.ts`) — inline reports, statements, 42-report download catalog, data-quality, exports, fy-bundle, provident-fund statement.
- `/api/tax` (`packages/api/src/routes/tax.routes.ts`) — tax summary, schedules, harvest, advance tax, FMV overrides, CSVs.
- `/api/analytics` (`packages/api/src/routes/analytics.routes.ts`) — snapshot, risk, benchmark, insights, what-if, mf-overlap (B02 caller).
- `/api/intelligence` (`packages/api/src/routes/intelligence.routes.ts`) — health score; net-worth history/snapshot are B10's.
- Job: `packages/api/src/jobs/dataIntegrityJob.ts` (02:15 IST).

## Progress
- [x] Reports page (tabs, statements, Tax & MIS, inbox imports, data quality)
- [x] Download Report dialog
- [x] Tax page
- [x] Analytics page
- [x] Health score page
- [x] Data-integrity job
