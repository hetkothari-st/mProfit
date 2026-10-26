---
id: F-ALERT-001
title: "Alerts & Reminders page"
module: "Alerts & Reminders"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-ALERT-001, S-ALERT-002]
related: [F-ALERT-002, F-ALERT-003, F-ALERT-004, F-ALERT-005, F-DASH-003, F-SHELL-008]
---

[← Alerts & Reminders](../modules/alerts-reminders.md) · [Index](../INDEX.md)

# Alerts & Reminders page

`F-ALERT-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** "Inbox — Alerts & Reminders" ("Maturities, premium due dates, expiries and your own reminders — grouped by when they land.") lists alerts in bands: **Overdue** (past their date), **This week** (next 7 days), **This month** (next 30 days), **Later** (beyond 30 days). Each row shows when ("in 3d", "today", "tomorrow", "5d late", or for loan checks "2d ago") with the exact date, the type label, the title (a link for loan and will alerts) and description. Chips **All**, **Overdue**, **Due ≤ 7d**, **Unread** (with counts) and a type picker filter the list.

**Why it exists:** Code comment: "The only question this page answers is 'what must I do, and by when'."

**Where to find it:** **Tools → Alerts** or the bell in the top bar (route `/alerts`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) — your own alerts ([R-MANAGER](../roles.md#r-manager): the managed person's).

**Steps**
1. Open the page. Unread alerts have an accent bar on the left (red when overdue) and bold titles.
2. Click a chip to show only that group; pick a type in **All types** to filter by type.
3. Click a linked title to open its item (loan alerts open the loan; will reviews open Will Maker).
4. Use **Previous** / **Next** for more pages.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **All**, **Overdue**, **Due ≤ 7d**, **Unread** | Filter chips with counts | Show that group of the loaded page | — |
| **All types** picker | Select | FD maturity, Bond maturity, MF lock-in, SIP due, Insurance premium, Dividend, Corporate action, Price target, Loan refinance, Loan rate change, Will review, Custom | — |
| Linked title | Link | `/loans/<id>` for Loan refinance / Loan rate change (`/loans` without an id); `/will` for Will review | Other types are plain text |
| **Mark all read** | Button | [F-ALERT-002](F-ALERT-002.md) | Hidden with no unread alerts |
| Row actions | Icon buttons | [F-ALERT-002](F-ALERT-002.md) | — |
| **Scan now**, **New reminder** | Buttons | [F-ALERT-004](F-ALERT-004.md), [F-ALERT-003](F-ALERT-003.md) | — |
| **Show all** | Button | Clears the chip filter | Only when a chip hides everything |
| **Previous** / **Next** ("Page X of Y") | Buttons | Page through | More than one page only |

**Fields and rules:** None.

**Settings and toggles here:** [S-ALERT-001](../settings/alerts-reminders.md#s-alert-001) **Alert lens** — All (default), Overdue, Due ≤ 7d, Unread; not remembered. [S-ALERT-002](../settings/alerts-reminders.md#s-alert-002) **Alert type filter** — All types (default) or one type; resets to page 1; not remembered.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "All clear — Nothing is due. Alerts appear here for maturities, premium due dates, vehicle expiries and rent reminders." | No active alerts | **Create a reminder** if you want one |
| "Nothing in this view — N alert(s) loaded, but none match this filter." | The chip hides all loaded alerts | **Show all** |

**Limitations:** 30 alerts per page; the chip counts and chips filter only the loaded page ("Showing N of M · K unread in total" states the scope). Loan-check alerts (Loan refinance, Loan rate change) are news dated when raised, so they are never "Overdue". Several kinds of alert cannot be picked in **All types** (EMI due, card due, loan given due, insurance claim, property tax, possession, PF refresh, F&O) and show their raw type name in lower case; vehicle-expiry and rent-overdue alerts are stored as "Custom" and are not linked. Dismissed alerts cannot be brought back.

**How it works:** `GET /api/alerts?type=&page=&limit=30` returns active alerts, unread first then by date (latest first), with the total and the overall unread count. The page then sorts each band soonest first. Days are counted from local midnight.

**Related features:** [F-ALERT-002](F-ALERT-002.md) to [F-ALERT-005](F-ALERT-005.md), [F-SHELL-008](F-SHELL-008.md), [F-DASH-003](F-DASH-003.md).

**Sources:** `apps/web/src/pages/alerts/AlertsPage.tsx:46`, `apps/web/src/pages/alerts/AlertsPage.tsx:61`, `apps/web/src/pages/alerts/AlertsPage.tsx:82`, `apps/web/src/pages/alerts/AlertsPage.tsx:93`, `apps/web/src/pages/alerts/AlertsPage.tsx:100`, `apps/web/src/pages/alerts/AlertsPage.tsx:327`, `apps/web/src/pages/alerts/AlertsPage.tsx:369`, `apps/web/src/pages/alerts/AlertsPage.tsx:423`, `apps/web/src/pages/alerts/AlertsPage.tsx:465`, `apps/web/src/pages/alerts/AlertsPage.tsx:513`, `apps/web/src/pages/alerts/alertLinks.ts:5`, `apps/web/src/pages/alerts/alertLinks.ts:15`, `packages/api/src/services/notifications/alerts.service.ts:17`
