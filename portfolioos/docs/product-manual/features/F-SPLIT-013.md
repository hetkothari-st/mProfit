---
id: F-SPLIT-013
title: "Pay via UPI"
module: "Split Expenses"
status: Live
roles: "Member who owes"
settings: [S-SPLIT-007]
related: [F-SPLIT-011, F-SPLIT-017]
---

[← Split Expenses](../modules/split-expenses.md) · [Index](../INDEX.md)

# Pay via UPI

`F-SPLIT-013` · Live · Roles: Member who owes

**What it does:** **Pay** on a balance row opens **Pay <name>**: the amount, the payee's name and UPI ID, **Open UPI app** (a `upi://pay` link), **Copy pay link** and a QR code ("Scan with any UPI app"). A second after the QR shows (or when you tap **Open UPI app**) it asks "Did the payment go through?" — **Yes, record it** records a UPI payment for today; **Not yet** closes.

**Why it exists:** Code comment: "a co-member's UPI ID is revealed only to someone who actually owes them."

**Where to find it:** Group page → **Balances** → **Pay** (INR groups only).

**Who can use it:** A member who owes the payee in that group.

**Steps**
1. Click **Pay**. Pay in your UPI app (button, copy link or scan).
2. Click **Yes, record it** ("Payment recorded").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Open UPI app** | Link button | Opens the UPI intent | — |
| **Copy pay link** | Button | Copies the link | — |
| **Yes, record it** / **Not yet** | Buttons | Record or close | Record disabled while saving |

**Fields and rules:** None (amount is what you owe; the API allows a smaller amount but not more).

**Settings and toggles here:** The payee's [S-SPLIT-007](../settings/split-expenses.md#s-split-007) **UPI ID**.

**Results:** A UPI payment is recorded and balances update.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "<name> hasn't shared a UPI ID in this group yet" + "Ask them to add a UPI ID in Split settings" | Payee has no UPI ID (or, for a linked account, hasn't added or paid anything in the group yet) | Ask them |
| "UPI works only for INR groups" | Foreign-currency group | Settle up manually |
| "you don't owe <name> anything here" | Nothing owed | — |

**Limitations:** UPI only for INR groups. The payee's UPI ID comes from their own Split settings (if they have an account and have taken part in the group) or from the saved person's UPI ID, which the page cannot set.

**How it works:** `GET /api/split/groups/:id/upi-link?to=&amount=` builds `upi://pay?pa=…&pn=…&am=…&cu=INR&tn=<group> settle-up` (note max 40 characters); not cached in the browser.

**Related features:** [F-SPLIT-011](F-SPLIT-011.md), [F-SPLIT-017](F-SPLIT-017.md).

**Sources:** `apps/web/src/pages/split/PayNowDialog.tsx:30`, `apps/web/src/pages/split/PayNowDialog.tsx:48`, `apps/web/src/pages/split/PayNowDialog.tsx:86`, `apps/web/src/pages/split/PayNowDialog.tsx:99`, `packages/api/src/services/split/settings.service.ts:63`
