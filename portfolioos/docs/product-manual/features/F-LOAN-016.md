---
id: F-LOAN-016
title: "Loans given list"
module: "Loans"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-LOAN-001, F-LOAN-017, F-LOAN-018]
---

[← Loans](../modules/loans.md) · [Index](../INDEX.md)

# Loans given list

`F-LOAN-016` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** The **Loans given** section lists money you have lent, one card per loan: the borrower's name, relationship and "Lent <date>", a status badge (**Active**, **Settled**, **Written off**), **Still owed** with "of ₹<lent>" and the yearly interest rate (when above 0), a progress bar (EMI loans show instalment blocks and an "x/y instalments done" bar), and for active loans the next payment: "₹… due <date>" or, in red with a warning icon, "₹… overdue by N days". Active loans come first; closed ones are listed under **Settled / Written off**, faded.

**Why it exists:** The section subtitle states it: "Money you have lent — what they owe, repayments and interest". The empty state: "Lent money to a friend, relative or business? Track what they owe, repayments, interest and due dates here."

**Where to find it:** **Asset Classes → Loans → Loans given** section, or **Given** in the switcher (route `/loans?view=given`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Open **Asset Classes → Loans** and click **Given** (or scroll down).
2. Read each card. An overdue loan has a red border.
3. Click a card (or press Enter on it) to open its detail page ([F-LOAN-018](F-LOAN-018.md)).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Loan-given card | Link (role link) | Opens `/loans/given/:id` | Never |
| **Lend money** | Button | Opens **Lend money** ([F-LOAN-017](F-LOAN-017.md)) | Never |
| **Record a loan you gave** | Button (empty state) | Opens **Lend money** | Shown only with no loans given |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing is changed.

**Errors and troubleshooting:** None specific — while loading, two placeholder cards show.

**Limitations:** Sorted by the date lent, newest first; no search or filter. The section shows no error message if loading fails (it shows nothing).

**How it works:** `GET /api/loans-given` returns each loan with its ledger entries and a server-computed summary (see [F-LOAN-018](F-LOAN-018.md)). For flexible loans the progress bar = (repaid + forgiven) ÷ lent, capped at 100%.

**Related features:** [F-LOAN-001](F-LOAN-001.md), [F-LOAN-017](F-LOAN-017.md), [F-LOAN-018](F-LOAN-018.md).

**Sources:** `apps/web/src/pages/loans/given/LoansGivenSection.tsx:16`, `apps/web/src/pages/loans/given/LoansGivenSection.tsx:79`, `apps/web/src/pages/loans/given/LoansGivenSection.tsx:99`, `apps/web/src/pages/loans/given/LoansGivenSection.tsx:136`, `apps/web/src/pages/loans/given/LoansGivenSection.tsx:157`, `packages/api/src/services/loans/loansGiven.service.ts:479`
