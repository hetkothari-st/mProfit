---
id: F-ONB-003
title: ""What do you have?" picker"
module: "First-run setup"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-ONB-004, F-ONB-005]
---

[← First-run setup](../modules/first-run-setup.md) · [Index](../INDEX.md)

# "What do you have?" picker

`F-ONB-003` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Lets you tick the kinds of things you own so the wizard asks only about those.

**Why it exists:** The page text: "Pick everything that applies. You'll add each one with just a few details — rough numbers are fine."

**Where to find it:** `/onboarding`, after the welcome panels.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Read "What do you have?".
2. Tick any of: **Savings & investments** — Mutual funds, Stocks, Fixed deposits, PPF / EPF / NPS; **Physical assets** — Gold, Vehicles; **Loans & cards** — Loans, Credit cards; **Protection** — Insurance.
3. Click **Continue**, or **Skip — I'll add things later** to finish without adding anything.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Nine item buttons | Toggle buttons | Select/deselect (a tick shows when selected) | — |
| **Continue** | Button | Starts the quick-add steps, in the order shown on screen | Disabled until at least one item is ticked |
| **Skip — I'll add things later** | Link | Finishes setup ([F-ONB-005](F-ONB-005.md)) | — |

**Fields and rules:** Not applicable — selections only.

**Settings and toggles here:** None.

**Results:** Your selection decides the quick-add steps; it is not saved.

**Errors and troubleshooting:** None.

**Limitations:** Property is deliberately not offered. The code note says the dashboard's net worth reads rental properties only, so a Real Estate entry made here would not show up there. Bank accounts, crypto, bonds and other classes are also not offered.

**How it works:** Steps follow the on-screen order, not the order you tapped.

**Related features:** [F-ONB-004](F-ONB-004.md), [F-ONB-005](F-ONB-005.md).

**Sources:** `apps/web/src/pages/onboarding/OnboardingWizard.tsx:114`, `apps/web/src/pages/onboarding/OnboardingWizard.tsx:157`, `apps/web/src/pages/onboarding/onboardingItems.ts:19`, `apps/web/src/pages/onboarding/onboardingItems.ts:41`
