---
id: F-WILL-009
title: "Step 6: Instructions"
module: "Will Maker"
status: Live
roles: "R-PLUS+"
settings: []
related: [F-WILL-001, F-WILL-004]
---

[← Will Maker](../modules/will-maker.md) · [Index](../INDEX.md)

# Step 6: Instructions

`F-WILL-009` · Live · Roles: [R-PLUS](../roles.md#r-plus)+

**What it does:** One optional text box, **Additional instructions (optional)**, for wishes such as funeral arrangements or organ donation, "printed word for word in your will".

**Why it exists:** Field hint: "Wishes such as funeral arrangements or organ donation."

**Where to find it:** Wizard step **Instructions** (`/will/:id/instructions`).

**Who can use it:** Same as [F-WILL-001](F-WILL-001.md).

**Steps**
1. Type your instructions; a counter shows "N / 1000".
2. Click **Next**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Additional instructions (optional)** | Text area | Free-text wishes | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Additional instructions | Text | No | ≤ 1,000 characters | Empty | — |

**Settings and toggles here:** None.

**Results:** Saved as the `instructions` section and printed verbatim.

**Errors and troubleshooting:** None specific to this step (see [F-WILL-004](F-WILL-004.md) for save errors).

**Limitations:** Text is printed exactly as typed; it is not checked.

**How it works:** Saved via `PUT /api/will/drafts/:id/sections/instructions`.

**Related features:** [F-WILL-004](F-WILL-004.md).

**Sources:** `apps/web/src/pages/will/steps/InstructionsStep.tsx:6`
