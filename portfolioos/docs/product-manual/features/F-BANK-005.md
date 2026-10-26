---
id: F-BANK-005
title: "Reveal full account number"
module: "Bank Accounts"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-BANK-006]
---

[← Bank Accounts](../modules/bank-accounts.md) · [Index](../INDEX.md)

# Reveal full account number

`F-BANK-005` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** The account number shows as "●●●● ●●●● 1234". The eye (**Show account number**) fetches and shows the full number grouped in fours; clicking again (**Hide account number**) masks it.

**Why it exists:** Code comment: the full number is "fetched on demand from the audited reveal endpoint and held only in component state".

**Where to find it:** The account number line on a tile or on the detail page.

**Who can use it:** The account's owner.

**Steps**
1. Click the eye. A spinner shows, then the full number.
2. Click again to hide it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Show account number** / **Hide account number** | Icon toggle | Reveals/masks | Disabled while loading |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Each reveal writes an audit record ("pii_view", account number). The number re-masks when you open another account or the account changes.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Only the last 4 digits are saved. Edit the account to add the full number." | No full number saved | Edit the account |
| "Could not reveal the account number. Try again in a minute." | Error, or more than 5 reveals/shares in a minute | Wait a minute |
| "Could not decrypt the account number — the encryption key may have changed" | Server key problem | Contact support |

**Limitations:** Reveal and share together are limited to 5 per minute per user.

**How it works:** `POST /api/bank-accounts/:id/reveal` (rate-limited, response not cached) decrypts the stored number and records the audit row before returning it.

**Related features:** [F-BANK-006](F-BANK-006.md).

**Sources:** `apps/web/src/components/bankAccounts/AccountNumberReveal.tsx:6`, `apps/web/src/components/bankAccounts/AccountNumberReveal.tsx:39`, `apps/web/src/components/bankAccounts/AccountNumberReveal.tsx:43`, `apps/web/src/components/bankAccounts/AccountNumberReveal.tsx:68`, `packages/api/src/routes/bankAccounts.routes.ts:38`, `packages/api/src/middleware/rateLimit.ts:196`, `packages/api/src/services/banking/bankAccounts.service.ts:114`, `packages/api/src/services/banking/bankAccounts.service.ts:274`
