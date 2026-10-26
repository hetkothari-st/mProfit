---
id: F-INTEL-002
title: "Score dimensions"
module: "Portfolio Score"
status: Live
roles: "R-FREE and up; R-MANAGER"
settings: []
related: [F-INTEL-001]
---

[← Portfolio Score](../modules/portfolio-score.md) · [Index](../INDEX.md)

# Score dimensions

`F-INTEL-002` · Live · Roles: [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager)

**What it does:** Six cards — **Emergency Fund**, **Investment Rate**, **Debt Burden**, **Diversification**, **Insurance Coverage**, **Goal Progress** — each with "Weight N%", its score (or "Not scored"), a bar, an explanation, **Where you stand** (what was found), **Fix this** or **To score this** (what to do) and **Go to …** links to the pages that hold the data.

**Why it exists:** Tells you which area pulls the score down and where to fix it. Inferred from behavior.

**Where to find it:** **Overview → Portfolio Score**, below the gauge.

**Who can use it:** As [F-INTEL-001](F-INTEL-001.md).

**Steps**
1. Read the lowest-scoring card.
2. Click a **Go to …** link (for example **Go to Bank Accounts**) to add the missing data.
3. Come back and click **Recalculate**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Go to Bank Accounts**, **Go to FDs & RDs** | Links | `/bank-accounts`, `/fds` | Emergency Fund |
| **Go to Transactions**, **Go to Income** | Links | `/transactions`, `/income` | Investment Rate |
| **Go to Loans**, **Go to Credit Cards**, **Go to Income** | Links | `/loans`, `/credit-cards`, `/income` | Debt Burden |
| **Go to Analytics**, **Go to Portfolios** | Links | `/analytics`, `/portfolios` | Diversification |
| **Go to Insurance**, **Go to Income** | Links | `/insurance`, `/income` | Insurance Coverage |
| **Go to Goals** | Link | `/goals` | Goal Progress |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Not scored" with **To score this** | The data for that area is missing (for example "We don't know your income yet, so we can't work out your investment rate.") | Do what the card says (for example "Add your salary under Income, or connect Gmail, so we can see your income.") |

**Limitations:** Income is your active salary entries, else an estimate from confirmed bank-credit events in the last 3 months. Age (for the equity guideline) is used only when known.

**How it works:** Scores (each clamped 0–100): **Emergency Fund** = liquid assets ÷ (6 × monthly expenses) × 100 (not scored without holdings or expenses). **Investment Rate** = monthly investment ÷ monthly income, 100 at 20% (not scored without income). **Debt Burden** = (EMIs + card minimum dues) ÷ income: 100 at ≤ 20%, 0 at ≥ 60%, linear between; 100 when you have no EMIs or card dues; not scored with debt but no income. **Diversification** = average of: largest asset class ≤ 60% (minus 2.5 points per % above), largest single holding ≤ 50% (minus 2 per % above), and — when your age is known — equity % within the age guideline (minus 5 per % gap). **Insurance Coverage** = life-type sum assured (term, whole life, ULIP, endowment) ÷ (10 × annual income); not scored without life policies or income. **Goal Progress** = average progress of active goals (each capped at 100); not scored without goals.

**Related features:** [F-INTEL-001](F-INTEL-001.md), [D-INTEL-002](../dependencies.md#d-intel-002).

**Sources:** `apps/web/src/pages/intelligence/HealthScorePage.tsx:39`, `apps/web/src/pages/intelligence/HealthScorePage.tsx:209`, `apps/web/src/pages/intelligence/HealthScorePage.tsx:214`, `apps/web/src/pages/intelligence/HealthScorePage.tsx:234`, `apps/web/src/pages/intelligence/HealthScorePage.tsx:247`, `packages/api/src/services/analytics/healthScoreMath.ts:26`, `packages/api/src/services/analytics/healthScoreMath.ts:39`, `packages/api/src/services/analytics/healthScoreMath.ts:50`, `packages/api/src/services/analytics/healthScoreMath.ts:77`, `packages/api/src/services/analytics/healthScoreMath.ts:122`, `packages/api/src/services/analytics/healthScoreMath.ts:135`, `packages/api/src/services/analytics/healthScore.service.ts:327`, `packages/api/src/services/analytics/healthScore.service.ts:350`, `packages/api/src/services/analytics/healthScore.service.ts:363`, `packages/api/src/services/analytics/healthScore.service.ts:410`, `packages/api/src/services/analytics/healthScore.service.ts:434`

**What this area doesn't do**
- It doesn't track your score over time — only the latest score is kept.
- It doesn't let you change the weights or targets.
- It doesn't score a family as a whole.
