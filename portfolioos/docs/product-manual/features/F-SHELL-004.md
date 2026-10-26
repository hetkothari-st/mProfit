---
id: F-SHELL-004
title: "Phone navigation (tab bar, drawer, swipe)"
module: "App layout and navigation"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-ADMIN"
settings: []
related: [F-SHELL-001]
---

[← App layout and navigation](../modules/app-layout-and-navigation.md) · [Index](../INDEX.md)

# Phone navigation (tab bar, drawer, swipe)

`F-SHELL-004` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-ADMIN](../roles.md#r-admin)

**What it does:** On screens narrower than 768px the sidebar is replaced by a bottom tab bar with **Dashboard**, **Portfolios**, **Transactions**, **Analytics** and **More**. **More** (or the menu button at the top left) opens the full sidebar as a drawer from the left. You can also swipe right anywhere on a page to open the drawer and swipe left on the drawer to close it.

**Why it exists:** Inferred from behavior: the four most-used pages are one tap away on phones; everything else is in the drawer.

**Where to find it:** Bottom of the screen and top-left menu button, phones only.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-ADMIN](../roles.md#r-admin).

**Steps**
1. Tap a tab to open that page; the active tab is highlighted.
2. Tap **More** (or the **Open navigation menu** button in the top bar). The drawer opens at the scroll position you left it.
3. Tap a link in the drawer; the page opens and the drawer closes.
4. To open the drawer by gesture, swipe right across the page; to close it, swipe left on the drawer or tap outside it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Dashboard**, **Portfolios**, **Transactions**, **Analytics** | Tabs | Open the page | Hidden on screens 768px and wider |
| **More** | Tab button | Opens the drawer | Same |
| **Open navigation menu** | Icon button (top bar) | Opens the drawer | Same |
| Swipe right / swipe left | Gesture | Opens / closes the drawer | Swipe right is ignored while a dialog is open or when the swipe starts inside a text field, slider, chart or sideways-scrolling table |

**Fields and rules:** A swipe counts only when it travels at least 60px sideways, drifts vertically no more than 0.6× that distance, and takes no longer than 800 ms.

**Settings and toggles here:** None.

**Results:** The drawer closes automatically whenever the page changes.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Swiping does nothing | The swipe started on a chart, a form field or a sideways-scrolling table, or a dialog is open | Swipe on another part of the page, or use **More** |

**Limitations:** The drawer's scroll position is remembered only until the page is reloaded.

**How it works:** Touch listeners are passive (they never block scrolling). The drawer is a sheet that is removed when closed; its list's scroll position is kept in memory under the key "mobile-drawer".

**Related features:** [F-SHELL-001](F-SHELL-001.md).

**Sources:** `apps/web/src/components/layout/MobileTabBar.tsx:5`, `apps/web/src/components/layout/MobileTabBar.tsx:44`, `apps/web/src/components/layout/MobileNavDrawer.tsx:22`, `apps/web/src/components/layout/AppShell.tsx:41`, `apps/web/src/components/layout/AppShell.tsx:49`, `apps/web/src/hooks/useSwipeGesture.ts:14`, `apps/web/src/hooks/useSwipeGesture.ts:36`, `apps/web/src/components/layout/Header.tsx:92`
