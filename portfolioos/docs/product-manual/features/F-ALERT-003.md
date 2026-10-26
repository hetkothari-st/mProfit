---
id: F-ALERT-003
title: "New reminder"
module: "Alerts & Reminders"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-ALERT-001]
---

[← Alerts & Reminders](../modules/alerts-reminders.md) · [Index](../INDEX.md)

# New reminder

`F-ALERT-003` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** "New reminder" creates your own dated reminder with a **Title**, optional **Description (optional)** and **Reminder date**.

**Why it exists:** Inferred from behavior: track things EveryPaisa does not detect itself (placeholder "e.g. FD maturity at SBI").

**Where to find it:** **Alerts → New reminder** (or **Create a reminder** when the list is empty).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Click **New reminder**.
2. Type a **Title**, optional description, and pick the **Reminder date** (today by default).
3. Click **Create** ("Creating…" while saving). "Alert created" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Title** | Text | Reminder title | — |
| **Description (optional)** | Text | Details ("Additional details") | — |
| **Reminder date** | Date | Due date | — |
| **Cancel** / **Create** | Buttons | Close / save | **Create** disabled without a title or while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Title | Text | Yes | 1–300 characters | Empty | **Create** stays disabled while empty |
| Description | Text | No | ≤1,000 characters | Empty | Generic request error |
| Reminder date | Date | Yes | YYYY-MM-DD | Today (UTC date) | Generic request error (server rule "Expected YYYY-MM-DD") |

**Settings and toggles here:** None.

**Results:** An unread alert of type Custom appears in its band; the bell count goes up.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A red message such as "Request failed with status code 400" | Validation failed (the server's reason is not shown) | Shorten the text or fix the date |

**Limitations:** No time of day, no repeat, no email or push for custom reminders from this dialog; it cannot be edited after creation (dismiss and recreate).

**How it works:** `POST /api/alerts` with title, description and trigger date; stored as type CUSTOM.

**Related features:** [F-ALERT-001](F-ALERT-001.md).

**Sources:** `apps/web/src/pages/alerts/AlertsPage.tsx:269`, `apps/web/src/pages/alerts/AlertsPage.tsx:273`, `apps/web/src/pages/alerts/AlertsPage.tsx:307`, `packages/api/src/controllers/alerts.controller.ts:21`, `packages/api/src/services/notifications/alerts.service.ts:76`
