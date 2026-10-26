---
id: F-SHELL-008
title: "Alerts bell with unread count"
module: "App layout and navigation"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-ADMIN"
settings: []
related: [F-ALERT-001, F-ALERT-002, F-DASH-003]
---

[← App layout and navigation](../modules/app-layout-and-navigation.md) · [Index](../INDEX.md)

# Alerts bell with unread count

`F-SHELL-008` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-ADMIN](../roles.md#r-admin)

**What it does:** The bell in the top bar opens the Alerts & Reminders page and shows a badge with how many unread alerts you have (up to "99+").

**Why it exists:** Inferred from behavior: a constant reminder that something needs your attention, on every page.

**Where to find it:** Top bar → bell (tooltip **Alerts & Reminders**).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-ADMIN](../roles.md#r-admin).

**Steps**
1. Click the bell. `/alerts` opens.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Alerts & Reminders** (bell) | Link | Opens `/alerts` | Never; the badge is hidden at 0 |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** The badge counts active (not dismissed) unread alerts; numbers above 99 show "99+".

**Errors and troubleshooting:** None.

**Limitations:** The count refreshes every 5 minutes, and immediately after you mark or create alerts on the Alerts page; changes made elsewhere may take up to 5 minutes to show. Dashboard alerts ([F-DASH-003](F-DASH-003.md)) are computed live and are not counted here.

**How it works:** `GET /api/alerts/unread-count` counts your alerts with `isActive = true` and `isRead = false`, polled every 5 minutes.

**Related features:** [F-ALERT-001](F-ALERT-001.md), [F-ALERT-002](F-ALERT-002.md).

**Sources:** `apps/web/src/components/layout/Header.tsx:69`, `apps/web/src/components/layout/Header.tsx:135`, `apps/web/src/components/layout/Header.tsx:143`, `packages/api/src/services/notifications/alerts.service.ts:52`
