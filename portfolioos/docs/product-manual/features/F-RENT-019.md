---
id: F-RENT-019
title: "Daily reminder scan"
module: "Rental"
status: Live
roles: "System"
settings: []
related: [F-RENT-016]
---

[← Rental](../modules/rental.md) · [Index](../INDEX.md)

# Daily reminder scan

`F-RENT-019` · Live · Roles: System

**What it does:** Daily at 09:00 IST the server queues rent reminders for all users exactly as **Run scan** does ([F-RENT-016](F-RENT-016.md)).

**Why it exists:** Code comment: reminders are ready when landlords open the app in the morning.

**Where to find it:** Automatic; results in the pending reminders panel.

**Who can use it:** All users with tenancies.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** New or revived Pending reminders.

**Errors and troubleshooting:** None shown.

**Limitations:** Same as [F-RENT-016](F-RENT-016.md); nothing is sent automatically.

**How it works:** node-cron "0 9 * * *" Asia/Kolkata runs `enqueuePendingReminders` in the system context; an overlapping run is skipped.

**Related features:** [F-RENT-016](F-RENT-016.md).

**Sources:** `packages/api/src/jobs/rentalJobs.ts:43`, `packages/api/src/jobs/rentalJobs.ts:77`, `packages/api/src/services/rental/rental.reminders.service.ts:324`
