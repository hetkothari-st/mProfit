---
id: F-SHELL-006
title: "Light / dark theme"
module: "App layout and navigation"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-ADMIN"
settings: [S-SHELL-005]
related: [F-DASH-015]
---

[← App layout and navigation](../modules/app-layout-and-navigation.md) · [Index](../INDEX.md)

# Light / dark theme

`F-SHELL-006` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-ADMIN](../roles.md#r-admin)

**What it does:** The sun/moon button switches the whole app between dark and light colours.

**Why it exists:** Inferred from behavior: comfort and readability; downloaded reports also start in the app's current theme.

**Where to find it:** Top bar → sun/moon button (tooltip **Switch to light mode** / **Switch to dark mode**).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-ADMIN](../roles.md#r-admin).

**Steps**
1. Click the button. The app switches theme immediately.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Switch to light mode** / **Switch to dark mode** | Icon button | Toggles theme | Never |

**Fields and rules:** None.

**Settings and toggles here:** [S-SHELL-005](../settings/app-layout-and-navigation.md#s-shell-005) **Theme** — dark (default) or light; remembered on this browser.

**Results:** The page, charts and the browser's theme colour (`#0d0d0d` dark, `#fafafa` light) change. The Dashboard export dialog's **Appearance** choice starts on the current theme.

**Errors and troubleshooting:** None.

**Limitations:** Not synced between devices; there is no "follow system setting" option.

**How it works:** Stored in localStorage `everypaisa.theme`; applied by toggling the `dark` class on the page root on load and on every change.

**Related features:** [F-DASH-015](F-DASH-015.md).

**Sources:** `apps/web/src/components/layout/Header.tsx:151`, `apps/web/src/stores/theme.store.ts:9`, `apps/web/src/stores/theme.store.ts:18`, `apps/web/src/stores/theme.store.ts:27`
