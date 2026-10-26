---
id: F-SPLIT-019
title: "Linking people who join"
module: "Split Expenses"
status: Live
roles: "Automatic"
settings: []
related: [F-SPLIT-002, F-SPLIT-015]
---

[← Split Expenses](../modules/split-expenses.md) · [Index](../INDEX.md)

# Linking people who join

`F-SPLIT-019` · Live · Roles: Automatic

**What it does:** When someone signs up or signs in with an email that you saved on a person, that person is linked to their account: they see your shared groups and the activity says "<name> joined EveryPaisa".

**Why it exists:** Inferred from behavior: people you split with can take part themselves once they have an account.

**Where to find it:** Automatic; the member shows "On EveryPaisa" in group settings.

**Who can use it:** Automatic.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Matching uses the email saved on the person (normalised to lowercase).

**Settings and toggles here:** None.

**Results:** The member row is attached to the account.

**Errors and troubleshooting:** None user-facing.

**Limitations:** If the account is already a member of that group, the placeholder is left unlinked.

**How it works:** Called from the auth service after registration/sign-in (`linkContactsForUser`), run as system, matched by email hash.

**Related features:** [F-SPLIT-002](F-SPLIT-002.md), [F-SPLIT-015](F-SPLIT-015.md), [D-SPLIT-003](../dependencies.md#d-split-003).

**Sources:** `packages/api/src/services/split/linking.service.ts:44`, `packages/api/src/services/auth/auth.service.ts:330`

**What this area doesn't do**
- No plan limits: Split Expenses is free for everyone.
- You can't edit or delete saved people, store their UPI ID, edit a payment, rename/delete labels or change a group's type or currency in the page.
- UPI pay and request links work only for INR groups; nothing is debited automatically.
- Payments are not added to Cash Activity; only your expense shares can be.
- It does not read SMS, email or receipts to create expenses.
