---
id: F-DASH-003
title: "Dashboard alerts strip"
module: "Dashboard"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-DASH-005]
related: [F-ALERT-001]
---

[← Dashboard](../modules/dashboard.md) · [Index](../INDEX.md)

# Dashboard alerts strip

`F-DASH-003` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Under the hero, up to four urgent items are listed, most urgent first, each with an icon by urgency, title, description and days left ("Overdue" when due today or past). Clicking an item opens its section. A button on the first item folds the strip into one line "N alerts — click to expand".

**Why it exists:** Inferred from behavior: puts expiries and dues that cost money if missed in front of you without opening the Alerts page.

**Where to find it:** Dashboard, below the hero and Portfolio Score card. Shown only when there is at least one item.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); family roles see members' items within their permissions.

**Steps**
1. Click an item ("Open section"). The related page opens.
2. Click the up-arrow on the first item (**Collapse alerts**) to fold the strip; click the folded bar (**Expand alerts**) to show it again.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Alert row ("Open section") | Link | Opens Insurance, Vehicles, Rental, Loans or Alerts | — |
| **Collapse alerts** | Icon button | Folds the strip | First row only |
| "N alerts — click to expand" (**Expand alerts**) | Button | Unfolds | Folded state only |

**Fields and rules:** None.

**Settings and toggles here:** [S-DASH-005](../settings/dashboard.md#s-dash-005) **Alerts strip folded** — in this visit only; reloading shows it unfolded.

**Results:** None stored; these items are computed live and are separate from the Alerts page.

**Errors and troubleshooting:** None.

**Limitations:** At most 10 items are calculated and 4 shown. Items: vehicle Insurance/PUC/Fitness/Road Tax expiring within 30 days (or already expired); insurance premiums due within 30 days; one item for overdue rent receipts; one for pending traffic challans; each overdue loan EMI; each loan EMI due within 30 days. Credit-card dues, FD maturities and custom reminders are on the Alerts page, not here. In family view, items are listed member by member before the 10-item cut, so one member's items can push out another's.

**How it works:** Urgency: HIGH when 7 days or fewer remain, MEDIUM up to 15 days, LOW beyond; overdue rent and overdue EMIs are always HIGH, challans MEDIUM. Sorted HIGH, MEDIUM, LOW, then by days remaining. Days = whole days from now to the date, rounded up. Links: insurance → `/insurance`; vehicle expiry and challans → `/vehicles`; rent → `/rental`; EMI → `/loans`.

**Related features:** [F-ALERT-001](F-ALERT-001.md), [D-DASH-003](../dependencies.md#d-dash-003), [D-DASH-004](../dependencies.md#d-dash-004), [D-DASH-005](../dependencies.md#d-dash-005) (Insurance), [D-DASH-006](../dependencies.md#d-dash-006) (Loans).

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:55`, `apps/web/src/pages/dashboard/DashboardPage.tsx:322`, `apps/web/src/pages/dashboard/DashboardPage.tsx:640`, `apps/web/src/pages/dashboard/DashboardPage.tsx:663`, `apps/web/src/pages/dashboard/DashboardPage.tsx:669`, `apps/web/src/pages/dashboard/DashboardPage.tsx:683`, `packages/api/src/services/analytics/dashboard.service.ts:46`, `packages/api/src/services/analytics/dashboard.service.ts:153`, `packages/api/src/services/analytics/dashboard.service.ts:397`, `packages/api/src/services/analytics/dashboard.service.ts:458`, `packages/api/src/services/analytics/dashboard.service.ts:523`, `packages/api/src/services/analytics/dashboard.service.ts:658`
