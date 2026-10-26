---
id: F-ADV-008
title: "Why this — inputs and fund evidence"
module: "Investment Advisor"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-ADV-007, F-ADV-014]
---

[← Investment Advisor](../modules/investment-advisor.md) · [Index](../INDEX.md)

# Why this — inputs and fund evidence

`F-ADV-008` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** **Why this** expands **Inputs this was computed from**: every figure the rule used, with readable labels (rupee values formatted as money, percentages as %, dates in IST). Under it, a line says where the instrument came from ("Instrument taken from your approved product list.", "Chosen by the house ranking methodology, then fitted to this portfolio." or "Instrument ranked from NAV history, not from your approved list."). For a fund chosen by the house methodology it adds "Rank #N of its bucket", scheme code, methodology version and scoring date, the metrics used (Tracking difference, Tracking error, Beat its peers in, Downside captured, Sortino), any adjustments, the runner-up and why it lost, and metrics it could not score ("Not scored on … — we do not hold that data, so its weight went to the metrics we do.").

**Why it exists:** Code comment: "'why this fund?' is the question a named recommendation raises, and an answer that has to be asked for is not really an answer."

**Where to find it:** **Overview → Advisor → What to do next →** a card → **Why this**.

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Click **Why this**. Click again to collapse.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Why this** | Toggle | Show/hide the inputs | — |

**Fields and rules:** None — view only.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** "No input snapshot was recorded for this recommendation." when the engine stored none.

**Limitations:** Nested values are summarised (an object shows its name; a list shows "N items").

**How it works:** Renders `inputsSnapshot`, `provenance` and `selectionEvidence` stored on the recommendation. The snapshot is refreshed on each run while the recommendation is live and unchanged.

**Related features:** [F-ADV-007](F-ADV-007.md), [F-ADV-014](F-ADV-014.md).

**Sources:** `apps/web/src/pages/advisor/widgets/RecommendationCard.tsx:133`, `apps/web/src/pages/advisor/widgets/RecommendationCard.tsx:436`, `packages/api/src/services/advisor/advisorEngine.service.ts:125`
