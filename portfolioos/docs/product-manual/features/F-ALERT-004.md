---
id: F-ALERT-004
title: "Scan now"
module: "Alerts & Reminders"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-ALERT-005]
---

[← Alerts & Reminders](../modules/alerts-reminders.md) · [Index](../INDEX.md)

# Scan now

`F-ALERT-004` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** **Scan now** runs all of EveryPaisa's alert checks for your account immediately instead of waiting for the nightly run, then reloads the list with "Scan complete — N new alerts".

**Why it exists:** Inferred from behavior: see new alerts right after adding a policy, vehicle, loan or deposit.

**Where to find it:** **Alerts → Scan now**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Click **Scan now**. Its icon spins.
2. "Scan complete — N new alerts" appears and the list reloads.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Scan now** | Button | Runs the checks | Disabled while running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** New alerts are added for: vehicle expiries (PUC, Insurance, Fitness Certificate, Road Tax at 30, 15, 7 and 1 days), overdue rent, post-office scheme maturities, loan EMIs, money lent coming due, credit-card dues, property tax/possession dates, deposit reminders, insurance renewals and insurance claims. The vehicle and rent checks skip alerts they have already created for the same item and threshold.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A red message such as "Request failed with status code 500" | A check failed | Try again later |

**Limitations:** The number in "Scan complete — N new alerts" counts only vehicle and rent alerts; alerts created by the other checks are added but not counted (see DOCUMENTATION_GAPS.md).

**How it works:** `POST /api/alerts/scan` runs the ten checks in parallel for your user id and returns a count per check.

**Related features:** [F-ALERT-005](F-ALERT-005.md), [D-ALERT-001](../dependencies.md#d-alert-001) (alert sources in other chapters).

**Sources:** `apps/web/src/pages/alerts/AlertsPage.tsx:353`, `apps/web/src/pages/alerts/AlertsPage.tsx:355`, `packages/api/src/controllers/alerts.controller.ts:72`, `packages/api/src/services/notifications/alerts.service.ts:13`, `packages/api/src/services/notifications/alerts.service.ts:339`
