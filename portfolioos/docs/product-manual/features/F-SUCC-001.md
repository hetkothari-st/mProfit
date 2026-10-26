---
id: F-SUCC-001
title: "Succession status and controls"
module: "Succession"
status: Live
roles: "R-PLUS+ (configure); any plan (pause/resume/off/revoke)"
settings: [S-SUCC-006]
related: [F-SUCC-002, F-SUCC-004, F-SUCC-005, F-SUCC-006]
---

[← Succession](../modules/succession.md) · [Index](../INDEX.md)

# Succession status and controls

`F-SUCC-001` · Live · Roles: [R-PLUS](../roles.md#r-plus)+ (configure); any plan (pause/resume/off/revoke)

**What it does:** Shows the plan's **Status** badge and a one-line next event, and offers the controls that fit the status: **Turn on**, **Pause** (with a date), **Resume**, **Revoke all access**, **Turn off**.

**Why it exists:** Page description: "Make sure your loved ones are never left in the dark about your finances."

**Where to find it:** **Planning → Succession** (route `/legacy`).

**Who can use it:** Configuring and turning on needs [R-PLUS](../roles.md#r-plus) or higher ([R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)). [R-FREE](../roles.md#r-free) can open the page and see the card "Succession is part of the PLUS plan." — if a plan already runs they can still pause, resume, turn off, revoke and remove nominees. Not available while managing someone's account ([R-MANAGER](../roles.md#r-manager)).

**Steps**
1. Open **Planning → Succession**.
2. With at least one nominee, click **Turn on**. Confirm it's you ([F-SUCC-005](F-SUCC-005.md)). Toast "Succession is on"; status becomes **On**.
3. To pause while counting, pick a **Pause until** date and click **Pause** (toast "Paused"); click **Resume** to restart (toast "Resumed").
4. After release, click **Revoke all access** (toast "Access withdrawn"); the plan re-arms.
5. Click **Turn off** at any time after turning on (toast "Succession is off").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Turn on** | Button | Arms the plan | Shown only when Off; disabled below PLUS or with no nominees ("Add a nominee to turn it on.") |
| **Pause until** | Date | Date the pause ends | Shown only while counting (On, reminders, nominees notified) |
| **Pause** | Button | Pauses the plan | Disabled with no date |
| **Resume** | Button | Re-arms a paused plan | Shown only when Paused |
| **Revoke all access** | Button | Withdraws every nominee's access and re-arms | Shown only when Shared with nominees |
| **Turn off** | Button | Back to Off; every link and session stops | Hidden when Off |
| **See plans** | Link | Opens `/pricing` | Shown only below PLUS |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Pause until** | Date | Yes for Pause | After today, at most 180 days ahead | Empty | "Pause for up to 180 days." |

**Settings and toggles here:** [S-SUCC-006](../settings/succession.md#s-succ-006) **Pause until**.

**Results:** Status labels: Off, On, Reminder sent, Second reminder sent, Final reminder sent, Nominees notified, Shared with nominees, Paused. Turning on emails each unconfirmed nominee a "Confirm" invitation. Every change emails you "Your Succession plan was changed" and is audit-logged.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Add at least one nominee first." | Turning on with none | Add a nominee |
| "Pick a future release date first." | Date trigger without a future date | Set a date |
| "The plan is already on." | Already armed | — |
| "Only an active plan can be paused." / "The plan is not paused." / "Nothing has been shared yet." | Wrong status | Refresh |
| "Confirm it is you first." | No valid step-up confirmation | Enter the code ([F-SUCC-005](F-SUCC-005.md)) |
| "Switch back to your own account to do this." | You are managing someone's account | **Back to my account** |

**Limitations:** Pausing during "Nominees notified" sends each nominee an "Update about <you>" email. A scheduled release date that passed during a pause is dropped (the plan falls back to inactivity). You can remove the last nominee of a running plan; it then has nobody to notify.

**How it works:** `GET /api/legacy` (no plan gate) creates the plan on first visit (status DRAFT) and returns status, settings, letter, nominees and the next-event sentence. `POST /api/legacy/activate|pause|resume|deactivate|revoke` all require a step-up grant header; activate also needs LEGACY_TRANSFER. Turning off wipes all nominee links, codes and sessions; revoking all access does the same and re-arms with a fresh clock. Plan status alone drives the countdown — a plan armed on PLUS keeps running after the subscription lapses.

**Related features:** [F-SUCC-002](F-SUCC-002.md), [F-SUCC-004](F-SUCC-004.md), [F-SUCC-005](F-SUCC-005.md), [F-SUCC-006](F-SUCC-006.md).

**Sources:** `apps/web/src/pages/legacy/LegacyPage.tsx:24`, `apps/web/src/pages/legacy/LegacyPage.tsx:91`, `apps/web/src/pages/legacy/LegacyPage.tsx:103`, `apps/web/src/pages/legacy/LegacyPage.tsx:203`, `packages/api/src/routes/legacy.routes.ts:19`, `packages/api/src/services/legacy/plan.service.ts:67`, `packages/api/src/services/legacy/plan.service.ts:217`, `packages/api/src/services/legacy/plan.service.ts:231`, `packages/api/src/services/legacy/plan.service.ts:264`, `packages/api/src/services/legacy/plan.service.ts:278`, `packages/api/src/services/legacy/runner.service.ts:12`
