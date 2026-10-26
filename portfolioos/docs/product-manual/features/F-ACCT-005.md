---
id: F-ACCT-005
title: "New voucher"
module: "Accounting"
status: Live
roles: "R-PRO, R-MANAGER"
settings: [S-ACCT-004]
related: [F-ACCT-004, F-ACCT-009]
---

[← Accounting](../modules/accounting.md) · [Index](../INDEX.md)

# New voucher

`F-ACCT-005` · Live · Roles: [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** **New Voucher** records a voucher with type, number (suggested automatically), date, narration and one or more lines, each a debit account, a credit account, an amount and an optional narration, with a running **Total**.

**Why it exists:** To post entries the automatic generation doesn't cover. Inferred from behavior.

**Where to find it:** **Tools → Accounting → Vouchers → New Voucher**.

**Who can use it:** [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) per the manager's plan.

**Steps**
1. Click **New Voucher**. Type **JOURNAL**, today's date and a suggested number (for example "JO0001") fill in.
2. Change **Type** if needed; the suggested number follows the type's two-letter prefix.
3. For each line pick **Debit Account** and **Credit Account** and type **Amount (₹)**; click **Add row** for more lines, the bin (aria "Remove row") to drop one.
4. Click **Save Voucher**. The toast "Voucher created" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add row** | Button | Adds a line | — |
| Bin (aria "Remove row") | Button | Removes a line | Hidden with one line |
| **Save Voucher** | Button | Saves; "Saving…" | Disabled until every line has both accounts and an amount, and while saving |
| **Cancel** | Button | Closes | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Type** | Select (6) | Yes | — | JOURNAL | — |
| **Voucher No.** | Text | Yes | 1–50; unique per type | Suggested | Server: "Voucher number <no> already exists for type <type>" (shown as a generic error) |
| **Date** | Date | Yes | YYYY-MM-DD | Today | — |
| **Narration** | Text | No | Up to 500 | Empty | — |
| **Debit Account** / **Credit Account** | Select | Yes | Your accounts | "Select…" | Server: "One or more account IDs not found" |
| **Amount (₹)** | Number | Yes | Positive decimal | Empty | — |

**Settings and toggles here:** [S-ACCT-004](../settings/accounting.md#s-acct-004) **Voucher type**.

**Results:** The voucher is saved and appears in the list, ledger and statements.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Generic request error when saving a second voucher | The suggested number isn't refreshed after a save (and a typed number is kept), so it repeats (defect) | Type a new number, or reload the page |

**Limitations:** The dialog keeps the previous voucher's lines after saving. With only generated ("AUTO-…") vouchers of a type, the suggested number is built from the digits inside the generated voucher's id, giving a very long number (defect). After number 9999 the suggestion stops increasing because numbers are compared as text.

**How it works:** `GET /api/accounting/vouchers/next-no?type=` returns the type's first two letters + the last number + 1, padded to 4 digits (cached for 30 seconds in the browser). `POST /api/accounting/vouchers` checks every account is yours and the number is unused for the type. Each line is its own debit/credit pair, so a voucher always balances.

**Related features:** [F-ACCT-004](F-ACCT-004.md), [F-ACCT-009](F-ACCT-009.md).

**Sources:** `apps/web/src/pages/accounting/AccountingPage.tsx:212`, `apps/web/src/pages/accounting/AccountingPage.tsx:227`, `apps/web/src/pages/accounting/AccountingPage.tsx:237`, `apps/web/src/pages/accounting/AccountingPage.tsx:348`, `apps/web/src/main.tsx:44`, `packages/api/src/schemas/accounting.schema.ts:55`, `packages/api/src/services/accounting/accounting.service.ts:364`, `packages/api/src/services/accounting/accounting.service.ts:434`, `packages/api/src/services/accounting/accounting.service.ts:441`
