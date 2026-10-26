[Index](../INDEX.md)

# Settings — Dashboard

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-dash-001"></a>
### Dashboard portfolio picker
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | Dashboard header |
| Purpose | Narrow portfolio-based cards to one portfolio |
| Default | **All portfolios (N)** (source: `apps/web/src/pages/dashboard/DashboardPage.tsx:305`) |
| Values | All portfolios · one portfolio (affects Investments in the hero, metric cards, portfolio chart, breakdown pie, top holdings, Net after debts) |
| Depends on | — |
| Persists | No |
| Stored in | Page state |
| Backend effect | `portfolioId` passed to `/api/dashboard/net-worth`; per-portfolio summary/holdings/valuation calls |
| Who can change | Everyone signed in |
| Sources | `apps/web/src/pages/dashboard/DashboardPage.tsx:370`, `apps/web/src/pages/dashboard/DashboardPage.tsx:518` |

<a id="s-dash-002"></a>
### Net worth eye
| Attribute | Value |
|---|---|
| Control type | Icon toggle (**Show net worth** / **Hide net worth**) |
| Location | Dashboard → Total Net Worth card |
| Purpose | Reveal the headline net worth |
| Default | Hidden (source: `apps/web/src/pages/dashboard/DashboardPage.tsx:314`) |
| Values | Hidden ("₹ • • • • • • •") · Shown |
| Depends on | Independent of [S-SHELL-006](../settings/app-layout-and-navigation.md#s-shell-006) |
| Persists | No — hidden again on every visit |
| Stored in | Page state |
| Backend effect | None |
| Who can change | Everyone signed in |
| Sources | `apps/web/src/pages/dashboard/DashboardPage.tsx:544` |

<a id="s-dash-003"></a>
### Portfolio chart period
| Attribute | Value |
|---|---|
| Control type | Toggle buttons **1M**, **3M**, **6M**, **1Y**, **All** |
| Location | Dashboard → Portfolio value over time |
| Purpose | Time window of the portfolio chart |
| Default | **1Y** (365 days) (source: `apps/web/src/pages/dashboard/DashboardPage.tsx:306`) |
| Values | 30, 90, 180, 365 days, or since the first transaction |
| Depends on | — |
| Persists | No |
| Stored in | Page state |
| Backend effect | `days` passed to historical valuation; may trigger a stock-price backfill |
| Who can change | Everyone signed in |
| Sources | `apps/web/src/pages/dashboard/DashboardPage.tsx:47`, `packages/api/src/controllers/portfolio.controller.ts:84` |

<a id="s-dash-004"></a>
### Net worth trend period
| Attribute | Value |
|---|---|
| Control type | Toggle buttons **1M**, **3M**, **6M**, **1Y**, **All** |
| Location | Dashboard → Net worth over time |
| Purpose | Time window of the trend chart |
| Default | **1Y** (source: `apps/web/src/components/dashboard/NetWorthTrendChart.tsx:30`) |
| Values | Last 30, 90, 180, 365 days, or all snapshots |
| Depends on | — |
| Persists | No |
| Stored in | Component state |
| Backend effect | `period` query; any other value is refused with "Invalid period. Must be one of: 1M, 3M, 6M, 1Y, ALL" |
| Who can change | Everyone signed in |
| Sources | `apps/web/src/components/dashboard/NetWorthTrendChart.tsx:13`, `packages/api/src/controllers/intelligence.controller.ts:22` |

<a id="s-dash-005"></a>
### Alerts strip folded
| Attribute | Value |
|---|---|
| Control type | Icon button / bar (**Collapse alerts** / **Expand alerts**) |
| Location | Dashboard → alerts strip |
| Purpose | Fold the urgent-items strip into one line |
| Default | Unfolded (source: `apps/web/src/pages/dashboard/DashboardPage.tsx:322`) |
| Values | Folded ("N alerts — click to expand") · Unfolded |
| Depends on | Only when there are items |
| Persists | No — "every fresh load shows alerts expanded" |
| Stored in | Page state |
| Backend effect | None |
| Who can change | Everyone signed in |
| Sources | `apps/web/src/pages/dashboard/DashboardPage.tsx:669`, `apps/web/src/pages/dashboard/DashboardPage.tsx:683` |

<a id="s-dash-006"></a>
### Upgrade banner dismissed
| Attribute | Value |
|---|---|
| Control type | × (**Dismiss**) |
| Location | Dashboard → Free plan banner |
| Purpose | Hide the Free plan upsell banner |
| Default | Shown on Free (source: `apps/web/src/components/dashboard/UpgradeBanner.tsx:19`) |
| Values | Dismissed · Shown |
| Depends on | Only on the Free plan |
| Persists | This device, per account |
| Stored in | localStorage `everypaisa.dismissedUpgradeBanner.<userId>` |
| Backend effect | None |
| Who can change | [R-FREE](../roles.md#r-free) |
| Sources | `apps/web/src/components/dashboard/UpgradeBanner.tsx:7`, `apps/web/src/components/dashboard/UpgradeBanner.tsx:25` |

<a id="s-dash-007"></a>
### Dashboard export options
| Attribute | Value |
|---|---|
| Control type | Selects and toggles in "Download Report" |
| Location | Dashboard → **Export** |
| Purpose | Choose whose dashboard, which portfolios, file format and appearance |
| Default | Scope **All portfolios combined**, Format **PDF**, Appearance = current app theme, Report for = **Me** (source: `apps/web/src/components/reports/DownloadReportButton.tsx:41`) |
| Values | Scope: All / Specific portfolio · Format: PDF / Excel (.xlsx) · Appearance: Dark / Light (print) · Report for: Me or a family member (family view only) |
| Depends on | Specific portfolio needs a portfolio picked; for another member Scope is ignored |
| Persists | No |
| Stored in | Dialog state |
| Backend effect | Query parameters of `/api/reports/dashboard-export` |
| Who can change | Everyone signed in |
| Sources | `apps/web/src/components/reports/DownloadReportButton.tsx:70`, `packages/api/src/controllers/reports.controller.ts:533` |
