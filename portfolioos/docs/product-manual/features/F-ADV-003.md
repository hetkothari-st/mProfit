---
id: F-ADV-003
title: "Risk profile summary"
module: "Investment Advisor"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-ADV-001, S-ADV-007]
related: [F-ADV-002]
---

[← Investment Advisor](../modules/investment-advisor.md) · [Index](../INDEX.md)

# Risk profile summary

`F-ADV-003` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** A card showing your current category (Conservative, Balanced, Growth or Aggressive) with its one-line description, a **Score** badge, three tiles — **Category**, **Score**, **Tax slab** (shows "Not sure" when unknown) — any guardrail adjustments under **Adjustments we made** ("from → to — reason"), and "Assessed" with the date and time in IST.

**Why it exists:** Inferred from behavior: it shows which profile the advice is steering by and explains any downgrade the guardrails applied ("Recorded rather than applied silently so a downgraded verdict can be explained to the person it was applied to" — code comment).

**Where to find it:** **Overview → Advisor**, first card under the disclaimer.

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Read the card. To change your answers click **Retake assessment** (opens [F-ADV-002](F-ADV-002.md)).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Retake assessment** | Button | Opens the questionnaire pre-filled | — |

**Fields and rules:** None — view only.

**Settings and toggles here:** Reflects [S-ADV-001](../settings/investment-advisor.md#s-adv-001) to [S-ADV-007](../settings/investment-advisor.md#s-adv-007).

**Results:** None.

**Errors and troubleshooting:** None specific; if a field is missing from the server the card shows what it has rather than failing.

**Limitations:** Category descriptions are fixed text: Conservative "Capital protection first. Modest equity, heavy on debt and cash."; Balanced "Steady growth with a cushion. Roughly even split between equity and debt."; Growth "Long-horizon compounding. Equity-led, with debt for ballast."; Aggressive "Maximum growth, accepting deep drawdowns along the way."

**How it works:** Reads the newest assessment from `GET /api/advisor/risk-profile`. Tax slab is stored as a percentage or null.

**Related features:** [F-ADV-002](F-ADV-002.md).

**Sources:** `apps/web/src/pages/advisor/AdvisorPage.tsx:228`, `apps/web/src/pages/advisor/AdvisorPage.tsx:252`, `apps/web/src/api/advisor.api.ts:510`, `packages/api/src/services/advisor/riskProfile.service.ts:216`
