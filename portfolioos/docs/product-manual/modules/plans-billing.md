[Index](../INDEX.md)

# Plans & billing

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The **Pricing** page (route `/pricing`, reached from the header **Upgrade** button, the sidebar upgrade card, lock cards' **View plans**, and **Settings → Plan → Pricing**) shows the four plans and sells them through Razorpay. Plans are a strict ladder — Free < Plus < Family < Pro/Advisor — and each includes everything below it.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-PLAN-001](../features/F-PLAN-001.md) | Compare plans (Pricing page) | Live | Shows the four plans with prices, a feature list and your current plan, with a Monthly/Annual switch. |
| [F-PLAN-002](../features/F-PLAN-002.md) | Upgrade with Razorpay checkout | Live | Buys a plan for 30 days (monthly) or 365 days (annual) through Razorpay's checkout window; on success your plan changes immediately. |
| [F-PLAN-003](../features/F-PLAN-003.md) | Admin plan switch (no payment) | Live | Lets an administrator set their own plan to any tier without paying, to test what each plan unlocks. |
| [F-PLAN-004](../features/F-PLAN-004.md) | Plan expiry (back to Free) | Live | When a paid plan's end date passes, the account is treated as Free everywhere: lock cards reappear and Free limits apply. |

Settings for this module: [settings/plans-billing.md](../settings/plans-billing.md)
