[Index](../INDEX.md)

# Settings — Plans & billing

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-plan-001"></a>
### Monthly / Annual
| Attribute | Value |
|---|---|
| Control type | Two-button switch in the page header |
| Location | **Pricing** page |
| Purpose | Show and buy the monthly or annual price |
| Default | Monthly (`apps/web/src/pages/pricing/PricingPage.tsx:97`) |
| Values | Monthly: Plus ₹499/month, Family ₹899/month, Pro/Advisor ₹1,999/month. Annual: Plus ₹4,999/year; Family and Pro/Advisor show "—" and "No annual plan yet" and cannot be bought. |
| Depends on | None |
| Persists | No — resets when you leave the page |
| Stored in | Page state only |
| Backend effect | Sent as `billingCycle` to checkout; decides 30 or 365 days of plan |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/pricing/PricingPage.tsx:163`, `packages/shared/src/pricing.ts:18` |
