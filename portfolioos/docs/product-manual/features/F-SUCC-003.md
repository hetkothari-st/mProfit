---
id: F-SUCC-003
title: "Succession test mode (admins)"
module: "Succession"
status: Live
roles: "R-ADMIN"
settings: [S-SUCC-005]
related: [F-SUCC-006]
---

[← Succession](../modules/succession.md) · [Index](../INDEX.md)

# Succession test mode (admins)

`F-SUCC-003` · Live · Roles: [R-ADMIN](../roles.md#r-admin)

**What it does:** For administrators only, a checkbox **Test mode: 1 minute (admins only)** makes inactivity and every reminder stage last 1 minute, so nominees get access in about 5 minutes. The status shows a red badge "Test mode · 1 minute".

**Why it exists:** Code comment: "Test mode can release someone's finances in ~5 minutes: admins only, server-enforced."

**Where to find it:** **Planning → Succession → When to share** (visible only to admins).

**Who can use it:** [R-ADMIN](../roles.md#r-admin) (who also has PLUS or higher).

**Steps**
1. Tick **Test mode: 1 minute (admins only)**. The trigger switches to **If I'm inactive**.
2. Click **Save**, then **Turn on**. Use test nominee emails.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Test mode: 1 minute (admins only)** | Checkbox | Switches to 1-minute units | Hidden for non-admins; disabled when not editable |

**Fields and rules:** Test mode requires the inactivity trigger ("Test mode works with the inactivity trigger only."); non-admins get "Test mode is for admins only."

**Settings and toggles here:** [S-SUCC-005](../settings/succession.md#s-succ-005) **Test mode**.

**Results:** A per-minute job advances the plan; the help text warns "Browsing the app only counts as activity once an hour, so use the "I'm OK" email link to test a reset."

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Test mode is for admins only." | Non-admin request | — |

**Limitations:** Real emails are sent to the nominees entered.

**How it works:** `testMode` on the plan; the state machine counts minutes instead of IST days; a cron runs every minute for test-mode plans only.

**Related features:** [F-SUCC-006](F-SUCC-006.md).

**Sources:** `apps/web/src/pages/legacy/LegacyPage.tsx:132`, `packages/api/src/services/legacy/plan.service.ts:91`, `packages/api/src/services/legacy/stateMachine.ts:51`, `packages/api/src/jobs/legacyTransferJob.ts:31`
