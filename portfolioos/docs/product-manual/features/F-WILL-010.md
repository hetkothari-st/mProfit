---
id: F-WILL-010
title: "Step 7: Review"
module: "Will Maker"
status: Live
roles: "R-PLUS+"
settings: []
related: [F-WILL-001, F-WILL-005, F-WILL-009, F-WILL-011]
---

[← Will Maker](../modules/will-maker.md) · [Index](../INDEX.md)

# Step 7: Review

`F-WILL-010` · Live · Roles: [R-PLUS](../roles.md#r-plus)+

**What it does:** A checklist of every rule with a tick, warning or cross and the message for each problem, a **Fix** button that jumps to the right step (and tab), "Your will at a glance" totals, and a "Legal review recommended" note. **Next** stays disabled while any blocker remains.

**Why it exists:** Heading text: "N things to fix before you can preview" / "Ready to preview".

**Where to find it:** Wizard step **Review** (`/will/:id/review`).

**Who can use it:** Same as [F-WILL-001](F-WILL-001.md).

**Steps**
1. Read each check. Click **Fix** next to a problem to jump there.
2. When the heading says "Ready to preview", click **Next**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Fix** | Button | Goes to the step/tab that fixes the check | Only on failing checks |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing saved here.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Something needs another look" | A finding from a rule not in the list | **Fix** |

**Limitations:** Passing every check does not mean the will is legally valid (disclaimer).

**How it works:** Lists `WILL_RULES` except the legal-review info rule; "At a glance" shows Assets, Liabilities, Net estate, People named, Specific gifts and Money gifts.

**Related features:** [F-WILL-005](F-WILL-005.md) to [F-WILL-009](F-WILL-009.md), [F-WILL-011](F-WILL-011.md).

**Sources:** `apps/web/src/pages/will/steps/ReviewStep.tsx:9`, `apps/web/src/pages/will/steps/ReviewStep.tsx:15`, `apps/web/src/pages/will/WillWizardPage.tsx:107`, `packages/shared/src/will/validation/rules.ts:303`
