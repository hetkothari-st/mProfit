---
id: F-PLAN-002
title: "Upgrade with Razorpay checkout"
module: "Plans & billing"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-PLAN-001]
related: [F-PLAN-001, F-PLAN-004]
---

[← Plans & billing](../modules/plans-billing.md) · [Index](../INDEX.md)

# Upgrade with Razorpay checkout

`F-PLAN-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Buys a plan for 30 days (monthly) or 365 days (annual) through Razorpay's checkout window; on success your plan changes immediately.

**Why it exists:** The code comment: upgrades happen "only through the billing flow, never by self-declaring a paid tier at signup".

**Where to find it:** **Pricing → Upgrade to <plan>**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (your own account; refused while managing someone else's).

**Steps**
1. Click **Upgrade to Plus** (or Family, Pro/Advisor). The button reads "Starting checkout…".
2. Razorpay's window opens with your name and email filled in. Pay.
3. On success: toast "Upgraded to <plan>" and features unlock at once.
4. Closing the window cancels quietly.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Upgrade to <plan>** | Button | Starts checkout | Disabled on your current plan ("Current plan"), on Free ("Included"), when that cycle has no price, and while starting |

**Fields and rules:** Not applicable — payment details are entered in Razorpay's window.

**Settings and toggles here:** [S-PLAN-001](../settings/plans-billing.md#s-plan-001) decides the cycle and duration.

**Results:** Your plan is set to the bought tier with an end date of payment time + 30 or 365 days; a fresh session is issued so the new plan applies to every request.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Payments are coming soon. No checkout session was created." | Razorpay not configured on this server | — |
| "Payment failed" or Razorpay's failure text | Payment declined | Try another method |
| "Payment signature verification failed" | Tampered or invalid payment reply | Contact support |
| "This order does not belong to you" | Replaying someone else's order | — |
| "Failed to load Razorpay checkout script" | Script blocked | Allow checkout.razorpay.com |

**Limitations:** Confirmed: the buttons let a paid user buy a lower plan (for example a Pro/Advisor user can click **Upgrade to Plus**), which replaces the higher plan. You cannot renew your current plan early (its button is disabled), there is no automatic renewal, no reminder before expiry, and the end date is not shown in the app. A plan bought while another is active starts its 30/365 days from the payment, not from the old end date.

**How it works:** POST `/api/billing/checkout-intent` creates a Razorpay order for the price, with your user id, tier and cycle stored in the order's notes. After payment, POST `/api/billing/verify-payment` checks the HMAC signature, re-reads the order from Razorpay to trust only its notes, records the payment once (a replay returns your session without extending the plan) and sets plan and end date in one transaction.

**Related features:** [F-PLAN-001](F-PLAN-001.md), [F-PLAN-004](F-PLAN-004.md), [W-PLAN-001](../workflows/W-PLAN-001.md).

**Sources:** `apps/web/src/pages/pricing/PricingPage.tsx:118`, `apps/web/src/pages/pricing/PricingPage.tsx:217`, `apps/web/src/lib/razorpay.ts:54`, `packages/api/src/routes/billing.routes.ts:33`, `packages/api/src/routes/billing.routes.ts:83`, `packages/api/src/services/billing/planActivation.service.ts:4`, `packages/api/src/services/billing/planActivation.service.ts:27`, `packages/api/src/services/billing/razorpay.service.ts:72`
