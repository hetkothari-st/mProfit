---
id: F-WILL-004
title: "Will wizard: navigation and saving"
module: "Will Maker"
status: Live
roles: "R-PLUS+"
settings: []
related: [F-WILL-001, F-WILL-005, F-WILL-011]
---

[← Will Maker](../modules/will-maker.md) · [Index](../INDEX.md)

# Will wizard: navigation and saving

`F-WILL-004` · Live · Roles: [R-PLUS](../roles.md#r-plus)+

**What it does:** The frame around steps 2–8: a stepper (full row on wide screens, "Step N of 8" bar on narrow), **Back** and **Next**, a save status ("Saving...", "All changes saved", "Not saved"), automatic saving, and protection against edits from another tab.

**Why it exists:** Overview text: "Your progress is saved as you go."

**Where to find it:** `/will/:id/<step>` (details, people, estate, allocation, instructions, review, preview).

**Who can use it:** Same as [F-WILL-001](F-WILL-001.md).

**Steps**
1. Edit the step; changes save automatically about 0.8 s after you stop typing.
2. Click **Next** (or a step in the stepper). The page saves first and then moves.
3. If a save fails, click **Retry** next to "Could not save your changes. Check your connection and try again."
4. If another tab changed the will, click **Reload**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Stepper steps | Buttons | Save and go to that step | Wide screens only (≥ 900 px) |
| **Back** | Button | Save and go back (step 2 goes to the overview) | After two failed saves you may leave anyway |
| **Next** | Button | Save and go forward | Disabled while loading, and on **Review** while any blocker remains; hidden on **Preview** |
| **Retry** | Button | Retries the save | Shown after a failed save |
| **Reload** | Button | Reloads the latest version | Shown on a conflict |

**Fields and rules:** Not applicable here (see each step).

**Settings and toggles here:** None.

**Results:** Each section is saved separately with the revision it builds on.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This will was changed in another tab or device. Reload to see the latest version - your last change here was not saved." | Revision conflict | **Reload** |
| "This draft could not be opened." | Draft missing or discarded | **Back to Will Maker** |
| "This request is too large." | Body over 512 KB | Shorten text |

**Limitations:** While a conflict is shown, the step is read-only.

**How it works:** `GET /api/will/drafts/:id`, `PUT /api/will/drafts/:id/sections/:section` with revision; a revision mismatch returns 409 "This will was changed in another tab or device. Reload to continue." Rules (`runWillRules`) run in the browser on every change.

**Related features:** [F-WILL-005](F-WILL-005.md) to [F-WILL-011](F-WILL-011.md).

**Sources:** `apps/web/src/pages/will/WillWizardPage.tsx:24`, `apps/web/src/pages/will/WillWizardPage.tsx:50`, `apps/web/src/pages/will/WillWizardPage.tsx:66`, `apps/web/src/pages/will/WillWizardPage.tsx:101`, `apps/web/src/pages/will/willSteps.ts:3`, `apps/web/src/pages/will/useWillDraft.ts:9`, `apps/web/src/pages/will/useWillDraft.ts:36`, `packages/api/src/routes/will.routes.ts:24`, `packages/api/src/services/will/willStore.ts:60`
