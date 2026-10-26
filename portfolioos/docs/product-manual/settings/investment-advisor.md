[Index](../INDEX.md)

# Settings — Investment Advisor

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-adv-001"></a>
### Age
| Attribute | Value |
|---|---|
| Control type | Number field ("How old are you?") |
| Location | **Overview → Advisor → Tell us how you invest / Retake your risk assessment** |
| Purpose | Applies the age guardrail |
| Default | Blank; on a retake the last answer (`apps/web/src/pages/advisor/RiskQuestionnaire.tsx:159`) |
| Values | Web accepts 18–100; server accepts 1–120 (and null). Age 55 or more caps an Aggressive score at Growth |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `RiskProfileAssessment.answers` (new row per submission) |
| Backend effect | Override `AGE_CAP` recorded in `overrides` |
| Who can change | [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:176`, `packages/api/src/services/analytics/riskProfileMath.ts:85`, `packages/api/src/services/advisor/riskProfile.service.ts:166` |

<a id="s-adv-002"></a>
### Investment horizon
| Attribute | Value |
|---|---|
| Control type | Button group ("When will you need most of this money?") |
| Location | **Overview → Advisor →** questionnaire Q2 |
| Purpose | Weight 20 in the risk score |
| Default | None (must choose) |
| Values | Under 3 years (0), 3 to 7 years (0.4), 7 to 15 years (0.75), More than 15 years (1) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `RiskProfileAssessment.answers.horizon` |
| Backend effect | Changes score → category → model portfolio |
| Who can change | [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:29`, `packages/api/src/services/analytics/riskProfileMath.ts:60` |

<a id="s-adv-003"></a>
### Drawdown reaction
| Attribute | Value |
|---|---|
| Control type | Button group ("Your portfolio drops 20% in three months. What do you actually do?") |
| Location | Questionnaire Q3 |
| Purpose | Weight 25 (largest) in the risk score |
| Default | None |
| Values | Sell everything (0), Sell some of it (0.35), Hold and do nothing (0.8), Buy more (1) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `RiskProfileAssessment.answers.drawdownReaction` |
| Backend effect | Changes score and category |
| Who can change | [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:36`, `packages/api/src/services/analytics/riskProfileMath.ts:61` |

<a id="s-adv-004"></a>
### Investable share of income
| Attribute | Value |
|---|---|
| Control type | Button group ("Roughly what share of your take-home income do you invest each month?") |
| Location | Questionnaire Q4 |
| Purpose | Weight 15 in the risk score |
| Default | None |
| Values | Under 10% (0), 10–20% (0.4), 20–35% (0.75), Over 35% (1) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `RiskProfileAssessment.answers.investableShareOfIncome` |
| Backend effect | Changes score and category |
| Who can change | [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:43`, `packages/api/src/services/analytics/riskProfileMath.ts:62` |

<a id="s-adv-005"></a>
### Objective
| Attribute | Value |
|---|---|
| Control type | Button group ("What is this portfolio mainly for?") |
| Location | Questionnaire Q5 |
| Purpose | Weight 20 in the risk score |
| Default | None |
| Values | Protect what I have (0), Generate regular income (0.35), Grow steadily with some safety (0.7), Grow as fast as possible (1) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `RiskProfileAssessment.answers.objective` |
| Backend effect | Changes score and category |
| Who can change | [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:50`, `packages/api/src/services/analytics/riskProfileMath.ts:63` |

<a id="s-adv-006"></a>
### Emergency fund
| Attribute | Value |
|---|---|
| Control type | Button group ("Do you have an emergency fund you could live on for six months?") |
| Location | Questionnaire Q6 |
| Purpose | Guardrail — not scored |
| Default | None |
| Values | Yes: no change · No, not yet: Aggressive → Growth and Growth → Balanced (recorded as `NO_EMERGENCY_FUND`) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `RiskProfileAssessment.answers.hasEmergencyFund` |
| Backend effect | Lowers category |
| Who can change | [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:64`, `packages/api/src/services/analytics/riskProfileMath.ts:120` |

<a id="s-adv-007"></a>
### Tax slab
| Attribute | Value |
|---|---|
| Control type | Button group ("Which income-tax slab are you in?") |
| Location | Questionnaire Q7 |
| Purpose | Tax rate used in advice text (for example tax-loss harvesting) |
| Default | None |
| Values | 5% → 5 · 20% → 20 · 30% → 30 · Not sure → unknown (shown "Not sure") |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `RiskProfileAssessment.taxSlabPct` |
| Backend effect | Shown on the profile; engine facts |
| Who can change | [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:57`, `packages/api/src/services/analytics/riskProfileMath.ts:65` |

<a id="s-adv-008"></a>
### Recommendation status tab
| Attribute | Value |
|---|---|
| Control type | Tabs |
| Location | **Overview → Advisor → What to do next** |
| Purpose | Filter the feed |
| Default | `Open` (`apps/web/src/pages/advisor/widgets/RecommendationFeed.tsx:33`) |
| Values | Open, Accepted, Snoozed, Done, Dismissed |
| Depends on | — |
| Persists | No |
| Stored in | Page state |
| Backend effect | `status` query parameter |
| Who can change | [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/advisor/widgets/RecommendationFeed.tsx:15` |

<a id="s-adv-009"></a>
### Bucket (override list)
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Overview → Advisor → Override list** |
| Purpose | The bucket an approved product is attached to |
| Default | Equity — Domestic (first bucket) (`apps/web/src/pages/advisor/ApprovedProductsPanel.tsx:34`) |
| Values | Equity — Domestic, Equity — International, Debt, Gold, Real assets, Cash equivalent, Other / alternatives |
| Depends on | A risk profile (model portfolio) |
| Persists | The selection no; the added product yes |
| Stored in | `AdvisorApprovedProduct.bucket` |
| Backend effect | Non-empty bucket → engine names your products for that bucket first |
| Who can change | [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/advisor/ApprovedProductsPanel.tsx:164`, `packages/api/src/services/advisor/productResolution.ts:11` |
