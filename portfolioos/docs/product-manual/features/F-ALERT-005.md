---
id: F-ALERT-005
title: "Daily alert scan"
module: "Alerts & Reminders"
status: Live
roles: "All users"
settings: []
related: [F-ALERT-004]
---

[← Alerts & Reminders](../modules/alerts-reminders.md) · [Index](../INDEX.md)

# Daily alert scan

`F-ALERT-005` · Live · Roles: All users

**What it does:** Every day at 20:45 India time, the same checks as **Scan now** run for every account, so new alerts are waiting for you.

**Why it exists:** Code comment: scheduled "after insurance renewal cron at 20:30".

**Where to find it:** Not a page; results appear on **Alerts** and in the bell count.

**Who can use it:** Automatic for every account.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** None.

**Settings and toggles here:** None for users. Operators can switch it off (`ENABLE_ALERT_CRONS=false`).

**Results:** As [F-ALERT-004](F-ALERT-004.md), for everyone.

**Errors and troubleshooting:** None visible — one account's failure is logged and the rest continue.

**Limitations:** Runs once a day; use **Scan now** for an immediate check.

**How it works:** Lists all users with system access, then runs each user's checks within that user's data context (without it, the database's row security would return nothing).

**Related features:** [F-ALERT-004](F-ALERT-004.md).

**Sources:** `packages/api/src/jobs/alertJobs.ts:25`, `packages/api/src/jobs/alertJobs.ts:45`, `packages/api/src/jobs/alertJobs.ts:48`
