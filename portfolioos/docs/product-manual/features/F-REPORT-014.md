---
id: F-REPORT-014
title: "Accounting reports and Export to Tally (Pro/Advisor)"
module: "Reports"
status: Live
roles: "R-PRO (others: lock)"
settings: []
related: [F-REPORT-012, F-REPORT-013]
---

[← Reports](../modules/reports.md) · [Index](../INDEX.md)

# Accounting reports and Export to Tally (Pro/Advisor)

`F-REPORT-014` · Live · Roles: [R-PRO](../roles.md#r-pro) (others: lock)

**What it does:** Six catalog entries for the double-entry books: **Trial Balance**, **Account Ledger — All Accounts**, **Profit & Loss Statement**, **Balance Sheet**, **Chart of Accounts (Account Master)** and **Export to Tally** — "Your complete books as one ZIP for TallyPrime: groups and ledgers (one per bank account, loan, card and holding), vouchers split by financial year, holdings at each year end, and a step-by-step import guide. Checked against Tally's import rules before it downloads."

**Why it exists:** Accounting-specific exports for practices and CAs (Pro/Advisor plan). From code comments.

**Where to find it:** **Tools → Reports → Tax & MIS downloads**, last group.

**Who can use it:** [R-PRO](../roles.md#r-pro). [R-PLUS](../roles.md#r-plus) and [R-FAMILY](../roles.md#r-family) see a compact lock "Accounting Reports is locked — Upgrade to Pro/Advisor to unlock Accounting Reports." with **Upgrade**. [R-FREE](../roles.md#r-free) sees the combined card ([F-REPORT-013](F-REPORT-013.md)).

**Steps**
1. Set **As-of date** (Trial Balance, Balance Sheet) or **From**/**To** (Ledger, P&L).
2. Click **PDF**/**Excel**, or **ZIP** on **Export to Tally**. The ZIP is saved as `tally-export<member suffix>.zip`.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **PDF**, **Excel** | Buttons | Download | Locked below Pro/Advisor |
| **ZIP** | Button | Tally export | Locked below Pro/Advisor |
| **Upgrade** | Link | `/pricing` | Shown when locked |

**Fields and rules:** As [F-REPORT-012](F-REPORT-012.md).

**Settings and toggles here:** As [F-REPORT-012](F-REPORT-012.md).

**Results:** A file is saved. Before building, the server brings your accounting books up to date from your transactions.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This feature requires the PRO_ADVISOR plan or higher" | Plan below Pro/Advisor | Upgrade |
| "The Tally export covers one person — a combined version would not be a valid filing for anyone. Pick a single member and download it once per person." | **Report for** is **Whole family** | Choose one member |
| Alert listing problems | The books break a Tally import rule; the export is refused rather than producing a file Tally would partly reject | Fix the listed records in Accounting ([D-REPORT-005](../dependencies.md#d-report-005)) |

**Limitations:** Tally export is one person per file.

**How it works:** Server gate `requireFeature('ACCOUNTING_MODULE')`. Trial balance, ledger, P&L and balance sheet first project accounting entries for the subject. Tally export builds a ZIP and returns header `X-Tally-Notes` with the number of notes.

**Related features:** [F-REPORT-012](F-REPORT-012.md), [D-REPORT-005](../dependencies.md#d-report-005).

**Sources:** `apps/web/src/pages/reports/TaxMisDownloads.tsx:28`, `apps/web/src/pages/reports/TaxMisDownloads.tsx:433`, `apps/web/src/pages/reports/TaxMisDownloads.tsx:655`, `packages/api/src/routes/reports.routes.ts:86`, `packages/api/src/routes/reports.routes.ts:176`, `packages/api/src/controllers/reports.controller.ts:1152`, `packages/api/src/controllers/reports.controller.ts:1430`, `packages/api/src/services/reports/reportSubjects.ts:432`
