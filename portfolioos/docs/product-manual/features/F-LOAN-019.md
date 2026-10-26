---
id: F-LOAN-019
title: "Record a repayment or other entry on a loan given"
module: "Loans"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-LOAN-018, F-LOAN-020]
---

[← Loans](../modules/loans.md) · [Index](../INDEX.md)

# Record a repayment or other entry on a loan given

`F-LOAN-019` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Adds an entry to a loan given's ledger: **Repayment received** (flexible) or **Lump-sum repayment** (EMI), **Interest received** (only for loans with interest), **Lent more money**, or **Forgave part of it** — each with an amount, date and note. Entries can be removed from **History**.

**Why it exists:** Inferred from behavior: every figure on the loan is derived from this ledger, so one-off events (a partial return, a top-up, a write-down) are recorded as entries.

**Where to find it:** Loan given page → **Record payment** (flexible) or **Add entry** (EMI) (route `/loans/given/:id`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Click **Record payment** (or **Add entry**). For EMI loans the dialog notes: "For a lump sum, extra money lent or interest. Regular EMIs are quicker from the schedule."
2. Choose **What happened?**, enter **Amount (₹)** and **Date** (today by default) and an optional **Note (optional)** (placeholder "e.g. UPI, cash").
3. Click **Add**. The toast "Entry added" appears.
4. To remove an entry, click the bin on its **History** row. The toast "Entry removed" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Cancel** / **Add** | Buttons | Close / save | Disabled while saving |
| **Remove entry** (bin) | Icon button | Deletes the entry, no confirmation | On hover (desktop) |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **What happened?** | Select | Yes | Repayment / Interest received (interest loans only) / Lent more money / Forgave part of it | Repayment | — |
| **Amount (₹)** | Text | Yes | Number > 0; commas, spaces, ₹ stripped | Empty | "Enter an amount greater than 0" (server: "Amount must be greater than 0") |
| **Date** | Date | Yes | YYYY-MM-DD | Today | — |
| **Note (optional)** | Text | No | Up to 1000 characters | Empty | — |

**Settings and toggles here:** None.

**Results:** The entry is stored and the summary, schedule and reminders recompute. On EMI loans an untied repayment or forgiveness fills the oldest instalments first; interest received counts toward instalments too.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Enter an amount greater than 0" | Empty, zero or non-numeric amount | Correct it |
| "Could not add the entry" or a server message | Server error | Retry |
| Toast "Something went wrong" on remove | Server error | Retry |

**Limitations:** Entries cannot be edited, only removed and re-added. Removing a write-off's forgiveness entry is the only way to undo its effect on the balance after **Reopen**.

**How it works:** `POST /api/loans-given/:id/entries` (kind REPAYMENT, INTEREST_RECEIVED, ADDITIONAL_LENT or WAIVER); `DELETE /api/loans-given/entries/:entryId` checks ownership through the parent loan. Both return the refreshed loan.

**Related features:** [F-LOAN-018](F-LOAN-018.md), [F-LOAN-020](F-LOAN-020.md).

**Sources:** `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:63`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:102`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:113`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:130`, `packages/api/src/controllers/loansGiven.controller.ts:41`, `packages/api/src/services/loans/loansGiven.service.ts:533`, `packages/api/src/services/loans/loansGiven.service.ts:540`, `packages/api/src/services/loans/loansGiven.service.ts:554`
