---
id: F-SHELL-005
title: "Header and user menu"
module: "App layout and navigation"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-ADMIN"
settings: [S-SHELL-005, S-SHELL-006]
related: [F-SHELL-006, F-SHELL-007, F-SHELL-008, F-SHELL-009]
---

[← App layout and navigation](../modules/app-layout-and-navigation.md) · [Index](../INDEX.md)

# Header and user menu

`F-SHELL-005` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-ADMIN](../roles.md#r-admin)

**What it does:** The top bar shows today's date (in India time) and "Welcome back, <your name>" on the left, and on the right: **Upgrade**, the desktop-app download button, the family **Switch view** menu, the alerts bell, the theme toggle, **Hide values** and your initials. Clicking your initials opens the user menu with "Signed in as <email>", **Profile & Settings**, **AI connectors**, the managed-account entries (when relevant) and **Sign out**.

**Why it exists:** Inferred from behavior: account actions and app-wide switches in one place on every page.

**Where to find it:** Top of every signed-in page.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-ADMIN](../roles.md#r-admin); [R-MANAGER](../roles.md#r-manager) sees **Back to my account**.

**Steps**
1. Click your initials (or name and email on wider screens). The menu opens.
2. Click **Profile & Settings** to open Settings, or **AI connectors** to open the AI connectors page.
3. Click **Sign out**. You are signed out and taken to the sign-in page.
4. The menu closes when you click anywhere outside it, press Escape, or move to another page.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Date and "Welcome back, <name>" | Text | Today's date; your name ("Investor" if no name) | The welcome line is hidden below 640px; the date is hidden below 360px |
| **Upgrade** | Link | See [F-SHELL-009](F-SHELL-009.md) | Hidden on Pro/Advisor |
| Desktop-app download | Button | See [D-SHELL-003](../dependencies.md#d-shell-003) | Computers only, once a release exists |
| **Switch view** | Menu | See [D-SHELL-004](../dependencies.md#d-shell-004) | Only if you belong to a family |
| Bell (**Alerts & Reminders**) | Link | See [F-SHELL-008](F-SHELL-008.md) | Never |
| Sun/moon | Button | See [F-SHELL-006](F-SHELL-006.md) | Never |
| **Hide values** / **Show values** | Button | See [F-SHELL-007](F-SHELL-007.md) | Never |
| **Profile & Settings** | Menu item | Opens `/settings` | Never |
| **AI connectors** | Menu item | Opens `/settings/ai-connectors` | Never |
| **Back to my account** | Menu item | Stops managing a family member's account | Only while managing one |
| **Accounts you manage** list | Menu items | Switch into a managed member's account | Only if you keep accounts for family members; the one you are in is disabled |
| **Sign out** | Menu item | Ends the session | Never |

**Fields and rules:** None.

**Settings and toggles here:** None (theme and Hide values are separate features: [S-SHELL-005](../settings/app-layout-and-navigation.md#s-shell-005), [S-SHELL-006](../settings/app-layout-and-navigation.md#s-shell-006)).

**Results:** **Sign out** tells the server to revoke your refresh session, clears the session from this browser and opens `/login`. If the server call fails, you are still signed out on this browser.

**Errors and troubleshooting:** None shown — sign-out never shows an error.

**Limitations:** There is no global search and no notifications panel in the header; the bell opens the Alerts page.

**How it works:** Logout calls `POST /api/auth/logout` with the stored refresh token, ignores any failure, then clears local session state. The managed-accounts list is fetched as you (never as the managed person) and cached for 60 seconds.

**Related features:** [F-SHELL-006](F-SHELL-006.md), [F-SHELL-007](F-SHELL-007.md), [F-SHELL-008](F-SHELL-008.md), [F-SHELL-009](F-SHELL-009.md), [D-SHELL-003](../dependencies.md#d-shell-003), [D-SHELL-004](../dependencies.md#d-shell-004), [D-SHELL-005](../dependencies.md#d-shell-005), [D-SHELL-006](../dependencies.md#d-shell-006).

**Sources:** `apps/web/src/components/layout/Header.tsx:29`, `apps/web/src/components/layout/Header.tsx:51`, `apps/web/src/components/layout/Header.tsx:60`, `apps/web/src/components/layout/Header.tsx:103`, `apps/web/src/components/layout/Header.tsx:214`, `apps/web/src/components/layout/Header.tsx:221`, `apps/web/src/components/layout/Header.tsx:229`, `apps/web/src/components/layout/Header.tsx:236`, `apps/web/src/components/layout/Header.tsx:261`
