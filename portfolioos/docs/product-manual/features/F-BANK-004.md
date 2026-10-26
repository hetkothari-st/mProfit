---
id: F-BANK-004
title: "Bank account detail"
module: "Bank Accounts"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-BANK-002, F-BANK-005, F-BANK-006, F-BANK-007, F-BANK-008]
---

[← Bank Accounts](../modules/bank-accounts.md) · [Index](../INDEX.md)

# Bank account detail

`F-BANK-004` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Shows one account: the large building tile, **Edit**, **Record balance**, **Share details**; an **Available balance** card ("As of <date>", with a pulsing "live from Gmail" when updated from email); **Bank details** (Bank, Type, Account number with eye, Customer ID, IFSC, Branch, Branch address, Status); **Holder & nominee** (Holder, Joint, Nominee, Relation); **Linked debit card** (Card last 4 as "•••• 1234", Expires) when set; then balance history ([F-BANK-007](F-BANK-007.md)) and recent activity ([F-BANK-008](F-BANK-008.md)).

**Why it exists:** Inferred from behavior: every detail of one account, plus how its balance moved.

**Where to find it:** **Bank Accounts** → tile (route `/bank-accounts/:id`).

**Who can use it:** The account's owner.

**Steps**
1. Read the details. Use **Edit**, **Record balance** or **Share details**.
2. Click **All accounts** to go back.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **All accounts** | Button | Opens `/bank-accounts` | — |
| **Edit** | Button | [F-BANK-002](F-BANK-002.md) | — |
| **Record balance** | Button | [F-BANK-007](F-BANK-007.md) | — |
| **Share details** | Button | [F-BANK-006](F-BANK-006.md) | — |
| Account number eye | Toggle | [F-BANK-005](F-BANK-005.md) | — |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Account not found." with **Back to bank accounts** | Deleted, or not yours | Go back |

**Limitations:** Empty fields show "—".

**How it works:** `GET /api/bank-accounts/:id` (owner only) with up to the 365 most recent balance records.

**Related features:** [F-BANK-005](F-BANK-005.md), [F-BANK-006](F-BANK-006.md), [F-BANK-007](F-BANK-007.md), [F-BANK-008](F-BANK-008.md).

**Sources:** `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:130`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:154`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:197`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:213`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:241`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:279`, `packages/api/src/services/banking/bankAccounts.service.ts:155`
