---
id: F-SUCC-006
title: "Countdown, reminders and release"
module: "Succession"
status: Live
roles: "Armed plans"
settings: [S-SUCC-001, S-SUCC-002, S-SUCC-003, S-SUCC-005]
related: [F-SUCC-001, F-SUCC-007, F-SUCC-008]
---

[← Succession](../modules/succession.md) · [Index](../INDEX.md)

# Countdown, reminders and release

`F-SUCC-006` · Live · Roles: Armed plans

**What it does:** Runs the plan automatically. Inactivity: after the chosen days without activity you get "Are you OK? (first Succession reminder)", then a second and a final reminder a week apart, then nominees are told access opens in 7 days ("Nominees notified"), then access is released. Date: reminders 30, 7 and 1 day before, then release on the date. Signing in or clicking "I'm OK" resets the countdown.

**Why it exists:** UI text: "Then 3 email reminders a week apart, and a 7-day notice to nominees, before anything is shared."

**Where to find it:** Automatic; the status card on `/legacy` shows the current stage and next event (e.g. "First warning on <date> if you stay inactive.").

**Who can use it:** Runs for every armed plan regardless of the owner's current plan.

**Steps**
1. Not applicable — automatic. To stop a countdown, sign in or click **I'm OK** in a reminder email ([F-SUCC-007](F-SUCC-007.md)).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| None on screen | — | — | — |

**Fields and rules:** Not applicable — automatic.

**Settings and toggles here:** [S-SUCC-001](../settings/succession.md#s-succ-001), [S-SUCC-002](../settings/succession.md#s-succ-002), [S-SUCC-003](../settings/succession.md#s-succ-003), [S-SUCC-005](../settings/succession.md#s-succ-005).

**Results:** Emails, in order: owner reminders (with **I'm OK — reset the countdown**), owner "Your nominees will get access in 7 days" and nominee "About <you>'s Succession plan", a verifier "Please confirm: is <you> OK?", then nominee "<you> has shared their financial information with you" with **View information**, and owner "Your Succession plan was released". A reset from the notice stage emails nominees "Update about <you>".

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Reminders keep arriving | You haven't signed in since the stage started | Sign in or click **I'm OK** |

**Limitations:** The daily run is at 10:00 IST, so stages move once a day. App activity counts at most once an hour. Scheduled release has no 7-day notice stage. Unsent emails retry with backoff (10 min doubling, capped at 6 h) and never drop.

**How it works:** `legacyTransferJob`: daily tick 10:00 IST, outbox retry hourly at :20, test-mode tick every minute (disable with `ENABLE_LEGACY_CRON=false`). A pure state machine decides the step from status, trigger, inactivity days, stage start, last activity and IST days; activity after a stage began always wins (reset). Stage length 7 days; reminders at 30/7/1 days for a date trigger. Each step and its emails commit together (outbox, sent once per plan/kind/cycle/recipient). Activity is any authenticated request by the owner (not when managing someone), throttled to once per hour.

**Related features:** [F-SUCC-001](F-SUCC-001.md), [F-SUCC-007](F-SUCC-007.md), [F-SUCC-008](F-SUCC-008.md).

**Sources:** `packages/api/src/jobs/legacyTransferJob.ts:45`, `packages/api/src/services/legacy/stateMachine.ts:66`, `packages/api/src/services/legacy/stateMachine.ts:101`, `packages/api/src/services/legacy/runner.service.ts:58`, `packages/api/src/services/legacy/runner.service.ts:141`, `packages/api/src/services/legacy/outbox.service.ts:25`, `packages/api/src/services/legacy/emails.ts:40`, `packages/api/src/services/legacy/activity.service.ts:13`, `packages/api/src/middleware/authenticate.ts:40`
