---
id: F-EMI-009
title: "Export the schedule to PDF or Excel"
module: "EMI Calculator"
status: Live
roles: "All signed-in"
settings: [S-EMI-006, S-EMI-008]
related: [F-EMI-001, F-EMI-005]
---

[← EMI Calculator](../modules/emi-calculator.md) · [Index](../INDEX.md)

# Export the schedule to PDF or Excel

`F-EMI-009` · Live · Roles: All signed-in

**What it does:** **PDF** and **Excel** download the current calculation as `emi-schedule.pdf` or `emi-schedule.xlsx`: a summary (loan amount, rate, tenure, EMI, total interest, total prepaid, fees, total cost, APR, nominal rate, tax saved and cost after tax when on, rate changes) and the full schedule with paise.

**Why it exists:** Inferred from behavior: to keep or share the schedule outside the app; the schedule card notes the files show paise.

**Where to find it:** **Tools → EMI Calculator → PDF** / **Excel** (header buttons, route `/emi`).

**Who can use it:** All signed-in users.

**Steps**
1. On the **Calculate** tab, with valid inputs, click **PDF** or **Excel**.
2. The file downloads.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **PDF** | Button | Downloads PDF | Disabled when inputs are invalid, while an export runs, or when not on the Calculate tab |
| **Excel** | Button | Downloads XLSX | Same as **PDF** |

**Fields and rules:** Not applicable.

**Settings and toggles here:** Tax and fee toggles ([S-EMI-006](../settings/emi-calculator.md#s-emi-006), [S-EMI-008](../settings/emi-calculator.md#s-emi-008)) decide what is included.

**Results:** A file is downloaded; nothing is stored on the server.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Too many exports - please wait a minute" | More than 10 exports in a minute | Wait a minute |
| "Couldn't create the file" or the server's validation message | Server error or invalid input | Fix inputs and retry |

**Limitations:** The file title is always "Loan". The PDF writes "Rs." instead of "₹". Compare-tab offers are not exported.

**How it works:** `POST /api/emi/export?format=pdf|xlsx` with the same inputs; the server re-validates them with the shared validator, recomputes the summary and builds the file (Excel money cells use the `#,##,##0.00` format and real date cells). Limited to 10 per minute per user.

**Related features:** [F-EMI-001](F-EMI-001.md), [F-EMI-005](F-EMI-005.md).

**Sources:** `apps/web/src/pages/emi/EmiCalculatorPage.tsx:60`, `apps/web/src/pages/emi/EmiCalculatorPage.tsx:81`, `apps/web/src/api/loans/emi.api.ts:5`, `packages/api/src/routes/emi.routes.ts:9`, `packages/api/src/controllers/emi.controller.ts:37`, `packages/api/src/services/loans/emi/emiExport.ts:17`, `packages/api/src/middleware/rateLimit.ts:219`
