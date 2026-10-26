[Index](../INDEX.md)

# Settings — Alerts & Reminders

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-alert-001"></a>
### Alert lens
| Attribute | Value |
|---|---|
| Control type | Filter chips **All**, **Overdue**, **Due ≤ 7d**, **Unread** |
| Location | Alerts page |
| Purpose | Show one group of the loaded alerts |
| Default | All (source: `apps/web/src/pages/alerts/AlertsPage.tsx:323`) |
| Values | All · Overdue (past date, not loan checks) · Due ≤ 7d (this week band) · Unread |
| Depends on | Applies to the loaded page of 30 only |
| Persists | No |
| Stored in | Page state |
| Backend effect | None |
| Who can change | Everyone signed in |
| Sources | `apps/web/src/pages/alerts/AlertsPage.tsx:380` |

<a id="s-alert-002"></a>
### Alert type filter
| Attribute | Value |
|---|---|
| Control type | Select (**All types**) |
| Location | Alerts page |
| Purpose | Show one alert type |
| Default | All types (source: `apps/web/src/pages/alerts/AlertsPage.tsx:322`) |
| Values | All types, FD maturity, Bond maturity, MF lock-in, SIP due, Insurance premium, Dividend, Corporate action, Price target, Loan refinance, Loan rate change, Will review, Custom |
| Depends on | Resets to page 1 |
| Persists | No |
| Stored in | Page state |
| Backend effect | `type` query on `/api/alerts` |
| Who can change | Everyone signed in |
| Sources | `apps/web/src/pages/alerts/AlertsPage.tsx:432`, `packages/api/src/services/notifications/alerts.service.ts:29` |
