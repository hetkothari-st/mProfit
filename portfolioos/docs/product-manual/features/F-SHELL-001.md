---
id: F-SHELL-001
title: "Sidebar navigation"
module: "App layout and navigation"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-ADMIN"
settings: [S-SHELL-001, S-SHELL-002, S-SHELL-003, S-SHELL-004]
related: [F-SHELL-002, F-SHELL-003, F-SHELL-004, F-SHELL-009]
---

[← App layout and navigation](../modules/app-layout-and-navigation.md) · [Index](../INDEX.md)

# Sidebar navigation

`F-SHELL-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-ADMIN](../roles.md#r-admin)

**What it does:** The sidebar lists every area of EveryPaisa as links. Clicking a link opens that page and highlights it (a thin accent bar on its left and bold text). The EveryPaisa logo at the top (with the caption "Wealth · Ledger") always opens the Dashboard. On large screens a button next to the logo folds the sidebar into a narrow icon rail and back.

**Why it exists:** Inferred from behavior: one fixed list of destinations, reachable from anywhere, so you never need to go back to the Dashboard to change area. The icon rail exists to give the page more room on smaller laptop screens (code comment: "In the md–lg tablet band there isn't room for the full 256px rail").

**Where to find it:** Left edge of every signed-in page on screens 768px wide and wider. On phones the same list opens as a drawer (see [F-SHELL-004](F-SHELL-004.md)).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-ADMIN](../roles.md#r-admin) — everyone signed in. Pages you open may still be locked by plan (see [F-SHELL-009](F-SHELL-009.md)).

**Steps**
1. Click any item in the sidebar. The page opens and the item is highlighted.
2. To fold the sidebar (screens 1024px and wider), click the panel icon next to the logo (**Collapse sidebar**). The sidebar becomes a 72px column of icons; hovering an icon shows its name.
3. Click the same button again (**Expand sidebar**) to restore the full 256px sidebar.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| EveryPaisa logo ("Go to dashboard") | Link | Opens `/dashboard` | Never |
| **Collapse sidebar** / **Expand sidebar** | Icon button | Folds or unfolds the sidebar; the choice is remembered on this browser | Hidden below 1024px wide; between 768px and 1023px the sidebar is always the icon rail |
| Family tree (family name, member rows) | Links | Open `/family` or a member page | Shown only if you belong to a family (documented in the Family chapter) |
| **Overview**: Dashboard, Analytics, Portfolios, Family, Income, Portfolio Score, Advisor, Transactions, Cash Activity | Links | Open the page | Never |
| **Planning** group: Goals, Will Maker, Succession, Tax Planning, AI connectors | Links | Open the page | Group can be folded ([F-SHELL-003](F-SHELL-003.md)) |
| **Asset Classes** list | Links | Open the asset-class page | Customisable ([F-SHELL-002](F-SHELL-002.md)) |
| **Account Access** | Link | Opens `/settings/professional-access` | Never |
| **Client books** | Link | Opens `/ca` | Shown only when you hold at least one client grant (or the client list answers "two-factor required") |
| **Inbox**: Connect your Gmail | Link | Opens `/ingestion` | Never |
| **Tools**: Reports, Import, Connectors, CAS, Accounting, Split Expenses, EMI Calculator, Documents, Alerts, Settings | Links | Open the page | Never |
| Upgrade card | Link | Opens `/pricing` ([F-SHELL-009](F-SHELL-009.md)) | Hidden on Pro/Advisor |
| Version label "v0.5.0" | Text | Shows the web app version | Hidden when the sidebar is folded |

**Fields and rules:** None — navigation only.

**Settings and toggles here:** [S-SHELL-001](../settings/app-layout-and-navigation.md#s-shell-001) **Collapse sidebar** — on: icon rail on screens 1024px and wider; off: full sidebar. Remembered on this browser only. [S-SHELL-002](../settings/app-layout-and-navigation.md#s-shell-002) (Planning group) and [S-SHELL-003](../settings/app-layout-and-navigation.md#s-shell-003)/[S-SHELL-004](../settings/app-layout-and-navigation.md#s-shell-004) (Asset Classes order and visibility) also live in the sidebar.

**Results:** The chosen page opens. The page area scrolls back to the top when you move to a different page; pressing the browser Back button returns you to where you were scrolled on that earlier page. A link to a section (an address ending in `#name`) scrolls to that section.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| The collapse button is missing | Your window is narrower than 1024px | Widen the window; between 768px and 1023px the sidebar is always folded |
| **Client books** is missing | You hold no client grant | Nothing to fix — it appears once someone gives you access to their books |

**Limitations:** There is no search box in the sidebar or anywhere in the app, and there are no keyboard shortcuts for moving between pages (only Escape closes menus, the assistant and sidebar edit mode). The collapsed/expanded choice is stored per browser, not on your account.

**How it works:** The lists come from fixed configuration in the web app. The sidebar polls the professional client list every 30 seconds (and whenever the tab regains focus) only to decide whether **Client books** exists. The collapsed state is the localStorage key `sidebar_collapsed` (`"true"`/`"false"`); a media query for 1024px decides whether it is honoured. Scroll position of the page area is recorded per history entry while you scroll and restored on Back/Forward.

**Related features:** [F-SHELL-002](F-SHELL-002.md), [F-SHELL-003](F-SHELL-003.md), [F-SHELL-004](F-SHELL-004.md), [F-SHELL-009](F-SHELL-009.md), [D-SHELL-001](../dependencies.md#d-shell-001) (family tree), [D-SHELL-002](../dependencies.md#d-shell-002) (Client books).

**Sources:** `apps/web/src/components/layout/SidebarNav.tsx:54`, `apps/web/src/components/layout/SidebarNav.tsx:88`, `apps/web/src/components/layout/SidebarNav.tsx:163`, `apps/web/src/components/layout/SidebarNav.tsx:193`, `apps/web/src/components/layout/navItems.tsx:78`, `apps/web/src/components/layout/navItems.tsx:94`, `apps/web/src/components/layout/navItems.tsx:102`, `apps/web/src/components/layout/Sidebar.tsx:9`, `apps/web/src/components/layout/Sidebar.tsx:20`, `apps/web/src/hooks/useMediaQuery.ts:36`, `apps/web/src/components/layout/AppShell.tsx:64`
