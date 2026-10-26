---
id: F-REPORT-012
title: "Tax & MIS downloads — inputs and free reports"
module: "Reports"
status: Live
roles: "R-FREE and up; R-MANAGER"
settings: [S-REPORT-002, S-REPORT-004, S-REPORT-005, S-REPORT-006, S-REPORT-007, S-REPORT-011]
related: [F-REPORT-001, F-REPORT-002, F-REPORT-013, F-REPORT-014]
---

[← Reports](../modules/reports.md) · [Index](../INDEX.md)

# Tax & MIS downloads — inputs and free reports

`F-REPORT-012` · Live · Roles: [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager)

**What it does:** The **Tax & MIS downloads** tab is a catalog of 42 print-style reports (PDF + Excel each; **Export to Tally** is ZIP). Its own input card has **Report for**, **Financial year**, **As-of date**, **From** and **To**; each card shows "Uses: …" with the inputs it takes. Two reports are free on every plan: **Portfolio Holdings Summary** (cross-asset valuation as of today with per-class subtotals) and **Cash Flow Statement** (period inflows vs outflows by category, T-account layout).

**Why it exists:** Mirrors the reports Indian investors and CAs know from desktop portfolio software ("mProfit-style layout"); these are "shaped to look right in print form … and would be visually noisy in-app" (code comment). Holdings summary and cash flow are "the Free-tier 'basic reports' carve-out".

**Where to find it:** **Tools → Reports → Tax & MIS downloads**.

**Who can use it:** Free reports: [R-FREE](../roles.md#r-free) and up. [R-MANAGER](../roles.md#r-manager) (managed person's data).

**Steps**
1. Open **Tax & MIS downloads**. Inputs default to: Financial year = the FY chosen on the page, As-of date = today, From = empty, To = today.
2. Adjust the inputs a report uses.
3. Click **PDF** or **Excel** on the card. The button spins until the file `<report>-<FY><member suffix>.pdf|xlsx` is saved.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Report for** | Select | Whose data ([S-REPORT-002](../settings/reports.md#s-report-002)) | As [F-REPORT-001](F-REPORT-001.md) |
| **Financial year** | Select | [S-REPORT-004](../settings/reports.md#s-report-004) | — |
| **As-of date** | Date | [S-REPORT-005](../settings/reports.md#s-report-005) | — |
| **From**, **To** | Date | [S-REPORT-006](../settings/reports.md#s-report-006), [S-REPORT-007](../settings/reports.md#s-report-007) | — |
| **PDF**, **Excel** (per card) | Buttons | Download | Disabled for that button while it downloads |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Financial year | Select | For FY reports | Current FY and 7 before | Page FY | "Invalid financial year …" |
| As-of date | Date | No | ISO date | Today | "Invalid `asOf` date" |
| From / To | Date | No | ISO dates; From ≤ To | From empty, To today | "Invalid `from` date", "`from` date is after `to` date" |

**Settings and toggles here:** [S-REPORT-002](../settings/reports.md#s-report-002), [S-REPORT-004](../settings/reports.md#s-report-004), [S-REPORT-005](../settings/reports.md#s-report-005), [S-REPORT-006](../settings/reports.md#s-report-006), [S-REPORT-007](../settings/reports.md#s-report-007), [S-REPORT-011](../settings/reports.md#s-report-011). Help text: "Each report uses whichever subset of these inputs applies to it (shown in the card). Leave any field blank to use the report's default range." When **Report for** is not **Me**: "These downloads cover every member of the family, one section each." or the member's name.

**Results:** A file is saved on your device.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Alert with raw error text | Invalid dates or a refused subject | Fix the dates or choose **Me** |

**Limitations:** The catalog ignores the page's **Portfolio** selector — every catalog report covers all your portfolios. The FY here is separate from the page's FY after the tab opens.

**How it works:** `GET /api/reports/download/<endpoint>?format&theme&fy|asOf|from|to&subject&familyId`. Every catalog download goes through one subject resolver (one section per member for **Whole family**) and is stamped with "Data as of" and data-check lines. Holdings summary and cash flow have no plan gate on the server.

**Related features:** [F-REPORT-013](F-REPORT-013.md), [F-REPORT-014](F-REPORT-014.md), [F-REPORT-002](F-REPORT-002.md).

**Sources:** `apps/web/src/pages/reports/TaxMisDownloads.tsx:36`, `apps/web/src/pages/reports/TaxMisDownloads.tsx:62`, `apps/web/src/pages/reports/TaxMisDownloads.tsx:172`, `apps/web/src/pages/reports/TaxMisDownloads.tsx:199`, `apps/web/src/pages/reports/TaxMisDownloads.tsx:530`, `apps/web/src/pages/reports/TaxMisDownloads.tsx:550`, `apps/web/src/pages/reports/TaxMisDownloads.tsx:630`, `packages/api/src/routes/reports.routes.ts:137`, `packages/api/src/routes/reports.routes.ts:140`, `packages/api/src/controllers/reports.controller.ts:1104`
