---
id: F-SPLIT-012
title: "Settle up (record a payment)"
module: "Split Expenses"
status: Live
roles: "Group members"
settings: [S-SPLIT-013]
related: [F-SPLIT-011, F-SPLIT-013]
---

[← Split Expenses](../modules/split-expenses.md) · [Index](../INDEX.md)

# Settle up (record a payment)

`F-SPLIT-012` · Live · Roles: Group members

**What it does:** The **Settle up** dialog records money paid between two members: **Paid by**, **Paid to**, **Amount (<currency>)**, **Method** (Cash, UPI, Other) and **Date**. Opened from a balance row it is pre-filled with that row.

**Why it exists:** Inferred from behavior: records repayments made outside the app so balances update.

**Where to find it:** Group page → **Settle up**, or **Settle** on a balance row.

**Who can use it:** Active group members (any member can record any pair).

**Steps**
1. Check **Paid by**, **Paid to**, **Amount**, **Method**, **Date**.
2. Click **Record payment** ("Payment recorded").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Paid by**, **Paid to** | Selects | The two members | — |
| **Method** | Select | [S-SPLIT-013](../settings/split-expenses.md#s-split-013) | — |
| **Record payment** / **Cancel** | Buttons | Save or close | Record disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Paid by / Paid to | Selects | Yes | Different active members | You / first other | "Pick two different people" |
| Amount | Number | Yes | > 0, at most 2 decimals | Row amount | "Enter an amount above 0 with at most 2 decimals" |
| Date | Date | Yes | Not in the future | Today | "Invalid date" |

**Settings and toggles here:** [S-SPLIT-013](../settings/split-expenses.md#s-split-013) **Payment method**.

**Results:** Balances update; activity records the payment.

**Errors and troubleshooting:** "Could not record the payment" + reason; "Payer and receiver must differ".

**Limitations:** Payments are always in the group currency from this dialog. A payment can be deleted from the expense list but not edited.

**How it works:** `POST /api/split/settlements` (amount 2 dp, method CASH/UPI/OTHER, date). `DELETE /api/split/settlements/:id` soft-deletes.

**Related features:** [F-SPLIT-011](F-SPLIT-011.md), [F-SPLIT-013](F-SPLIT-013.md).

**Sources:** `apps/web/src/pages/split/SettleUpDialog.tsx:62`, `apps/web/src/pages/split/SettleUpDialog.tsx:96`, `apps/web/src/pages/split/SettleUpDialog.tsx:109`, `packages/api/src/controllers/split.controller.ts:58`, `packages/api/src/services/split/settlements.service.ts:34`
