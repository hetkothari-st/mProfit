---
id: F-FAM-006
title: "Family dashboard: household goals"
module: "Family"
status: Live
roles: "Members on FAMILY+ plan"
settings: [S-FAM-005]
related: [F-FAM-004]
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Family dashboard: household goals

`F-FAM-006` · Live · Roles: Members on FAMILY+ plan

**What it does:** Card "What the household is saving for": every goal of every member you may see, with owner, target, current value, shortfall, inflation-adjusted figures and the monthly SIP needed, plus per-member and household totals.

**Why it exists:** Inferred from behavior: lets the household see all members' goals and their combined shortfall in one place.

**Where to find it:** **Overview → Family → Overview** tab, goals card.

**Who can use it:** Same as [F-FAM-004](F-FAM-004.md). A sibling's goals are visible only if your caps include the **Goals** category.

**Steps**
1. Open the **Overview** tab and read the goals card — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Goal rows | Display | One per goal; "Due today" / "No target date" shown where relevant | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-FAM-005](../settings/family.md#s-fam-005) (Goals category in your caps).

**Results:** Read-only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No goals are shared with you. The household may well have goals, but their owners have not granted you the Goals category." | Goals category not in your caps | Ask an owner |
| "No goals yet. Once a member creates one, it shows here with its owner, shortfall, and the monthly SIP it needs." | No goals exist | Create goals on **Goals** ([D-FAM-007](../dependencies.md#d-fam-007)) |

**Limitations:** Asset-class caps are deliberately not applied to goal progress; visibility is all-or-nothing per member via the Goals category.

**How it works:** `GET /api/families/:familyId/dashboard/goals`. Your own goals load uncapped; siblings' goals load per member in their security context and are skipped entirely when your caps deny GOAL. Shortfall = max(0, target − current); the required monthly SIP funds the inflation-adjusted shortfall when one exists (expected return converted from a fraction to a percentage). Goals sort by target date. Household progress % is recomputed from summed current ÷ summed target.

**Related features:** [F-FAM-004](F-FAM-004.md), [D-FAM-007](../dependencies.md#d-fam-007).

**Sources:** `apps/web/src/pages/family/widgets/FamilyGoalsCard.tsx:91`, `packages/api/src/services/family/familyAggregate.service.ts:405`, `packages/api/src/services/family/familyAggregate.service.ts:431`
