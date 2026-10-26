[Index](../INDEX.md)

# Upgrade your plan

`W-PLAN-001` · Plans & billing

**Goal:** Unlock paid features.
**Who:** [R-FREE](../roles.md#r-free) (or any plan).
**Before you start:** A Razorpay payment method.

| # | You do | The app does |
|---|---|---|
| 1 | **Upgrade** (header) or **Settings → Plan → Pricing** | Shows plans |
| 2 | Pick **Monthly** or **Annual**, click **Upgrade to <plan>** | Opens Razorpay checkout |
| 3 | Pay | Verifies, sets the plan for 30/365 days, toast "Upgraded to <plan>" |

**Success:** Locks disappear immediately.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Payments are coming soon. No checkout session was created." | Payments not configured | — |
| Closed the window | Cancelled | Click again |
| Paid but still locked | Session not updated (e.g. tab closed before verify finished) | Reload; if still locked contact support with the Razorpay payment id |
