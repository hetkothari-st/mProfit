---
id: F-ALERT-002
title: "Mark read, mark all read, dismiss"
module: "Alerts & Reminders"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-ALERT-001, F-SHELL-008]
---

[← Alerts & Reminders](../modules/alerts-reminders.md) · [Index](../INDEX.md)

# Mark read, mark all read, dismiss

`F-ALERT-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Each unread alert has a tick (**Mark as read**); every alert has a bin (**Dismiss**) that removes it from the list; **Mark all read** marks all your unread alerts read.

**Why it exists:** Inferred from behavior: keep the list to what still needs action.

**Where to find it:** Alerts page rows and the control row.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Click the tick on a row — it loses its accent bar and bold title.
2. Click the bin to dismiss it — it disappears.
3. Click **Mark all read** — "All alerts marked as read".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Mark as read** (tick) | Icon button | Marks one read | Unread rows only |
| **Dismiss** (bin) | Icon button | Removes the alert | — |
| **Mark all read** | Button | Marks all unread as read | Hidden with no unread alerts; disabled while running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** The bell's unread badge updates immediately.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A red message such as "Request failed with status code 404" after **Dismiss**; nothing happens after **Mark as read** | The alert was already dismissed or is not yours (mark-read failures show no message) | Reload the page |

**Limitations:** Dismiss has no confirmation and no undo. A scanner may raise a new alert for the same item at its next threshold (for example vehicle expiry at 30, 15, 7 and 1 days).

**How it works:** `PATCH /api/alerts/:id/read`, `PATCH /api/alerts/mark-all-read`, `DELETE /api/alerts/:id` (sets the alert inactive; the row is kept).

**Related features:** [F-ALERT-001](F-ALERT-001.md), [F-SHELL-008](F-SHELL-008.md).

**Sources:** `apps/web/src/pages/alerts/AlertsPage.tsx:179`, `apps/web/src/pages/alerts/AlertsPage.tsx:190`, `apps/web/src/pages/alerts/AlertsPage.tsx:337`, `apps/web/src/pages/alerts/AlertsPage.tsx:348`, `apps/web/src/pages/alerts/AlertsPage.tsx:442`, `packages/api/src/services/notifications/alerts.service.ts:56`, `packages/api/src/services/notifications/alerts.service.ts:62`, `packages/api/src/services/notifications/alerts.service.ts:70`
