[Index](../INDEX.md)

# App layout and navigation

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

Every page you see after signing in sits inside the same frame: a sidebar on the left (a drawer on phones), a top bar, the page itself, a bottom tab bar on phones, and the floating AI Assistant button. This chapter covers that frame and the controls in it that work on every page.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-SHELL-001](../features/F-SHELL-001.md) | Sidebar navigation | Live | The sidebar lists every area of EveryPaisa as links. |
| [F-SHELL-002](../features/F-SHELL-002.md) | Asset Classes sidebar customisation | Live | Lets you choose which asset classes appear in the sidebar, in what order, and whether they are sorted by how much you hold. |
| [F-SHELL-003](../features/F-SHELL-003.md) | Planning group fold/unfold | Live | The Planning heading in the sidebar folds and unfolds the group holding Goals, Will Maker, Succession, Tax Planning and AI connectors. |
| [F-SHELL-004](../features/F-SHELL-004.md) | Phone navigation (tab bar, drawer, swipe) | Live | On screens narrower than 768px the sidebar is replaced by a bottom tab bar with Dashboard, Portfolios, Transactions, Analytics and More. |
| [F-SHELL-005](../features/F-SHELL-005.md) | Header and user menu | Live | The top bar shows today's date (in India time) and "Welcome back, <your name>" on the left, and on the right: Upgrade, the desktop-app … |
| [F-SHELL-006](../features/F-SHELL-006.md) | Light / dark theme | Live | The sun/moon button switches the whole app between dark and light colours. |
| [F-SHELL-007](../features/F-SHELL-007.md) | Hide values (privacy mode) | Live | The eye button in the top bar hides amounts, percentages and counts across the app by covering them with grey bars, so you can use … |
| [F-SHELL-008](../features/F-SHELL-008.md) | Alerts bell with unread count | Live | The bell in the top bar opens the Alerts & Reminders page and shows a badge with how many unread alerts you have (up to "99+"). |
| [F-SHELL-009](../features/F-SHELL-009.md) | Upgrade prompts (header button, sidebar card, lock card) | Live | Three prompts lead to the plans page. |
| [F-SHELL-010](../features/F-SHELL-010.md) | Page error screen | Live | If a page fails while drawing, EveryPaisa replaces just that page with "Something went wrong on this screen — Your data is safe. |

Settings for this module: [settings/app-layout-and-navigation.md](../settings/app-layout-and-navigation.md)

### What this area doesn't do
- There is no global search and no command palette.
- There are no app-wide keyboard shortcuts; Escape only closes menus, the AI panel (or shrinks it first) and the sidebar's edit mode.
- There is no notifications drop-down; the bell opens the Alerts page.
- Theme, sidebar folding, the Planning group and By value / My order are not saved to your account — only the asset-class order and visibility are.
- You cannot rename sidebar items or add your own links.
