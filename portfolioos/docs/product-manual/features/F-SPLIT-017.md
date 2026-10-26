---
id: F-SPLIT-017
title: "Split settings"
module: "Split Expenses"
status: Live
roles: "R-FREE…R-PRO, R-MANAGER"
settings: [S-SPLIT-007, S-SPLIT-008, S-SPLIT-009, S-SPLIT-010, S-SPLIT-011]
related: [F-SPLIT-010, F-SPLIT-013, F-SPLIT-014, F-SPLIT-018]
---

[← Split Expenses](../modules/split-expenses.md) · [Index](../INDEX.md)

# Split settings

`F-SPLIT-017` · Live · Roles: [R-FREE](../roles.md#r-free)…[R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** **Split settings** has three cards: **Payments** (**UPI ID**, "Friends see this when they pay you"), **Defaults** (**Home currency**, **Default portfolio**), **Emails** ("Email me about activity in my groups (at most hourly)", "Weekly balance summary (Mondays)"), and **Save**.

**Why it exists:** Inferred from behavior: personal preferences for paying, converting and notifications.

**Where to find it:** **Tools → Split Expenses → Settings** (route `/split/settings`).

**Who can use it:** [R-FREE](../roles.md#r-free) and above, [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Change values and click **Save** ("Settings saved").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **UPI ID** | Text | [S-SPLIT-007](../settings/split-expenses.md#s-split-007) | — |
| **Home currency** | Select | [S-SPLIT-008](../settings/split-expenses.md#s-split-008) | — |
| **Default portfolio** | Select ("None") | [S-SPLIT-009](../settings/split-expenses.md#s-split-009) | — |
| Email about activity | Checkbox | [S-SPLIT-010](../settings/split-expenses.md#s-split-010) | — |
| Weekly balance summary | Checkbox | [S-SPLIT-011](../settings/split-expenses.md#s-split-011) | — |
| **Save** | Button | Saves all | Invalid UPI ID; while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| UPI ID | Text | No | name@bank: 2–256 of letters, digits, `.`, `_`, `-`, then `@`, then 2–64 letters | Empty | "Enter a UPI ID like name@bank" / "Invalid UPI ID" |
| Default portfolio | Select | No | One of your portfolios | None | "Pick one of your own portfolios" |

**Settings and toggles here:** [S-SPLIT-007](../settings/split-expenses.md#s-split-007) to [S-SPLIT-011](../settings/split-expenses.md#s-split-011).

**Results:** Saved per user.

**Errors and troubleshooting:** "Couldn't load your settings." / "Couldn't save your settings".

**Limitations:** Home currency choices are the same 10 currencies.

**How it works:** `GET/PUT /api/split/settings`; defaults when never saved: UPI none, INR, no portfolio, activity emails on, weekly off.

**Related features:** [F-SPLIT-010](F-SPLIT-010.md), [F-SPLIT-013](F-SPLIT-013.md), [F-SPLIT-014](F-SPLIT-014.md), [F-SPLIT-018](F-SPLIT-018.md).

**Sources:** `apps/web/src/pages/split/SplitSettingsPage.tsx:65`, `apps/web/src/pages/split/SplitSettingsPage.tsx:85`, `apps/web/src/pages/split/SplitSettingsPage.tsx:89`, `apps/web/src/pages/split/SplitSettingsPage.tsx:92`, `packages/api/src/controllers/split.controller.ts:118`, `packages/api/src/services/split/settings.service.ts:22`, `packages/api/prisma/schema.prisma:5441`
