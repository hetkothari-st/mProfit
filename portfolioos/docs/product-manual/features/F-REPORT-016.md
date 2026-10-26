---
id: F-REPORT-016
title: "Download Report dialog (on other pages)"
module: "Reports"
status: Live
roles: "R-FREE and up; R-MANAGER"
settings: [S-REPORT-011]
related: [F-REPORT-001, F-REPORT-011]
---

[← Reports](../modules/reports.md) · [Index](../INDEX.md)

# Download Report dialog (on other pages)

`F-REPORT-016` · Live · Roles: [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager)

**What it does:** A **Download** button used on the dashboard and on many asset and liability pages (stocks, mutual funds, F&O, crypto, deposits, post office, other assets, forex, loans, credit cards, insurance, rental, real estate, vehicles). It opens "Download Report" with **Report for** (when offered), **Portfolio** (holdings reports), **Scope** (dashboard: **All portfolios combined** / **Specific portfolio**), **Format** (**PDF** / **Excel (.xlsx)**), **Appearance** (**Dark** / **Light (print)**, the app's current theme marked "· current"), **Cancel** and **Download** ("Preparing…" while running).

**Why it exists:** Lets any section be exported without going to Reports. Inferred from behavior.

**Where to find it:** The **Download** button in the header of those pages (owned by their batches).

**Who can use it:** [R-FREE](../roles.md#r-free) and up (ungated); [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Click **Download**. The dialog opens with PDF and your current theme selected.
2. Choose options; click **Download**. The file `everypaisa-<section>-report<member suffix>.pdf|xlsx` is saved and the dialog closes.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Report for** | Select | Subject; **Whole family** is removed for holdings and dashboard exports | Hidden as in [F-REPORT-001](F-REPORT-001.md) |
| **Portfolio** | Select | **All portfolios** or one | Holdings reports only |
| **Scope** + portfolio pick | Select | Dashboard export scope ("— pick portfolio —") | Dashboard only |
| **Format** | Toggle | PDF or Excel | — |
| **Appearance** | Toggle | Dark or Light (print), this download only | — |
| **Download** | Button | Builds the file | Disabled while running, or when **Specific portfolio** has no portfolio |

**Fields and rules:** Not applicable — choices only.

**Settings and toggles here:** [S-REPORT-011](../settings/reports.md#s-report-011) **Report theme** (overridable per download here).

**Results:** A file is saved.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Alert "Error: …" with the raw server response | Server refusal | See Limitations |

**Limitations:** For a holdings export with **Portfolio** = **All portfolios**, the dialog sends the id of every portfolio in your list; if you are viewing a family (the list then includes other members' portfolios) or chose another member in **Report for**, the server refuses with "Forbidden" (see DOCUMENTATION_GAPS.md).

**How it works:** Holdings → `GET /api/reports/holdings-export?portfolioIds&assetClasses&format&theme` (one person per file, ownership of each id checked); dashboard → `/api/reports/dashboard-export?scope&portfolioId`; vehicles, insurance, loans, credit cards, rental, real estate → `/api/reports/section-export?section=…` (subject-aware, one section per member for the family).

**Related features:** [F-REPORT-011](F-REPORT-011.md).

**Sources:** `apps/web/src/components/reports/DownloadReportButton.tsx:38`, `apps/web/src/components/reports/DownloadReportButton.tsx:98`, `apps/web/src/components/reports/DownloadReportButton.tsx:149`, `apps/web/src/components/reports/DownloadReportButton.tsx:181`, `apps/web/src/components/reports/DownloadReportButton.tsx:215`, `apps/web/src/hooks/useDownloadReport.ts:1`, `packages/api/src/controllers/reports.controller.ts:386`, `packages/api/src/controllers/reports.controller.ts:411`, `packages/api/src/controllers/reports.controller.ts:572`
