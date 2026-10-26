---
id: F-INTEL-001
title: "Financial Health Score overview"
module: "Portfolio Score"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER"
settings: []
related: [F-INTEL-002]
---

[← Portfolio Score](../modules/portfolio-score.md) · [Index](../INDEX.md)

# Financial Health Score overview

`F-INTEL-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager)

**What it does:** Shows a gauge with your overall score and grade, "Updated <date and time>", a **Grade scale** (A Excellent 85–100, B Good 70–84, C Fair 55–69, D Needs work 40–54, F At risk 0–39, your grade highlighted) and a **Recalculate** button. When less than half of the weighted areas can be scored, the grade is "—".

**Why it exists:** "One number summarizing six areas of your financial life — emergency readiness, investing discipline, debt load, diversification, insurance, and goal progress — each weighted by importance." (page description).

**Where to find it:** **Overview → Portfolio Score** (route `/health-score`); the dashboard health card's **View breakdown** link ([D-INTEL-001](../dependencies.md#d-intel-001)).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (ungated); [R-MANAGER](../roles.md#r-manager) (the managed person's score).

**Steps**
1. Open **Portfolio Score**. "Loading…" shows, then the gauge.
2. Click **Recalculate** to compute a fresh score now; the page reloads the result.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Recalculate** | Button | Forces a fresh computation | Disabled while the page query is refreshing |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** A recalculation replaces your stored score snapshot.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load your health score. Try again shortly." | Request failed | Reload |
| Grade "—" | Less than 50% of the weight could be scored | Add income, expenses, holdings, policies or goals as each card suggests |

**Limitations:** The description says "Recalculated automatically every 24 hours", but no scheduled job does it: the stored score is reused for 24 hours and recomputed the next time the page (or dashboard card) is opened after that (see DOCUMENTATION_GAPS.md). A failed **Recalculate** shows no message.

**How it works:** `GET /api/intelligence/health-score[?force=true]`. A stored snapshot younger than 24 hours (and of the current format version) is returned unless forced. Overall = weighted average of the parts that could be scored (weights: emergency fund 20%, investment rate 20%, debt burden 20%, diversification 20%, insurance 10%, goal progress 10%), rounded; unscored parts are left out rather than counted as 50; below 0.5 of total weight scored → grade "—". Grade A ≥ 85, B ≥ 70, C ≥ 55, D ≥ 40, else F.

**Related features:** [F-INTEL-002](F-INTEL-002.md), [D-INTEL-001](../dependencies.md#d-intel-001).

**Sources:** `apps/web/src/pages/intelligence/HealthScorePage.tsx:95`, `apps/web/src/pages/intelligence/HealthScorePage.tsx:118`, `apps/web/src/pages/intelligence/HealthScorePage.tsx:128`, `apps/web/src/pages/intelligence/HealthScorePage.tsx:144`, `packages/api/src/controllers/intelligence.controller.ts:11`, `packages/api/src/services/analytics/healthScore.service.ts:15`, `packages/api/src/services/analytics/healthScore.service.ts:254`, `packages/api/src/services/analytics/healthScoreMath.ts:151`, `packages/api/src/services/analytics/healthScoreMath.ts:157`, `packages/api/src/services/analytics/healthScoreMath.ts:184`, `apps/web/src/App.tsx:250`
