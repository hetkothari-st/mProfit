---
id: F-REPORT-007
title: "Income tab"
module: "Reports"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER"
settings: [S-REPORT-001, S-REPORT-002, S-REPORT-003]
related: [F-REPORT-001, F-TAX-008]
---

[← Reports](../modules/reports.md) · [Index](../INDEX.md)

# Income tab

`F-REPORT-007` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager)

**What it does:** Lists dividends, interest and maturity credits in the FY (Date, Type, Asset, Amount, Narration), headed "Dividends ₹… · Interest ₹… · Total income ₹… · Maturity proceeds ₹… (principal, not income)".

**Why it exists:** Collects "income from other sources" for the return and keeps returned principal out of the income total. Inferred from the heading text.

**Where to find it:** **Tools → Reports → Income**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Click **Income**, choose **Financial Year**.
2. Optional: **Excel** / **PDF**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Excel**, **PDF** | Buttons | Download | — |

**Fields and rules:** As [F-REPORT-001](F-REPORT-001.md).

**Settings and toggles here:** [S-REPORT-001](../settings/reports.md#s-report-001), [S-REPORT-002](../settings/reports.md#s-report-002) (download), [S-REPORT-003](../settings/reports.md#s-report-003).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No income this FY." | No dividend/interest/maturity rows dated in that FY | Pick another year |

**Limitations:** Maturity proceeds are shown but not counted in **Total income**.

**How it works:** `GET /api/reports/income`; download footer: Dividends, Interest, Total income, "Maturity proceeds (not income)".

**Related features:** [F-TAX-008](F-TAX-008.md).

**Sources:** `apps/web/src/pages/reports/ReportsPage.tsx:813`, `apps/web/src/pages/reports/ReportsPage.tsx:827`, `packages/api/src/controllers/reports.controller.ts:196`
