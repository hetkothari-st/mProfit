---
id: F-BANK-007
title: "Record balance and balance history"
module: "Bank Accounts"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-BANK-004, F-BANK-008]
---

[← Bank Accounts](../modules/bank-accounts.md) · [Index](../INDEX.md)

# Record balance and balance history

`F-BANK-007` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** **Record balance** saves an account's balance on a date. With two or more records, a **Balance history** chart appears; **Recorded balances** lists every record (Date, Balance, Source, Note) with a delete button.

**Why it exists:** Inferred from behavior: track how a balance changes over time from statements.

**Where to find it:** Bank account detail → **Record balance**; sections below the details.

**Who can use it:** The account's owner.

**Steps**
1. Click **Record balance**. "Record balance" opens.
2. Set **As of** (today by default), **Balance (₹)** and optional **Note (optional)**.
3. Click **Record**. "Balance recorded" appears.
4. To remove a record, click its bin (**Delete**) — it is deleted at once.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **As of** | Date | Date of the balance | — |
| **Balance (₹)** ("123456.78") | Text | Amount | — |
| **Note (optional)** ("Monthly statement, etc.") | Text | Note | — |
| **Cancel** / **Record** | Buttons | Close / save | **Record** disabled until the balance is a number, and while saving |
| **Delete** (bin in a row) | Icon button | Deletes that record | Disabled while deleting |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| As of | Date | Yes | YYYY-MM-DD | Today (UTC date) | Server validation message |
| Balance | Text | Yes | Number, may be negative | — | Button stays disabled |
| Note | Text | No | ≤500 characters | — | — |

**Settings and toggles here:** None.

**Results:** One record per account per date — recording the same date again replaces it. If it is the newest record, the account's current balance and "As of" date take its values.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to save snapshot" | Server error | Try again |

**Limitations:** Deleting a record does not change the account's current balance and has no confirmation or message. The chart's axis shows thousands ("₹100k") and is not hidden by **Hide values**. The default date is the UTC date, which before 05:30 IST is yesterday.

**How it works:** `POST /api/bank-accounts/:id/snapshots` upserts by (account, date); `DELETE /api/bank-accounts/snapshots/:id` checks ownership. Records you add are "manual"; the account's balance source becomes "statement" when a manual record is the newest.

**Related features:** [F-BANK-004](F-BANK-004.md), [F-BANK-008](F-BANK-008.md).

**Sources:** `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:53`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:109`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:142`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:300`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:326`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:365`, `packages/api/src/controllers/bankAccounts.controller.ts:54`, `packages/api/src/services/banking/bankAccounts.service.ts:400`, `packages/api/src/services/banking/bankAccounts.service.ts:427`, `packages/api/src/services/banking/bankAccounts.service.ts:445`
