[Index](../INDEX.md)

# Settings — Analytics

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-anlyt-001"></a>
### Portfolio (Analytics)
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Overview → Analytics**, header |
| Purpose | Scope of all cards except what-if and rule-based insights |
| Default | **All portfolios (N)** (source: `apps/web/src/pages/analytics/AnalyticsPage.tsx:50`) |
| Values | ALL or a portfolio id |
| Depends on | — |
| Persists | No |
| Stored in | Component state |
| Backend effect | `portfolioId` on snapshot, risk, insights; ownership checked |
| Who can change | Everyone |
| Sources | `apps/web/src/pages/analytics/AnalyticsPage.tsx:123`, `packages/api/src/controllers/analytics.controller.ts:59` |

<a id="s-anlyt-002"></a>
### Period
| Attribute | Value |
|---|---|
| Control type | Pills |
| Location | **Overview → Analytics**, header |
| Purpose | Window for value chart, income chart, money in/out, risk, AI insights |
| Default | **1Y** (source: `apps/web/src/pages/analytics/AnalyticsPage.tsx:51`) |
| Values | 1M (30 days), 3M (90), 6M (180), 1Y (365), 3Y (1095), 5Y (1825), All |
| Depends on | — |
| Persists | No |
| Stored in | Component state |
| Backend effect | `period` parameter |
| Who can change | Everyone |
| Sources | `apps/web/src/pages/analytics/AnalyticsPage.tsx:27`, `packages/api/src/services/analytics/analytics.service.ts:43` |

<a id="s-anlyt-003"></a>
### View
| Attribute | Value |
|---|---|
| Control type | Tabs |
| Location | **Overview → Analytics** |
| Purpose | Overview or Detail cards |
| Default | Overview (source: `apps/web/src/pages/analytics/AnalyticsPage.tsx:57`) |
| Values | Overview · Detail (`?view=detail`) |
| Depends on | — |
| Persists | In the URL only |
| Stored in | URL search parameter `view` |
| Backend effect | Detail also fetches `/api/analytics/risk` |
| Who can change | Everyone |
| Sources | `apps/web/src/pages/analytics/AnalyticsPage.tsx:58`, `apps/web/src/pages/analytics/AnalyticsPage.tsx:85` |

<a id="s-anlyt-004"></a>
### Tax financial year (Analytics)
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Overview → Analytics → Tax** |
| Purpose | Year for "What you'll owe" and whether the harvest card shows |
| Default | Current FY (source: `apps/web/src/pages/analytics/AnalyticsPage.tsx:55`) |
| Values | Current FY plus years with activity |
| Depends on | — |
| Persists | No |
| Stored in | Component state |
| Backend effect | `fy` on `/api/tax/advance` |
| Who can change | Everyone |
| Sources | `apps/web/src/pages/analytics/widgets/TaxYearWidgets.tsx:23`, `apps/web/src/pages/analytics/AnalyticsPage.tsx:199` |

<a id="s-anlyt-005"></a>
### AI Insights panel folded
| Attribute | Value |
|---|---|
| Control type | Collapsible header |
| Location | **Overview → Analytics → AI Portfolio Insights** |
| Purpose | Keep the panel folded across visits |
| Default | Open (source: `apps/web/src/pages/analytics/widgets/InsightsPanel.tsx:136`) |
| Values | Open · Folded (no insight requests are made while folded) |
| Depends on | — |
| Persists | This device only |
| Stored in | localStorage key `analytics_insights_collapsed` (`1` when folded) |
| Backend effect | None; folded panel does not fetch |
| Who can change | Everyone who sees the panel |
| Sources | `apps/web/src/pages/analytics/widgets/InsightsPanel.tsx:107`, `apps/web/src/pages/analytics/widgets/InsightsPanel.tsx:118` |
