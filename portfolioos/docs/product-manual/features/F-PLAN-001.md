---
id: F-PLAN-001
title: "Compare plans (Pricing page)"
module: "Plans & billing"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-PLAN-001]
related: [F-PLAN-002, F-PLAN-003, F-PLAN-004]
---

[← Plans & billing](../modules/plans-billing.md) · [Index](../INDEX.md)

# Compare plans (Pricing page)

`F-PLAN-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Shows the four plans with prices, a feature list and your current plan, with a Monthly/Annual switch.

**Why it exists:** The page text: "Free forever for a single portfolio and the essentials. Upgrade as your needs grow — every tier includes everything in the tier below it."

**Where to find it:** **Pricing** (route `/pricing`), eyebrow "Pricing", title "Plans for every stage of your portfolio".

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Choose **Monthly** or **Annual**.
2. Compare the cards. Your plan's button reads **Current plan**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Monthly** / **Annual** | Switch | [S-PLAN-001](../settings/plans-billing.md#s-plan-001) | — |
| Plan buttons | Buttons | [F-PLAN-002](F-PLAN-002.md) | See [F-PLAN-002](F-PLAN-002.md) |

**Fields and rules:** Not applicable.

**Settings and toggles here:** [S-PLAN-001](../settings/plans-billing.md#s-plan-001) **Monthly / Annual** — Monthly: Plus ₹499, Family ₹899, Pro/Advisor ₹1,999 a month; Annual: Plus ₹4,999 a year, other paid plans "No annual plan yet".

**Results:** None.

**Errors and troubleshooting:** None.

**Limitations:** The prices and the Family note ("3 members included, +₹199/month per extra member (placeholder)") are marked as placeholders in code. Some listed features have no matching restriction in the app (see Plan card contents below and DOCUMENTATION_GAPS).

Plan card contents (exact):
| Plan | Tagline | Listed features |
|---|---|---|
| Free (₹0) | Get your net worth in one place. | Net worth + dashboard; Manual entry across all asset classes; 1 portfolio; Basic reports (holdings summary, XIRR, cash flow) |
| Plus ("Most popular") | Automate ingestion, unlock the full report catalog. | Everything in Free; Full 30+ tax/CA report catalog; AA/Finvu auto-import — bank, MF, stocks; Multiple portfolios; AI insights (rule-based + LLM); AI Assistant — ask it your XIRR, tax exposure, or "am I overweight in IT?" in plain English; Goal projections |
| Family | One consolidated view for the whole household. | Everything in Plus; Family portfolio sharing (3 seats included); Consolidated family net worth; Consolidated family reports |
| Pro/Advisor | For CAs and advisors running client books. | Everything in Family; Full accounting module — Trial Balance, P&L, Balance Sheet; Unlimited portfolios / clients; F&O-heavy reports (Schedule 43); Priority AA refresh frequency; PDF/ITR exports |

What the server actually gates is listed in the Roles and profiles chapter ([R-FREE](../roles.md#r-free) to [R-PRO](../roles.md#r-pro)). "Priority AA refresh frequency" and "Unlimited … clients" are not enforced anywhere; "PDF/ITR exports" has no Pro-only restriction.

**How it works:** Prices come from one shared table that is also what Razorpay charges. The current plan shown is your effective plan ([F-PLAN-004](F-PLAN-004.md)).

**Related features:** [F-PLAN-002](F-PLAN-002.md), [F-PLAN-003](F-PLAN-003.md), [F-PLAN-004](F-PLAN-004.md), [D-AUTH-004](../dependencies.md#d-auth-004).

**Sources:** `apps/web/src/pages/pricing/PricingPage.tsx:27`, `apps/web/src/pages/pricing/PricingPage.tsx:72`, `apps/web/src/pages/pricing/PricingPage.tsx:86`, `apps/web/src/pages/pricing/PricingPage.tsx:159`, `packages/shared/src/pricing.ts:18`, `packages/shared/src/entitlements.ts:68`, `packages/shared/src/entitlements.ts:70`
