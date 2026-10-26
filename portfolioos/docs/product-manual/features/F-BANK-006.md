---
id: F-BANK-006
title: "Share bank details"
module: "Bank Accounts"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-BANK-005]
---

[← Bank Accounts](../modules/bank-accounts.md) · [Index](../INDEX.md)

# Share bank details

`F-BANK-006` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** **Share details** prepares a text with the bank name, holder, full account number, IFSC, branch and branch address. On touch devices it opens your phone's share sheet (WhatsApp, SMS, email…); on computers it copies the text ("Bank details copied").

**Why it exists:** Code comment: "Plain-text bank details for the user to send onward (to receive a transfer)."

**Where to find it:** Under each tile and on the detail page.

**Who can use it:** The account's owner.

**Steps**
1. Click **Share details**. A spinner shows.
2. Choose an app in the share sheet, or paste the copied text where you need it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Share details** | Button | Builds and shares/copies the text | Disabled while loading |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** The text is lines: "<Bank> account details", "Account holder: <name>", "Account number: <number>", and when known "IFSC: …", "Branch: …", "Branch address: …". An audit record "pii_share" is written. Missing branch name/address are filled from the IFSC and saved to the account.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Add the full account number (Edit) to share bank details." | No full number saved | Edit the account |
| "Couldn't load bank details. Try again in a minute." | Error or rate limit (5 per minute) | Wait |
| "Couldn't copy: the browser blocked clipboard access." | Browser refused | Allow clipboard access |

**Limitations:** Closing the share sheet without choosing an app does nothing; other share-sheet failures fall back to copying.

**How it works:** `POST /api/bank-accounts/:id/share` (shares the 5-per-minute limit with reveal); the IFSC lookup failing does not block sharing.

**Related features:** [F-BANK-005](F-BANK-005.md).

**Sources:** `apps/web/src/components/bankAccounts/ShareBankDetailsButton.tsx:8`, `apps/web/src/components/bankAccounts/ShareBankDetailsButton.tsx:15`, `apps/web/src/components/bankAccounts/ShareBankDetailsButton.tsx:32`, `apps/web/src/components/bankAccounts/ShareBankDetailsButton.tsx:52`, `packages/api/src/services/banking/bankAccounts.service.ts:312`, `packages/api/src/services/banking/bankAccounts.service.ts:347`, `packages/api/src/services/banking/bankAccounts.service.ts:387`
