---
id: F-REPORT-010
title: "Excel / PDF download of the open tab"
module: "Reports"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO; R-FAMOWNER/uncapped members for others; R-MANAGER"
settings: [S-REPORT-001, S-REPORT-002, S-REPORT-003, S-REPORT-011]
related: [F-REPORT-001, F-REPORT-003]
---

[← Reports](../modules/reports.md) · [Index](../INDEX.md)

# Excel / PDF download of the open tab

`F-REPORT-010` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-FAMOWNER](../roles.md#r-famowner)/uncapped members for others; [R-MANAGER](../roles.md#r-manager)

**What it does:** On **Unrealised P&L**, **Intraday**, **STCG**, **LTCG**, **Schedule 112A** and **Income**, the **Excel** and **PDF** buttons download the same report as a file named `<tab>-<FY><member suffix>.xlsx|pdf`.

**Why it exists:** To hand the figures to a CA or keep them on file. Inferred from behavior.

**Where to find it:** **Tools → Reports**, right side of the filter card, on those six tabs.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (ungated); [R-FAMOWNER](../roles.md#r-famowner) and uncapped members can download for another member or the whole family; [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Open one of the six tabs and set the filters.
2. Optional: choose **Report for**.
3. Click **Excel** or **PDF**. The browser saves the file.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Excel** | Button | `.xlsx` | Hidden on other tabs |
| **PDF** | Button | `.pdf` | Hidden on other tabs |

**Fields and rules:** Not applicable — uses the page filters.

**Settings and toggles here:** [S-REPORT-001](../settings/reports.md#s-report-001), [S-REPORT-002](../settings/reports.md#s-report-002), [S-REPORT-003](../settings/reports.md#s-report-003); the file's colours follow the app's light/dark theme ([S-REPORT-011](../settings/reports.md#s-report-011)).

**Results:** A file is saved on your device. Nothing changes in your data.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A browser alert showing the raw server error text | The server refused (for example "That member is not part of a family you can see.", or a capped family view: "Your view of this family is limited to certain categories, and reports cannot yet be produced in a limited form. …") | Choose **Me** in **Report for** |

**Limitations:** Errors appear as a plain browser alert containing the raw server response. A file for another member covers all of that member's portfolios, whatever is chosen in **Portfolio**. The file name contains the FY even for **Unrealised P&L**, which is not FY-based.

**How it works:** The browser fetches `GET /api/reports/<tab>?portfolioId&fy&format&theme` with your session token (plus `subject` and `familyId` when **Report for** is not **Me**) and saves the response. The server resolves the subject: Me (default); a member (must be readable in the family you are viewing; capped members are refused); or **Whole family** (one section per member). Each file is stamped with data-check lines.

**Related features:** [F-REPORT-001](F-REPORT-001.md), [F-REPORT-003](F-REPORT-003.md).

**Sources:** `apps/web/src/pages/reports/ReportsPage.tsx:257`, `apps/web/src/pages/reports/ReportsPage.tsx:268`, `apps/web/src/pages/reports/ReportsPage.tsx:286`, `apps/web/src/components/reports/useReportSubject.ts:102`, `packages/api/src/services/reports/reportSubjects.ts:94`, `packages/api/src/services/reports/reportSubjects.ts:162`, `packages/api/src/services/reports/reportSubjects.ts:199`
