---
id: F-REST-012
title: "Real estate alerts"
module: "Real Estate"
status: Live
roles: "System (per user)"
settings: [S-REST-004]
related: [F-REST-003, F-REST-013]
---

[← Real Estate](../modules/real-estate.md) · [Index](../INDEX.md)

# Real estate alerts

`F-REST-012` · Live · Roles: System (per user)

**What it does:** Creates alerts 30, 15, 7 and 1 day(s) before: the property-tax due date (1st of the chosen **Tax due month**), the expected possession date of an under-construction property, and the next premium of an insurance policy linked to the property.

**Why it exists:** Code comment: three classes of real-estate reminders.

**Where to find it:** Alerts ([D-REST-002](../dependencies.md#d-rest-002)). Examples: "Property tax due in 7 days — <name>" ("₹<amount> property tax due on <date>"), "Possession in 30 days — <name>", "Insurance renewal in 15 days — <name>".

**Who can use it:** Every user with active, unsold properties.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** [S-REST-004](../settings/real-estate.md#s-rest-004) **Tax due month** — without it no property-tax alert is made.

**Results:** Alerts of types property tax due, possession due and insurance premium, de-duplicated per property, date and threshold.

**Errors and troubleshooting:** None.

**Limitations:** Exact-day thresholds only (a missed scan day skips that reminder). The insurance alert needs a linked policy, which cannot be set in the UI ([F-REST-013](F-REST-013.md)). Sold or inactive properties are skipped.

**How it works:** Run by the daily alert job at 20:45 IST per user and by the Alerts page scan. Due date for tax = 1st of the due month this year if that month has not passed, else next year; days = rounded days from today (UTC midnight).

**Related features:** [F-REST-003](F-REST-003.md), [F-REST-013](F-REST-013.md), [D-REST-002](../dependencies.md#d-rest-002).

**Sources:** `packages/api/src/services/realEstate/realEstateAlerts.ts:17`, `packages/api/src/services/realEstate/realEstateAlerts.ts:23`, `packages/api/src/services/realEstate/realEstateAlerts.ts:66`, `packages/api/src/services/realEstate/realEstateAlerts.ts:110`, `packages/api/src/services/realEstate/realEstateAlerts.ts:148`, `packages/api/src/services/notifications/alerts.service.ts:358`
