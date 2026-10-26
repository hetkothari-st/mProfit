---
id: F-SET-005
title: "Loan rate alerts"
module: "Settings"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-SET-002]
related: []
---

[← Settings](../modules/settings.md) · [Index](../INDEX.md)

# Loan rate alerts

`F-SET-005` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** One checkbox that turns refinance and repo-rate/MCLR-change alerts for your loans on or off.

**Why it exists:** The code comment calls it the "opt-out: refinance and repo/MCLR change alerts for this profile's loans. Default on."

**Where to find it:** **Tools → Settings → Loan rate alerts** — "Checked every morning against live lender rates and RBI / MCLR changes."

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) changes the managed person's setting.

**Steps**
1. Tick or untick "Tell me when I could save by refinancing a loan, and when the repo rate or my lender's MCLR changes".
2. Toast "Loan rate alerts on" or "Loan rate alerts off".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Alert checkbox | Checkbox | Saves immediately | Disabled while saving |
| **Try again** | Button | Reloads the setting | Shown only after "Couldn't load this setting." |

**Fields and rules:** Not applicable — one checkbox.

**Settings and toggles here:** [S-SET-002](../settings/settings.md#s-set-002) **Loan rate alerts** — on (default): alerts may be raised; off: none.

**Results:** The setting is saved on your account.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load this setting." | Load failed | **Try again** |
| "Couldn't save - try again" | Save failed | Click again |

**Limitations:** The alerts themselves are produced by the loan module (B04); this card only switches them.

**How it works:** GET/PUT `/api/notifications/preferences` with `{ loanRateAlerts: true|false }` (no other keys accepted) reads and writes `User.loanRateAlerts`. Because `/api/notifications` is not an account route, while managing a family member it applies to that person.

**Related features:** [D-SET-003](../dependencies.md#d-set-003).

**Sources:** `apps/web/src/pages/settings/LoanRateAlertsCard.tsx:13`, `apps/web/src/pages/settings/LoanRateAlertsCard.tsx:41`, `apps/web/src/pages/settings/LoanRateAlertsCard.tsx:53`, `packages/api/src/controllers/alertPrefs.controller.ts:7`, `packages/api/src/services/notifications/alertPrefs.service.ts:4`, `packages/api/prisma/schema.prisma:176`
