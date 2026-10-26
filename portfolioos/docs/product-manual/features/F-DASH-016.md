---
id: F-DASH-016
title: "Free plan upgrade banner"
module: "Dashboard"
status: Live
roles: "R-FREE"
settings: [S-DASH-006]
related: [F-SHELL-009]
---

[← Dashboard](../modules/dashboard.md) · [Index](../INDEX.md)

# Free plan upgrade banner

`F-DASH-016` · Live · Roles: [R-FREE](../roles.md#r-free)

**What it does:** On the Free plan the Dashboard opens with "You're on the Free plan — Upgrade to Plus for the full tax report catalog, AA auto-import, multiple portfolios, and AI insights." with **See plans** and a close button.

**Why it exists:** Code comment: "Free-tier upsell on the Dashboard. Dismissible."

**Where to find it:** Top of the Dashboard (also on the empty Dashboard).

**Who can use it:** [R-FREE](../roles.md#r-free).

**Steps**
1. Click **See plans** to open Pricing, or × (**Dismiss**) to hide it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **See plans** | Button link | Opens `/pricing` | — |
| **Dismiss** (×) | Icon button | Hides the banner | — |

**Fields and rules:** None.

**Settings and toggles here:** [S-DASH-006](../settings/dashboard.md#s-dash-006) **Upgrade banner dismissed** — per account, on this browser.

**Results:** Dismissed banners stay hidden on this browser for this account.

**Errors and troubleshooting:** None.

**Limitations:** The header **Upgrade** button and sidebar card stay visible.

**How it works:** localStorage `everypaisa.dismissedUpgradeBanner.<userId>` = `"1"`.

**Related features:** [F-SHELL-009](F-SHELL-009.md).

**Sources:** `apps/web/src/components/dashboard/UpgradeBanner.tsx:7`, `apps/web/src/components/dashboard/UpgradeBanner.tsx:23`, `apps/web/src/components/dashboard/UpgradeBanner.tsx:37`
