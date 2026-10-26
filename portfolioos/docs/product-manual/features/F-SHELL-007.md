---
id: F-SHELL-007
title: "Hide values (privacy mode)"
module: "App layout and navigation"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-ADMIN"
settings: [S-DASH-002, S-SHELL-006]
related: [F-BANK-007, F-DASH-002, F-DASH-005, F-DASH-009]
---

[← App layout and navigation](../modules/app-layout-and-navigation.md) · [Index](../INDEX.md)

# Hide values (privacy mode)

`F-SHELL-007` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-ADMIN](../roles.md#r-admin)

**What it does:** The eye button in the top bar hides amounts, percentages and counts across the app by covering them with grey bars, so you can use EveryPaisa while someone can see your screen. Click again (**Show values**) to reveal them.

**Why it exists:** Code comment: "Privacy mode: replace numeric values with clean redaction bars." Inferred: for screen-sharing and public places.

**Where to find it:** Top bar → eye button (**Hide values** / **Show values**).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-ADMIN](../roles.md#r-admin).

**Steps**
1. Click **Hide values**. The icon becomes a crossed-out eye and numbers turn into grey bars; +/− signs are hidden too.
2. Click **Show values** to reveal them.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Hide values** / **Show values** | Icon button | Toggles privacy mode | Never |

**Fields and rules:** None.

**Settings and toggles here:** [S-SHELL-006](../settings/app-layout-and-navigation.md#s-shell-006) **Hide values** — off (default) or on; remembered on this browser. Separate from the Dashboard's own net-worth eye ([S-DASH-002](../settings/dashboard.md#s-dash-002)).

**Results:** Text keeps its place on the page but becomes unreadable; the Dashboard's portfolio chart axis and tooltips show "•••".

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Some chart axis labels still show amounts | Chart axes and tooltips are drawn as graphics and only some charts check this setting | Known limitation (below) |

**Limitations:** Masking is done by styling, so values remain in the page (copy-paste is blocked on masked text). The Net worth over time chart's axis and tooltip and the bank balance-history chart's axis are not masked — see DOCUMENTATION_GAPS.md.

**How it works:** When on, the app frame gets the `privacy-mask` style, which makes the text of money, number and percentage elements transparent over a grey pill. Stored in localStorage `everypaisa.privacy`.

**Related features:** [F-DASH-002](F-DASH-002.md), [F-DASH-005](F-DASH-005.md), [F-DASH-009](F-DASH-009.md), [F-BANK-007](F-BANK-007.md).

**Sources:** `apps/web/src/components/layout/Header.tsx:162`, `apps/web/src/stores/privacy.store.ts:13`, `apps/web/src/components/layout/AppShell.tsx:91`, `apps/web/src/styles/globals.css:460`, `apps/web/src/styles/globals.css:473`, `apps/web/src/pages/dashboard/DashboardPage.tsx:974`
