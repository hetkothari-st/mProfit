[Index](../INDEX.md)

# Settings — App layout and navigation

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-shell-001"></a>
### Collapse sidebar
| Attribute | Value |
|---|---|
| Control type | Icon toggle (**Collapse sidebar** / **Expand sidebar**) |
| Location | Sidebar, next to the logo |
| Purpose | Fold the sidebar into a 72px icon rail |
| Default | Expanded (source: `apps/web/src/components/layout/Sidebar.tsx:13` — only the stored value "true" folds it) |
| Values | Folded: icons only, names on hover · Expanded: full 256px sidebar |
| Depends on | Screen width: honoured only at 1024px and wider; 768–1023px is always folded; below 768px the sidebar is a drawer |
| Persists | This device only |
| Stored in | localStorage `sidebar_collapsed` |
| Backend effect | None |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-ADMIN](../roles.md#r-admin) |
| Sources | `apps/web/src/components/layout/Sidebar.tsx:9`, `apps/web/src/components/layout/Sidebar.tsx:20`, `apps/web/src/hooks/useMediaQuery.ts:36` |

<a id="s-shell-002"></a>
### Planning group open
| Attribute | Value |
|---|---|
| Control type | Heading toggle (**Planning**) |
| Location | Sidebar → Planning |
| Purpose | Show or fold Goals, Will Maker, Succession, Tax Planning, AI connectors |
| Default | Open (source: `apps/web/src/components/layout/PlanningNavGroup.tsx:19`) |
| Values | Open · Folded (a dot shows when the current page is inside) |
| Depends on | Not shown on the icon rail (icons always visible there) |
| Persists | This device only; if storage is blocked, for the current page view |
| Stored in | localStorage `sidebar_planning_open` ("1"/"0") |
| Backend effect | None |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-ADMIN](../roles.md#r-admin) |
| Sources | `apps/web/src/components/layout/PlanningNavGroup.tsx:15`, `apps/web/src/components/layout/PlanningNavGroup.tsx:25` |

<a id="s-shell-003"></a>
### By value / My order
| Attribute | Value |
|---|---|
| Control type | Text toggle |
| Location | Sidebar → Asset Classes heading |
| Purpose | Sort asset classes by how much you hold, or by your own order |
| Default | By value (source: `apps/web/src/hooks/useSidebarClassValues.ts:54`) |
| Values | By value: largest first, empty classes last and faded · My order: saved order ([S-SHELL-004](../settings/app-layout-and-navigation.md#s-shell-004)) |
| Depends on | Hidden while editing; editing always shows the saved order |
| Persists | This device only |
| Stored in | localStorage `everypaisa.sidebar.assetSort` ("manual" for My order) |
| Backend effect | By value reads dashboard net worth, bank accounts and real-estate summary |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-ADMIN](../roles.md#r-admin) |
| Sources | `apps/web/src/hooks/useSidebarClassValues.ts:50`, `apps/web/src/components/layout/AssetClassSectionList.tsx:104`, `apps/web/src/lib/sidebarClassValues.ts:113` |

<a id="s-shell-004"></a>
### Asset class order and visibility
| Attribute | Value |
|---|---|
| Control type | Drag handles, eye toggles, remove buttons, **Add asset class** (edit mode) |
| Location | Sidebar → Asset Classes → **Edit** |
| Purpose | Choose which asset classes show, in what order, and add optional classes |
| Default | Bank Accounts, Stocks, F & O, Mutual Funds, FDs & RDs, Gold & Silver, PPF & EPF, Real Estate, Rental, Vehicles, Insurance, Loans, Credit Cards, Others — all visible; Bonds, Crypto, Forex, NPS, Post Office absent (source: `packages/api/src/services/account/userPreferences.service.ts:10`, `packages/shared/src/types/preferences.ts:17`) |
| Values | Each class: visible or hidden, position; optional classes: present or absent |
| Depends on | — |
| Persists | Yes — on your account (all devices) |
| Stored in | `User.preferences.assetSections` (with `assetSectionsVersion` 2) |
| Backend effect | Hidden classes are also removed from the Dashboard's Top holdings, Net worth breakdown and Real Estate/Vehicles/Insurance cards (mapping caveats in DOCUMENTATION_GAPS.md) |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-ADMIN](../roles.md#r-admin) ([R-MANAGER](../roles.md#r-manager) changes the managed person's) |
| Sources | `apps/web/src/stores/assetSections.store.ts:92`, `packages/api/src/controllers/userPreferences.controller.ts:13`, `packages/api/src/services/account/userPreferences.service.ts:76`, `apps/web/src/pages/dashboard/DashboardPage.tsx:336` |

<a id="s-shell-005"></a>
### Theme
| Attribute | Value |
|---|---|
| Control type | Icon toggle (**Switch to light mode** / **Switch to dark mode**) |
| Location | Top bar |
| Purpose | Dark or light colours |
| Default | Dark (source: `apps/web/src/stores/theme.store.ts:18`) |
| Values | Dark · Light |
| Depends on | — |
| Persists | This device only |
| Stored in | localStorage `everypaisa.theme` |
| Backend effect | None; report downloads start on the current theme |
| Who can change | Everyone signed in |
| Sources | `apps/web/src/stores/theme.store.ts:27`, `apps/web/src/components/layout/Header.tsx:151` |

<a id="s-shell-006"></a>
### Hide values
| Attribute | Value |
|---|---|
| Control type | Icon toggle (**Hide values** / **Show values**) |
| Location | Top bar |
| Purpose | Cover amounts and numbers with grey bars |
| Default | Off (source: `apps/web/src/stores/privacy.store.ts:13`) |
| Values | On: numbers masked app-wide (not some chart axes) · Off: shown |
| Depends on | — |
| Persists | This device only |
| Stored in | localStorage `everypaisa.privacy` |
| Backend effect | None (display only) |
| Who can change | Everyone signed in |
| Sources | `apps/web/src/stores/privacy.store.ts:18`, `apps/web/src/components/layout/AppShell.tsx:91`, `apps/web/src/styles/globals.css:460` |
