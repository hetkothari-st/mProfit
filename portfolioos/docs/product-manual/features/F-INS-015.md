---
id: F-INS-015
title: "Surrender value"
module: "Insurance"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-INS-007]
---

[← Insurance](../modules/insurance.md) · [Index](../INDEX.md)

# Surrender value

`F-INS-015` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** For whole life, endowment and ULIP policies, records the insurer's surrender quote (**Quoted value (₹)**, **Quoted on**) and compares it with the premiums recorded: **You'd lose**, **You'd get back more by** or **Difference**, with the percentage. Also shows ULIP lock-in or first-year timing and IRDAI's surrender rules.

**Why it exists:** To weigh surrendering a savings policy against what has been paid. Stated in the code comment.

**Where to find it:** Policy page (route `/insurance/:id`), **Surrender value** card (hidden for other types).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Click **Add quote** (or **Update quote**).
2. Enter **Quoted value (₹)** and **Quoted on**; click **Save**. The toast "Surrender value saved" appears.
3. **Remove** clears the quote.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add quote** / **Update quote** | Button | Opens the form | Hidden while editing |
| **Save** / **Cancel** / **Remove** | Buttons | Save, close, clear | Remove shown only with a quote |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Quoted value (₹)** | Text | Yes | Digits, up to 2 decimals; commas stripped | Current | "Enter the amount the insurer quoted, like 185000" |
| **Quoted on** | Date | Yes | Not in the future | Today | "The quote can't be dated in the future" |

**Settings and toggles here:** None.

**Results:** The quote is stored on the policy.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not save the surrender value" | Server error or rule | Read the message |

**Limitations:** "Premiums recorded" counts only payments in EveryPaisa; untracked earlier premiums are noted but not added.

**How it works:** `PATCH /api/insurance/policies/:id` with `surrenderValue` and `surrenderValueAsOf`; the server refuses a value on other policy types ("Only whole life, endowment and ULIP policies have a surrender value").

**Related features:** [F-INS-007](F-INS-007.md).

**Sources:** `apps/web/src/components/insurance/SurrenderValueCard.tsx:34`, `apps/web/src/components/insurance/SurrenderValueCard.tsx:71`, `packages/api/src/services/insurance/insurance.service.ts:325`
