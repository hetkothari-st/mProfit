---
id: F-GOAL-001
title: "Goals list and progress"
module: "Goals"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO, R-MANAGER (manager's plan); R-FREE locked"
settings: [S-GOAL-001, S-GOAL-006]
related: [F-GOAL-002, F-GOAL-003]
---

[← Goals](../modules/goals.md) · [Index](../INDEX.md)

# Goals list and progress

`F-GOAL-001` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) (manager's plan); [R-FREE](../roles.md#r-free) locked

**What it does:** Lists your goals as cards in three sections — **Active**, **Achieved** and **Paused / abandoned** — each with category and priority badges, a progress bar and percentage, **Current**, **Target**, **Remaining**, **Target date**, years left ("N.Ny left"), the yearly return needed ("Need N.N% CAGR"), an **Off-track** flag when the needed return exceeds your expected return, and the linked portfolios.

**Why it exists:** Page description: "Track progress against retirement, child education, FIRE corpus, and custom targets."

**Where to find it:** **Planning → Goals** (route `/goals`).

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (server-enforced: GOAL_PROJECTIONS needs Plus). [R-FREE](../roles.md#r-free) sees the page blurred behind "Goal Planning is locked — Upgrade to Plus to unlock Goal Planning." with **View plans**. [R-MANAGER](../roles.md#r-manager): the manager's plan decides; goals shown are the managed person's.

**Steps**
1. Open **Planning → Goals**. With no goals: "No goals yet" and **Create first goal**.
2. Read each card. Click **Edit** to change a goal ([F-GOAL-002](F-GOAL-002.md)) or the bin to delete it ([F-GOAL-003](F-GOAL-003.md)).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **New goal** / **Create first goal** | Button | Opens **Create goal** | — |
| **Edit** | Button | Opens **Edit goal** | — |
| Bin (title "Delete") | Button | Deletes after confirmation | — |
| **View plans** | Link | Opens Pricing | Shown only when locked |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-GOAL-001](../settings/goals.md#s-goal-001) to [S-GOAL-006](../settings/goals.md#s-goal-006) are set in the goal form.

**Results:** Nothing changes by viewing.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Locked card | Your plan is Free | Upgrade on Pricing |
| "Need …% CAGR" missing | Current value is 0, or the target date has passed | Link a portfolio or add an initial amount |

**Limitations:** **Inflation rate** has no visible effect: the needed return is computed against the target as entered, not the inflation-adjusted target, which is computed but not shown (see DOCUMENTATION_GAPS.md). When current value already exceeds the target, the needed return shows as a negative percentage. Progress is capped at 100%.

**How it works:** `GET /api/goals` (Plus-gated) returns each goal with computed fields. Current value = initial amount + the value of holdings in linked portfolios you own (current value, or cost when no price); an **Emergency fund** goal counts only cash, fixed and recurring deposits and post-office savings, RD and TD. Remaining = max(0, target − current). Years left = days to target date ÷ 365.25. Needed return = (target ÷ current)^(1 ÷ years) − 1, only when current > 0 and the date is in the future. **Off-track** when needed return > expected return. Sorted by status, then nearest target date.

**Related features:** [F-GOAL-002](F-GOAL-002.md), [F-GOAL-003](F-GOAL-003.md), [D-GOAL-001](../dependencies.md#d-goal-001), [D-GOAL-002](../dependencies.md#d-goal-002).

**Sources:** `apps/web/src/pages/goals/GoalsPage.tsx:43`, `apps/web/src/pages/goals/GoalsPage.tsx:87`, `apps/web/src/pages/goals/GoalsPage.tsx:221`, `apps/web/src/pages/goals/GoalsPage.tsx:294`, `apps/web/src/components/common/LockedFeature.tsx:59`, `packages/api/src/routes/goals.routes.ts:9`, `packages/api/src/services/goals/goals.service.ts:173`, `packages/api/src/services/goals/goals.service.ts:215`, `packages/api/src/services/goals/goalMath.ts:38`, `packages/api/src/services/goals/goalMath.ts:53`
