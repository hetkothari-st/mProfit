---
id: F-DASH-015
title: "Export dashboard report"
module: "Dashboard"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-DASH-007]
related: []
---

[← Dashboard](../modules/dashboard.md) · [Index](../INDEX.md)

# Export dashboard report

`F-DASH-015` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** **Export** opens "Download Report" to download the Dashboard as a PDF or Excel file.

**Why it exists:** Inferred from behavior: share or keep a dated snapshot of the Dashboard.

**Where to find it:** Dashboard header → **Export**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro). In family view you can pick the member (**Report for**); "Whole family" is not offered here.

**Steps**
1. Click **Export**.
2. (Family view) choose **Report for**.
3. Choose **Scope**: **All portfolios combined** or **Specific portfolio** (then pick one).
4. Choose **Format**: **PDF** or **Excel (.xlsx)**.
5. Choose **Appearance**: **Dark** or **Light (print)** ("· current" marks the app's theme).
6. Click **Download**. It reads **Preparing…**, then `everypaisa-dashboard-report<-member>.pdf` or `.xlsx` downloads and the dialog closes.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Report for** | Select | Whose dashboard | Family view only |
| **Scope** | Select | All portfolios or one | — |
| Portfolio picker ("— pick portfolio —") | Select | Chooses the portfolio | Only for **Specific portfolio** |
| **PDF** / **Excel (.xlsx)** | Toggle | File format | — |
| **Dark** / **Light (print)** | Toggle | Colours of the file | — |
| **Cancel** / **Download** | Buttons | Close / download | **Download** disabled while preparing, or for **Specific portfolio** with none picked |

**Fields and rules:** A specific portfolio must be picked when Scope is Specific portfolio.

**Settings and toggles here:** [S-DASH-007](../settings/dashboard.md#s-dash-007) **Dashboard export options** — Scope (default All portfolios combined), Format (default PDF), Appearance (default current theme); not remembered.

**Results:** A file is downloaded; it includes "Data as of / Data checks" lines like other reports.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A browser pop-up with an error text | The export failed | Try again; check the portfolio still exists |

**Limitations:** For another family member, the whole book is always exported (Scope is ignored).

**How it works:** `GET /api/reports/dashboard-export?format=&theme=&scope=&portfolioId=`; a specific portfolio must belong to the person the report is about.

**Related features:** [D-DASH-010](../dependencies.md#d-dash-010).

**Sources:** `apps/web/src/components/reports/DownloadReportButton.tsx:38`, `apps/web/src/components/reports/DownloadReportButton.tsx:70`, `apps/web/src/components/reports/DownloadReportButton.tsx:175`, `apps/web/src/components/reports/DownloadReportButton.tsx:201`, `apps/web/src/components/reports/DownloadReportButton.tsx:221`, `apps/web/src/components/reports/DownloadReportButton.tsx:246`, `packages/api/src/routes/reports.routes.ts:103`, `packages/api/src/controllers/reports.controller.ts:515`, `packages/api/src/controllers/reports.controller.ts:533`
