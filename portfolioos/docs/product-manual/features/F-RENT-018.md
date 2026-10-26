---
id: F-RENT-018
title: "Overdue rent status and alerts"
module: "Rental"
status: Live
roles: "System"
settings: []
related: [F-RENT-007, F-RENT-016]
---

[← Rental](../modules/rental.md) · [Index](../INDEX.md)

# Overdue rent status and alerts

`F-RENT-018` · Live · Roles: System

**What it does:** Daily at 01:00 IST the server re-derives rent statuses so months 7+ days past due become Overdue. The daily alert scan then creates "Rent overdue — <property>" alerts ("<YYYY-MM> rent of ₹… is overdue") and removes alerts for months that were since settled.

**Why it exists:** Code comment §8.1: surface delinquent receipts without user action.

**Where to find it:** Automatic; shown as Overdue on rental pages and in Alerts ([D-REST-002](../dependencies.md#d-rest-002)).

**Who can use it:** All users with tenancies.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** Status changes and one alert per overdue month (de-duplicated). Recording payment, skipping or auto-matching deletes that month's alert.

**Errors and troubleshooting:** None.

**Limitations:** Partly paid months are never marked Overdue. Operator switch `ENABLE_RENTAL_CRONS=false` stops the status job (statuses still re-derive whenever the tenancy changes or **Run scan** is used).

**How it works:** node-cron "0 1 * * *" Asia/Kolkata runs `markOverdueReceipts` in the system context: for each tenancy with an Expected month due on or before today − 7 days, recompute the ledger. The alert scan (20:45 IST per user) picks Overdue months due on or before today − 7 days.

**Related features:** [F-RENT-007](F-RENT-007.md), [F-RENT-016](F-RENT-016.md), [D-REST-002](../dependencies.md#d-rest-002).

**Sources:** `packages/api/src/jobs/rentalJobs.ts:21`, `packages/api/src/jobs/rentalJobs.ts:70`, `packages/api/src/services/rental/rental.service.ts:985`, `packages/api/src/services/notifications/alerts.service.ts:181`, `packages/api/src/services/notifications/alerts.service.ts:207`
