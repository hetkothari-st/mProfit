# Settings and Toggles Reference — Reports, Tax, Analytics, Portfolio Score (B08)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Reports, Tax Planning, Analytics, Portfolio Score

Only two settings here are saved: the per-ISIN FMV override (S-TAX-003, on your account) and the folded state of the AI Insights panel (S-ANLYT-005, this browser). Everything else is a per-visit choice that resets on reload.

<!-- BEGIN SETTINGS -->
## Reports → Filter card

### Portfolio <!-- S-REPORT-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Tools → Reports**, filter card |
| Purpose | Which book the on-screen tabs, tab downloads and statements cover |
| Default | **All portfolios** (`all`) (source: `apps/web/src/pages/reports/ReportsPage.tsx:197`) |
| Values | `all`: every portfolio you own · a portfolio id: that portfolio only |
| Depends on | — |
| Persists | No |
| Stored in | Component state |
| Backend effect | `portfolioId` query parameter; server checks you own it (403 otherwise) |
| Who can change | Everyone who can open Reports |
| Sources | `apps/web/src/pages/reports/ReportsPage.tsx:304`, `packages/api/src/controllers/reports.controller.ts:93` |

### Report for <!-- S-REPORT-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Tools → Reports** filter card; **Tax & MIS downloads** input card; **Download Report** dialog |
| Purpose | Whose figures a download covers |
| Default | **Me** (`self`) (source: `apps/web/src/components/reports/useReportSubject.ts:102`) |
| Values | **Me** · **Whole family (one section per member)** · a member's name. Options other than Me appear only when viewing a family whose view is not capped |
| Depends on | Family view (D-REPORT-007) |
| Persists | No (resets to Me when the selection is no longer offered) |
| Stored in | Hook state; sent as `subject` and `familyId` query parameters |
| Backend effect | Server authorises the subject against your family scope; capped members are refused; Tally export, holdings/dashboard exports and FY bundle refuse **Whole family** |
| Who can change | R-FAMOWNER; R-FAMCONTRIB / R-FAMVIEWER with an uncapped view |
| Sources | `apps/web/src/components/reports/useReportSubject.ts:90`, `apps/web/src/components/reports/useReportSubject.ts:117`, `packages/api/src/services/reports/reportSubjects.ts:94` |

### Financial Year (Reports) <!-- S-REPORT-003 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Tools → Reports**, filter card (Intraday, STCG, LTCG, Schedule 112A, Income tabs) |
| Purpose | Year for FY-based tabs, their downloads and the FY-based statements |
| Default | Current Indian FY (source: `apps/web/src/pages/reports/ReportsPage.tsx:198`) |
| Values | Current FY and the 7 before it |
| Depends on | — |
| Persists | No |
| Stored in | Component state |
| Backend effect | `fy` query parameter, validated as consecutive years |
| Who can change | Everyone who can open Reports |
| Sources | `apps/web/src/pages/reports/ReportsPage.tsx:139`, `apps/web/src/pages/reports/ReportsPage.tsx:338` |

## Reports → Tax & MIS downloads

### Financial year (Tax & MIS) <!-- S-REPORT-004 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Tools → Reports → Tax & MIS downloads** |
| Purpose | Year for catalog reports that use "FY" |
| Default | The page's FY when the tab opens (source: `apps/web/src/pages/reports/TaxMisDownloads.tsx:531`) |
| Values | Current FY and 7 before |
| Depends on | — |
| Persists | No |
| Stored in | Component state |
| Backend effect | `fy` parameter on reports that use it |
| Who can change | Everyone |
| Sources | `apps/web/src/pages/reports/TaxMisDownloads.tsx:607` |

### As-of date <!-- S-REPORT-005 -->
| Attribute | Value |
|---|---|
| Control type | Date |
| Location | **Tools → Reports → Tax & MIS downloads** |
| Purpose | Valuation/closing date for "As of" reports |
| Default | Today (source: `apps/web/src/pages/reports/TaxMisDownloads.tsx:532`) |
| Values | Any date; blank = report default |
| Depends on | — |
| Persists | No |
| Stored in | Component state |
| Backend effect | `asOf` parameter; invalid → "Invalid `asOf` date" |
| Who can change | Everyone |
| Sources | `apps/web/src/pages/reports/TaxMisDownloads.tsx:617` |

### From <!-- S-REPORT-006 -->
| Attribute | Value |
|---|---|
| Control type | Date |
| Location | **Tools → Reports → Tax & MIS downloads** |
| Purpose | Start of the period for date-range reports |
| Default | Empty (report's default range) (source: `apps/web/src/pages/reports/TaxMisDownloads.tsx:533`) |
| Values | Any date ≤ **To** |
| Depends on | S-REPORT-007 |
| Persists | No |
| Stored in | Component state |
| Backend effect | `from`; "`from` date is after `to` date" if reversed |
| Who can change | Everyone |
| Sources | `apps/web/src/pages/reports/TaxMisDownloads.tsx:621`, `packages/api/src/controllers/reports.controller.ts:1222` |

### To <!-- S-REPORT-007 -->
| Attribute | Value |
|---|---|
| Control type | Date |
| Location | **Tools → Reports → Tax & MIS downloads** |
| Purpose | End of the period for date-range reports |
| Default | Today (source: `apps/web/src/pages/reports/TaxMisDownloads.tsx:534`) |
| Values | Any date ≥ **From** |
| Depends on | S-REPORT-006 |
| Persists | No |
| Stored in | Component state |
| Backend effect | `to` parameter |
| Who can change | Everyone |
| Sources | `apps/web/src/pages/reports/TaxMisDownloads.tsx:625` |

### Report theme <!-- S-REPORT-011 -->
| Attribute | Value |
|---|---|
| Control type | Implicit (follows the app theme); toggle **Appearance** in the Download Report dialog |
| Location | All report downloads; **Download Report** dialog |
| Purpose | Light or dark colours in PDF/Excel files |
| Default | The app's current theme (source: `apps/web/src/lib/reportTheme.ts:13`) |
| Values | `light` ("Light (print)") · `dark` |
| Depends on | App theme (B10) |
| Persists | Follows the app theme setting; the dialog override is per download |
| Stored in | Theme store; `theme` query parameter |
| Backend effect | Colours of the generated file |
| Who can change | Everyone |
| Sources | `apps/web/src/lib/reportTheme.ts:13`, `apps/web/src/components/reports/DownloadReportButton.tsx:46` |

## Reports → Inbox imports

### Status filter <!-- S-REPORT-008 -->
| Attribute | Value |
|---|---|
| Control type | Chips |
| Location | **Tools → Reports → Inbox imports** |
| Purpose | Which documents are listed |
| Default | **Pending review** (source: `apps/web/src/pages/reports/InboxImportsTab.tsx:28`) |
| Values | Pending review · Approved · Imported · Parse failed · All |
| Depends on | — |
| Persists | No |
| Stored in | Component state |
| Backend effect | `status` parameter (omitted for All) |
| Who can change | Everyone with Gmail connected |
| Sources | `apps/web/src/pages/reports/InboxImportsTab.tsx:122` |

### Sender filter <!-- S-REPORT-009 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Tools → Reports → Inbox imports** |
| Purpose | Limit to one sender address |
| Default | **All senders** (source: `apps/web/src/pages/reports/InboxImportsTab.tsx:29`) |
| Values | All senders or one address from your discovered senders |
| Depends on | — |
| Persists | No |
| Stored in | Component state |
| Backend effect | `fromAddress` parameter |
| Who can change | Everyone with Gmail connected |
| Sources | `apps/web/src/pages/reports/InboxImportsTab.tsx:165` |

### Doc type filter <!-- S-REPORT-010 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Tools → Reports → Inbox imports** |
| Purpose | Limit to one document type |
| Default | **All doc types** (source: `apps/web/src/pages/reports/InboxImportsTab.tsx:30`) |
| Values | Every inbox document type except "NOT FINANCIAL" |
| Depends on | — |
| Persists | No |
| Stored in | Component state |
| Backend effect | `docType` parameter |
| Who can change | Everyone with Gmail connected |
| Sources | `apps/web/src/pages/reports/InboxImportsTab.tsx:175` |

## Tax Planning → Top card

### Financial Year (Tax) <!-- S-TAX-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Planning → Tax Planning** |
| Purpose | Year for all tabs and downloads |
| Default | Latest FY with activity, else current FY (source: `apps/web/src/pages/tax/TaxPage.tsx:146`) |
| Values | FYs with capital gains or transactions, newest first |
| Depends on | — |
| Persists | No |
| Stored in | Component state |
| Backend effect | `fy` parameter (required by summary, schedule-43, CSVs, PDF) |
| Who can change | Everyone |
| Sources | `apps/web/src/pages/tax/TaxPage.tsx:269`, `packages/api/src/services/tax/tax.service.ts:104` |

### Download reports for <!-- S-TAX-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Planning → Tax Planning** |
| Purpose | Whose CA Tax Report / CSV is downloaded |
| Default | **Me** |
| Values | Me or one member (no "Whole family") |
| Depends on | Family view; same rules as S-REPORT-002 |
| Persists | No |
| Stored in | Hook state |
| Backend effect | `subject`/`familyId` on downloads. The two CSV buttons call an endpoint that ignores it (see DOCUMENTATION_GAPS.md) |
| Who can change | As S-REPORT-002 |
| Sources | `apps/web/src/pages/tax/TaxPage.tsx:286`, `apps/web/src/pages/tax/TaxPage.tsx:293`, `packages/api/src/controllers/fmv.controller.ts:117` |

## Tax Planning → Grandfathering (112A FMV)

### FMV / unit override <!-- S-TAX-003 -->
| Attribute | Value |
|---|---|
| Control type | Number per row (per ISIN) |
| Location | **Planning → Tax Planning → Grandfathering (112A FMV)** |
| Purpose | Your 31-Jan-2018 price per unit for an ISIN, replacing the seed value |
| Default | Seed value where one exists, else empty ("Enter FMV") |
| Values | Number ≥ 0 · revert = delete override |
| Depends on | Row must have an ISIN |
| Persists | Yes — server, your account |
| Stored in | User FMV override record (per user + ISIN) |
| Backend effect | Invalidates your FMV cache and starts a background capital-gains recompute; changes Schedule 112A, the summary and CSV FMV column |
| Who can change | The account owner; R-MANAGER for the managed person |
| Sources | `apps/web/src/pages/tax/TaxPage.tsx:1083`, `packages/api/src/controllers/fmv.controller.ts:99`, `packages/api/src/controllers/fmv.controller.ts:108` |

## Analytics → Header

### Portfolio (Analytics) <!-- S-ANLYT-001 -->
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

### Period <!-- S-ANLYT-002 -->
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

### View <!-- S-ANLYT-003 -->
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

### Tax financial year (Analytics) <!-- S-ANLYT-004 -->
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

### AI Insights panel folded <!-- S-ANLYT-005 -->
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
<!-- END SETTINGS -->

## Client-side storage
| Key / cookie | What's stored | Written when | Refreshed when | Can go stale? |
|---|---|---|---|---|
<!-- BEGIN CLIENT-STORAGE -->
| localStorage `analytics_insights_collapsed` | `1` while the AI Insights panel is folded | On fold/unfold | — | No (absent = open; storage errors fall back to open) |
| React Query cache `report-*` keys (memory) | Reports tab data per portfolio/FY | On tab open | On remount/focus; all `report-*` keys after **Fix now** | Yes until refetch |
| React Query cache `report-data-quality` (memory) | Data checks result | On page open | After 60 seconds | Up to 60 seconds |
| React Query cache `analytics` keys (memory) | Snapshot (5 min), risk (15 min), insights (~23 h), deterministic insights (5 min), spend (60 s) | On page open | After those times | Yes, for those times |
| React Query cache `tax-*` keys (memory) | Tax page data; available FYs 60 s (Tax page) / 1 h (Analytics) | On tab open | FMV save invalidates grandfathering, summary, 112A | FMV revert does not refresh the Schedule 112A tab |
| React Query cache `intelligence/health-score` (memory) | Health score | On page open | After **Recalculate** | Server-side snapshot reused for 24 h |
<!-- END CLIENT-STORAGE -->

## Operator configuration (not user-facing)
| Env var name | Purpose | Effect when unset |
|---|---|---|
<!-- BEGIN OPERATOR-CONFIG -->
| `ENABLE_DATA_INTEGRITY_CRON` | `false` stops scheduling the 02:15 IST integrity job | Job scheduled |
| `ENABLE_LLM_INSIGHTS` | Enables AI Insights generation in production | Default `false`: users see "AI Insights are disabled (set ENABLE_LLM_INSIGHTS=true)." unless `ENABLE_LLM_PARSER=true` or not production |
| `ENABLE_LLM_PARSER` | Email parser gate; also opens the AI Insights gate | — |
| `ANTHROPIC_API_KEY` | Purpose: credential for the Anthropic API used by AI Insights | "ANTHROPIC_API_KEY is not set — cannot generate insights." |
| `LLM_INSIGHTS_MODEL` | Model for AI Insights (AppSetting `llm.insights_model` overrides) | Default `claude-sonnet-4-6` |
| AppSetting `llm.monthly_warn_inr` / `llm.monthly_cap_inr` (and `.user.<id>` variants) | Monthly AI spend warning and cap per user | ₹500 / ₹1,000 |
| AppSetting `llm.usd_inr_fx` | USD→INR rate for AI cost accounting | 90 |
<!-- END OPERATOR-CONFIG -->
