[Index](../INDEX.md)

# Alerts & Reminders

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The Alerts & Reminders page collects dated reminders that EveryPaisa creates for you — maturities, premiums, EMIs, card dues, vehicle expiries, overdue rent, property tax and more — plus reminders you add yourself, grouped by when they fall due.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-ALERT-001](../features/F-ALERT-001.md) | Alerts & Reminders page | Live | "Inbox — Alerts & Reminders" ("Maturities, premium due dates, expiries and your own reminders — grouped by when they land.") lists alerts … |
| [F-ALERT-002](../features/F-ALERT-002.md) | Mark read, mark all read, dismiss | Live | Each unread alert has a tick (Mark as read); every alert has a bin (Dismiss) that removes it from the list; Mark all read marks all your … |
| [F-ALERT-003](../features/F-ALERT-003.md) | New reminder | Live | "New reminder" creates your own dated reminder with a Title, optional Description (optional) and Reminder date. |
| [F-ALERT-004](../features/F-ALERT-004.md) | Scan now | Live | Scan now runs all of EveryPaisa's alert checks for your account immediately instead of waiting for the nightly run, then reloads the list … |
| [F-ALERT-005](../features/F-ALERT-005.md) | Daily alert scan | Live | Every day at 20:45 India time, the same checks as Scan now run for every account, so new alerts are waiting for you. |

Settings for this module: [settings/alerts-reminders.md](../settings/alerts-reminders.md)

### What this area doesn't do
- You cannot edit or snooze an alert, or restore a dismissed one.
- Custom reminders do not repeat and have no time of day.
- Alert e-mail/notification preferences are not set here (see Settings → notifications, [D-ALERT-002](../dependencies.md#d-alert-002)).
- Family members' alerts are not shown, even in family view.
