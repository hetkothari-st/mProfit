[Index](../INDEX.md)

# Settings — Reports

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-report-001"></a>
### Portfolio
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

<a id="s-report-002"></a>
### Report for
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Tools → Reports** filter card; **Tax & MIS downloads** input card; **Download Report** dialog |
| Purpose | Whose figures a download covers |
| Default | **Me** (`self`) (source: `apps/web/src/components/reports/useReportSubject.ts:102`) |
| Values | **Me** · **Whole family (one section per member)** · a member's name. Options other than Me appear only when viewing a family whose view is not capped |
| Depends on | Family view ([D-REPORT-007](../dependencies.md#d-report-007)) |
| Persists | No (resets to Me when the selection is no longer offered) |
| Stored in | Hook state; sent as `subject` and `familyId` query parameters |
| Backend effect | Server authorises the subject against your family scope; capped members are refused; Tally export, holdings/dashboard exports and FY bundle refuse **Whole family** |
| Who can change | [R-FAMOWNER](../roles.md#r-famowner); [R-FAMCONTRIB](../roles.md#r-famcontrib) / [R-FAMVIEWER](../roles.md#r-famviewer) with an uncapped view |
| Sources | `apps/web/src/components/reports/useReportSubject.ts:90`, `apps/web/src/components/reports/useReportSubject.ts:117`, `packages/api/src/services/reports/reportSubjects.ts:94` |

<a id="s-report-003"></a>
### Financial Year (Reports)
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

<a id="s-report-004"></a>
### Financial year (Tax & MIS)
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

<a id="s-report-005"></a>
### As-of date
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

<a id="s-report-006"></a>
### From
| Attribute | Value |
|---|---|
| Control type | Date |
| Location | **Tools → Reports → Tax & MIS downloads** |
| Purpose | Start of the period for date-range reports |
| Default | Empty (report's default range) (source: `apps/web/src/pages/reports/TaxMisDownloads.tsx:533`) |
| Values | Any date ≤ **To** |
| Depends on | [S-REPORT-007](../settings/reports.md#s-report-007) |
| Persists | No |
| Stored in | Component state |
| Backend effect | `from`; "`from` date is after `to` date" if reversed |
| Who can change | Everyone |
| Sources | `apps/web/src/pages/reports/TaxMisDownloads.tsx:621`, `packages/api/src/controllers/reports.controller.ts:1222` |

<a id="s-report-007"></a>
### To
| Attribute | Value |
|---|---|
| Control type | Date |
| Location | **Tools → Reports → Tax & MIS downloads** |
| Purpose | End of the period for date-range reports |
| Default | Today (source: `apps/web/src/pages/reports/TaxMisDownloads.tsx:534`) |
| Values | Any date ≥ **From** |
| Depends on | [S-REPORT-006](../settings/reports.md#s-report-006) |
| Persists | No |
| Stored in | Component state |
| Backend effect | `to` parameter |
| Who can change | Everyone |
| Sources | `apps/web/src/pages/reports/TaxMisDownloads.tsx:625` |

<a id="s-report-011"></a>
### Report theme
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

<a id="s-report-008"></a>
### Status filter
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

<a id="s-report-009"></a>
### Sender filter
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

<a id="s-report-010"></a>
### Doc type filter
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
