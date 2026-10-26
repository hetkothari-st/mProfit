---
id: F-ACCT-004
title: "Vouchers list"
module: "Accounting"
status: Live
roles: "R-PRO, R-MANAGER"
settings: [S-ACCT-005]
related: [F-ACCT-005, F-ACCT-006, F-ACCT-008]
---

[← Accounting](../modules/accounting.md) · [Index](../INDEX.md)

# Vouchers list

`F-ACCT-004` · Live · Roles: [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Lists vouchers newest first, 50 per page: **Date**, **Voucher No.**, **Type** (JOURNAL, PAYMENT, RECEIPT, CONTRA, PURCHASE, SALES, with "auto" for generated ones), **Narration**, **Amount** (sum of its lines), **Entries** count, and view / download / delete buttons. A type filter narrows the list.

**Why it exists:** The day book of all postings. Inferred from behavior.

**Where to find it:** **Tools → Accounting → Vouchers**.

**Who can use it:** [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) per the manager's plan.

**Steps**
1. Pick a type in the filter (**All types** by default).
2. Page with **Previous** / **Next** when there are more than 50.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Type filter (**All types**, JOURNAL…SALES) | Select | Filters; back to page 1 | — |
| **Previous** / **Next** | Buttons | Page | Shown with more than 50; disabled at the ends |
| Eye ("View receipt") / Download ("Download receipt (PDF)") / Bin ("Delete voucher") | Buttons | [F-ACCT-008](F-ACCT-008.md) / [F-ACCT-006](F-ACCT-006.md) | — |

**Fields and rules:** Not applicable.

**Settings and toggles here:** [S-ACCT-005](../settings/accounting.md#s-acct-005) **Voucher type filter** (not saved).

**Results:** None.

**Errors and troubleshooting:** "No vouchers yet — create one above."

**Limitations:** Vouchers can't be opened or edited in the app.

**How it works:** `GET /api/accounting/vouchers?type=&page=&limit=50` (limit up to 200), ordered by date.

**Related features:** [F-ACCT-005](F-ACCT-005.md) to [F-ACCT-008](F-ACCT-008.md).

**Sources:** `apps/web/src/pages/accounting/AccountingPage.tsx:356`, `apps/web/src/pages/accounting/AccountingPage.tsx:534`, `packages/api/src/services/accounting/accounting.service.ts:330`
