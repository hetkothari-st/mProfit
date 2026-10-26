---
id: F-PLAN-003
title: "Admin plan switch (no payment)"
module: "Plans & billing"
status: Live
roles: "R-ADMIN"
settings: []
related: [F-PLAN-001, F-SET-003]
---

[← Plans & billing](../modules/plans-billing.md) · [Index](../INDEX.md)

# Admin plan switch (no payment)

`F-PLAN-003` · Live · Roles: [R-ADMIN](../roles.md#r-admin)

**What it does:** Lets an administrator set their own plan to any tier without paying, to test what each plan unlocks.

**Why it exists:** The code comment: an "ADMIN-only QA escape hatch … without spending real money on every check". Admins get no automatic bypass of plan gates.

**Where to find it:** **Pricing**, under each plan button: **Set (no payment — dev)** (administrators only).

**Who can use it:** [R-ADMIN](../roles.md#r-admin) with two-factor sign-in used for this session.

**Steps**
1. Click **Set (no payment — dev)** under a plan.
2. Toast "Plan set to <PLAN> (no payment — ADMIN dev switch)".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Set (no payment — dev)** | Button | Sets your plan | Hidden for non-admins; disabled while switching |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** Your plan changes with no end date (it never lapses) and a fresh session is issued.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Turn on two-factor sign-in (Settings) to use admin tools." | No two-factor | [F-SET-003](F-SET-003.md) |
| "Sign out and sign in again with your authenticator code to use admin tools." | Session not two-factor | Sign in again |
| "Could not switch plan" | Other failure | Retry |

**Limitations:** None.

**How it works:** POST `/api/billing/dev-set-plan` requires the ADMIN role and a two-factor session, sets the plan and clears the end date.

**Related features:** [F-PLAN-001](F-PLAN-001.md), [F-SET-003](F-SET-003.md).

**Sources:** `apps/web/src/pages/pricing/PricingPage.tsx:100`, `apps/web/src/pages/pricing/PricingPage.tsx:228`, `packages/api/src/routes/billing.routes.ts:133`, `packages/api/src/routes/billing.routes.ts:143`
