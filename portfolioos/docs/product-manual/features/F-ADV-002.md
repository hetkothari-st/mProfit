---
id: F-ADV-002
title: "Risk questionnaire (take or retake)"
module: "Investment Advisor"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-ADV-001, S-ADV-002, S-ADV-003, S-ADV-004, S-ADV-005, S-ADV-006, S-ADV-007]
related: [F-ADV-003, F-ADV-004, F-ADV-005, F-ADV-010]
---

[← Investment Advisor](../modules/investment-advisor.md) · [Index](../INDEX.md)

# Risk questionnaire (take or retake)

`F-ADV-002` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Seven questions that set your risk category and therefore the target allocation every recommendation is measured against. The first time, the card is titled **Tell us how you invest** and the button is **Get my recommendations**; a retake (from **Retake assessment**) is titled **Retake your risk assessment**, starts pre-filled with your last answers, and the button is **Save new profile** with a **Cancel** next to it.

**Why it exists:** From the card text: "Your answers set the target allocation every recommendation is measured against — without them, advice would be a guess." A retake is pre-filled because "re-answering seven questions from scratch to change one is the kind of friction that stops people keeping their profile current" (code comment).

**Where to find it:** **Overview → Advisor** — shown automatically when you have no profile; otherwise **Retake assessment** on the risk-profile card.

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) (manager's plan).

**Steps**
1. Type your age in **How old are you?**.
2. Pick one answer for each of questions 2–7 (they are button groups; the chosen one is highlighted).
3. Click **Get my recommendations** (or **Save new profile**). The app shows "Risk profile saved" and the page switches to the profile view.
4. Click **Refresh recommendations** to generate advice against the new profile (saving does not run the engine).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **How old are you?** | Number field | Age ([S-ADV-001](../settings/investment-advisor.md#s-adv-001)) | — |
| Questions 2–7 answer buttons | Radio-style buttons | One answer per question ([S-ADV-002](../settings/investment-advisor.md#s-adv-002) to [S-ADV-007](../settings/investment-advisor.md#s-adv-007)) | — |
| **Get my recommendations** / **Save new profile** | Submit button | Saves a new assessment | Disabled while saving |
| **Cancel** | Button | Leaves a retake without saving | Only on a retake; disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| How old are you? | Whole number | Yes | Web: 18–100. Server accepts 0–120 (schema) and rejects ≤0 or >120 | Blank (retake: last answer) | "Enter an age between 18 and 100." |
| Questions 2–7 | One choice each | Yes | Fixed choices (see [S-ADV-002](../settings/investment-advisor.md#s-adv-002)…007) | None (retake: last answer) | "Answer every question to continue." |

**Settings and toggles here:** [S-ADV-001](../settings/investment-advisor.md#s-adv-001) **Age**, [S-ADV-002](../settings/investment-advisor.md#s-adv-002) **Investment horizon**, [S-ADV-003](../settings/investment-advisor.md#s-adv-003) **Drawdown reaction**, [S-ADV-004](../settings/investment-advisor.md#s-adv-004) **Investable share of income**, [S-ADV-005](../settings/investment-advisor.md#s-adv-005) **Objective**, [S-ADV-006](../settings/investment-advisor.md#s-adv-006) **Emergency fund**, [S-ADV-007](../settings/investment-advisor.md#s-adv-007) **Tax slab** — each changes the score, the guardrails or the tax rate the engine uses (detail in the settings reference).

**Results:** A new assessment is stored (older ones are kept as history). On your first submission four model portfolios — Conservative, Balanced, Growth, Aggressive — are created for you with default target weights; later submissions never reset them. The profile card, allocation, recommendations and override list refresh.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Enter an age between 18 and 100." | Age missing or outside 18–100 | Enter a whole number in range |
| "Answer every question to continue." | A question has no answer | Pick an answer for each |
| Toast "Could not save your risk profile" or the server's message | Server rejected the answers | Retry; check the message |

**Limitations:** Saving does not generate recommendations; press **Refresh recommendations** afterwards. The assessment history is returned by the API but not shown on the page.

**How it works:** `POST /api/advisor/risk-profile` with `{ age, horizon, drawdownReaction, investableShareOfIncome, objective, hasEmergencyFund, taxSlab }`. Scoring (questionnaire version 1): each answer earns points × weight — horizon (weight 20: under 3 years 0, 3–7 years 0.4, 7–15 years 0.75, over 15 years 1), drawdown reaction (weight 25: sell everything 0, sell some 0.35, hold 0.8, buy more 1), investable share (weight 15: under 10% 0, 10–20% 0.4, 20–35% 0.75, over 35% 1), objective (weight 20: protect 0, income 0.35, steady growth 0.7, fast growth 1). Score = round(raw ÷ 80 × 100). Category: below 30 Conservative, 30–54 Balanced, 55–79 Growth, 80+ Aggressive. Two guardrails only lower risk and are recorded as "Adjustments we made": age 55 or more caps Aggressive at Growth; no emergency fund lowers Aggressive → Growth and Growth → Balanced. Tax slab maps to 5, 20 or 30%; "Not sure" is stored as unknown (not 30%). Each submission inserts a new `RiskProfileAssessment`; the newest one is "current".

**Related features:** [F-ADV-003](F-ADV-003.md), [F-ADV-004](F-ADV-004.md), [F-ADV-005](F-ADV-005.md), [F-ADV-010](F-ADV-010.md).

**Sources:** `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:176`, `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:190`, `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:259`, `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:325`, `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:334`, `packages/api/src/controllers/advisor.controller.ts:63`, `packages/api/src/services/advisor/riskProfile.service.ts:91`, `packages/api/src/services/advisor/riskProfile.service.ts:166`, `packages/api/src/services/advisor/riskProfile.service.ts:179`, `packages/api/src/services/analytics/riskProfileMath.ts:57`, `packages/api/src/services/analytics/riskProfileMath.ts:77`, `packages/api/src/services/analytics/riskProfileMath.ts:110`, `packages/api/src/services/analytics/riskProfileMath.ts:120`
