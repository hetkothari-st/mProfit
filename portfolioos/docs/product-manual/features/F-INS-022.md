---
id: F-INS-022
title: "Premium and claim reminders"
module: "Insurance"
status: Live
roles: "All with policies"
settings: [S-INS-003, S-INS-004]
related: [F-INS-006, F-INS-007, F-INS-012]
---

[← Insurance](../modules/insurance.md) · [Index](../INDEX.md)

# Premium and claim reminders

`F-INS-022` · Live · Roles: All with policies

**What it does:** Creates alerts in **Alerts** for each active policy's next premium: 30, 15, 7 and 1 days before and on the due day ("<insurer> — <plan> premium due in N days", "… premium is due today"), during the grace period ("… premium overdue — N days of grace left", again in the last 5 days), and after it ("… may have lapsed" or, with no grace, "… cover has ended"). For claims, it alerts once when it is time to raise a complaint and once when you can take it to the Insurance Ombudsman.

**Why it exists:** "You'll get reminders before each premium" (empty-state text).

**Where to find it:** Alerts appear in **Alerts** ([D-INS-001](../dependencies.md#d-ins-001)) and the alerts bell; there is no page of its own.

**Who can use it:** All signed-in users with active policies or open claims; [R-MANAGER](../roles.md#r-manager)'s managed person gets their own.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** [S-INS-003](../settings/insurance.md#s-ins-003) and [S-INS-004](../settings/insurance.md#s-ins-004) decide the dates.

**Results:** Alerts are created once per premium and step (keys carry the due date), so next year's premium gets fresh reminders.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Reminder for a premium you paid | The payment isn't recorded, or its period is in a different month | Record it ([F-INS-006](F-INS-006.md), [F-INS-007](F-INS-007.md)) |

**Limitations:** Runs once a day at 20:45 IST; a skipped day is caught up (the nearest of 30/15/7/1 days is used). Policies due more than 120 days ago are no longer reminded. Matured or lapsed policies keep being reminded because the status can't be changed in the app.

**How it works:** The daily alert scan (`ENABLE_ALERT_CRONS`) runs `generateRenewalAlerts` and `generateClaimAlerts` per user under that user's database context. Alert types `INSURANCE_PREMIUM` and `INSURANCE_CLAIM`. An API route `POST /api/insurance/alerts/trigger` also creates today's premium reminders for the caller (no UI button).

**Related features:** [F-INS-006](F-INS-006.md), [F-INS-012](F-INS-012.md), [D-INS-001](../dependencies.md#d-ins-001).

**Sources:** `packages/api/src/services/insurance/insurance.service.ts:71`, `packages/api/src/services/insurance/insurance.service.ts:73`, `packages/api/src/services/insurance/insurance.service.ts:75`, `packages/api/src/services/insurance/insurance.service.ts:1106`, `packages/api/src/services/insurance/insurance.service.ts:1235`, `packages/api/src/services/notifications/alerts.service.ts:360`, `packages/api/src/jobs/alertJobs.ts:48`
