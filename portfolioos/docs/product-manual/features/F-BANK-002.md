---
id: F-BANK-002
title: "Add or edit a bank account"
module: "Bank Accounts"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-BANK-001, S-BANK-002]
related: [F-BANK-001, F-BANK-004, F-BANK-005, F-BANK-008]
---

[← Bank Accounts](../modules/bank-accounts.md) · [Index](../INDEX.md)

# Add or edit a bank account

`F-BANK-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** "Add bank account" / "Edit bank account" records an account's details. Recognised banks fill in the IFSC's first five characters; a full IFSC looks up the branch name and address; the customer ID is copied from another account you have at the same bank.

**Why it exists:** Code comments: users paste numbers with spaces; "CIFs are per bank, not per account"; the IFSC lookup "pulls branch name + address".

**Where to find it:** **Bank Accounts → Add account**, tile **Edit**, or detail **Edit**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Type or pick the **Bank** (suggestions list Indian banks with their IFSC prefix). For a recognised bank, an empty IFSC becomes the bank's four letters plus "0", and the Customer ID is copied from your other account at that bank ("From your other <bank> account.").
2. Choose **Type** and fill **Account holder** (suggestions: your name and holders on your other accounts).
3. Either type **Last 4 digits**, or type the **Full account number (optional)** — the last 4 then fill themselves and lock.
4. Type the **IFSC**. A complete code shows "Looking up branch…" and fills **Branch** and **Branch address**.
5. Fill **Customer ID**, optional **Nickname**, **Current balance (₹)** (the **As of** date becomes today when you first type a balance), nominee, joint holders, debit card and **Status**.
6. Click **Add account** (or **Save changes**). It reads **Saving…**, then "Account added" / "Account updated".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Bank \*** ("Search HDFC, SBI, Kotak…") | Suggest input | Bank name | — |
| **Type** | Select | Savings, Current, Salary, Nre, Nro, Od | — |
| **Account holder \*** ("Name on account") | Suggest input | Holder name | — |
| **Last 4 digits \*** | Text | Last 4 digits | Read-only while a full number is typed |
| **Full account number (optional)** | Text | Full number (placeholder "Saved — type a new one to replace it" when one is saved) | — |
| **IFSC** | Text | Branch code; lookup when complete | — |
| **Branch**, **Branch address** | Text | Branch details ("Filled from the IFSC — edit if needed") | — |
| **Customer ID \*** ("Bank-issued CIF / Customer ID") | Text | Customer ID | — |
| **Nickname (optional)** ("Primary salary, Emergency fund…") | Text | Name shown on the tile | — |
| **Current balance (₹)**, **As of** | Text, date | Balance and its date | — |
| **Nominee name**, **Relation** | Suggest inputs | Nominee; picking a known nominee fills the relation | — |
| **Joint holders (comma-separated)** | Text | Joint holders | — |
| **Card last 4**, **Expiry** (MM, YY) | Text, selects | Linked debit card | — |
| **Status** | Select | Active, Dormant, Closed | — |
| **Cancel** / **Add account** / **Save changes** | Buttons | Close / save | Save disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Bank | Text | Yes | ≤200 characters | Empty | "Required" |
| Account holder | Text | Yes | ≤200 | Your name (new account) | "Required" |
| Last 4 digits | Text | Yes | Exactly 4 digits | Empty | "Must be 4 digits" |
| Full account number | Text | No | 6–18 digits after removing spaces and hyphens | Empty (never shown back) | "Must be 6–18 digits"; server "Account number must be 6–18 digits" |
| IFSC | Text | No | 11 characters: 4 letters, 0, 6 letters/digits; a bare "XXXX0" counts as not entered | Bank prefix | "11 characters, e.g. HDFC0001234" |
| Customer ID | Text | Yes in the form (optional on the server) | ≤64 | Copied from same bank | "Required" |
| Nickname | Text | No | ≤120 | — | — |
| Current balance | Text | No | A number, may be negative | Empty | "Must be a number" |
| Nominee / Relation | Text | No | ≤200 / ≤60 | — | — |
| Card last 4 | Text | No | 4 digits | — | "Must be 4 digits" |
| Expiry | Two selects | No | Both month and year, or neither; years from this year to +20 | — | "Pick both month and year" |
| Status | Select | Yes | Active, Dormant, Closed | Active | — |

**Settings and toggles here:** [S-BANK-001](../settings/bank-accounts.md#s-bank-001) **Account type** — a label (Savings, Current, Salary, NRE, NRO, OD); no calculation uses it. [S-BANK-002](../settings/bank-accounts.md#s-bank-002) **Status** — Active accounts count in **Total balance**; Closed accounts are skipped when email events are matched to an account ([F-BANK-008](F-BANK-008.md)); Dormant/Closed tiles show the status instead of "Available balance".

**Results:** The account is saved; the full number is encrypted; the customer ID is stored encrypted too. Typing a new full number replaces the saved one and updates the last 4.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "IFSC not found — check the code." | No branch has that code | Check the code |
| "Couldn't look up the branch. Fill it in below." | Lookup service unreachable | Type branch details by hand |
| "Failed to add account" / "Failed to update account" | Server rejected the data (the specific reason is not shown) | Check lengths and formats above |

**Limitations:** The form requires Customer ID although the server does not. Saving an edit always re-saves the balance, so an account updated from email loses its "live" mark after you edit it (see DOCUMENTATION_GAPS.md). The saved full number cannot be removed from the form (leaving the box empty keeps it). Opening and closing dates exist on the server but are not in the form.

**How it works:** `POST /api/bank-accounts` / `PATCH /api/bank-accounts/:id`. IFSC details come from `GET /api/bank-accounts/ifsc/:code`, which asks Razorpay's public IFSC service (5-second timeout) and remembers answers, including "not found", in server memory. A new account fills only empty branch fields; editing to a different IFSC replaces them. A balance typed here sets the balance date to the **As of** date (today if blank) and marks the source as manual.

**Related features:** [F-BANK-001](F-BANK-001.md), [F-BANK-004](F-BANK-004.md), [F-BANK-005](F-BANK-005.md).

**Sources:** `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:24`, `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:229`, `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:254`, `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:270`, `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:300`, `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:318`, `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:337`, `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:448`, `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:469`, `packages/api/src/controllers/bankAccounts.controller.ts:26`, `packages/api/src/controllers/bankAccounts.controller.ts:115`, `packages/api/src/services/banking/bankAccounts.service.ts:98`, `packages/api/src/services/banking/bankAccounts.service.ts:166`, `packages/api/src/services/banking/bankAccounts.service.ts:245`, `packages/api/src/services/banking/ifscLookup.service.ts:14`, `packages/api/src/services/banking/ifscLookup.service.ts:63`
