## Alerts & Reminders

The Alerts & Reminders page collects dated reminders that EveryPaisa creates for you — maturities, premiums, EMIs, card dues, vehicle expiries, overdue rent, property tax and more — plus reminders you add yourself, grouped by when they fall due.

### Alerts & Reminders page <!-- F-ALERT-001 -->

**What it does:** "Inbox — Alerts & Reminders" ("Maturities, premium due dates, expiries and your own reminders — grouped by when they land.") lists alerts in bands: **Overdue** (past their date), **This week** (next 7 days), **This month** (next 30 days), **Later** (beyond 30 days). Each row shows when ("in 3d", "today", "tomorrow", "5d late", or for loan checks "2d ago") with the exact date, the type label, the title (a link for loan and will alerts) and description. Chips **All**, **Overdue**, **Due ≤ 7d**, **Unread** (with counts) and a type picker filter the list.

**Why it exists:** Code comment: "The only question this page answers is 'what must I do, and by when'."

**Where to find it:** **Tools → Alerts** or the bell in the top bar (route `/alerts`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO — your own alerts (R-MANAGER: the managed person's).

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
| **Mark all read** | Button | F-ALERT-002 | Hidden with no unread alerts |
| Row actions | Icon buttons | F-ALERT-002 | — |
| **Scan now**, **New reminder** | Buttons | F-ALERT-004, F-ALERT-003 | — |
| **Show all** | Button | Clears the chip filter | Only when a chip hides everything |
| **Previous** / **Next** ("Page X of Y") | Buttons | Page through | More than one page only |

**Fields and rules:** None.

**Settings and toggles here:** S-ALERT-001 **Alert lens** — All (default), Overdue, Due ≤ 7d, Unread; not remembered. S-ALERT-002 **Alert type filter** — All types (default) or one type; resets to page 1; not remembered.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "All clear — Nothing is due. Alerts appear here for maturities, premium due dates, vehicle expiries and rent reminders." | No active alerts | **Create a reminder** if you want one |
| "Nothing in this view — N alert(s) loaded, but none match this filter." | The chip hides all loaded alerts | **Show all** |

**Limitations:** 30 alerts per page; the chip counts and chips filter only the loaded page ("Showing N of M · K unread in total" states the scope). Loan-check alerts (Loan refinance, Loan rate change) are news dated when raised, so they are never "Overdue". Several kinds of alert cannot be picked in **All types** (EMI due, card due, loan given due, insurance claim, property tax, possession, PF refresh, F&O) and show their raw type name in lower case; vehicle-expiry and rent-overdue alerts are stored as "Custom" and are not linked. Dismissed alerts cannot be brought back.

**How it works:** `GET /api/alerts?type=&page=&limit=30` returns active alerts, unread first then by date (latest first), with the total and the overall unread count. The page then sorts each band soonest first. Days are counted from local midnight.

**Related features:** F-ALERT-002 to F-ALERT-005, F-SHELL-008, F-DASH-003.

**Sources:** `apps/web/src/pages/alerts/AlertsPage.tsx:46`, `apps/web/src/pages/alerts/AlertsPage.tsx:61`, `apps/web/src/pages/alerts/AlertsPage.tsx:82`, `apps/web/src/pages/alerts/AlertsPage.tsx:93`, `apps/web/src/pages/alerts/AlertsPage.tsx:100`, `apps/web/src/pages/alerts/AlertsPage.tsx:327`, `apps/web/src/pages/alerts/AlertsPage.tsx:369`, `apps/web/src/pages/alerts/AlertsPage.tsx:423`, `apps/web/src/pages/alerts/AlertsPage.tsx:465`, `apps/web/src/pages/alerts/AlertsPage.tsx:513`, `apps/web/src/pages/alerts/alertLinks.ts:5`, `apps/web/src/pages/alerts/alertLinks.ts:15`, `packages/api/src/services/notifications/alerts.service.ts:17`

### Mark read, mark all read, dismiss <!-- F-ALERT-002 -->

**What it does:** Each unread alert has a tick (**Mark as read**); every alert has a bin (**Dismiss**) that removes it from the list; **Mark all read** marks all your unread alerts read.

**Why it exists:** Inferred from behavior: keep the list to what still needs action.

**Where to find it:** Alerts page rows and the control row.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

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

**Related features:** F-ALERT-001, F-SHELL-008.

**Sources:** `apps/web/src/pages/alerts/AlertsPage.tsx:179`, `apps/web/src/pages/alerts/AlertsPage.tsx:190`, `apps/web/src/pages/alerts/AlertsPage.tsx:337`, `apps/web/src/pages/alerts/AlertsPage.tsx:348`, `apps/web/src/pages/alerts/AlertsPage.tsx:442`, `packages/api/src/services/notifications/alerts.service.ts:56`, `packages/api/src/services/notifications/alerts.service.ts:62`, `packages/api/src/services/notifications/alerts.service.ts:70`

### New reminder <!-- F-ALERT-003 -->

**What it does:** "New reminder" creates your own dated reminder with a **Title**, optional **Description (optional)** and **Reminder date**.

**Why it exists:** Inferred from behavior: track things EveryPaisa does not detect itself (placeholder "e.g. FD maturity at SBI").

**Where to find it:** **Alerts → New reminder** (or **Create a reminder** when the list is empty).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

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

**Related features:** F-ALERT-001.

**Sources:** `apps/web/src/pages/alerts/AlertsPage.tsx:269`, `apps/web/src/pages/alerts/AlertsPage.tsx:273`, `apps/web/src/pages/alerts/AlertsPage.tsx:307`, `packages/api/src/controllers/alerts.controller.ts:21`, `packages/api/src/services/notifications/alerts.service.ts:76`

### Scan now <!-- F-ALERT-004 -->

**What it does:** **Scan now** runs all of EveryPaisa's alert checks for your account immediately instead of waiting for the nightly run, then reloads the list with "Scan complete — N new alerts".

**Why it exists:** Inferred from behavior: see new alerts right after adding a policy, vehicle, loan or deposit.

**Where to find it:** **Alerts → Scan now**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

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

**Related features:** F-ALERT-005, D-ALERT-001 (alert sources in other chapters).

**Sources:** `apps/web/src/pages/alerts/AlertsPage.tsx:353`, `apps/web/src/pages/alerts/AlertsPage.tsx:355`, `packages/api/src/controllers/alerts.controller.ts:72`, `packages/api/src/services/notifications/alerts.service.ts:13`, `packages/api/src/services/notifications/alerts.service.ts:339`

### Daily alert scan <!-- F-ALERT-005 -->

**What it does:** Every day at 20:45 India time, the same checks as **Scan now** run for every account, so new alerts are waiting for you.

**Why it exists:** Code comment: scheduled "after insurance renewal cron at 20:30".

**Where to find it:** Not a page; results appear on **Alerts** and in the bell count.

**Who can use it:** Automatic for every account.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** None.

**Settings and toggles here:** None for users. Operators can switch it off (`ENABLE_ALERT_CRONS=false`).

**Results:** As F-ALERT-004, for everyone.

**Errors and troubleshooting:** None visible — one account's failure is logged and the rest continue.

**Limitations:** Runs once a day; use **Scan now** for an immediate check.

**How it works:** Lists all users with system access, then runs each user's checks within that user's data context (without it, the database's row security would return nothing).

**Related features:** F-ALERT-004.

**Sources:** `packages/api/src/jobs/alertJobs.ts:25`, `packages/api/src/jobs/alertJobs.ts:45`, `packages/api/src/jobs/alertJobs.ts:48`

### What this area doesn't do
- You cannot edit or snooze an alert, or restore a dismissed one.
- Custom reminders do not repeat and have no time of day.
- Alert e-mail/notification preferences are not set here (see Settings → notifications, D-ALERT-002).
- Family members' alerts are not shown, even in family view.

