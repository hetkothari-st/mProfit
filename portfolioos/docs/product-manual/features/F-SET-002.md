---
id: F-SET-002
title: "Plan card"
module: "Settings"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-PLAN-001, F-PLAN-004]
---

[← Settings](../modules/settings.md) · [Index](../INDEX.md)

# Plan card

`F-SET-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Shows your current plan and your "I am" role, with a link to **Pricing**.

**Why it exists:** Inferred from behavior: tells you which plan is in force.

**Where to find it:** **Tools → Settings → Plan** (right of Profile).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps:** Not applicable — view only. Click **Pricing** in "To change your plan, go to Pricing." to change plan.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Pricing** | Link | Opens `/pricing` | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** None.

**Limitations:** The plan and role are shown as raw codes (for example `PRO_ADVISOR`, `INVESTOR`). The plan's end date is not shown anywhere in the app.

**How it works:** Reads your profile; the plan shown is the effective plan (a lapsed paid plan shows `FREE`, [F-PLAN-004](F-PLAN-004.md)).

**Related features:** [F-PLAN-001](F-PLAN-001.md), [F-PLAN-004](F-PLAN-004.md).

**Sources:** `apps/web/src/pages/settings/SettingsPage.tsx:135`, `apps/web/src/pages/settings/SettingsPage.tsx:140`, `apps/web/src/pages/settings/SettingsPage.tsx:148`, `packages/api/src/services/auth/auth.service.ts:65`
