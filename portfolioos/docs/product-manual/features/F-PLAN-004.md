---
id: F-PLAN-004
title: "Plan expiry (back to Free)"
module: "Plans & billing"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-AUTH-006, F-CONN-006, F-PLAN-002]
---

[← Plans & billing](../modules/plans-billing.md) · [Index](../INDEX.md)

# Plan expiry (back to Free)

`F-PLAN-004` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** When a paid plan's end date passes, the account is treated as Free everywhere: lock cards reappear and Free limits apply. Your data is kept.

**Why it exists:** The code comment: "a lapsed subscription stops unlocking features instead of lasting forever".

**Where to find it:** Not applicable — automatic. The plan shown in **Settings → Plan** and the **Current plan** button change to Free.

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (applies to them).

**Steps:** Not applicable — buy again on **Pricing** to restore.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** Paid features lock; with more than one portfolio you cannot add more (existing ones stay).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This feature requires the PLUS plan or higher" (or FAMILY/PRO_ADVISOR) | Plan lapsed | Buy again |

**Limitations:** It takes effect at your next session refresh (within 15 minutes). Confirmed defect: connected chatbots (AI connectors) keep working after a paid plan lapses, because that check reads the stored plan, not the effective one. No email warns you before or after expiry.

**How it works:** Every place that turns the stored plan into access (access token, profile, AI Assistant quota) uses the effective plan: a paid plan whose end date is in the past counts as FREE; no end date means it stands.

**Related features:** [F-PLAN-002](F-PLAN-002.md), [F-AUTH-006](F-AUTH-006.md), [F-CONN-006](F-CONN-006.md).

**Sources:** `packages/api/src/lib/effectivePlan.ts:16`, `packages/api/src/services/auth/auth.service.ts:92`, `packages/api/src/services/auth/auth.service.ts:65`, `packages/api/src/routes/mcp.routes.ts:48`

**What this area doesn't do**
- No invoices, receipts or payment history in the app.
- No cancellation, refund, downgrade-at-period-end or auto-renewal.
- No coupon or promo codes.
- Extra Family seats cannot be bought on this page (seat payments belong to the Family area, B03).
