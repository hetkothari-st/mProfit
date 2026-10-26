# EveryPaisa User Manual — Core shell, Dashboard, Portfolios, Transactions, Bank Accounts, Alerts, AI Assistant

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): App layout and navigation, AI Assistant, Dashboard, Portfolios, Transactions, Bank Accounts, Alerts & Reminders (batch B10 fragment; merged into the full manual)

## Contents
- [App layout and navigation](#app-layout-and-navigation)
- [AI Assistant](#ai-assistant)
- [Dashboard](#dashboard)
- [Portfolios](#portfolios)
- [Transactions](#transactions)
- [Bank Accounts](#bank-accounts)
- [Alerts & Reminders](#alerts--reminders)
- [Roles and profiles](#roles-and-profiles)
- [Glossary](#glossary)

<!-- BEGIN MODULES -->
## App layout and navigation

Every page you see after signing in sits inside the same frame: a sidebar on the left (a drawer on phones), a top bar, the page itself, a bottom tab bar on phones, and the floating AI Assistant button. This chapter covers that frame and the controls in it that work on every page.

### Sidebar navigation <!-- F-SHELL-001 -->

**What it does:** The sidebar lists every area of EveryPaisa as links. Clicking a link opens that page and highlights it (a thin accent bar on its left and bold text). The EveryPaisa logo at the top (with the caption "Wealth · Ledger") always opens the Dashboard. On large screens a button next to the logo folds the sidebar into a narrow icon rail and back.

**Why it exists:** Inferred from behavior: one fixed list of destinations, reachable from anywhere, so you never need to go back to the Dashboard to change area. The icon rail exists to give the page more room on smaller laptop screens (code comment: "In the md–lg tablet band there isn't room for the full 256px rail").

**Where to find it:** Left edge of every signed-in page on screens 768px wide and wider. On phones the same list opens as a drawer (see F-SHELL-004).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO, R-ADMIN — everyone signed in. Pages you open may still be locked by plan (see F-SHELL-009).

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
| **Planning** group: Goals, Will Maker, Succession, Tax Planning, AI connectors | Links | Open the page | Group can be folded (F-SHELL-003) |
| **Asset Classes** list | Links | Open the asset-class page | Customisable (F-SHELL-002) |
| **Account Access** | Link | Opens `/settings/professional-access` | Never |
| **Client books** | Link | Opens `/ca` | Shown only when you hold at least one client grant (or the client list answers "two-factor required") |
| **Inbox**: Connect your Gmail | Link | Opens `/ingestion` | Never |
| **Tools**: Reports, Import, Connectors, CAS, Accounting, Split Expenses, EMI Calculator, Documents, Alerts, Settings | Links | Open the page | Never |
| Upgrade card | Link | Opens `/pricing` (F-SHELL-009) | Hidden on Pro/Advisor |
| Version label "v0.5.0" | Text | Shows the web app version | Hidden when the sidebar is folded |

**Fields and rules:** None — navigation only.

**Settings and toggles here:** S-SHELL-001 **Collapse sidebar** — on: icon rail on screens 1024px and wider; off: full sidebar. Remembered on this browser only. S-SHELL-002 (Planning group) and S-SHELL-003/S-SHELL-004 (Asset Classes order and visibility) also live in the sidebar.

**Results:** The chosen page opens. The page area scrolls back to the top when you move to a different page; pressing the browser Back button returns you to where you were scrolled on that earlier page. A link to a section (an address ending in `#name`) scrolls to that section.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| The collapse button is missing | Your window is narrower than 1024px | Widen the window; between 768px and 1023px the sidebar is always folded |
| **Client books** is missing | You hold no client grant | Nothing to fix — it appears once someone gives you access to their books |

**Limitations:** There is no search box in the sidebar or anywhere in the app, and there are no keyboard shortcuts for moving between pages (only Escape closes menus, the assistant and sidebar edit mode). The collapsed/expanded choice is stored per browser, not on your account.

**How it works:** The lists come from fixed configuration in the web app. The sidebar polls the professional client list every 30 seconds (and whenever the tab regains focus) only to decide whether **Client books** exists. The collapsed state is the localStorage key `sidebar_collapsed` (`"true"`/`"false"`); a media query for 1024px decides whether it is honoured. Scroll position of the page area is recorded per history entry while you scroll and restored on Back/Forward.

**Related features:** F-SHELL-002, F-SHELL-003, F-SHELL-004, F-SHELL-009, D-SHELL-001 (family tree), D-SHELL-002 (Client books).

**Sources:** `apps/web/src/components/layout/SidebarNav.tsx:54`, `apps/web/src/components/layout/SidebarNav.tsx:88`, `apps/web/src/components/layout/SidebarNav.tsx:163`, `apps/web/src/components/layout/SidebarNav.tsx:193`, `apps/web/src/components/layout/navItems.tsx:78`, `apps/web/src/components/layout/navItems.tsx:94`, `apps/web/src/components/layout/navItems.tsx:102`, `apps/web/src/components/layout/Sidebar.tsx:9`, `apps/web/src/components/layout/Sidebar.tsx:20`, `apps/web/src/hooks/useMediaQuery.ts:36`, `apps/web/src/components/layout/AppShell.tsx:64`

### Asset Classes sidebar customisation <!-- F-SHELL-002 -->

**What it does:** Lets you choose which asset classes appear in the sidebar, in what order, and whether they are sorted by how much you hold. You can drag classes into your own order, hide classes you don't use, add the optional classes (Bonds, Crypto, Forex, NPS, Post Office) and remove them again. Your saved order and hidden classes also control the Dashboard: holdings, pie slices and summary cards of hidden classes are left out there.

**Why it exists:** Inferred from behavior and code comments: most people hold only a few of the 19 classes; optional classes are "absent (not hidden) until they do" so the list stays short, and "By value" puts what matters most at the top.

**Where to find it:** Sidebar → **Asset Classes** heading (full-width sidebar only; the buttons are not shown on the icon rail or while folded).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO, R-ADMIN.

**Steps**
1. Click **Edit** next to **Asset Classes**. Each class shows a drag handle, an eye button and (for optional classes) an × button; hidden classes appear faded and struck through.
2. Drag a class by its handle (**Drag to reorder**) to a new position, or use the keyboard (focus the handle, Space, arrow keys).
3. Click the eye (**Hide section** / **Show section**) to hide or show a class.
4. For Bonds, Crypto, Forex, NPS or Post Office, click × (**Remove <class>**) to take it off the sidebar.
5. Click **Done**. The button reads **Saving…** while it saves; the sidebar then shows your new list. Press Escape instead to cancel without saving.
6. To add an optional class, click **Add asset class** (shown only when at least one optional class is not in your list) and pick it. It is added at the end and saved at once.
7. Click **By value** / **My order** to switch sorting.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **By value** / **My order** | Text button | Switches between largest-first sorting and your saved order | Hidden while editing |
| **Edit** | Text button | Enters edit mode | Replaced by **Done** while editing |
| **Done** (**Saving…**) | Text button | Saves order and visibility | Disabled while saving |
| **Drag to reorder** handle | Drag handle | Moves the class | Edit mode only |
| **Hide section** / **Show section** | Icon button | Toggles visibility | Edit mode only |
| **Remove <class>** (×) | Icon button | Removes an optional class from your list | Edit mode only; optional classes only |
| **+ N hidden** | Text button | Opens edit mode to show hidden classes | Shown only when at least one class is hidden |
| **Add asset class** | Button with a list | Adds an optional class | Shown only when an optional class is not yet in your list (and after your list has loaded) |
| Escape key | Keyboard | Cancels the edit | Edit mode only |

**Fields and rules:** None typed. Server accepts a list of `{key, visible, order}` items; order must be a whole number 0 or more.

**Settings and toggles here:** S-SHELL-003 **By value / My order** — By value (the starting choice): biggest class first, classes with nothing in them below and shown faded; My order: your saved order. Stored on this browser. S-SHELL-004 **Asset class order and visibility** — saved on your account, so it follows you to every device; hidden classes are also removed from the Dashboard.

**Results:** The sidebar shows your order; hidden classes disappear from the sidebar and from the Dashboard's holdings list, pie and summary cards. Optional classes you remove are no longer offered as hidden — they return to **Add asset class**.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Red text under the heading (the server's error, or "Failed to save") | Saving the list failed | Click **Done** again; adding a class that fails to save is undone automatically |
| A class page exists but the class is not in the sidebar | It is an optional class you have not added, or it is hidden | Use **Add asset class**, or **Edit** → show it |

**Limitations:** In By value mode the sidebar ranks by: current value for assets, balance for bank accounts (all accounts, including closed ones), amount owed for loans and credit cards (by size, not sign), and yearly premium for insurance. While By value is on, dragging is not possible — editing always shows the saved order. The Dashboard pie maps some non-holding slices to the wrong sidebar entry (Vehicles follows **Others**, rental property follows **Real Estate**) — see DOCUMENTATION_GAPS.md.

**How it works:** Preferences are read from and written to `/api/user/preferences` (stored in the account's `preferences.assetSections`). On read, the server keeps your saved entries in saved order and appends any core class you have not seen yet (visible, at the end); optional classes are kept only if you added them after the "opt-in" change (version 2 of the saved format). Saving stamps the current version. Values for By value come from the dashboard net-worth figures, the bank-accounts list and the real-estate summary, and the list waits until they have loaded so it does not reshuffle. Ties keep your saved order.

**Related features:** F-SHELL-001, F-DASH-010, F-DASH-011, F-DASH-012.

**Sources:** `apps/web/src/components/layout/AssetClassSectionList.tsx:61`, `apps/web/src/components/layout/AssetClassSectionList.tsx:91`, `apps/web/src/components/layout/AssetClassSectionList.tsx:104`, `apps/web/src/components/layout/AssetClassSectionList.tsx:169`, `apps/web/src/components/layout/AssetClassSectionList.tsx:179`, `apps/web/src/components/layout/SortableAssetClassItem.tsx:44`, `apps/web/src/stores/assetSections.store.ts:71`, `apps/web/src/stores/assetSections.store.ts:92`, `apps/web/src/hooks/useSidebarClassValues.ts:50`, `apps/web/src/lib/sidebarClassValues.ts:85`, `apps/web/src/lib/sidebarClassValues.ts:113`, `packages/api/src/controllers/userPreferences.controller.ts:7`, `packages/api/src/services/account/userPreferences.service.ts:45`, `packages/shared/src/types/preferences.ts:17`

### Planning group fold/unfold <!-- F-SHELL-003 -->

**What it does:** The **Planning** heading in the sidebar folds and unfolds the group holding Goals, Will Maker, Succession, Tax Planning and AI connectors. When the group is folded and the page you are on is inside it, a small dot appears next to the heading.

**Why it exists:** Inferred from behavior: keeps forward-looking pages together and lets you shorten the sidebar.

**Where to find it:** Sidebar → **Planning** heading.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO, R-ADMIN.

**Steps**
1. Click **Planning**. The five links hide and the arrow points right.
2. Click it again. The links show and the arrow points down.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Planning** | Heading button | Folds/unfolds the group | On the icon rail the five icons are always shown and there is no heading |

**Fields and rules:** None.

**Settings and toggles here:** S-SHELL-002 **Planning group open** — open (default) or folded; remembered on this browser.

**Results:** The group stays as you left it the next time you open the app in this browser.

**Errors and troubleshooting:** None — if the browser blocks storage, the group starts open and your choice lasts until the page reloads.

**Limitations:** Per browser, not per account.

**How it works:** localStorage key `sidebar_planning_open` (`"1"` open, `"0"` folded); any value other than `"0"` means open.

**Related features:** F-SHELL-001.

**Sources:** `apps/web/src/components/layout/PlanningNavGroup.tsx:15`, `apps/web/src/components/layout/PlanningNavGroup.tsx:38`, `apps/web/src/components/layout/PlanningNavGroup.tsx:59`

### Phone navigation (tab bar, drawer, swipe) <!-- F-SHELL-004 -->

**What it does:** On screens narrower than 768px the sidebar is replaced by a bottom tab bar with **Dashboard**, **Portfolios**, **Transactions**, **Analytics** and **More**. **More** (or the menu button at the top left) opens the full sidebar as a drawer from the left. You can also swipe right anywhere on a page to open the drawer and swipe left on the drawer to close it.

**Why it exists:** Inferred from behavior: the four most-used pages are one tap away on phones; everything else is in the drawer.

**Where to find it:** Bottom of the screen and top-left menu button, phones only.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO, R-ADMIN.

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

**Related features:** F-SHELL-001.

**Sources:** `apps/web/src/components/layout/MobileTabBar.tsx:5`, `apps/web/src/components/layout/MobileTabBar.tsx:44`, `apps/web/src/components/layout/MobileNavDrawer.tsx:22`, `apps/web/src/components/layout/AppShell.tsx:41`, `apps/web/src/components/layout/AppShell.tsx:49`, `apps/web/src/hooks/useSwipeGesture.ts:14`, `apps/web/src/hooks/useSwipeGesture.ts:36`, `apps/web/src/components/layout/Header.tsx:92`

### Header and user menu <!-- F-SHELL-005 -->

**What it does:** The top bar shows today's date (in India time) and "Welcome back, <your name>" on the left, and on the right: **Upgrade**, the desktop-app download button, the family **Switch view** menu, the alerts bell, the theme toggle, **Hide values** and your initials. Clicking your initials opens the user menu with "Signed in as <email>", **Profile & Settings**, **AI connectors**, the managed-account entries (when relevant) and **Sign out**.

**Why it exists:** Inferred from behavior: account actions and app-wide switches in one place on every page.

**Where to find it:** Top of every signed-in page.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO, R-ADMIN; R-MANAGER sees **Back to my account**.

**Steps**
1. Click your initials (or name and email on wider screens). The menu opens.
2. Click **Profile & Settings** to open Settings, or **AI connectors** to open the AI connectors page.
3. Click **Sign out**. You are signed out and taken to the sign-in page.
4. The menu closes when you click anywhere outside it, press Escape, or move to another page.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Date and "Welcome back, <name>" | Text | Today's date; your name ("Investor" if no name) | The welcome line is hidden below 640px; the date is hidden below 360px |
| **Upgrade** | Link | See F-SHELL-009 | Hidden on Pro/Advisor |
| Desktop-app download | Button | See D-SHELL-003 | Computers only, once a release exists |
| **Switch view** | Menu | See D-SHELL-004 | Only if you belong to a family |
| Bell (**Alerts & Reminders**) | Link | See F-SHELL-008 | Never |
| Sun/moon | Button | See F-SHELL-006 | Never |
| **Hide values** / **Show values** | Button | See F-SHELL-007 | Never |
| **Profile & Settings** | Menu item | Opens `/settings` | Never |
| **AI connectors** | Menu item | Opens `/settings/ai-connectors` | Never |
| **Back to my account** | Menu item | Stops managing a family member's account | Only while managing one |
| **Accounts you manage** list | Menu items | Switch into a managed member's account | Only if you keep accounts for family members; the one you are in is disabled |
| **Sign out** | Menu item | Ends the session | Never |

**Fields and rules:** None.

**Settings and toggles here:** None (theme and Hide values are separate features: S-SHELL-005, S-SHELL-006).

**Results:** **Sign out** tells the server to revoke your refresh session, clears the session from this browser and opens `/login`. If the server call fails, you are still signed out on this browser.

**Errors and troubleshooting:** None shown — sign-out never shows an error.

**Limitations:** There is no global search and no notifications panel in the header; the bell opens the Alerts page.

**How it works:** Logout calls `POST /api/auth/logout` with the stored refresh token, ignores any failure, then clears local session state. The managed-accounts list is fetched as you (never as the managed person) and cached for 60 seconds.

**Related features:** F-SHELL-006, F-SHELL-007, F-SHELL-008, F-SHELL-009, D-SHELL-003, D-SHELL-004, D-SHELL-005, D-SHELL-006.

**Sources:** `apps/web/src/components/layout/Header.tsx:29`, `apps/web/src/components/layout/Header.tsx:51`, `apps/web/src/components/layout/Header.tsx:60`, `apps/web/src/components/layout/Header.tsx:103`, `apps/web/src/components/layout/Header.tsx:214`, `apps/web/src/components/layout/Header.tsx:221`, `apps/web/src/components/layout/Header.tsx:229`, `apps/web/src/components/layout/Header.tsx:236`, `apps/web/src/components/layout/Header.tsx:261`

### Light / dark theme <!-- F-SHELL-006 -->

**What it does:** The sun/moon button switches the whole app between dark and light colours.

**Why it exists:** Inferred from behavior: comfort and readability; downloaded reports also start in the app's current theme.

**Where to find it:** Top bar → sun/moon button (tooltip **Switch to light mode** / **Switch to dark mode**).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO, R-ADMIN.

**Steps**
1. Click the button. The app switches theme immediately.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Switch to light mode** / **Switch to dark mode** | Icon button | Toggles theme | Never |

**Fields and rules:** None.

**Settings and toggles here:** S-SHELL-005 **Theme** — dark (default) or light; remembered on this browser.

**Results:** The page, charts and the browser's theme colour (`#0d0d0d` dark, `#fafafa` light) change. The Dashboard export dialog's **Appearance** choice starts on the current theme.

**Errors and troubleshooting:** None.

**Limitations:** Not synced between devices; there is no "follow system setting" option.

**How it works:** Stored in localStorage `everypaisa.theme`; applied by toggling the `dark` class on the page root on load and on every change.

**Related features:** F-DASH-015.

**Sources:** `apps/web/src/components/layout/Header.tsx:151`, `apps/web/src/stores/theme.store.ts:9`, `apps/web/src/stores/theme.store.ts:18`, `apps/web/src/stores/theme.store.ts:27`

### Hide values (privacy mode) <!-- F-SHELL-007 -->

**What it does:** The eye button in the top bar hides amounts, percentages and counts across the app by covering them with grey bars, so you can use EveryPaisa while someone can see your screen. Click again (**Show values**) to reveal them.

**Why it exists:** Code comment: "Privacy mode: replace numeric values with clean redaction bars." Inferred: for screen-sharing and public places.

**Where to find it:** Top bar → eye button (**Hide values** / **Show values**).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO, R-ADMIN.

**Steps**
1. Click **Hide values**. The icon becomes a crossed-out eye and numbers turn into grey bars; +/− signs are hidden too.
2. Click **Show values** to reveal them.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Hide values** / **Show values** | Icon button | Toggles privacy mode | Never |

**Fields and rules:** None.

**Settings and toggles here:** S-SHELL-006 **Hide values** — off (default) or on; remembered on this browser. Separate from the Dashboard's own net-worth eye (S-DASH-002).

**Results:** Text keeps its place on the page but becomes unreadable; the Dashboard's portfolio chart axis and tooltips show "•••".

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Some chart axis labels still show amounts | Chart axes and tooltips are drawn as graphics and only some charts check this setting | Known limitation (below) |

**Limitations:** Masking is done by styling, so values remain in the page (copy-paste is blocked on masked text). The Net worth over time chart's axis and tooltip and the bank balance-history chart's axis are not masked — see DOCUMENTATION_GAPS.md.

**How it works:** When on, the app frame gets the `privacy-mask` style, which makes the text of money, number and percentage elements transparent over a grey pill. Stored in localStorage `everypaisa.privacy`.

**Related features:** F-DASH-002, F-DASH-005, F-DASH-009, F-BANK-007.

**Sources:** `apps/web/src/components/layout/Header.tsx:162`, `apps/web/src/stores/privacy.store.ts:13`, `apps/web/src/components/layout/AppShell.tsx:91`, `apps/web/src/styles/globals.css:460`, `apps/web/src/styles/globals.css:473`, `apps/web/src/pages/dashboard/DashboardPage.tsx:974`

### Alerts bell with unread count <!-- F-SHELL-008 -->

**What it does:** The bell in the top bar opens the Alerts & Reminders page and shows a badge with how many unread alerts you have (up to "99+").

**Why it exists:** Inferred from behavior: a constant reminder that something needs your attention, on every page.

**Where to find it:** Top bar → bell (tooltip **Alerts & Reminders**).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO, R-ADMIN.

**Steps**
1. Click the bell. `/alerts` opens.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Alerts & Reminders** (bell) | Link | Opens `/alerts` | Never; the badge is hidden at 0 |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** The badge counts active (not dismissed) unread alerts; numbers above 99 show "99+".

**Errors and troubleshooting:** None.

**Limitations:** The count refreshes every 5 minutes, and immediately after you mark or create alerts on the Alerts page; changes made elsewhere may take up to 5 minutes to show. Dashboard alerts (F-DASH-003) are computed live and are not counted here.

**How it works:** `GET /api/alerts/unread-count` counts your alerts with `isActive = true` and `isRead = false`, polled every 5 minutes.

**Related features:** F-ALERT-001, F-ALERT-002.

**Sources:** `apps/web/src/components/layout/Header.tsx:69`, `apps/web/src/components/layout/Header.tsx:135`, `apps/web/src/components/layout/Header.tsx:143`, `packages/api/src/services/notifications/alerts.service.ts:52`

### Upgrade prompts (header button, sidebar card, lock card) <!-- F-SHELL-009 -->

**What it does:** Three prompts lead to the plans page. The **Upgrade** button in the top bar and the upgrade card at the bottom of the sidebar show on every page unless you are on Pro/Advisor. The card names the next plan: **Go Plus** ("Full reports, AI insights, more portfolios") on Free, **Go Family** ("Share your portfolio with family") on Plus, **Go Pro/Advisor** ("Full accounting module, unlimited clients") on Family. A section your plan does not include shows a lock card: "<feature> is locked — Upgrade to <plan> to unlock <feature>." with **View plans** (or, in its compact form, **Upgrade**), drawn over a blurred preview of the section.

**Why it exists:** Code comment: "showing what's behind the paywall drives upgrades better than hiding the section outright, which just reads as a bug."

**Where to find it:** Top bar (**Upgrade**), sidebar footer (upgrade card), and inside any locked section.

**Who can use it:** Shown to R-FREE, R-PLUS, R-FAMILY (and R-ADMIN by their plan). Hidden for R-PRO.

**Steps**
1. Click **Upgrade**, the upgrade card, or **View plans**. The Pricing page opens.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Upgrade** | Link | Opens `/pricing` | Hidden on Pro/Advisor; label hidden below 640px (icon only) |
| **Go Plus** / **Go Family** / **Go Pro/Advisor** | Link card | Opens `/pricing` | Hidden on Pro/Advisor; icon only when the sidebar is folded |
| **View plans** / **Upgrade** (lock card) | Button link | Opens `/pricing` | Shown only when your plan is below the feature's minimum plan |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** None until you buy a plan on the Pricing page (documented in the account chapter).

**Errors and troubleshooting:** None.

**Limitations:** The prompts read the plan stored in your current session, which is refreshed at sign-in and token refresh (every 15 minutes by default); after an upgrade or expiry the prompts can lag until then. Administrators see prompts by their own plan — there is no admin bypass of plan locks.

**How it works:** Plan names come from the session's effective plan. Lock cards compare it with the feature's minimum plan from the shared plan table (`meetsMinTier`).

**Related features:** D-SHELL-007 (Pricing and checkout), F-DASH-016.

**Sources:** `apps/web/src/components/layout/Header.tsx:114`, `apps/web/src/components/layout/UpgradeSidebarCard.tsx:5`, `apps/web/src/components/layout/UpgradeSidebarCard.tsx:21`, `apps/web/src/components/common/LockedFeature.tsx:50`, `apps/web/src/components/common/LockedFeature.tsx:59`, `apps/web/src/components/common/LockedFeature.tsx:64`, `packages/api/src/services/auth/auth.service.ts:65`

### Page error screen <!-- F-SHELL-010 -->

**What it does:** If a page fails while drawing, EveryPaisa replaces just that page with "Something went wrong on this screen — Your data is safe. Try again, or reload the page if it keeps happening." with **Try again** and **Reload**. The sidebar and top bar stay, so you can go elsewhere. If the failure is outside the page area, the whole window shows the same message with only **Reload**.

**Why it exists:** Code comment: without it "the user is left on a blank white screen."

**Where to find it:** Appears in place of a failing page.

**Who can use it:** Everyone signed in.

**Steps**
1. Click **Try again** to draw the page again, or **Reload** to reload the browser tab.
2. Or click another sidebar link — moving to another page clears the error.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Try again** | Button | Re-draws the page | Not shown on the whole-window version |
| **Reload** | Button | Reloads the browser tab | Never |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Nothing is changed in your data.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Something went wrong on this screen" | A display error on that page | **Try again**, then **Reload**; if it persists, report the page to support |

**Limitations:** The error is written only to the browser console; no report is sent to EveryPaisa.

**How it works:** A page-level error boundary wraps every page and resets when the address changes; a second, app-level boundary wraps the whole app.

**Related features:** None.

**Sources:** `apps/web/src/components/ErrorBoundary.tsx:29`, `apps/web/src/components/ErrorBoundary.tsx:35`, `apps/web/src/components/ErrorBoundary.tsx:56`, `apps/web/src/components/layout/AppShell.tsx:107`, `apps/web/src/main.tsx:67`

### What this area doesn't do
- There is no global search and no command palette.
- There are no app-wide keyboard shortcuts; Escape only closes menus, the AI panel (or shrinks it first) and the sidebar's edit mode.
- There is no notifications drop-down; the bell opens the Alerts page.
- Theme, sidebar folding, the Planning group and By value / My order are not saved to your account — only the asset-class order and visibility are.
- You cannot rename sidebar items or add your own links.

## AI Assistant

The Portfolio Assistant is a chat panel, available from a floating button on every page, that answers questions about your own finances using your EveryPaisa data. Full answers need the Plus plan or higher; on Free you can see one locked preview. It is a deployment option: it works only when the operator has configured an Anthropic API key and switched the feature on.

### AI Assistant launcher and panel <!-- F-AI-001 -->

**What it does:** A round button at the bottom-right of every page (**Open AI Assistant**, tooltip "Ask the AI Assistant") opens the assistant panel. Until you dismiss it, a bubble beside the button first says "New — Meet your Portfolio Assistant. Tap to ask anything about your portfolio." and, after 6 seconds, rotates through "Try asking" questions every 12 seconds; tapping the bubble opens the panel and sends that question. The panel docks in the corner (full screen on phones) and can be expanded into a large centred window.

**Why it exists:** Code comment: the teaser exists "To catch the user's eye … so the first interaction is a real answer, not a blank prompt."

**Where to find it:** Floating button, bottom-right of every signed-in page (above the tab bar on phones).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (R-ADMIN by their plan). The button is shown to everyone, including when the operator has the assistant switched off.

**Steps**
1. Click the floating button. The panel opens with your most recent chat (a first chat is created for you if you have none).
2. Optionally click the bubble's question instead — the panel opens and sends it once the chat has loaded.
3. Click the expand icon (**Open the big window**) for the large window; click it again (**Shrink to the corner (Esc)**) or click the dimmed page to go back.
4. Press Escape: in the big window it first shrinks the panel; pressed again (or **Close (Esc)**) it closes the panel.
5. Click × on the bubble (**Dismiss**) to stop the teaser for the rest of this browser session.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Open AI Assistant** | Floating button | Opens the panel | Hidden while the panel is open; on phones it slides away while you scroll down and returns when you scroll up |
| Teaser bubble ("Meet your Portfolio Assistant." / "Try asking") | Button | Opens the panel and sends the shown question | Hidden after **Dismiss**, while the panel is open, or while scrolled away on phones; on phones it shows the welcome once for 6 seconds and then hides for the session |
| **Dismiss** (×) | Icon button | Hides the teaser for this browser session | — |
| **Open the big window** / **Shrink to the corner (Esc)** | Icon button | Expands/shrinks the panel | Hidden below 640px |
| **Close (Esc)** | Icon button | Closes the panel | Never |
| Escape key | Keyboard | Shrinks, then closes | — |

**Fields and rules:** None here (see F-AI-003 for the question box).

**Settings and toggles here:** S-AI-001 **Assistant big window** — remembered on this browser. S-AI-002 **Assistant teaser dismissed** — this browser session only.

**Results:** The panel shows the AI-use notice first if you have not accepted it (F-AI-002), otherwise your chat.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A red line such as "Request failed with status code 404" at the bottom of the panel | The operator has not enabled the assistant (no Anthropic key, or the switch is off — it is off by default) | Ask the operator to enable it; there is nothing to do in the app |
| "Failed to load conversation." | Loading your chats failed | Close and reopen the panel |

**Limitations:** The floating button does not check whether the assistant is enabled — see DOCUMENTATION_GAPS.md.

**How it works:** On open, the panel loads your chat list, suggested questions (`/api/assistant/suggested`, up to 4) and quota (`/api/assistant/quota`) in parallel, creating a first chat if the list is empty, then loads the newest chat's messages. If the teaser question API fails or returns nothing, four built-in questions are used ("How am I doing overall?", "What's my portfolio XIRR?", "Am I overweight in IT?", "Should I sell any holding for LTCG?"). Every `/api/assistant` endpoint answers 404 `ai_assistant_disabled` unless the server has `ANTHROPIC_API_KEY` set and `ENABLE_LLM_INSIGHTS` is `true`.

**Related features:** F-AI-002, F-AI-003, F-AI-005.

**Sources:** `apps/web/src/components/ai/AssistantButton.tsx:31`, `apps/web/src/components/ai/AssistantButton.tsx:37`, `apps/web/src/components/ai/AssistantButton.tsx:78`, `apps/web/src/components/ai/AssistantButton.tsx:98`, `apps/web/src/components/ai/AssistantButton.tsx:150`, `apps/web/src/components/ai/AIAssistant.tsx:80`, `apps/web/src/components/ai/AIAssistant.tsx:134`, `apps/web/src/hooks/useAIAssistant.ts:110`, `packages/api/src/routes/aiAssistant.routes.ts:58`, `packages/api/src/config/env.ts:118`

### AI-use notice acceptance <!-- F-AI-002 -->

**What it does:** Before your first question, the panel shows "How EveryPaisa uses AI in advice" with six short points (Where AI is used, What the AI does not decide, What the AI sees, Who is responsible, Its limits, Records and changes), a **Read the full notice** link and **I understand**. The assistant will not answer until you accept the current version; a new version of the notice asks again.

**Why it exists:** Code comment: SEBI Investment Adviser Regulations 15(14) and 18(9) — clients must be told how AI is used in advice.

**Where to find it:** Inside the assistant panel, before the chat, until accepted.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Open the assistant. The notice appears.
2. Optionally click **Read the full notice** (opens `/legal/ai-use`).
3. Click **I understand**. The chat appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Read the full notice** | Link | Opens the AI-use page | — |
| **I understand** | Button | Records your acceptance | Shows a spinner while saving |

**Fields and rules:** None.

**Settings and toggles here:** S-AI-003 **AI-use notice accepted** — stored on your account per notice version (currently 2026-10-21).

**Results:** An audit record "ai_disclosure_acknowledged" is written for the version; the chat opens.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "We couldn’t save that. Please try again." | Saving the acceptance failed | Click **I understand** again |
| "Please read and accept how we use AI in advice before asking a question." | A question was sent without an accepted notice (e.g. the notice check failed to load) | Close and reopen the panel and accept the notice |

**Limitations:** If the notice status cannot be loaded, the panel shows the chat; the server still refuses questions until acceptance.

**How it works:** Status is read from the audit log (action `ai_disclosure_acknowledged`, resource `AiDisclosure:<version>`). Accepting posts the version shown; the server rejects a version that is not the current one.

**Related features:** F-AI-003, D-AI-001 (AI-use legal page).

**Sources:** `apps/web/src/components/ai/AiDisclosureCard.tsx:10`, `apps/web/src/components/ai/AiDisclosureCard.tsx:54`, `apps/web/src/hooks/useAiDisclosure.ts:23`, `packages/api/src/ai/aiDisclosure.ts:14`, `packages/api/src/routes/aiAssistant.routes.ts:214`, `packages/shared/src/aiDisclosure.ts:16`

### Ask the assistant (streamed answers, cards, daily quota) <!-- F-AI-003 -->

**What it does:** You type a question (up to 2,000 characters) or tap a suggested one, and the assistant writes its answer word by word, based on your holdings, XIRR, tax position, goals, loans and other data in the current view (your own, or the family's in family view). An answer can end with a small card: a holding (current value, XIRR), a goal (target, projected, gap), a statistic, or a suggested action. After each answer, up to four "Try next" questions appear. The header shows how many questions you have left today.

**Why it exists:** Code comment: the assistant is "designed as a financial planner agent, not a chatbot" — answers from your live data instead of generic advice.

**Where to find it:** Assistant panel → question box at the bottom ("Ask about your XIRR, tax, holdings, goals…").

**Who can use it:** R-PLUS (100 questions a day), R-FAMILY (200), R-PRO (500). R-FREE gets one locked preview only (F-AI-004). While managing a family member's account (R-MANAGER) the assistant does not work — see Limitations.

**Steps**
1. Type a question and press Enter or click send (**Send (Enter)**). Your message appears; three pulsing dots show "Thinking through your numbers…" in the header.
2. The answer streams in. Any card appears under it when the answer finishes.
3. Tap a "Try next" question to ask it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Question box | Text input | Your question | Disabled while an answer is streaming, after the daily limit ("Daily limit reached — resets tomorrow"), or after the free preview ("Upgrade to keep chatting") |
| **Send (Enter)** | Button | Sends | Disabled when the box is empty or disabled |
| Suggested question tiles ("Try one of these") | Buttons | Send that question | Disabled while streaming, after the daily limit or after the free preview; empty chats only |
| "Try next" questions | Buttons | Send that question | Hidden while streaming or after the free preview |
| **How we use AI** | Link | Opens `/legal/ai-use` | Hidden on Free |
| **Prefer your own ChatGPT or Claude? Connect it** | Link | Opens `/settings/ai-connectors` | — |
| Quota "<used>/<limit>" and "<n> questions left today" | Text | Today's usage | Hidden on Free |
| Links inside answers | Links | Open in-app pages or https sites | Other link types are shown as plain text |
| Action card button | Button | Shows the action's label | Does nothing when clicked — see Limitations |

**Fields and rules:** Question: required, 1–2,000 characters (the box stops at 2,000).

**Settings and toggles here:** None.

**Results:** Your question and the answer are saved in the chat, with a record of the data and tools the answer used. The chat's title becomes the first 60 characters of your first question (if it was still "New chat"). One question is taken from today's allowance.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "You've hit the daily limit of <n> questions. Resets tomorrow." | Daily quota used | Wait until the reset (00:00 UTC, which is 05:30 IST) or upgrade |
| "Please read and accept how we use AI in advice before asking a question." | Notice not accepted | Accept the notice (F-AI-002) |
| "Chat session not found" | The chat was deleted elsewhere, or you are managing a family member's account | Start a **New chat**; switch back to your own account |
| "Part of the response was lost (<n> unreadable event(s))." | Some streamed pieces could not be read | Ask again |
| "HTTP <status>" or another message in the red line | The server rejected or failed the request | Try again later |

**Limitations:** Answers are AI-written and their content cannot be verified from code. The daily allowance resets at 00:00 UTC (05:30 IST), not at Indian midnight. If an answer fails before any text arrives, the question is given back to your allowance. The question is sent without the "acting as" header, so while managing a family member's account the chat fails — see DOCUMENTATION_GAPS.md. A session that expires mid-chat is not refreshed by the chat request itself. The action card's button has no action.

**How it works:** `POST /api/assistant/chat` streams server-sent events (`token`, `card`, `locked`, `done`, `error`). Before calling the model the server checks the notice, checks the quota against your effective plan, reserves one question atomically (so parallel requests cannot exceed the cap), classifies the question, builds context for your scope (family view header honoured), loads the last 10 messages of the chat, your adviser profile and matching knowledge passages, and saves your question. The model (setting `llm.assistant_model`, else `LLM_ASSISTANT_MODEL`) may call read-only tools up to 3 rounds and writes at most 2,048 tokens. The final answer and its context snapshot are saved; a card in the answer is sent as a separate event and never shown as raw text.

**Related features:** F-AI-002, F-AI-004, F-AI-005, D-AI-002 (AI connectors).

**Sources:** `apps/web/src/hooks/useAIAssistant.ts:254`, `apps/web/src/api/aiAssistant.api.ts:112`, `apps/web/src/api/aiAssistant.api.ts:118`, `apps/web/src/components/ai/AIAssistant.tsx:664`, `apps/web/src/components/ai/MessageBubble.tsx:37`, `apps/web/src/components/ai/PortfolioDataCard.tsx:10`, `apps/web/src/components/ai/PortfolioDataCard.tsx:149`, `packages/api/src/routes/aiAssistant.routes.ts:82`, `packages/api/src/routes/aiAssistant.routes.ts:278`, `packages/api/src/routes/aiAssistant.routes.ts:292`, `packages/api/src/routes/aiAssistant.routes.ts:309`, `packages/api/src/ai/rateLimit.ts:34`, `packages/api/src/ai/rateLimit.ts:48`, `packages/api/src/ai/claudeClient.ts:38`, `packages/api/src/ai/claudeClient.ts:42`

### Free plan locked preview <!-- F-AI-004 -->

**What it does:** On the Free plan the panel looks and behaves the same, and you can send one question. Its answer is shown as blurred grey bars with an **Upgrade to unlock** button instead of text. After that one preview — on any chat, device or browser — the question box, suggested questions and **New chat** are disabled, with "You've used your free preview — upgrade to ask unlimited questions →".

**Why it exists:** Code comment: lets Free users see "the full interactive experience … before revealing it's locked" without paying for an answer.

**Where to find it:** Assistant panel, Free plan.

**Who can use it:** R-FREE.

**Steps**
1. Ask a question. The thinking dots appear, then the blurred answer with **Upgrade to unlock**.
2. Click **Upgrade to unlock** or the footer link to open Pricing.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Upgrade to unlock** | Link | Opens `/pricing` | — |
| "You've used your free preview — upgrade to ask unlimited questions →" | Link | Opens `/pricing` | Shown after the preview |

**Fields and rules:** Same as F-AI-003.

**Settings and toggles here:** None.

**Results:** Your question and an empty "locked" answer are saved; no AI model is called and no allowance is used. The header reads "Free plan — upgrade to unlock full answers".

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "The AI Assistant requires a paid plan. Upgrade to unlock." | A second question was sent after the preview | Upgrade |

**Limitations:** One preview per account, ever.

**How it works:** The quota check returns `tier_locked` for Free (daily limit 0). The server checks whether any of your saved messages is marked locked; if none, it saves the question plus a locked empty answer and streams `locked` then `done`.

**Related features:** F-AI-003, F-SHELL-009.

**Sources:** `packages/api/src/routes/aiAssistant.routes.ts:225`, `packages/api/src/routes/aiAssistant.routes.ts:235`, `packages/api/src/routes/aiAssistant.routes.ts:257`, `packages/api/src/routes/aiAssistant.routes.ts:95`, `apps/web/src/components/ai/MessageBubble.tsx:419`, `apps/web/src/components/ai/AIAssistant.tsx:174`, `apps/web/src/components/ai/AIAssistant.tsx:728`

### Chat history (sessions) <!-- F-AI-005 -->

**What it does:** Keeps several separate chats. **Chat history** lists your chats, most recently used first; you can open one, start a **New chat**, rename a chat (pencil) or delete it (bin).

**Why it exists:** Code comment: "the multi-session mechanics every other AI chat product has".

**Where to find it:** Assistant panel header → clock icon (**Chat history**) and pen icon (**New chat**).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (Free: **New chat** is disabled after the free preview).

**Steps**
1. Click **Chat history**. "Your chats" lists your chats, most recently used first.
2. Click a chat to open it; the panel returns to the chat view.
3. Hover a chat and click the pencil (**Rename chat**), type a name, press Enter or click the tick (**Save**); Escape cancels.
4. Hover a chat and click the bin (**Delete chat**). It is deleted at once, without confirmation; if it was open, the next chat opens (or a new one is created).
5. Click **New chat** (header icon or the button at the top of the list) for an empty chat.
6. Click the back arrow (**Back to chat**) to leave the list.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Chat history** | Icon button | Shows the list | Chat view only |
| **New chat** | Icon button / button | Creates an empty chat | Disabled after the Free preview ("Upgrade to start a new chat") |
| Chat row | Button | Opens the chat | — |
| **Rename chat** | Icon | Edits the title | Appears on hover |
| **Save** | Icon button | Saves the title | Rename only |
| **Delete chat** | Icon | Deletes the chat and its messages | Appears on hover |
| **Back to chat** | Icon button | Returns to the chat | List view only |

**Fields and rules:** Chat title: 1–200 characters; an empty or unchanged title is ignored.

**Settings and toggles here:** None.

**Results:** Chats and messages are stored on the server, so they follow you between devices. New chats are titled "New chat" until the first question.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to start a new chat." / "Failed to delete chat." / "Failed to rename chat." | Request failed | Try again |
| "No chats yet." | No chats exist | Ask a question or click **New chat** |

**Limitations:** Delete has no undo. Chats you create while in family view are tagged with that family but listed with all your chats.

**How it works:** `/api/assistant/sessions` list/create/rename/delete, each checked against your user id; history `GET /sessions/:id/history`. Titles longer than 60 characters are cut with "…".

**Related features:** F-AI-003.

**Sources:** `apps/web/src/components/ai/AIAssistant.tsx:433`, `apps/web/src/components/ai/AIAssistant.tsx:493`, `apps/web/src/hooks/useAIAssistant.ts:193`, `apps/web/src/hooks/useAIAssistant.ts:211`, `apps/web/src/hooks/useAIAssistant.ts:237`, `packages/api/src/routes/aiAssistant.routes.ts:91`, `packages/api/src/routes/aiAssistant.routes.ts:129`, `packages/api/src/ai/chatSessions.ts:10`, `packages/api/src/ai/chatSessions.ts:11`, `packages/api/src/ai/chatSessions.ts:49`

### What this area doesn't do
- The assistant never changes your data — it only reads it.
- You cannot attach files or images to a question.
- There is no way to stop an answer while it is streaming.
- There is no export or share of a chat, and no feedback (thumbs up/down) on answers.
- Free users cannot buy single questions; full answers need Plus or higher.

## Dashboard

The Dashboard (`/dashboard`, also opened by `/` and the logo) is the first page after sign-in: your net worth, liabilities, trends, alerts, holdings and recent activity on one page. Most cards can be narrowed to one portfolio with the picker at the top; the ones that cannot are noted below.

### Dashboard page, portfolio filter and empty state <!-- F-DASH-001 -->

**What it does:** Shows the page "Dashboard — Your financial portrait" ("A complete, hand-curated view of every asset, liability, and signal — engineered for investors who read between the lines.") with a portfolio picker, **Export** and **Refresh** at the top. If you have no portfolio yet, it shows "No portfolios yet — Create your first portfolio to start tracking investments and other assets." with **Get started**. It also sends new accounts to the setup wizard.

**Why it exists:** Inferred from behavior: one overview of everything, with an easy way to look at a single portfolio.

**Where to find it:** **Overview → Dashboard** (route `/dashboard`); phone tab **Dashboard**; EveryPaisa logo.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (R-ADMIN by plan). In family view (R-FAMOWNER, R-FAMCONTRIB, R-FAMVIEWER) the figures are the family's; while managing an account (R-MANAGER) they are that person's.

**Steps**
1. Open the Dashboard. While loading, grey placeholder blocks show.
2. Pick **All portfolios (N)** or one portfolio in the picker. The cards marked "follows the picker" below update.
3. If you have no portfolios, click **Get started** to open the setup wizard.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Portfolio picker (**All portfolios (N)** / portfolio names) | Select | Narrows portfolio-based cards | Hidden when you have no portfolios |
| **Export** | Button | F-DASH-015 | Same |
| **Refresh** | Button | F-DASH-014 | Same |
| **Get started** | Button link | Opens `/onboarding` | Only when you have no portfolios |

**Fields and rules:** None.

**Settings and toggles here:** S-DASH-001 **Dashboard portfolio picker** — **All portfolios (N)** (default each visit) or one portfolio. Follows the picker: Total Net Worth's Investments figure and holdings count, Investment metric cards, Portfolio value over time, Net worth breakdown, Top holdings, the Liabilities' Net after debts (through net worth). Does not follow it: Net worth over time, Recent transactions, Vehicles/Real Estate/Insurance cards, loans and credit cards, the tax strip.

**Results:** None stored.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| You are sent to the setup wizard | You have no portfolio and this browser has never finished setup, or your account left setup unfinished | Finish or skip the wizard |
| "No portfolios yet" | No portfolio exists | **Get started**, or create one on Portfolios |

**Limitations:** The picker resets to all portfolios each time you open the Dashboard. The "setup finished" marker is per browser; a new browser with no portfolios on the account is sent to the wizard again.

**How it works:** The page loads `GET /api/portfolios` (family-aware). With at least one portfolio it sets the browser flag `onboarding_v2_done`; with none and no flag it redirects to `/onboarding`. A per-account browser flag `everypaisa.onboarding.inProgress.<userId>` also redirects there. A family banner (D-DASH-001) and the Free upgrade banner (F-DASH-016) sit at the top.

**Related features:** F-DASH-002 to F-DASH-018, D-DASH-001, D-DASH-002 (onboarding wizard).

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:340`, `apps/web/src/pages/dashboard/DashboardPage.tsx:346`, `apps/web/src/pages/dashboard/DashboardPage.tsx:366`, `apps/web/src/pages/dashboard/DashboardPage.tsx:482`, `apps/web/src/pages/dashboard/DashboardPage.tsx:512`, `apps/web/src/pages/dashboard/DashboardPage.tsx:518`, `apps/web/src/lib/onboardingProgress.ts:12`, `apps/web/src/App.tsx:164`

### Total Net Worth hero <!-- F-DASH-002 -->

**What it does:** The large card at the top shows **Total Net Worth · Consolidated** — hidden as "₹ • • • • • • •" until you click the small eye (**Show net worth**). Beneath it: today's date, your number of holdings and portfolios, and "All accounts" or "Filtered". A breakdown row shows **Investments** and, when they are above zero, **Real Estate**, **Vehicles** and **Sum Assured**.

**Why it exists:** Code comment: hidden by default "so a screen-share or co-worker glance doesn't reveal the headline number".

**Where to find it:** Dashboard, top card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; family roles see the family total.

**Steps**
1. Click the eye next to **Total Net Worth · Consolidated** (**Show net worth**). The amount appears.
2. Click again (**Hide net worth**) to hide it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Show net worth** / **Hide net worth** | Icon toggle | Reveals/hides the headline number | — |
| Tooltip on the label | Text | "Gross: investments + real estate + vehicles, before loans & credit-card liabilities." | — |

**Fields and rules:** None.

**Settings and toggles here:** S-DASH-002 **Net worth eye** — hidden (default every visit) or shown; not remembered. Independent of S-SHELL-006 **Hide values**, which masks the breakdown figures too.

**Results:** None stored.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| The card does not appear | Net-worth figures have not loaded or failed | Reload the page |
| Bank balances or a home you own are not in the total | They are not part of this figure (see Limitations) | — |

**Limitations:** Total Net Worth = Investments + Vehicles + Rental property values + money you lent that is still owed to you. It does not include bank account balances or properties recorded on the **Real Estate** page; **Sum Assured** is displayed but not added. The "Real Estate" figure here is the current value of properties on the **Rental** page. Only Investments follows the portfolio picker. Liabilities are not subtracted here — see **Net after debts** (F-DASH-004). See DOCUMENTATION_GAPS.md.

**How it works:** `GET /api/dashboard/net-worth?portfolioId=` returns gross `totalNetWorth`. Investments = sum over holdings of current value, or cost (total invested) when a holding has no price. Vehicles = sum of vehicle current values; rental = sum of rental property current values; loans given = outstanding amounts owed to you (counted only when you may see the LOAN category). In family view the server computes each member's figures (other members' filtered by your asset-class and category permissions) and adds them up. The holdings count comes from the portfolio summaries of the selected portfolio(s).

**Related features:** F-DASH-004, F-DASH-010, F-SHELL-007, D-DASH-003 (Rental), D-DASH-004 (Vehicles).

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:314`, `apps/web/src/pages/dashboard/DashboardPage.tsx:540`, `apps/web/src/pages/dashboard/DashboardPage.tsx:544`, `apps/web/src/pages/dashboard/DashboardPage.tsx:562`, `apps/web/src/pages/dashboard/DashboardPage.tsx:608`, `packages/api/src/routes/dashboard.routes.ts:13`, `packages/api/src/services/analytics/dashboard.service.ts:97`, `packages/api/src/services/analytics/dashboard.service.ts:110`, `packages/api/src/services/analytics/dashboard.service.ts:180`, `packages/api/src/services/analytics/dashboard.service.ts:470`, `packages/api/src/services/analytics/dashboard.service.ts:543`

### Dashboard alerts strip <!-- F-DASH-003 -->

**What it does:** Under the hero, up to four urgent items are listed, most urgent first, each with an icon by urgency, title, description and days left ("Overdue" when due today or past). Clicking an item opens its section. A button on the first item folds the strip into one line "N alerts — click to expand".

**Why it exists:** Inferred from behavior: puts expiries and dues that cost money if missed in front of you without opening the Alerts page.

**Where to find it:** Dashboard, below the hero and Portfolio Score card. Shown only when there is at least one item.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; family roles see members' items within their permissions.

**Steps**
1. Click an item ("Open section"). The related page opens.
2. Click the up-arrow on the first item (**Collapse alerts**) to fold the strip; click the folded bar (**Expand alerts**) to show it again.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Alert row ("Open section") | Link | Opens Insurance, Vehicles, Rental, Loans or Alerts | — |
| **Collapse alerts** | Icon button | Folds the strip | First row only |
| "N alerts — click to expand" (**Expand alerts**) | Button | Unfolds | Folded state only |

**Fields and rules:** None.

**Settings and toggles here:** S-DASH-005 **Alerts strip folded** — in this visit only; reloading shows it unfolded.

**Results:** None stored; these items are computed live and are separate from the Alerts page.

**Errors and troubleshooting:** None.

**Limitations:** At most 10 items are calculated and 4 shown. Items: vehicle Insurance/PUC/Fitness/Road Tax expiring within 30 days (or already expired); insurance premiums due within 30 days; one item for overdue rent receipts; one for pending traffic challans; each overdue loan EMI; each loan EMI due within 30 days. Credit-card dues, FD maturities and custom reminders are on the Alerts page, not here. In family view, items are listed member by member before the 10-item cut, so one member's items can push out another's.

**How it works:** Urgency: HIGH when 7 days or fewer remain, MEDIUM up to 15 days, LOW beyond; overdue rent and overdue EMIs are always HIGH, challans MEDIUM. Sorted HIGH, MEDIUM, LOW, then by days remaining. Days = whole days from now to the date, rounded up. Links: insurance → `/insurance`; vehicle expiry and challans → `/vehicles`; rent → `/rental`; EMI → `/loans`.

**Related features:** F-ALERT-001, D-DASH-003, D-DASH-004, D-DASH-005 (Insurance), D-DASH-006 (Loans).

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:55`, `apps/web/src/pages/dashboard/DashboardPage.tsx:322`, `apps/web/src/pages/dashboard/DashboardPage.tsx:640`, `apps/web/src/pages/dashboard/DashboardPage.tsx:663`, `apps/web/src/pages/dashboard/DashboardPage.tsx:669`, `apps/web/src/pages/dashboard/DashboardPage.tsx:683`, `packages/api/src/services/analytics/dashboard.service.ts:46`, `packages/api/src/services/analytics/dashboard.service.ts:153`, `packages/api/src/services/analytics/dashboard.service.ts:397`, `packages/api/src/services/analytics/dashboard.service.ts:458`, `packages/api/src/services/analytics/dashboard.service.ts:523`, `packages/api/src/services/analytics/dashboard.service.ts:658`

### Liabilities summary (Loans & credit cards) <!-- F-DASH-004 -->

**What it does:** When you owe anything, a card "Liabilities · FY <year> — Loans & credit cards" shows **Net after debts** ("Assets minus liabilities"), **Total outstanding** ("Across all debts"), **Monthly EMI** (with number of loans), **Card balance** (with number of cards) and **Interest paid YTD** (with "Principal: <amount>"). A footer shows "N EMI(s) overdue" and "Next EMI: <lender> on <date> — <amount>".

**Why it exists:** Inferred from behavior: the headline net worth is gross; this card shows what is left after debts.

**Where to find it:** Dashboard, below the alerts strip. Hidden when total liabilities are zero.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; family roles see members' loans/cards only with the LOAN / CREDIT_CARD categories.

**Steps**
1. Read the figures. Click **Manage** to open Loans.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Manage** | Link | Opens `/loans` | — |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** None stored.

**Errors and troubleshooting:** None.

**Limitations:** Loans and cards are not filtered by the portfolio picker; Net after debts subtracts all liabilities from the (possibly filtered) gross figure. Only ACTIVE loans and ACTIVE credit cards count.

**How it works:** Net after debts = Total Net Worth − (loan outstanding + card outstanding). Loan outstanding = opening balance of the first unpaid instalment in the loan's schedule (the principal when no schedule can be built). Monthly EMI = sum of the EMI amounts of active loans. Card balance = the card's recorded outstanding balance, or, when none is recorded, the total of its pending/partly paid statements. Interest and principal YTD = loan payments dated in the current financial year (April–March) that carry an interest or principal split. The next EMI is the soonest first-unpaid instalment within 30 days; an unpaid instalment dated before today counts as overdue.

**Related features:** F-DASH-002, D-DASH-006, D-DASH-007 (Credit Cards).

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:702`, `apps/web/src/pages/dashboard/DashboardPage.tsx:713`, `apps/web/src/pages/dashboard/DashboardPage.tsx:822`, `packages/api/src/services/analytics/dashboard.service.ts:239`, `packages/api/src/services/analytics/dashboard.service.ts:272`, `packages/api/src/services/analytics/dashboard.service.ts:299`, `packages/api/src/services/analytics/dashboard.service.ts:315`, `packages/api/src/services/analytics/dashboard.service.ts:471`

### Net worth over time chart <!-- F-DASH-005 -->

**What it does:** "Trend — Net worth over time" draws your net worth after liabilities from one snapshot per day, with the change over the chosen period ("+₹X (+Y%) this 1Y"). Choose **1M**, **3M**, **6M**, **1Y** (default) or **All**.

**Why it exists:** Code comment: "the 'look how far you've come' dashboard element."

**Where to find it:** Dashboard, below the Liabilities card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. Always your own figures — not the family's and not the selected portfolio.

**Steps**
1. Click a period button. The chart and change line redraw.
2. Hover (or touch) the line to see the date and value.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **1M**, **3M**, **6M**, **1Y**, **All** | Toggle buttons | Period of 30, 90, 180, 365 days or everything | — |

**Fields and rules:** None.

**Settings and toggles here:** S-DASH-004 **Net worth trend period** — default **1Y**; not remembered.

**Results:** None stored.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Come back tomorrow to see your net worth trend. We snapshot your net worth once a day." | Fewer than 2 snapshots in the period | Wait for more daily snapshots |
| "Couldn't load your net worth trend. Try again shortly." | Request failed | Reload later |
| "N of these days were priced from the last NAVs we had" and an estimate chip | Some snapshots were taken while fund prices were stale | No action — those points are estimates |

**Limitations:** One point per day, taken at 23:45 IST (F-DASH-018); today's changes appear tomorrow. The percentage is blank when the first value is zero. The chart's axis and tooltip are not hidden by **Hide values** — see DOCUMENTATION_GAPS.md.

**How it works:** `GET /api/intelligence/net-worth/history?period=` reads your snapshots from the start of the period (UTC date) onward. Change = last − first net-worth-after-liabilities; percent = change ÷ |first| × 100. Points flagged as not OK are marked "Net worth (estimate)" in the tooltip.

**Related features:** F-DASH-018.

**Sources:** `apps/web/src/components/dashboard/NetWorthTrendChart.tsx:13`, `apps/web/src/components/dashboard/NetWorthTrendChart.tsx:30`, `apps/web/src/components/dashboard/NetWorthTrendChart.tsx:124`, `apps/web/src/components/dashboard/NetWorthTrendChart.tsx:137`, `apps/web/src/components/dashboard/NetWorthTrendChart.tsx:145`, `apps/web/src/components/dashboard/NetWorthTrendChart.tsx:177`, `packages/api/src/controllers/intelligence.controller.ts:16`, `packages/api/src/services/analytics/netWorthHistory.service.ts:7`, `packages/api/src/services/analytics/netWorthHistory.service.ts:84`

### FX rates strip <!-- F-DASH-006 -->

**What it does:** A thin strip "FX" shows USD/INR, EUR/INR, GBP/INR and JPY/INR with two decimals and a source badge (green for RBI or FRANKFURTER, blue otherwise). Clicking it opens the Forex page.

**Why it exists:** Code comment: "Compact rates strip … quick glance + click-through to /forex".

**Where to find it:** Dashboard, below the net worth chart. Hidden when no rates are available.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Read the rates; click the strip to open `/forex`.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| FX strip | Link | Opens `/forex` | Hidden with no rates |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** None — the strip simply hides.

**Limitations:** Rates are shown, not used in Dashboard totals.

**How it works:** `GET /api/forex/ticker` for the four pairs, refreshed every 30 seconds.

**Related features:** D-DASH-008 (Forex).

**Sources:** `apps/web/src/pages/forex/DashboardFxStrip.tsx:11`, `apps/web/src/pages/forex/DashboardFxStrip.tsx:17`, `apps/web/src/pages/forex/DashboardFxStrip.tsx:24`, `apps/web/src/api/forex.api.ts:197`

### Tax strip (this financial year) <!-- F-DASH-007 -->

**What it does:** "Tax · FY <yyyy-yy>" shows this financial year's **Realised gain**, **Est. tax**, **LTCG exempt** (used / limit, when you have long-term equity gains) and **STCG** (when above zero), with **Report** (downloads a CA-ready capital-gains PDF) and **Details** (opens Tax Planning).

**Why it exists:** Inferred from behavior: a running reminder of tax from sales this year.

**Where to find it:** Dashboard, below the FX strip. Hidden while loading and when both realised gain and estimated tax are zero.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click **Report**. The button spins, then `capital-gains-tax-<fy>.pdf` downloads.
2. Click **Details** to open `/tax`.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Report** ("Download CA-ready tax report (PDF)") | Button | Downloads the PDF | Disabled while downloading |
| **Details** | Link | Opens `/tax` | — |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** A PDF file is saved by your browser.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not download the tax report" (or the server's message) | Download failed | Try again |

**Limitations:** Amounts of ₹1 crore or more show as "₹x.xxCr", ₹1 lakh or more as "₹x.xxL", smaller amounts rounded to whole rupees. The LTCG figure turns amber at 90% of the exemption; the red state for 100% never shows (see DOCUMENTATION_GAPS.md). The figures are cached for 10 minutes. The financial year is worked out from the UTC date.

**How it works:** `GET /api/tax/summary?fy=` for the figures; the PDF is fetched from `/api/tax/capital-gains-report` with your session.

**Related features:** D-DASH-009 (Tax Planning).

**Sources:** `apps/web/src/components/dashboard/DashboardTaxStrip.tsx:14`, `apps/web/src/components/dashboard/DashboardTaxStrip.tsx:31`, `apps/web/src/components/dashboard/DashboardTaxStrip.tsx:42`, `apps/web/src/components/dashboard/DashboardTaxStrip.tsx:47`, `apps/web/src/components/dashboard/DashboardTaxStrip.tsx:61`, `apps/web/src/components/dashboard/DashboardTaxStrip.tsx:138`, `apps/web/src/api/tax.api.ts:279`

### Investment metric cards <!-- F-DASH-008 -->

**What it does:** Four cards: **Portfolio value** ("<n> holdings"), **Total invested** (with "XIRR x% · TWR y%"), **Unrealised P&L** (with percentage) and **Today's change** (with percentage), for the portfolios in the picker.

**Why it exists:** Tooltips state each card's meaning: "Tradable + accrual holdings only. Excludes real estate, vehicles and insurance (those sit in Total Net Worth)."; "Sum of cost basis across all holdings (what you put in)."; "Current value minus invested, across holdings only. Accrual assets contribute earned interest; not annualized."; "Day move on market-priced holdings only (equities, MF, crypto, gold). Accrual/cost assets have no intraday change."

**Where to find it:** Dashboard, below the tax strip.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Card tooltips | Hover text | Explain the figure | — |

**Fields and rules:** None.

**Settings and toggles here:** S-DASH-001 (portfolio picker).

**Results:** None.

**Errors and troubleshooting:** None.

**Limitations:** The XIRR shown is a simple average of each portfolio's XIRR, not a combined XIRR (see DOCUMENTATION_GAPS.md); portfolios with too little history have no XIRR and are left out. TWR is account-wide and ignores the picker. "Today's change" uses the last two prices on record, which may not be today's and yesterday's (e.g. over a weekend). Percent signs show with two decimals; XIRR/TWR with one.

**How it works:** For each selected portfolio `GET /api/portfolios/:id/summary` returns: invested = sum of holding costs; value = sum of current values (cost when unpriced); P&L = value − invested; today's change = Σ (latest price − previous price) × quantity for stocks, mutual funds (NAV), crypto and gold/silver (spot); its % = change ÷ (value − change) × 100. The Dashboard adds the portfolios together exactly (decimal arithmetic). TWR comes from `GET /api/reports/xirr/user`.

**Related features:** F-PORT-004, D-DASH-010 (Reports XIRR).

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:375`, `apps/web/src/pages/dashboard/DashboardPage.tsx:412`, `apps/web/src/pages/dashboard/DashboardPage.tsx:451`, `apps/web/src/pages/dashboard/DashboardPage.tsx:476`, `apps/web/src/pages/dashboard/DashboardPage.tsx:867`, `apps/web/src/pages/dashboard/DashboardPage.tsx:875`, `apps/web/src/pages/dashboard/DashboardPage.tsx:890`, `apps/web/src/pages/dashboard/DashboardPage.tsx:901`, `packages/api/src/services/holdings/portfolio.service.ts:420`, `packages/api/src/services/holdings/portfolio.service.ts:440`, `packages/api/src/services/holdings/portfolio.service.ts:518`, `packages/api/src/services/holdings/portfolio.service.ts:534`

### Portfolio value over time chart <!-- F-DASH-009 -->

**What it does:** "Trajectory — Portfolio value over time" plots the market value of the selected portfolios day by day. Choose **1M**, **3M**, **6M**, **1Y** (default) or **All**.

**Why it exists:** Inferred from behavior: shows how your investments moved over time.

**Where to find it:** Dashboard, left of the Net worth breakdown.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click a period. The chart reloads.
2. Hover for "Market value" on a date.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **1M**, **3M**, **6M**, **1Y**, **All** | Toggle buttons | 30, 90, 180, 365 days, or from your first transaction | — |

**Fields and rules:** None.

**Settings and toggles here:** S-DASH-003 **Portfolio chart period** — default **1Y**; not remembered. S-DASH-001 picker applies. S-SHELL-006 hides the axis and tooltip values ("•••").

**Results:** Missing stock prices for the period may be downloaded and stored for everyone.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Add transactions to see your portfolio value over time" | No transactions in the selected portfolios | Add transactions |

**Limitations:** Only stocks are valued at historical daily closing prices; mutual funds and every other holding are carried at cost on past days, and the chart jumps to live values on today's point. Invested money is not plotted. Axis labels use ₹…Cr, ₹…L, ₹…K.

**How it works:** For each selected portfolio, `GET /api/portfolios/:id/historical-valuation?days=` replays transactions in date order (buys add quantity and cost; sells remove average cost; bonus adds quantity at no cost; splits add quantity) and values each day. If stored stock prices cover less than 40% of the expected days, daily prices are fetched from Yahoo first. Today's point is replaced by the live value of current holdings. The Dashboard adds the series of all selected portfolios by date.

**Related features:** F-DASH-008, F-PORT-008.

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:47`, `apps/web/src/pages/dashboard/DashboardPage.tsx:306`, `apps/web/src/pages/dashboard/DashboardPage.tsx:386`, `apps/web/src/pages/dashboard/DashboardPage.tsx:943`, `apps/web/src/pages/dashboard/DashboardPage.tsx:990`, `packages/api/src/services/holdings/portfolio.service.ts:690`, `packages/api/src/services/holdings/portfolio.service.ts:705`, `packages/api/src/services/holdings/portfolio.service.ts:762`, `packages/api/src/services/holdings/portfolio.service.ts:838`, `packages/api/src/services/holdings/portfolio.service.ts:874`

### Net worth breakdown pie <!-- F-DASH-010 -->

**What it does:** A ring chart "Net worth breakdown" with one slice per kind of holding (Equity, Mutual Fund, Fixed Deposit, …) plus Vehicles, Real Estate (rental properties) and Loans given, and a list of each slice's value and percentage.

**Why it exists:** Inferred from behavior: shows how your wealth is spread across asset types.

**Where to find it:** Dashboard, right of the portfolio chart.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps:** Not applicable — view only (hover a slice for "<amount> (<percent>%)").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Slices and legend rows | Chart | Show value and share | Slices with zero value and classes hidden in the sidebar are left out |

**Fields and rules:** None.

**Settings and toggles here:** S-SHELL-004 (sidebar visibility) hides slices; S-DASH-001 picker narrows the holdings slices.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Add holdings to see breakdown" | Nothing to show | Add holdings |
| Hiding **Vehicles** in the sidebar does not remove the Vehicles slice (hiding **Others** does) | Known mapping defect | See DOCUMENTATION_GAPS.md |

**Limitations:** Percentages are of gross net worth (holdings + vehicles + rental + loans given). In family view, slice sizes in the ring use the first member's value for a merged slice while the list shows the combined value — see DOCUMENTATION_GAPS.md.

**How it works:** Uses `allocationBreakdown` from `GET /api/dashboard/net-worth`: holdings grouped by asset class (value or cost when unpriced), then vehicles, rental, loans given, sorted largest first; percent = slice ÷ total × 100.

**Related features:** F-DASH-002, F-SHELL-002.

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:218`, `apps/web/src/pages/dashboard/DashboardPage.tsx:503`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1002`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1010`, `packages/api/src/services/analytics/dashboard.service.ts:329`, `packages/api/src/services/analytics/dashboard.service.ts:386`, `packages/api/src/services/analytics/dashboard.service.ts:677`

### Top holdings <!-- F-DASH-011 -->

**What it does:** "Top holdings — Ranked by current value · N positions" lists your 10 largest holdings across the selected portfolios: rank, asset (and symbol), class, quantity, average cost, value, and unrealised P&L with percentage. Clicking a row opens that holding's page or its asset-class page.

**Why it exists:** Inferred from behavior: the positions that matter most at a glance.

**Where to find it:** Dashboard, below the charts.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click a row (or press Enter on it) to open it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Holding row ("Open <name>") | Row link | FD → its FD page; physical gold, gold bond, gold ETF → its gold page; crypto → its crypto page; other classes → their list page (NPS, PMS, AIF, private equity, REIT, InvIT, art, cash, other → **Others**) | Not clickable when the class has no page |
| **View all** | Link | Opens `/holdings` — this address does not exist and shows "This page doesn't exist" | — |

**Fields and rules:** None.

**Settings and toggles here:** S-SHELL-004 hides classes; S-DASH-001 picker.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| **View all** shows "This page doesn't exist" | The link points to a page that is not in the app | Use **Portfolios → Inspect**, or the asset-class pages |
| "Add transactions to see your top holdings" | No holdings | Add transactions |

**Limitations:** Ranked by current value, or by cost when there is no price ("cost basis" under the value, "no price" in the P&L column). Non-market holdings show "accrued" (interest-earning) or "at cost" under the P&L (phones: "accr"/"cost"). Quantities show up to 4 decimals.

**How it works:** Holdings of each selected portfolio (`GET /api/portfolios/:id/holdings`) are combined, sorted by value (cost when unpriced), filtered by sidebar visibility, and the first 10 shown.

**Related features:** F-PORT-004, F-SHELL-002.

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:259`, `apps/web/src/pages/dashboard/DashboardPage.tsx:418`, `apps/web/src/pages/dashboard/DashboardPage.tsx:502`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1057`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1061`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1226`, `apps/web/src/App.tsx:282`

### Real Estate, Vehicles and Insurance cards <!-- F-DASH-012 -->

**What it does:** Three cards. **Real Estate** (rental properties): Property value, Monthly rent ("active tenancies"), Income YTD, Net P&L YTD and "N overdue receipt(s)". **Vehicles**: Total value, Pending challans ("None" when zero) and up to four "Expiring soon" items, or "All documents up to date". **Insurance**: Total sum assured ("N active policies"), Annual premium ("per year total") and up to four "Upcoming premiums" ("Due now" or days), or "No premiums due in the next 30 days". Each card has **Manage**.

**Why it exists:** Inferred from behavior: summaries of the non-investment parts of your wealth.

**Where to find it:** Dashboard, below Top holdings. The cards follow your sidebar order; a card is hidden when its sidebar entry is hidden.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; family roles see members' items only with the RENTAL, VEHICLE, INSURANCE categories.

**Steps**
1. Click **Manage** on a card.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Manage** (Real Estate) | Link | Opens `/rental` | Card hidden when **Real Estate** is hidden in the sidebar |
| **Manage** (Vehicles) | Link | Opens `/vehicles` | Card hidden when **Vehicles** is hidden |
| **Manage** (Insurance) | Link | Opens `/insurance` | Card hidden when **Insurance** is hidden |

**Fields and rules:** None.

**Settings and toggles here:** S-SHELL-004 (order and visibility).

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No properties added yet." / "No vehicles added yet." / "No policies added yet." | Nothing recorded | Add items on those pages |

**Limitations:** The Real Estate card shows rental properties and opens Rental, but its position and visibility follow the **Real Estate** sidebar entry. Not filtered by the portfolio picker. Item colours: 7 days or fewer red, up to 15 amber, otherwise blue.

**How it works:** Income YTD = rent payment entries since 1 April; Net P&L YTD = that minus property expenses paid since 1 April (deposits and discounts are not income). Monthly rent = rent of active tenancies. Annual premium = each active policy's premium converted to a yearly amount. Upcoming premiums = active policies with next premium due within 30 days.

**Related features:** D-DASH-003, D-DASH-004, D-DASH-005.

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:1248`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1309`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1365`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1429`, `packages/api/src/services/analytics/dashboard.service.ts:184`, `packages/api/src/services/analytics/dashboard.service.ts:199`, `packages/api/src/services/analytics/dashboard.service.ts:222`, `packages/api/src/services/analytics/dashboard.service.ts:226`

### Recent transactions card <!-- F-DASH-013 -->

**What it does:** "Recent transactions" lists your 5 latest transactions: name, trade date · type, net amount and quantity @ price. **View all** opens Transactions.

**Why it exists:** Inferred from behavior: quick check that your latest entries or imports landed.

**Where to find it:** Dashboard, bottom.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click **View all** to open `/transactions`.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **View all** | Link | Opens `/transactions` | — |

**Fields and rules:** None.

**Settings and toggles here:** None (not filtered by the portfolio picker).

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Add a manual transaction to see activity here." | No transactions | Add one |

**Limitations:** Rows are not clickable here.

**How it works:** `GET /api/transactions?pageSize=5`, newest trade date first (then newest created).

**Related features:** F-TXN-001.

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:381`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1449`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1475`, `packages/api/src/services/holdings/transaction.service.ts:653`

### Refresh prices (dashboard) <!-- F-DASH-014 -->

**What it does:** **Refresh** fetches the latest prices for the stocks you hold and re-values all your holdings, then reloads the Dashboard.

**Why it exists:** Inferred from behavior: prices also update on a schedule (F-PORT-008); this lets you force it.

**Where to find it:** Dashboard header → **Refresh**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click **Refresh**. A spinner replaces the icon.
2. A message appears: "Updated N price(s) · M holding(s)" or "Data refreshed — no new prices available".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Refresh** | Button | Refreshes prices | Disabled while running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Stock prices and your holdings' current values, P&L and price dates are updated.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Refresh failed" (or the server's message) | Price source or server error | Try again later |

**Limitations:** Stock prices come from Yahoo; other holdings are re-valued from the latest stored prices (fund NAVs, crypto, gold arrive by their scheduled jobs).

**How it works:** `POST /api/assets/refresh-prices` → update Yahoo prices for held stocks, then refresh every holding's price; the Dashboard, portfolio and holdings caches are then reloaded.

**Related features:** F-PORT-005, F-PORT-008.

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:433`, `apps/web/src/pages/dashboard/DashboardPage.tsx:437`, `apps/web/src/pages/dashboard/DashboardPage.tsx:523`, `packages/api/src/controllers/assets.controller.ts:85`

### Export dashboard report <!-- F-DASH-015 -->

**What it does:** **Export** opens "Download Report" to download the Dashboard as a PDF or Excel file.

**Why it exists:** Inferred from behavior: share or keep a dated snapshot of the Dashboard.

**Where to find it:** Dashboard header → **Export**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. In family view you can pick the member (**Report for**); "Whole family" is not offered here.

**Steps**
1. Click **Export**.
2. (Family view) choose **Report for**.
3. Choose **Scope**: **All portfolios combined** or **Specific portfolio** (then pick one).
4. Choose **Format**: **PDF** or **Excel (.xlsx)**.
5. Choose **Appearance**: **Dark** or **Light (print)** ("· current" marks the app's theme).
6. Click **Download**. It reads **Preparing…**, then `everypaisa-dashboard-report<-member>.pdf` or `.xlsx` downloads and the dialog closes.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Report for** | Select | Whose dashboard | Family view only |
| **Scope** | Select | All portfolios or one | — |
| Portfolio picker ("— pick portfolio —") | Select | Chooses the portfolio | Only for **Specific portfolio** |
| **PDF** / **Excel (.xlsx)** | Toggle | File format | — |
| **Dark** / **Light (print)** | Toggle | Colours of the file | — |
| **Cancel** / **Download** | Buttons | Close / download | **Download** disabled while preparing, or for **Specific portfolio** with none picked |

**Fields and rules:** A specific portfolio must be picked when Scope is Specific portfolio.

**Settings and toggles here:** S-DASH-007 **Dashboard export options** — Scope (default All portfolios combined), Format (default PDF), Appearance (default current theme); not remembered.

**Results:** A file is downloaded; it includes "Data as of / Data checks" lines like other reports.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A browser pop-up with an error text | The export failed | Try again; check the portfolio still exists |

**Limitations:** For another family member, the whole book is always exported (Scope is ignored).

**How it works:** `GET /api/reports/dashboard-export?format=&theme=&scope=&portfolioId=`; a specific portfolio must belong to the person the report is about.

**Related features:** D-DASH-010.

**Sources:** `apps/web/src/components/reports/DownloadReportButton.tsx:38`, `apps/web/src/components/reports/DownloadReportButton.tsx:70`, `apps/web/src/components/reports/DownloadReportButton.tsx:175`, `apps/web/src/components/reports/DownloadReportButton.tsx:201`, `apps/web/src/components/reports/DownloadReportButton.tsx:221`, `apps/web/src/components/reports/DownloadReportButton.tsx:246`, `packages/api/src/routes/reports.routes.ts:103`, `packages/api/src/controllers/reports.controller.ts:515`, `packages/api/src/controllers/reports.controller.ts:533`

### Free plan upgrade banner <!-- F-DASH-016 -->

**What it does:** On the Free plan the Dashboard opens with "You're on the Free plan — Upgrade to Plus for the full tax report catalog, AA auto-import, multiple portfolios, and AI insights." with **See plans** and a close button.

**Why it exists:** Code comment: "Free-tier upsell on the Dashboard. Dismissible."

**Where to find it:** Top of the Dashboard (also on the empty Dashboard).

**Who can use it:** R-FREE.

**Steps**
1. Click **See plans** to open Pricing, or × (**Dismiss**) to hide it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **See plans** | Button link | Opens `/pricing` | — |
| **Dismiss** (×) | Icon button | Hides the banner | — |

**Fields and rules:** None.

**Settings and toggles here:** S-DASH-006 **Upgrade banner dismissed** — per account, on this browser.

**Results:** Dismissed banners stay hidden on this browser for this account.

**Errors and troubleshooting:** None.

**Limitations:** The header **Upgrade** button and sidebar card stay visible.

**How it works:** localStorage `everypaisa.dismissedUpgradeBanner.<userId>` = `"1"`.

**Related features:** F-SHELL-009.

**Sources:** `apps/web/src/components/dashboard/UpgradeBanner.tsx:7`, `apps/web/src/components/dashboard/UpgradeBanner.tsx:23`, `apps/web/src/components/dashboard/UpgradeBanner.tsx:37`

### Gmail connect and scan progress cards <!-- F-DASH-017 -->

**What it does:** If you have not connected Gmail, a card "Auto-import from Gmail — Scan your inbox for contract notes and statements — you approve each document before import." offers **Connect Gmail**. If Gmail is connected and an inbox scan is running, a card "Scanning your Gmail inbox…" shows "<processed> / <total> messages • N financial document(s) found", a progress bar and **Review docs**.

**Why it exists:** Inferred from behavior: invites automatic import and shows its progress where you land.

**Where to find it:** Dashboard, below the alerts strip area.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click **Connect Gmail**. You are sent to Google to approve access (continued in the Gmail chapter).
2. While a scan runs, click **Review docs** to open Reports → inbox imports.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Connect Gmail** | Button | Starts Google sign-in | Hidden when an active Gmail mailbox exists |
| **Review docs** | Button link | Opens `/reports?tab=inbox-imports` | Shown only while a scan is running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** See the Gmail chapter (D-DASH-011).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to start Gmail connect" (or the server's message) | Could not get the Google sign-in link | Try again; ask the operator if Google sign-in is configured |

**Limitations:** The progress card disappears when no scan is running.

**How it works:** `GET /api/mailboxes` (active Gmail mailbox?), `GET /api/gmail/auth-url`, and `GET /api/gmail/scan-jobs` polled every 3 seconds while a scan is in PENDING, LISTING, DOWNLOADING or CLASSIFYING.

**Related features:** D-DASH-011.

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:1499`, `apps/web/src/components/dashboard/ConnectGmailCard.tsx:8`, `apps/web/src/components/dashboard/ConnectGmailCard.tsx:24`, `apps/web/src/components/dashboard/GmailScanProgressCard.tsx:9`, `apps/web/src/components/dashboard/GmailScanProgressCard.tsx:18`, `apps/web/src/components/dashboard/GmailScanProgressCard.tsx:49`

### Daily net-worth snapshot <!-- F-DASH-018 -->

**What it does:** Every night at 23:45 India time, EveryPaisa records each active user's net worth (gross, liabilities, net after liabilities and the breakdown) for that day. These records draw the Net worth over time chart.

**Why it exists:** Code comment: "so the dashboard trend chart has a time series to render", scheduled after the last price updates of the day.

**Where to find it:** Not a page; results appear in **Dashboard → Net worth over time**.

**Who can use it:** Runs for every active account automatically.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** None.

**Settings and toggles here:** None for users. Operators can switch it off (`ENABLE_NET_WORTH_SNAPSHOT_CRON=false`).

**Results:** One snapshot per user per day; running again the same day replaces it.

**Errors and troubleshooting:** None visible — a failure for one user is logged and the others continue.

**Limitations:** Snapshots use your personal figures with all portfolios (no family, no filter). A backend endpoint `POST /api/intelligence/net-worth/snapshot` can take today's snapshot on demand but the app has no button for it.

**How it works:** For each active user, runs the same net-worth calculation as the Dashboard under that user's data context and upserts `NetWorthSnapshot (userId, asOf)`. A second run while one is in progress is skipped.

**Related features:** F-DASH-005.

**Sources:** `packages/api/src/jobs/netWorthSnapshotJob.ts:28`, `packages/api/src/jobs/netWorthSnapshotJob.ts:54`, `packages/api/src/jobs/netWorthSnapshotJob.ts:86`, `packages/api/src/jobs/netWorthSnapshotJob.ts:92`, `packages/api/src/controllers/intelligence.controller.ts:32`

### What this area doesn't do
- The Dashboard cannot be rearranged beyond the sidebar order/visibility of asset classes and the three summary cards.
- There is no "View all holdings" page — the **View all** link on Top holdings goes nowhere.
- Total Net Worth does not include bank balances or properties on the Real Estate page.
- You cannot pick custom date ranges for the charts — only 1M, 3M, 6M, 1Y and All.
- The portfolio picker is not remembered between visits.

## Portfolios

A portfolio is a named container for holdings and transactions (for example "Long Term Equity" or "Trading"). Portfolio groups bundle several of your portfolios into one combined read-only view. This chapter also covers the background price feeds and corporate-action processing that value every holding.

### Portfolios list <!-- F-PORT-001 -->

**What it does:** The Portfolios page ("Allocation — Portfolios: Group holdings by goal, strategy, or account. Bundle multiple portfolios into a family group for a consolidated view.") shows your groups under **Family groups** (when any exist) and your portfolios under **Individual portfolios**. Each portfolio card shows its type, name (a star marks the default), description, currency, number of holdings and **Current value**, with **Edit** and **Inspect**. On plans with a limit, a badge reads "N of M portfolios used".

**Why it exists:** Inferred from the page text: separate long-term investments, trading and goal-based money, and see them together when needed.

**Where to find it:** **Overview → Portfolios** (route `/portfolios`); phone tab **Portfolios**.

**Who can use it:** R-FREE (1 portfolio), R-PLUS and R-FAMILY (5), R-PRO (unlimited). In family view the list also includes family-shared portfolios and other members' personal portfolios.

**Steps**
1. Open Portfolios. Cards load (grey placeholders first).
2. Click **Inspect** on a card to open it (F-PORT-004), or **Edit** to change it (F-PORT-002).
3. Click **New portfolio** or **New group** to create one.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "N of M portfolios used" | Badge | Shows usage against your plan | Hidden on Pro/Advisor |
| **New group** | Button | Opens the group dialog (F-PORT-006) | Disabled when you have no portfolios |
| **New portfolio** | Button | Opens the portfolio dialog | Disabled at your plan's limit (tooltip "Upgrade to add more portfolios") |
| "upgrade to add more" | Link | Opens `/pricing` | Shown only at the limit |
| **Create your first portfolio** | Button | Opens the portfolio dialog | Empty list only |
| **Edit** (portfolio card) | Button | Opens the portfolio dialog | — |
| **Inspect** (portfolio card) | Link | Opens `/portfolios/:id` | — |
| **Edit** / **Inspect** (group card) | Button / link | Edit group / open `/portfolio-groups/:id` | — |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| **New portfolio** is greyed out | You reached your plan's portfolio limit | Upgrade, or delete a portfolio |
| "No portfolios yet" | None created | **Create your first portfolio** |

**Limitations:** Current value shows "—" for a portfolio with no holdings. In family view the "N of M portfolios used" badge counts every portfolio in the list, including other members', while the server counts only portfolios you created — see DOCUMENTATION_GAPS.md. Groups are always yours only.

**How it works:** `GET /api/portfolios` returns portfolios with holding and transaction counts and current value (sum of holdings' current value, cost when unpriced), default first then oldest first. `GET /api/portfolio-groups` returns your groups.

**Related features:** F-PORT-002, F-PORT-004, F-PORT-006, F-PORT-007, F-SHELL-009.

**Sources:** `apps/web/src/pages/portfolios/PortfolioListPage.tsx:25`, `apps/web/src/pages/portfolios/PortfolioListPage.tsx:46`, `apps/web/src/pages/portfolios/PortfolioListPage.tsx:59`, `apps/web/src/pages/portfolios/PortfolioListPage.tsx:67`, `apps/web/src/pages/portfolios/PortfolioListPage.tsx:73`, `apps/web/src/pages/portfolios/PortfolioListPage.tsx:192`, `packages/api/src/services/holdings/portfolio.service.ts:85`, `packages/api/src/services/holdings/portfolio.service.ts:182`, `packages/shared/src/entitlements.ts:82`

### Create or edit a portfolio <!-- F-PORT-002 -->

**What it does:** The dialog "Create a new portfolio" / "Edit portfolio" ("A portfolio groups holdings by strategy, goal, or account.") sets a portfolio's **Name**, **Description (optional)**, **Type**, **Currency** and **Set as default portfolio**.

**Why it exists:** Inferred from behavior: organise holdings your way.

**Where to find it:** **Portfolios → New portfolio**, or **Edit** on a card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO within their portfolio limit. Editing: the portfolio's creator, or any active OWNER of the family a portfolio is shared into (R-FAMOWNER). While managing an account (R-MANAGER) the limit is the manager's plan.

**Steps**
1. Click **New portfolio** (or **Edit**).
2. Fill **Name** and the optional fields.
3. Click **Create** (or **Save changes**). "Portfolio created" / "Portfolio updated" appears and the dialog closes.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Name** | Text | Portfolio name (placeholder "Long Term Equity") | — |
| **Description (optional)** | Text area | Notes | — |
| **Type** | Select | Investment, Trading, Goal-based, Strategy | — |
| **Currency** | Select | INR, USD, EUR, GBP | — |
| **Set as default portfolio** | Checkbox | Makes it the default | — |
| **Delete** | Button | F-PORT-003 | Edit only |
| **Cancel** / **Create** / **Save changes** | Buttons | Close / save | Save disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Name | Text | Yes | 1–100 characters | Empty | "Name is required" |
| Description | Text | No | Up to 500 characters | Empty | Server validation message |
| Type | Select | Yes | INVESTMENT, TRADING, GOAL, STRATEGY | Investment | — |
| Currency | Select | Yes | 3 letters | INR | — |
| Set as default | Checkbox | No | — | Off | — |

**Settings and toggles here:** S-PORT-001 **Type** — a label shown on the card (no calculation uses it). S-PORT-002 **Currency** — the portfolio's currency code; groups only combine portfolios with the same currency. S-PORT-003 **Set as default portfolio** — on: this portfolio is listed first with a star and the previous default is cleared.

**Results:** The portfolio is saved and the lists refresh.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Your FREE plan allows 1 portfolio. Upgrade to PLUS for multiple." (similar for PLUS/FAMILY with their limit) | Plan limit reached | Upgrade or delete a portfolio |
| "Forbidden" or "Save failed" | You are not allowed to edit this portfolio | Ask its creator or a family owner |

**Limitations:** Amounts are still shown in rupees regardless of the portfolio currency. The setup wizard's portfolio creation never adds a second portfolio (it reuses your oldest).

**How it works:** `POST /api/portfolios` checks the count of portfolios you created against your plan (Free 1, Plus 5, Family 5, Pro/Advisor unlimited — placeholders in code) and creates the row; `PATCH /api/portfolios/:id` requires ownership. Setting a default clears the default flag on your other portfolios in the same transaction.

**Related features:** F-PORT-001, F-PORT-003, F-SHELL-009.

**Sources:** `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:25`, `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:76`, `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:134`, `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:143`, `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:156`, `packages/api/src/controllers/portfolio.controller.ts:23`, `packages/api/src/controllers/portfolio.controller.ts:55`, `packages/api/src/lib/planLimits.ts:11`, `packages/api/src/services/holdings/portfolio.service.ts:219`, `packages/api/src/services/holdings/portfolio.service.ts:310`, `packages/api/src/services/holdings/portfolio.service.ts:339`

### Delete a portfolio <!-- F-PORT-003 -->

**What it does:** Permanently deletes a portfolio and everything recorded in it.

**Why it exists:** Inferred from behavior: remove portfolios you no longer need (and free a slot on your plan).

**Where to find it:** **Portfolios → Edit → Delete**.

**Who can use it:** The portfolio's creator; any active OWNER of the family a portfolio is shared into (R-FAMOWNER).

**Steps**
1. Click **Edit** on the portfolio, then **Delete**.
2. Confirm "Delete portfolio "<name>"? This cannot be undone." "Portfolio deleted" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Delete** | Button | Asks for confirmation, then deletes | Disabled while deleting |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** The portfolio, its transactions, holdings, cash flows, capital-gain records and group memberships are deleted. Bank accounts or other records that pointed at it lose the link but are kept.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Delete failed" or the server's message | Not allowed, or server error | Check you own it |

**Limitations:** No undo and no archive.

**How it works:** `DELETE /api/portfolios/:id` after an ownership check; related rows are removed by database cascade.

**Related features:** F-PORT-002.

**Sources:** `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:95`, `packages/api/src/services/holdings/portfolio.service.ts:360`, `packages/api/prisma/schema.prisma:1053`

### Portfolio detail <!-- F-PORT-004 -->

**What it does:** Shows one portfolio: name and description, four cards (**Current value**, **Invested**, **Unrealised P&L**, **Today's change**) and a **Holdings** table with Asset, Class, Qty, Avg cost, Invested, CMP, Value, P&L and **XIRR**.

**Why it exists:** Inferred from behavior: the full picture of one portfolio's positions and returns.

**Where to find it:** **Portfolios → Inspect** (route `/portfolios/:id`).

**Who can use it:** Anyone who can read the portfolio: its creator; in a family, any active member (peers' personal portfolios included). Adding a transaction needs you to be the portfolio's creator (see F-TXN-002).

**Steps**
1. Read the cards and table.
2. Click **XIRR** in the header to sort: highest first, then lowest first, then unsorted.
3. Click **Add transaction** (or **Add transaction** in the empty state) to record one in this portfolio.
4. Click **Back to portfolios** to return.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Back to portfolios** | Link | Opens `/portfolios` | — |
| **Refresh prices** | Button | F-PORT-005 | — |
| **Add transaction** | Button | Opens the transaction dialog with this portfolio chosen | — |
| **XIRR** | Sort button | Cycles descending → ascending → off | — |

**Fields and rules:** None.

**Settings and toggles here:** S-PORT-004 **XIRR sort** — off (default), descending, ascending; not remembered.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No holdings yet — Import a contract note or add a manual transaction to see holdings here." | Empty portfolio | Add a transaction |
| "Portfolio not found" / forbidden | The portfolio was deleted or is not yours to see | Go back to Portfolios |

**Limitations:** Holdings are listed in the order they were last recalculated, not by value. A holding's XIRR is shown only when it has a current price and enough history; holdings without XIRR sort last. XIRR colours: red below 0, green at 7% a year or more, amber in between (7% is a fixed-deposit benchmark used only for colour). The cards do not refresh immediately after you add a transaction from this page — reload or revisit (see DOCUMENTATION_GAPS.md).

**How it works:** Summary as in F-DASH-008. Holdings come from the recalculated holdings table with stock symbol or fund scheme code added; per-holding XIRR is solved from all the portfolio's transactions with today's value as the final cash flow.

**Related features:** F-PORT-005, F-TXN-002, F-DASH-008.

**Sources:** `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:38`, `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:59`, `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:108`, `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:144`, `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:185`, `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:268`, `packages/api/src/services/holdings/portfolio.service.ts:251`, `packages/api/src/services/holdings/portfolio.service.ts:547`, `packages/api/src/services/holdings/portfolio.service.ts:631`

### Refresh prices (one portfolio) <!-- F-PORT-005 -->

**What it does:** **Refresh prices** re-values this portfolio's holdings from the latest prices and shows "N holdings refreshed".

**Why it exists:** Inferred from behavior: update one portfolio without waiting for the schedule.

**Where to find it:** Portfolio detail → **Refresh prices**.

**Who can use it:** The portfolio's creator only (others get "Portfolio not found").

**Steps**
1. Click **Refresh prices**. A spinner shows; then "N holdings refreshed".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Refresh prices** | Button | Refreshes this portfolio | Disabled while running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Holdings' current price, value and P&L are updated.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Refresh failed" / "Portfolio not found" | Error, or the portfolio is not yours | Use your own portfolio |

**Limitations:** Uses prices already stored (and live quotes where the price router supports them); it does not first download new stock closes the way the Dashboard's **Refresh** does.

**How it works:** `POST /api/assets/portfolios/:id/refresh-prices` checks `portfolio.userId` equals you, then re-prices that portfolio's holdings.

**Related features:** F-DASH-014, F-PORT-008.

**Sources:** `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:91`, `packages/api/src/controllers/assets.controller.ts:76`, `packages/api/src/services/holdings/holdingsProjection.ts:712`

### Portfolio groups: create, edit, delete <!-- F-PORT-006 -->

**What it does:** "Create a portfolio group" ("Bundle multiple portfolios (e.g. each family member's investments) into a single consolidated view. Member portfolios stay independent for transactions.") lets you name a group, describe it and tick member portfolios. Edit changes them; **Delete group** removes the group only.

**Why it exists:** Code comment: "a user-owned bucket that bundles N of that same user's Portfolios into a single read view".

**Where to find it:** **Portfolios → New group**, or **Edit** on a group card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO — only with portfolios you created.

**Steps**
1. Click **New group** (enabled once you have a portfolio).
2. Enter **Name** (placeholder "e.g. Kotharis") and optional **Description (optional)**.
3. Tick portfolios under **Member portfolios**. After the first tick, portfolios in other currencies are greyed out ("Group currency locked to <code>. Other-currency portfolios disabled.").
4. Click **Create group** (or **Save changes**). "Group created" / "Group updated" appears.
5. To delete, open **Edit**, click **Delete group** and confirm "Delete group "<name>"? Member portfolios are unaffected."

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Name** | Text | Group name | — |
| **Description (optional)** | Text area | Notes | — |
| **Member portfolios** checkboxes | Checkbox list | Choose members | Other-currency portfolios disabled once one is ticked |
| **Delete group** | Button | Deletes the group | Edit only |
| **Cancel** / **Create group** / **Save changes** | Buttons | Close / save | Save disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Name | Text | Yes | 1–100 characters | Empty | "Name is required"; server "Group name is required" |
| Description | Text | No | Up to 500 characters | Empty | — |
| Members | List | No | Your own portfolios, one currency | None | "One or more portfolios not owned by user"; "Group members must share a currency; got …" |

**Settings and toggles here:** None.

**Results:** The group card appears under **Family groups**. Deleting a group leaves its portfolios untouched.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Save failed" with a server message | Not your portfolio, or mixed currencies | Pick your own portfolios in one currency |
| "No portfolios available. Create individual portfolios first." | No portfolios | Create one first |

**Limitations:** Groups cannot include family members' portfolios or another person's; they are a personal view only, despite the "Family groups" heading. A group can be empty. Saving an edit sends name/description and members as two requests.

**How it works:** `POST /api/portfolio-groups` with `memberIds`; `PATCH /api/portfolio-groups/:id` then `PUT /api/portfolio-groups/:id/members`; every write checks the group and each portfolio belong to you and that member currencies match.

**Related features:** F-PORT-007.

**Sources:** `apps/web/src/pages/portfolios/PortfolioGroupFormDialog.tsx:25`, `apps/web/src/pages/portfolios/PortfolioGroupFormDialog.tsx:65`, `apps/web/src/pages/portfolios/PortfolioGroupFormDialog.tsx:81`, `apps/web/src/pages/portfolios/PortfolioGroupFormDialog.tsx:114`, `apps/web/src/pages/portfolios/PortfolioGroupFormDialog.tsx:166`, `apps/web/src/pages/portfolios/PortfolioGroupFormDialog.tsx:194`, `packages/api/src/controllers/portfolioGroup.controller.ts:19`, `packages/api/src/services/holdings/portfolioGroup.service.ts:37`, `packages/api/src/services/holdings/portfolioGroup.service.ts:44`, `packages/api/src/services/holdings/portfolioGroup.service.ts:57`

### Portfolio group detail <!-- F-PORT-007 -->

**What it does:** Shows a group: "Members:" chips (each opens that portfolio), cards **Combined value**, **Invested**, **Unrealised P&L**, **Today's change**, and **Combined holdings** where the same asset in several member portfolios is merged into one row.

**Why it exists:** Inferred from behavior: see several portfolios as one.

**Where to find it:** **Portfolios → group card → Inspect** (route `/portfolio-groups/:id`).

**Who can use it:** The group's owner only.

**Steps**
1. Read the cards and table; click a member chip to open that portfolio.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Back to portfolios** | Link | Opens `/portfolios` | — |
| Member chips | Links | Open `/portfolios/:id` | Hidden when the group has no members |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No holdings in this group — Add member portfolios with holdings to see combined positions here." | Empty group or members without holdings | Edit the group |
| "Portfolio group not found" | Deleted or not yours | — |

**Limitations:** **Today's change** counts stocks only (unlike a single portfolio, which also counts funds, crypto and gold). There is no XIRR for groups. When a merged asset's members are priced differently, CMP shows the last member's price. P&L is blank if any member's holding lacks a price.

**How it works:** Summary and holdings are computed over all member portfolios' holdings; merged rows sum quantity, cost and value, with average cost = cost ÷ quantity.

**Related features:** F-PORT-006, F-PORT-004.

**Sources:** `apps/web/src/pages/portfolios/PortfolioGroupDetailPage.tsx:28`, `apps/web/src/pages/portfolios/PortfolioGroupDetailPage.tsx:71`, `apps/web/src/pages/portfolios/PortfolioGroupDetailPage.tsx:87`, `packages/api/src/services/holdings/portfolioGroup.service.ts:239`, `packages/api/src/services/holdings/portfolioGroup.service.ts:283`, `packages/api/src/services/holdings/portfolioGroup.service.ts:327`

### Scheduled market price feeds <!-- F-PORT-008 -->

**What it does:** EveryPaisa downloads market prices on a fixed India-time schedule and re-values every user's holdings after each price download, so values, P&L and charts stay current without you doing anything.

**Why it exists:** Code comments: prices are "valuation inputs behind every holding"; feeds are checked ("canary") so a broken source does not silently corrupt valuations.

**Where to find it:** Not a page; results appear in every value on the Dashboard, Portfolios and asset-class pages (with "price as of" dates where shown).

**Who can use it:** Runs for everyone automatically.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** None.

**Settings and toggles here:** None for users. Operators: `ENABLE_PRICE_CRONS=false` stops all of these; `ENABLE_COST_SIZE_REFRESH=false` stops the fund cost/size refresh.

**Results:** Schedule (all India time):
| Feed | When | Then |
|---|---|---|
| Mutual fund NAVs (AMFI) | Daily 22:00 | All holdings re-priced |
| Fund expense ratio and size (AMFI) | Daily 22:30 | — |
| Stock end-of-day prices (Yahoo, all stocks) | Mon–Fri 16:30 | All holdings re-priced |
| Stock prices for held stocks | Mon–Fri every 15 minutes, 09:00–15:45 | All holdings re-priced |
| NSE/BSE stock and ETF lists | Sunday 03:00 | — |
| Corporate actions (NSE) | Daily 20:00 | F-PORT-009 |
| Gold/silver and other commodities | Daily 23:30 | All holdings re-priced |
| Crypto | Every 2 minutes | All holdings re-priced |
| Currency rates | Hourly | — |
| Index benchmarks (NIFTY, Sensex) | Mon–Fri 16:40 and at server start | — |
| F&O lot sizes / end-of-day / live | Sun 03:30 / Mon–Fri 16:45 / every minute 09:00–15:59 Mon–Fri | F&O positions re-priced |
| Fuel prices | Daily 06:30 | — |

**Errors and troubleshooting:** None visible to users; a failed feed is logged and reported to monitoring, and prices stay at their last values.

**Limitations:** Market data comes from outside sources (AMFI, Yahoo, NSE, BSE, CoinGecko and others) whose availability cannot be verified from code. A job still running when its next run is due is skipped.

**How it works:** node-cron schedules in `Asia/Kolkata`; each job runs with system access (it updates shared price tables and all users' holdings) and is guarded against overlapping runs.

**Related features:** F-PORT-009, F-DASH-014, F-DASH-018.

**Sources:** `packages/api/src/jobs/priceJobs.ts:49`, `packages/api/src/jobs/priceJobs.ts:64`, `packages/api/src/jobs/priceJobs.ts:320`, `packages/api/src/jobs/priceJobs.ts:327`, `packages/api/src/jobs/priceJobs.ts:335`, `packages/api/src/jobs/priceJobs.ts:338`, `packages/api/src/jobs/priceJobs.ts:344`, `packages/api/src/jobs/priceJobs.ts:351`, `packages/api/src/jobs/priceJobs.ts:372`

### Automatic corporate-action application <!-- F-PORT-009 -->

**What it does:** After the daily 20:00 corporate-action download, EveryPaisa adds stock splits, bonus issues and cash dividends to the affected stock holdings as transactions, so quantities and income stay right.

**Why it exists:** Code comment: "fold newly-fetched splits/bonuses into holdings (idempotent)".

**Where to find it:** Results appear as SPLIT, BONUS and DIVIDEND PAYOUT rows on **Transactions** and in holdings quantities.

**Who can use it:** Automatic for every portfolio with stock holdings.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** None.

**Settings and toggles here:** None (runs inside the corporate-actions price job).

**Results:** For each stock holding and each action whose ex-date has passed, based on the quantity held before the ex-date: SPLIT adds quantity × (ratio − 1) at no cost; BONUS adds quantity × ratio at zero cost; DIVIDEND adds a dividend payout of amount per share × quantity (no change to quantity or cost). Holdings are then recalculated.

**Errors and troubleshooting:** None visible.

**Limitations:** Mergers, demergers, rights issues and buybacks are not applied automatically (they need your choice or data the feed lacks). Only holdings linked to a listed stock are processed. An action is applied once per holding; an identical row already on the books is not added again.

**How it works:** Each created row carries a fixed identity (`ca:<action>:<holding>`) and is also checked against existing identical transactions, so re-runs add nothing.

**Related features:** F-PORT-008, F-PORT-010, F-TXN-001.

**Sources:** `packages/api/src/jobs/priceJobs.ts:209`, `packages/api/src/jobs/corporateActionApplyJob.ts:10`, `packages/api/src/services/corporateActions/corporateActionApply.service.ts:14`, `packages/api/src/services/corporateActions/corporateActionApply.service.ts:48`, `packages/api/src/services/corporateActions/corporateActionApply.service.ts:63`

### What this area doesn't do
- You cannot move a portfolio's holdings to another portfolio in one step (edit each transaction's portfolio instead).
- Portfolio groups cannot mix currencies and cannot include other people's portfolios.
- There is no archive for portfolios — deleting is permanent.
- There is no manual price entry on the portfolio page.
- The corporate-actions report and manual sync endpoints exist on the server but have no screen (see DOCUMENTATION_GAPS.md).

## Transactions

Transactions are the record from which every holding, gain and chart is calculated: buys, sells, SIPs, switches, dividends, bonuses, splits and redemptions, whether typed in, imported or created automatically. Editing or deleting a transaction recalculates the holding it belongs to.

### Transactions list <!-- F-TXN-001 -->

**What it does:** The Transactions page ("All buys, sells, dividends, SIPs, and corporate actions") lists every transaction, newest trade date first, 50 per page, with Date, Type, Asset, Qty, Price, Net and Broker. A picker narrows it to one portfolio; the total count shows beside it. Clicking a row opens it for editing.

**Why it exists:** Inferred from behavior: one ledger of everything that changed your holdings.

**Where to find it:** **Overview → Transactions** (route `/transactions`); phone tab **Transactions**; **View all** on the Dashboard's Recent transactions.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. In family view the list includes family-shared portfolios and other members' personal portfolios (R-FAMCONTRIB/R-FAMVIEWER limited to their permitted asset classes); you can open their rows but only save changes to portfolios you created.

**Steps**
1. Pick **All portfolios** or one portfolio. The list returns to page 1.
2. Use **Previous** / **Next** to page ("Page X of Y").
3. Click a row (on phones, tap it) to edit it (F-TXN-003).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Find duplicates** | Button | F-TXN-006 | — |
| **Add transaction** | Button | F-TXN-002 | — |
| Portfolio picker (**All portfolios**) | Select | Filters by portfolio | — |
| Row | Clickable row | Opens the edit dialog | — |
| **Previous** / **Next** | Buttons | Change page | Shown only with more than one page; disabled at the ends |

**Fields and rules:** None.

**Settings and toggles here:** S-TXN-001 **Transactions portfolio filter** — **All portfolios** (default) or one; not remembered.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No transactions yet — Add your first buy or sell to populate holdings and P&L." | Nothing recorded (or nothing in the chosen portfolio) | **Add transaction** |

**Limitations:** No search, date-range, type or asset filters on this page (the server supports asset class, type and date filters, but the page does not offer them). The Type badge is green for BUY, SIP and SWITCH IN, red for SELL, SWITCH OUT and REDEMPTION, grey otherwise. The Asset sub-line shows symbol, scheme code, ISIN or the class. Phones show two lines per transaction.

**How it works:** `GET /api/transactions?portfolioId=&page=&pageSize=50` (page size capped at 200 on the server). In family view the server reads your rows plus each other member's personal rows, sorts by trade date then creation time (newest first) and pages the result.

**Related features:** F-TXN-002, F-TXN-003, F-TXN-006, F-DASH-013.

**Sources:** `apps/web/src/pages/transactions/TransactionsPage.tsx:52`, `apps/web/src/pages/transactions/TransactionsPage.tsx:84`, `apps/web/src/pages/transactions/TransactionsPage.tsx:101`, `apps/web/src/pages/transactions/TransactionsPage.tsx:159`, `apps/web/src/pages/transactions/TransactionsPage.tsx:189`, `apps/web/src/pages/transactions/TransactionsPage.tsx:226`, `packages/api/src/controllers/transaction.controller.ts:74`, `packages/api/src/services/holdings/transaction.service.ts:605`, `packages/api/src/services/holdings/transaction.service.ts:653`

### Add a transaction <!-- F-TXN-002 -->

**What it does:** The "Add transaction" dialog ("Record a buy, sell, SIP, dividend, or corporate action. Holdings recalculate automatically.") records one transaction and recalculates the holding. A live preview shows **Gross**, **Charges** and **Net (outflow)** or **Net (inflow)**.

**Why it exists:** Inferred from behavior: manual entry for anything not imported.

**Where to find it:** **Transactions → Add transaction**; **Portfolios → <portfolio> → Add transaction** (that portfolio pre-selected).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO — only into portfolios you created (R-MANAGER: portfolios of the person you manage).

**Steps**
1. Choose **Portfolio** and **Type**.
2. Choose **Asset class**, then search the **Asset** box (at least 2 characters) and pick a result. Picking a stock sets the class to EQUITY; picking a fund sets MUTUAL FUND and fills its scheme code, AMC and ISIN. "Selected: <name>" confirms it.
3. For other classes, type **Asset name** and optionally **ISIN (optional)**.
4. For FOREIGN EQUITY or FOREX PAIR, set **Currency** and **Rate to INR at trade**.
5. Enter **Trade date**, **Quantity** and **Price**; optionally open **Charges (optional)** and **Narration (optional)**.
6. Click **Add transaction**. "Transaction added" appears and the dialog closes.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Portfolio** ("Select portfolio…") | Select | Target portfolio | — |
| **Type** | Select | BUY, SELL, SIP, SWITCH IN, SWITCH OUT, DIVIDEND PAYOUT, DIVIDEND REINVEST, BONUS, SPLIT, REDEMPTION | — |
| **Asset class** | Select | EQUITY, MUTUAL FUND, ETF, BOND, GOVT BOND, CORPORATE BOND, FIXED DEPOSIT, RECURRING DEPOSIT, NPS, PPF, EPF, PHYSICAL GOLD, GOLD BOND, GOLD ETF, PHYSICAL SILVER, CRYPTOCURRENCY, REIT, INVIT, PMS, AIF, ULIP, FOREIGN EQUITY, FOREX PAIR, REAL ESTATE, ART COLLECTIBLES, CASH, OTHER | — |
| **Asset** search ("Search scheme name / code / ISIN…" or "Search symbol, name, or ISIN…") | Search box | Finds stocks and funds; results marked Stock/MF (and "· Yahoo" when from Yahoo) | Results appear after 2 characters; "No matches" when none |
| **Asset name** | Text | Name for non-stock, non-fund assets | Hidden for EQUITY, ETF, MUTUAL FUND, FOREIGN EQUITY |
| **ISIN (optional)** / **Pair code (e.g. USDINR / EURUSD)** | Text | Identifier (uppercase, max 12 characters) | Same as **Asset name** |
| **Currency** ("INR (default)", USD, EUR, GBP, JPY, AED, SGD, AUD, CAD, CHF, HKD, CNY) | Select | Trade currency | FOREIGN EQUITY / FOREX PAIR only |
| **Rate to INR at trade** | Number | FX rate frozen for tax ("Frozen for tax basis per Rule 115. INR equivalent = gross × rate.") | Same |
| **Trade date**, **Quantity**, **Price** | Date / numbers | Trade details | — |
| **Charges (optional)**: Brokerage, STT, Stamp duty, Exchange, GST, SEBI, Other, Broker | Collapsible fields | Costs and broker name | — |
| **Narration (optional)** | Text area | Note | — |
| **Cancel** / **Add transaction** | Buttons | Close / save | Save disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Portfolio | Select | Yes | One of your portfolios | Pre-selected portfolio, else your first | "Select a portfolio" |
| Trade date | Date | Yes | YYYY-MM-DD | Today (blank when opened from Reports) | None shown on the form (see Limitations); server "Date must be YYYY-MM-DD" |
| Quantity | Number | Yes | Greater than 0; up to 10^12 | 0 | "Must be > 0"; server "Quantity must be > 0" |
| Price | Number | Yes | 0 or more; up to 10^12 | 0 | None shown on the form; server "Price cannot be negative" |
| Charges (each) | Number | No | 0 or more | Empty | None shown on the form (the dialog does not save) |
| Asset name / symbol | Text | One of symbol, scheme or name | Symbol ≤40, stock name ≤200, scheme name ≤300, asset name ≤300, ISIN ≤20 | — | "Asset name or symbol is required" |
| Narration | Text | No | ≤500 characters | — | Server validation message |
| Broker | Text | No | ≤100 characters | — | Server validation message |

**Settings and toggles here:** None.

**Results:** The transaction is saved, the holding for that asset in that portfolio is recalculated, and for stocks, ETFs, mutual funds and foreign equity a price refresh starts in the background so the new holding gets a value quickly. Transactions, portfolios and holdings lists refresh.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "You may already have this one" banner | The same trade already exists (F-TXN-005) | **Let me check** or **Record it anyway** |
| "Save failed" / "Forbidden" | Server rejected it, or the portfolio is not yours | Use your own portfolio |
| Clicking **Add transaction** does nothing | Trade date (or price) is invalid or blank — the form shows no message for these | Fill in a valid date and price |

**Limitations:** Net = Gross + Charges for buy-type entries (BUY, SIP, SWITCH IN, DIVIDEND REINVEST and, on the server, also BONUS, RIGHTS ISSUE, OPENING BALANCE, MERGER IN, DEMERGER IN), otherwise Gross − Charges; the preview treats BONUS as an inflow while the server treats it as buy-type. Only portfolios you created accept new transactions, even family-shared ones. After adding from a portfolio's page, that page's top cards and the Dashboard keep their old numbers until revisited. A stock symbol not yet known is added to the stock list (NSE by default; NASDAQ for foreign equity).

**How it works:** `POST /api/transactions`. The server checks the portfolio is yours, quantity and price, a repeat by source key (silently returns the existing row) and a repeat by trade details (409, F-TXN-005); resolves the stock or fund; computes gross = quantity × price, charges, net; stores the row; recalculates the holding. For FOREIGN EQUITY/FOREX PAIR with a rate, the INR equivalent = gross × rate is stored.

**Related features:** F-TXN-005, F-TXN-003, F-PORT-004.

**Sources:** `apps/web/src/pages/transactions/TransactionFormDialog.tsx:62`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:124`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:138`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:208`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:252`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:286`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:319`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:364`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:466`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:481`, `apps/web/src/components/common/AssetSearch.tsx:21`, `apps/web/src/components/common/AssetSearch.tsx:37`, `packages/api/src/controllers/transaction.controller.ts:28`, `packages/api/src/services/holdings/transaction.service.ts:104`, `packages/api/src/services/holdings/transaction.service.ts:123`, `packages/api/src/services/holdings/transaction.service.ts:169`, `packages/api/src/services/holdings/transaction.service.ts:224`, `packages/api/src/services/holdings/transaction.service.ts:342`, `packages/api/src/services/holdings/transaction.service.ts:346`

### Edit a transaction <!-- F-TXN-003 -->

**What it does:** Opens a transaction in the same dialog ("Edit transaction") with its values filled in; **Save changes** updates it and recalculates the holding and its capital gains.

**Why it exists:** Code comment: edits cascade "projection + capital-gains" recalculation so nothing is left stale.

**Where to find it:** **Transactions** → click a row.

**Who can use it:** The creator of the portfolio the transaction is in.

**Steps**
1. Click the row. The dialog opens with its values (the asset search box starts empty; the saved asset is kept unless you pick another).
2. Change fields; click **Save changes**. "Transaction updated" appears.

**Controls:** Same as F-TXN-002 plus **Delete** (F-TXN-004). Types not offered for new entries (for example DEPOSIT, MATURITY, OPENING BALANCE) still show in the **Type** list for a transaction that has them.

**Fields and rules:** Same as F-TXN-002; fields you do not change keep their saved values.

**Settings and toggles here:** None.

**Results:** The row is updated. If its asset or portfolio changed, both the old and the new holding are recalculated, with their capital gains.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Saving this would match a <TYPE> of <qty> <asset> at <price> already recorded on <date>. Save it only if both are genuine." | The edit makes it identical to another row | Check the other row; see Limitations |
| "Transaction not found" | Deleted meanwhile | Refresh the list |

**Limitations:** For an edit, **Record it anyway** on the duplicate banner does not work — the app does not pass the override on edits, so the same warning returns (see DOCUMENTATION_GAPS.md). Change a detail (or delete the other row) instead.

**How it works:** `PATCH /api/transactions/:id` merges your changes with the saved row, re-resolves the asset, recomputes amounts and the asset key, runs the duplicate check excluding itself, saves, then recalculates holdings and capital gains for the old and new asset/portfolio.

**Related features:** F-TXN-002, F-TXN-004, F-TXN-005.

**Sources:** `apps/web/src/pages/transactions/TransactionFormDialog.tsx:179`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:283`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:360`, `packages/api/src/services/holdings/transaction.service.ts:356`, `packages/api/src/services/holdings/transaction.service.ts:461`, `packages/api/src/services/holdings/transaction.service.ts:537`

### Delete a transaction <!-- F-TXN-004 -->

**What it does:** Removes a transaction and recalculates its holding and capital gains.

**Why it exists:** Inferred from behavior: correct mistakes and remove wrong imports.

**Where to find it:** **Transactions** → row → **Delete**.

**Who can use it:** The creator of the portfolio.

**Steps**
1. Open the transaction and click **Delete**.
2. Confirm "Delete this transaction? Holdings will recalculate." "Transaction deleted" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Delete** | Button | Deletes after confirmation | Edit only; disabled while deleting |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** The row is gone; the holding is recalculated (it disappears when nothing is left); capital-gain records that used it are rebuilt.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Delete failed" | Not yours, or server error | — |

**Limitations:** No undo.

**How it works:** `DELETE /api/transactions/:id`, then holding and capital-gains recalculation for that asset.

**Related features:** F-TXN-003, F-TXN-006.

**Sources:** `apps/web/src/pages/transactions/TransactionFormDialog.tsx:304`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:367`, `packages/api/src/services/holdings/transaction.service.ts:549`, `packages/api/src/services/holdings/transaction.service.ts:568`

### Duplicate warning on save <!-- F-TXN-005 -->

**What it does:** When a new transaction matches one already recorded, the dialog shows "You may already have this one" with the server's explanation, **Let me check** and **Record it anyway**.

**Why it exists:** Code comment: the same trade can arrive "in a CAS, again in a contract note, again typed in"; this stops double-counting unless you confirm.

**Where to find it:** Top of the Add/Edit transaction dialog after saving.

**Who can use it:** Same as F-TXN-002.

**Steps**
1. Click **Let me check** to close the banner and review, or
2. Click **Record it anyway** to save it as a second, genuine trade.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Let me check** | Button | Hides the banner | — |
| **Record it anyway** | Button | Saves with the duplicate check skipped | Disabled while saving; does not work for edits |

**Fields and rules:** A duplicate is another transaction in the same portfolio, same asset, same type, same trade date, same quantity and same price (charges ignored). It is not a duplicate when both rows carry broker order and trade numbers and they differ (two fills of one order).

**Settings and toggles here:** None.

**Results:** With **Record it anyway**, the transaction is saved.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "A <TYPE> of <qty> <asset> at <price> on <date> is already recorded. Record it again only if this is a second, genuine trade." | Duplicate found | Decide as above |

**Limitations:** See F-TXN-003 for edits.

**How it works:** Server error 409 `DUPLICATE_TRANSACTION` with the matching row's id; the app keeps your values and resends with `allowDuplicate`.

**Related features:** F-TXN-002, F-TXN-006.

**Sources:** `apps/web/src/pages/transactions/TransactionFormDialog.tsx:229`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:383`, `packages/api/src/services/holdings/transaction.service.ts:265`, `packages/api/src/services/holdings/transaction.service.ts:288`, `packages/api/src/services/imports/duplicateMatch.ts:244`, `packages/api/src/services/imports/duplicateMatch.ts:262`

### Find duplicates <!-- F-TXN-006 -->

**What it does:** "Duplicates" ("Rows that record the same money twice. The oldest row in each set is kept; tick anything else you want removed. Holdings, gains and the rent khata are recalculated after.") scans all your transactions and rent entries, groups repeats, and deletes only the rows you tick.

**Why it exists:** Code comment: "The same trade can reach the books from a CAS, a contract note and a typed entry — three sources, one event."

**Where to find it:** **Transactions → Find duplicates**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO — over your own portfolios and rentals only.

**Steps**
1. Click **Find duplicates**. "Looking through your books…" shows.
2. Review each set: its label ("N × <TYPE> <qty> <asset> on <date> (<portfolio>)"), reason, a badge **Duplicate** or **Probably fine**, and its rows (amount · source · order/trade numbers · "added <date>"). The oldest row is marked "oldest — kept".
3. Tick or untick rows. Rows in **Duplicate** sets are pre-ticked except the oldest; **Probably fine** sets start unticked.
4. Click **Remove N selected**, then **Yes — remove N row(s)** to confirm. "Removed N transaction(s) and M rent entr(y/ies)" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Row checkbox ("Remove <row>") | Checkbox | Marks a row for removal | — |
| **Remove N selected** → **Yes — remove N row(s)** | Two-step button | Deletes ticked rows | Disabled with nothing ticked or while removing; hidden when there are no sets |
| **Close** | Button | Closes | — |

**Fields and rules:** Up to 1,000 transaction ids and 1,000 rent-entry ids per removal; at least one ("Nothing selected to remove").

**Settings and toggles here:** None.

**Results:** Each ticked row is deleted through its normal delete (holdings, capital gains and rent ledger recalculated).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Nothing is recorded twice across N transactions and M rent entries." | No repeats | — |
| "Could not read your transactions" | Scan failed | Reopen |
| "Could not remove the selected rows" | A delete failed (earlier rows may already be removed) | Reopen and retry |

**Limitations:** A set is "Probably fine" when every row has its own broker order+trade number, or all rows came from one imported file. Rent entries repeat when tenancy, entry type, date, amount and month match ("usually the 'mark received' button pressed twice"). Family members' portfolios are not scanned.

**How it works:** `GET /api/transactions/duplicates` groups by portfolio + asset + type + date + quantity + price (trailing zeros ignored); `POST /api/transactions/duplicates/remove` deletes ids one by one.

**Related features:** F-TXN-004, F-TXN-005, D-TXN-001 (Rental khata).

**Sources:** `apps/web/src/pages/transactions/DuplicatesDialog.tsx:42`, `apps/web/src/pages/transactions/DuplicatesDialog.tsx:66`, `apps/web/src/pages/transactions/DuplicatesDialog.tsx:131`, `apps/web/src/pages/transactions/DuplicatesDialog.tsx:158`, `apps/web/src/pages/transactions/DuplicatesDialog.tsx:228`, `packages/api/src/controllers/transaction.controller.ts:98`, `packages/api/src/services/imports/duplicates.service.ts:24`, `packages/api/src/services/imports/duplicates.service.ts:120`, `packages/api/src/services/imports/duplicateMatch.ts:81`, `packages/api/src/services/imports/duplicateMatch.ts:124`, `packages/api/src/services/imports/duplicateMatch.ts:189`

### Add the missing purchase (from Reports) <!-- F-TXN-007 -->

**What it does:** When a report finds a sale with no purchase behind it, its link opens Transactions with "Add transaction" pre-filled: BUY, the portfolio, asset and quantity filled in, and **Trade date** left blank with the hint "When you bought these units — on or before the sale on <date>." (dates after the sale cannot be picked).

**Why it exists:** Code comment: "A prefilled purchase has no known date. Left blank … rather than defaulted: a default the user forgets to change would book a wrong holding period".

**Where to find it:** Reached from the Reports data-quality banner (D-TXN-002); address `/transactions?add=purchase&…`.

**Who can use it:** Same as F-TXN-002.

**Steps**
1. Follow the link from Reports. The dialog opens pre-filled.
2. Enter the purchase **Trade date** and **Price**; click **Add transaction**.

**Controls:** As F-TXN-002.

**Fields and rules:** Trade date must be on or before the sale date (date picker maximum).

**Settings and toggles here:** None.

**Results:** As F-TXN-002. The address is cleaned so reloading does not reopen the form.

**Errors and troubleshooting:** As F-TXN-002 (a blank date gives no message).

**Limitations:** Quantity is pre-filled only when it is a positive number.

**How it works:** Reads `portfolioId`, `assetClass` (default EQUITY), `symbol`, `assetName`, `isin`, `quantity`, `onOrBefore` from the address once, then clears it.

**Related features:** F-TXN-002, D-TXN-002.

**Sources:** `apps/web/src/pages/transactions/TransactionsPage.tsx:27`, `apps/web/src/pages/transactions/TransactionsPage.tsx:42`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:104`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:215`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:518`

### What this area doesn't do
- There is no bulk edit, bulk delete (other than duplicates) or export from this page (exports are on Reports).
- You cannot search transactions or filter by date, type or asset on this page.
- You cannot attach photos here (photo attachments exist only on Gold pages).
- You cannot add transactions to a portfolio someone else created, even in a family.
- F&O-specific fields (strike, expiry, option type, lot size) are not in this form; F&O is entered on its own page.

## Bank Accounts

Bank Accounts keeps your savings, current, salary and NRI accounts: bank, branch and IFSC, holder, nominee, linked debit card, balance and balance history. The full account number is optional, stored encrypted, and shown only when you ask. Balances here are not part of the Dashboard's Total Net Worth.

### Bank accounts list <!-- F-BANK-001 -->

**What it does:** The page "Bank Accounts" ("Your savings, current, and salary accounts in one place — branch, IFSC, balance, nominee, and linked debit card details.") shows a summary strip — **Total balance** ("across N active account(s)"), **Active accounts** ("with known balances") and **Inactive** ("dormant or closed") — and a tile per account drawn as a bank building: bank logo or initials, type, nickname, masked account number with an eye, **Available balance** (or the status), and **Holder**. Under each tile: Customer ID, IFSC, Branch, Status, "As of <date>" ("· live" when updated from email) and **Share details**.

**Why it exists:** Inferred from the page text: all bank details in one place, for reference and for sharing when someone needs to pay you.

**Where to find it:** **Asset Classes → Bank Accounts** (route `/bank-accounts`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO — your own accounts only (family view does not add other members' accounts). R-MANAGER sees the managed person's accounts.

**Steps**
1. Hover a tile (on touch screens the buttons are always shown) and use **Edit**, **Delete** or **Open**; or click the tile to open it.
2. Click **Add account** to add one (F-BANK-002).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add account** / **Add first account** | Button | Opens the account dialog | — |
| **Edit** | Icon button | Opens the dialog for this account | Shown on hover (always on touch screens) |
| **Delete** | Icon button | F-BANK-003 | Same |
| **Open** / tile | Link | Opens `/bank-accounts/:id` | — |
| Eye on the account number | Toggle | F-BANK-005 | — |
| **Share details** | Button | F-BANK-006 | — |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No bank accounts yet — Add your first bank account to see balances, branch details, and linked transactions." | None added | **Add first account** |

**Limitations:** **Total balance** adds the balances of ACTIVE accounts only; "Active accounts" counts all active accounts whether or not a balance is known. Accounts are ordered by status (Active, then Closed, then Dormant), then bank name, then newest. Balances are hidden by **Hide values**.

**How it works:** `GET /api/bank-accounts` returns your accounts with their latest balance record; the full account number is never sent, only whether one is saved.

**Related features:** F-BANK-002 to F-BANK-008.

**Sources:** `apps/web/src/pages/bankAccounts/BankAccountListPage.tsx:29`, `apps/web/src/pages/bankAccounts/BankAccountListPage.tsx:73`, `apps/web/src/pages/bankAccounts/BankAccountListPage.tsx:156`, `apps/web/src/pages/bankAccounts/BankAccountListPage.tsx:206`, `apps/web/src/pages/bankAccounts/BankAccountListPage.tsx:224`, `apps/web/src/components/bankAccounts/BankAccountVisual.tsx:90`, `packages/api/src/services/banking/bankAccounts.service.ts:126`, `packages/api/src/services/banking/bankAccounts.service.ts:144`

### Add or edit a bank account <!-- F-BANK-002 -->

**What it does:** "Add bank account" / "Edit bank account" records an account's details. Recognised banks fill in the IFSC's first five characters; a full IFSC looks up the branch name and address; the customer ID is copied from another account you have at the same bank.

**Why it exists:** Code comments: users paste numbers with spaces; "CIFs are per bank, not per account"; the IFSC lookup "pulls branch name + address".

**Where to find it:** **Bank Accounts → Add account**, tile **Edit**, or detail **Edit**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Type or pick the **Bank** (suggestions list Indian banks with their IFSC prefix). For a recognised bank, an empty IFSC becomes the bank's four letters plus "0", and the Customer ID is copied from your other account at that bank ("From your other <bank> account.").
2. Choose **Type** and fill **Account holder** (suggestions: your name and holders on your other accounts).
3. Either type **Last 4 digits**, or type the **Full account number (optional)** — the last 4 then fill themselves and lock.
4. Type the **IFSC**. A complete code shows "Looking up branch…" and fills **Branch** and **Branch address**.
5. Fill **Customer ID**, optional **Nickname**, **Current balance (₹)** (the **As of** date becomes today when you first type a balance), nominee, joint holders, debit card and **Status**.
6. Click **Add account** (or **Save changes**). It reads **Saving…**, then "Account added" / "Account updated".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Bank \*** ("Search HDFC, SBI, Kotak…") | Suggest input | Bank name | — |
| **Type** | Select | Savings, Current, Salary, Nre, Nro, Od | — |
| **Account holder \*** ("Name on account") | Suggest input | Holder name | — |
| **Last 4 digits \*** | Text | Last 4 digits | Read-only while a full number is typed |
| **Full account number (optional)** | Text | Full number (placeholder "Saved — type a new one to replace it" when one is saved) | — |
| **IFSC** | Text | Branch code; lookup when complete | — |
| **Branch**, **Branch address** | Text | Branch details ("Filled from the IFSC — edit if needed") | — |
| **Customer ID \*** ("Bank-issued CIF / Customer ID") | Text | Customer ID | — |
| **Nickname (optional)** ("Primary salary, Emergency fund…") | Text | Name shown on the tile | — |
| **Current balance (₹)**, **As of** | Text, date | Balance and its date | — |
| **Nominee name**, **Relation** | Suggest inputs | Nominee; picking a known nominee fills the relation | — |
| **Joint holders (comma-separated)** | Text | Joint holders | — |
| **Card last 4**, **Expiry** (MM, YY) | Text, selects | Linked debit card | — |
| **Status** | Select | Active, Dormant, Closed | — |
| **Cancel** / **Add account** / **Save changes** | Buttons | Close / save | Save disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Bank | Text | Yes | ≤200 characters | Empty | "Required" |
| Account holder | Text | Yes | ≤200 | Your name (new account) | "Required" |
| Last 4 digits | Text | Yes | Exactly 4 digits | Empty | "Must be 4 digits" |
| Full account number | Text | No | 6–18 digits after removing spaces and hyphens | Empty (never shown back) | "Must be 6–18 digits"; server "Account number must be 6–18 digits" |
| IFSC | Text | No | 11 characters: 4 letters, 0, 6 letters/digits; a bare "XXXX0" counts as not entered | Bank prefix | "11 characters, e.g. HDFC0001234" |
| Customer ID | Text | Yes in the form (optional on the server) | ≤64 | Copied from same bank | "Required" |
| Nickname | Text | No | ≤120 | — | — |
| Current balance | Text | No | A number, may be negative | Empty | "Must be a number" |
| Nominee / Relation | Text | No | ≤200 / ≤60 | — | — |
| Card last 4 | Text | No | 4 digits | — | "Must be 4 digits" |
| Expiry | Two selects | No | Both month and year, or neither; years from this year to +20 | — | "Pick both month and year" |
| Status | Select | Yes | Active, Dormant, Closed | Active | — |

**Settings and toggles here:** S-BANK-001 **Account type** — a label (Savings, Current, Salary, NRE, NRO, OD); no calculation uses it. S-BANK-002 **Status** — Active accounts count in **Total balance**; Closed accounts are skipped when email events are matched to an account (F-BANK-008); Dormant/Closed tiles show the status instead of "Available balance".

**Results:** The account is saved; the full number is encrypted; the customer ID is stored encrypted too. Typing a new full number replaces the saved one and updates the last 4.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "IFSC not found — check the code." | No branch has that code | Check the code |
| "Couldn't look up the branch. Fill it in below." | Lookup service unreachable | Type branch details by hand |
| "Failed to add account" / "Failed to update account" | Server rejected the data (the specific reason is not shown) | Check lengths and formats above |

**Limitations:** The form requires Customer ID although the server does not. Saving an edit always re-saves the balance, so an account updated from email loses its "live" mark after you edit it (see DOCUMENTATION_GAPS.md). The saved full number cannot be removed from the form (leaving the box empty keeps it). Opening and closing dates exist on the server but are not in the form.

**How it works:** `POST /api/bank-accounts` / `PATCH /api/bank-accounts/:id`. IFSC details come from `GET /api/bank-accounts/ifsc/:code`, which asks Razorpay's public IFSC service (5-second timeout) and remembers answers, including "not found", in server memory. A new account fills only empty branch fields; editing to a different IFSC replaces them. A balance typed here sets the balance date to the **As of** date (today if blank) and marks the source as manual.

**Related features:** F-BANK-001, F-BANK-004, F-BANK-005.

**Sources:** `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:24`, `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:229`, `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:254`, `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:270`, `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:300`, `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:318`, `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:337`, `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:448`, `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:469`, `packages/api/src/controllers/bankAccounts.controller.ts:26`, `packages/api/src/controllers/bankAccounts.controller.ts:115`, `packages/api/src/services/banking/bankAccounts.service.ts:98`, `packages/api/src/services/banking/bankAccounts.service.ts:166`, `packages/api/src/services/banking/bankAccounts.service.ts:245`, `packages/api/src/services/banking/ifscLookup.service.ts:14`, `packages/api/src/services/banking/ifscLookup.service.ts:63`

### Delete a bank account <!-- F-BANK-003 -->

**What it does:** Deletes an account after an in-tile confirmation "Delete <bank> account ending <last 4>?".

**Why it exists:** Inferred from behavior: remove accounts you no longer track (you can also mark them Closed instead).

**Where to find it:** **Bank Accounts** → tile → **Delete**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click **Delete** on the tile. The tile turns into a confirmation.
2. Click **Delete** to confirm ("Account deleted") or **Cancel**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Delete** / **Cancel** | Buttons | Confirm / cancel | **Delete** disabled while deleting |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** The account and its balance history are deleted; cash-flow entries that were attached to it are kept but no longer linked to an account.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to delete account" | Server error | Try again |

**Limitations:** No undo; there is no Delete button on the detail page.

**How it works:** `DELETE /api/bank-accounts/:id` (owner checked); balance snapshots are removed by cascade; cash flows keep their rows with the account link cleared.

**Related features:** F-BANK-001.

**Sources:** `apps/web/src/pages/bankAccounts/BankAccountListPage.tsx:185`, `apps/web/src/pages/bankAccounts/BankAccountListPage.tsx:243`, `packages/api/src/services/banking/bankAccounts.service.ts:259`, `packages/api/prisma/schema.prisma:3232`, `packages/api/prisma/schema.prisma:1259`

### Bank account detail <!-- F-BANK-004 -->

**What it does:** Shows one account: the large building tile, **Edit**, **Record balance**, **Share details**; an **Available balance** card ("As of <date>", with a pulsing "live from Gmail" when updated from email); **Bank details** (Bank, Type, Account number with eye, Customer ID, IFSC, Branch, Branch address, Status); **Holder & nominee** (Holder, Joint, Nominee, Relation); **Linked debit card** (Card last 4 as "•••• 1234", Expires) when set; then balance history (F-BANK-007) and recent activity (F-BANK-008).

**Why it exists:** Inferred from behavior: every detail of one account, plus how its balance moved.

**Where to find it:** **Bank Accounts** → tile (route `/bank-accounts/:id`).

**Who can use it:** The account's owner.

**Steps**
1. Read the details. Use **Edit**, **Record balance** or **Share details**.
2. Click **All accounts** to go back.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **All accounts** | Button | Opens `/bank-accounts` | — |
| **Edit** | Button | F-BANK-002 | — |
| **Record balance** | Button | F-BANK-007 | — |
| **Share details** | Button | F-BANK-006 | — |
| Account number eye | Toggle | F-BANK-005 | — |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Account not found." with **Back to bank accounts** | Deleted, or not yours | Go back |

**Limitations:** Empty fields show "—".

**How it works:** `GET /api/bank-accounts/:id` (owner only) with up to the 365 most recent balance records.

**Related features:** F-BANK-005, F-BANK-006, F-BANK-007, F-BANK-008.

**Sources:** `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:130`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:154`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:197`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:213`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:241`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:279`, `packages/api/src/services/banking/bankAccounts.service.ts:155`

### Reveal full account number <!-- F-BANK-005 -->

**What it does:** The account number shows as "●●●● ●●●● 1234". The eye (**Show account number**) fetches and shows the full number grouped in fours; clicking again (**Hide account number**) masks it.

**Why it exists:** Code comment: the full number is "fetched on demand from the audited reveal endpoint and held only in component state".

**Where to find it:** The account number line on a tile or on the detail page.

**Who can use it:** The account's owner.

**Steps**
1. Click the eye. A spinner shows, then the full number.
2. Click again to hide it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Show account number** / **Hide account number** | Icon toggle | Reveals/masks | Disabled while loading |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Each reveal writes an audit record ("pii_view", account number). The number re-masks when you open another account or the account changes.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Only the last 4 digits are saved. Edit the account to add the full number." | No full number saved | Edit the account |
| "Could not reveal the account number. Try again in a minute." | Error, or more than 5 reveals/shares in a minute | Wait a minute |
| "Could not decrypt the account number — the encryption key may have changed" | Server key problem | Contact support |

**Limitations:** Reveal and share together are limited to 5 per minute per user.

**How it works:** `POST /api/bank-accounts/:id/reveal` (rate-limited, response not cached) decrypts the stored number and records the audit row before returning it.

**Related features:** F-BANK-006.

**Sources:** `apps/web/src/components/bankAccounts/AccountNumberReveal.tsx:6`, `apps/web/src/components/bankAccounts/AccountNumberReveal.tsx:39`, `apps/web/src/components/bankAccounts/AccountNumberReveal.tsx:43`, `apps/web/src/components/bankAccounts/AccountNumberReveal.tsx:68`, `packages/api/src/routes/bankAccounts.routes.ts:38`, `packages/api/src/middleware/rateLimit.ts:196`, `packages/api/src/services/banking/bankAccounts.service.ts:114`, `packages/api/src/services/banking/bankAccounts.service.ts:274`

### Share bank details <!-- F-BANK-006 -->

**What it does:** **Share details** prepares a text with the bank name, holder, full account number, IFSC, branch and branch address. On touch devices it opens your phone's share sheet (WhatsApp, SMS, email…); on computers it copies the text ("Bank details copied").

**Why it exists:** Code comment: "Plain-text bank details for the user to send onward (to receive a transfer)."

**Where to find it:** Under each tile and on the detail page.

**Who can use it:** The account's owner.

**Steps**
1. Click **Share details**. A spinner shows.
2. Choose an app in the share sheet, or paste the copied text where you need it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Share details** | Button | Builds and shares/copies the text | Disabled while loading |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** The text is lines: "<Bank> account details", "Account holder: <name>", "Account number: <number>", and when known "IFSC: …", "Branch: …", "Branch address: …". An audit record "pii_share" is written. Missing branch name/address are filled from the IFSC and saved to the account.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Add the full account number (Edit) to share bank details." | No full number saved | Edit the account |
| "Couldn't load bank details. Try again in a minute." | Error or rate limit (5 per minute) | Wait |
| "Couldn't copy: the browser blocked clipboard access." | Browser refused | Allow clipboard access |

**Limitations:** Closing the share sheet without choosing an app does nothing; other share-sheet failures fall back to copying.

**How it works:** `POST /api/bank-accounts/:id/share` (shares the 5-per-minute limit with reveal); the IFSC lookup failing does not block sharing.

**Related features:** F-BANK-005.

**Sources:** `apps/web/src/components/bankAccounts/ShareBankDetailsButton.tsx:8`, `apps/web/src/components/bankAccounts/ShareBankDetailsButton.tsx:15`, `apps/web/src/components/bankAccounts/ShareBankDetailsButton.tsx:32`, `apps/web/src/components/bankAccounts/ShareBankDetailsButton.tsx:52`, `packages/api/src/services/banking/bankAccounts.service.ts:312`, `packages/api/src/services/banking/bankAccounts.service.ts:347`, `packages/api/src/services/banking/bankAccounts.service.ts:387`

### Record balance and balance history <!-- F-BANK-007 -->

**What it does:** **Record balance** saves an account's balance on a date. With two or more records, a **Balance history** chart appears; **Recorded balances** lists every record (Date, Balance, Source, Note) with a delete button.

**Why it exists:** Inferred from behavior: track how a balance changes over time from statements.

**Where to find it:** Bank account detail → **Record balance**; sections below the details.

**Who can use it:** The account's owner.

**Steps**
1. Click **Record balance**. "Record balance" opens.
2. Set **As of** (today by default), **Balance (₹)** and optional **Note (optional)**.
3. Click **Record**. "Balance recorded" appears.
4. To remove a record, click its bin (**Delete**) — it is deleted at once.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **As of** | Date | Date of the balance | — |
| **Balance (₹)** ("123456.78") | Text | Amount | — |
| **Note (optional)** ("Monthly statement, etc.") | Text | Note | — |
| **Cancel** / **Record** | Buttons | Close / save | **Record** disabled until the balance is a number, and while saving |
| **Delete** (bin in a row) | Icon button | Deletes that record | Disabled while deleting |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| As of | Date | Yes | YYYY-MM-DD | Today (UTC date) | Server validation message |
| Balance | Text | Yes | Number, may be negative | — | Button stays disabled |
| Note | Text | No | ≤500 characters | — | — |

**Settings and toggles here:** None.

**Results:** One record per account per date — recording the same date again replaces it. If it is the newest record, the account's current balance and "As of" date take its values.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to save snapshot" | Server error | Try again |

**Limitations:** Deleting a record does not change the account's current balance and has no confirmation or message. The chart's axis shows thousands ("₹100k") and is not hidden by **Hide values**. The default date is the UTC date, which before 05:30 IST is yesterday.

**How it works:** `POST /api/bank-accounts/:id/snapshots` upserts by (account, date); `DELETE /api/bank-accounts/snapshots/:id` checks ownership. Records you add are "manual"; the account's balance source becomes "statement" when a manual record is the newest.

**Related features:** F-BANK-004, F-BANK-008.

**Sources:** `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:53`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:109`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:142`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:300`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:326`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:365`, `packages/api/src/controllers/bankAccounts.controller.ts:54`, `packages/api/src/services/banking/bankAccounts.service.ts:400`, `packages/api/src/services/banking/bankAccounts.service.ts:427`, `packages/api/src/services/banking/bankAccounts.service.ts:445`

### Recent activity and live balance from email <!-- F-BANK-008 -->

**What it does:** **Recent activity** lists up to 50 latest credits and debits attached to this account (date, description, +/− amount). When EveryPaisa reads a bank alert (from your connected Gmail) whose last 4 digits match this account, the credit or debit is attached here and the balance moves with it; the balance then shows "live from Gmail" (tile: "· live").

**Why it exists:** Code comment: lets "UPI/NEFT/INTEREST credits/debits land against the right account based on accountLast4".

**Where to find it:** Bank account detail → **Recent activity** (shown when there is any).

**Who can use it:** The account's owner; requires email ingestion (D-BANK-001).

**Steps:** Not applicable — view only; entries arrive automatically.

**Controls:** None.

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Inflows add to and outflows subtract from the current balance; a balance record for that day is written with source "auto event".

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| An alert's money does not appear on the account | You have two non-closed accounts ending in the same 4 digits, or the alert had no account digits | Give accounts distinct last 4 digits (mark old ones Closed) |
| The balance does not move with alerts | No current balance was ever entered | Enter a current balance once |

**Limitations:** Only the latest 50 entries are shown. Closed accounts are never matched.

**How it works:** When an email-parsed event is turned into a cash flow, the account is matched by last 4 digits among your non-closed accounts (exactly one match required); the balance is changed with an atomic increment, then that day's balance record is upserted. `GET /api/bank-accounts/:id/cashflows?limit=50` lists entries newest first.

**Related features:** F-BANK-007, D-BANK-001, D-BANK-002 (Cash Activity).

**Sources:** `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:136`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:224`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:419`, `packages/api/src/services/banking/bankAccounts.service.ts:458`, `packages/api/src/services/banking/bankAccounts.service.ts:486`, `packages/api/src/services/banking/bankAccounts.service.ts:517`

### What this area doesn't do
- Bank balances are not added to Total Net Worth on the Dashboard.
- There is no direct bank connection here; balances come from what you type, statements you record, or email alerts (account-aggregator connections are under Connectors).
- You cannot import a bank statement file on this page.
- You cannot see or share another family member's bank accounts.
- Deleting a recorded balance does not recalculate the current balance.

## Alerts & Reminders

The Alerts & Reminders page collects dated reminders that EveryPaisa creates for you — maturities, premiums, EMIs, card dues, vehicle expiries, overdue rent, property tax and more — plus reminders you add yourself, grouped by when they fall due.

### Alerts & Reminders page <!-- F-ALERT-001 -->

**What it does:** "Inbox — Alerts & Reminders" ("Maturities, premium due dates, expiries and your own reminders — grouped by when they land.") lists alerts in bands: **Overdue** (past their date), **This week** (next 7 days), **This month** (next 30 days), **Later** (beyond 30 days). Each row shows when ("in 3d", "today", "tomorrow", "5d late", or for loan checks "2d ago") with the exact date, the type label, the title (a link for loan and will alerts) and description. Chips **All**, **Overdue**, **Due ≤ 7d**, **Unread** (with counts) and a type picker filter the list.

**Why it exists:** Code comment: "The only question this page answers is 'what must I do, and by when'."

**Where to find it:** **Tools → Alerts** or the bell in the top bar (route `/alerts`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO — your own alerts (R-MANAGER: the managed person's).

**Steps**
1. Open the page. Unread alerts have an accent bar on the left (red when overdue) and bold titles.
2. Click a chip to show only that group; pick a type in **All types** to filter by type.
3. Click a linked title to open its item (loan alerts open the loan; will reviews open Will Maker).
4. Use **Previous** / **Next** for more pages.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **All**, **Overdue**, **Due ≤ 7d**, **Unread** | Filter chips with counts | Show that group of the loaded page | — |
| **All types** picker | Select | FD maturity, Bond maturity, MF lock-in, SIP due, Insurance premium, Dividend, Corporate action, Price target, Loan refinance, Loan rate change, Will review, Custom | — |
| Linked title | Link | `/loans/<id>` for Loan refinance / Loan rate change (`/loans` without an id); `/will` for Will review | Other types are plain text |
| **Mark all read** | Button | F-ALERT-002 | Hidden with no unread alerts |
| Row actions | Icon buttons | F-ALERT-002 | — |
| **Scan now**, **New reminder** | Buttons | F-ALERT-004, F-ALERT-003 | — |
| **Show all** | Button | Clears the chip filter | Only when a chip hides everything |
| **Previous** / **Next** ("Page X of Y") | Buttons | Page through | More than one page only |

**Fields and rules:** None.

**Settings and toggles here:** S-ALERT-001 **Alert lens** — All (default), Overdue, Due ≤ 7d, Unread; not remembered. S-ALERT-002 **Alert type filter** — All types (default) or one type; resets to page 1; not remembered.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "All clear — Nothing is due. Alerts appear here for maturities, premium due dates, vehicle expiries and rent reminders." | No active alerts | **Create a reminder** if you want one |
| "Nothing in this view — N alert(s) loaded, but none match this filter." | The chip hides all loaded alerts | **Show all** |

**Limitations:** 30 alerts per page; the chip counts and chips filter only the loaded page ("Showing N of M · K unread in total" states the scope). Loan-check alerts (Loan refinance, Loan rate change) are news dated when raised, so they are never "Overdue". Several kinds of alert cannot be picked in **All types** (EMI due, card due, loan given due, insurance claim, property tax, possession, PF refresh, F&O) and show their raw type name in lower case; vehicle-expiry and rent-overdue alerts are stored as "Custom" and are not linked. Dismissed alerts cannot be brought back.

**How it works:** `GET /api/alerts?type=&page=&limit=30` returns active alerts, unread first then by date (latest first), with the total and the overall unread count. The page then sorts each band soonest first. Days are counted from local midnight.

**Related features:** F-ALERT-002 to F-ALERT-005, F-SHELL-008, F-DASH-003.

**Sources:** `apps/web/src/pages/alerts/AlertsPage.tsx:46`, `apps/web/src/pages/alerts/AlertsPage.tsx:61`, `apps/web/src/pages/alerts/AlertsPage.tsx:82`, `apps/web/src/pages/alerts/AlertsPage.tsx:93`, `apps/web/src/pages/alerts/AlertsPage.tsx:100`, `apps/web/src/pages/alerts/AlertsPage.tsx:327`, `apps/web/src/pages/alerts/AlertsPage.tsx:369`, `apps/web/src/pages/alerts/AlertsPage.tsx:423`, `apps/web/src/pages/alerts/AlertsPage.tsx:465`, `apps/web/src/pages/alerts/AlertsPage.tsx:513`, `apps/web/src/pages/alerts/alertLinks.ts:5`, `apps/web/src/pages/alerts/alertLinks.ts:15`, `packages/api/src/services/notifications/alerts.service.ts:17`

### Mark read, mark all read, dismiss <!-- F-ALERT-002 -->

**What it does:** Each unread alert has a tick (**Mark as read**); every alert has a bin (**Dismiss**) that removes it from the list; **Mark all read** marks all your unread alerts read.

**Why it exists:** Inferred from behavior: keep the list to what still needs action.

**Where to find it:** Alerts page rows and the control row.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click the tick on a row — it loses its accent bar and bold title.
2. Click the bin to dismiss it — it disappears.
3. Click **Mark all read** — "All alerts marked as read".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Mark as read** (tick) | Icon button | Marks one read | Unread rows only |
| **Dismiss** (bin) | Icon button | Removes the alert | — |
| **Mark all read** | Button | Marks all unread as read | Hidden with no unread alerts; disabled while running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** The bell's unread badge updates immediately.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A red message such as "Request failed with status code 404" after **Dismiss**; nothing happens after **Mark as read** | The alert was already dismissed or is not yours (mark-read failures show no message) | Reload the page |

**Limitations:** Dismiss has no confirmation and no undo. A scanner may raise a new alert for the same item at its next threshold (for example vehicle expiry at 30, 15, 7 and 1 days).

**How it works:** `PATCH /api/alerts/:id/read`, `PATCH /api/alerts/mark-all-read`, `DELETE /api/alerts/:id` (sets the alert inactive; the row is kept).

**Related features:** F-ALERT-001, F-SHELL-008.

**Sources:** `apps/web/src/pages/alerts/AlertsPage.tsx:179`, `apps/web/src/pages/alerts/AlertsPage.tsx:190`, `apps/web/src/pages/alerts/AlertsPage.tsx:337`, `apps/web/src/pages/alerts/AlertsPage.tsx:348`, `apps/web/src/pages/alerts/AlertsPage.tsx:442`, `packages/api/src/services/notifications/alerts.service.ts:56`, `packages/api/src/services/notifications/alerts.service.ts:62`, `packages/api/src/services/notifications/alerts.service.ts:70`

### New reminder <!-- F-ALERT-003 -->

**What it does:** "New reminder" creates your own dated reminder with a **Title**, optional **Description (optional)** and **Reminder date**.

**Why it exists:** Inferred from behavior: track things EveryPaisa does not detect itself (placeholder "e.g. FD maturity at SBI").

**Where to find it:** **Alerts → New reminder** (or **Create a reminder** when the list is empty).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click **New reminder**.
2. Type a **Title**, optional description, and pick the **Reminder date** (today by default).
3. Click **Create** ("Creating…" while saving). "Alert created" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Title** | Text | Reminder title | — |
| **Description (optional)** | Text | Details ("Additional details") | — |
| **Reminder date** | Date | Due date | — |
| **Cancel** / **Create** | Buttons | Close / save | **Create** disabled without a title or while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Title | Text | Yes | 1–300 characters | Empty | **Create** stays disabled while empty |
| Description | Text | No | ≤1,000 characters | Empty | Generic request error |
| Reminder date | Date | Yes | YYYY-MM-DD | Today (UTC date) | Generic request error (server rule "Expected YYYY-MM-DD") |

**Settings and toggles here:** None.

**Results:** An unread alert of type Custom appears in its band; the bell count goes up.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A red message such as "Request failed with status code 400" | Validation failed (the server's reason is not shown) | Shorten the text or fix the date |

**Limitations:** No time of day, no repeat, no email or push for custom reminders from this dialog; it cannot be edited after creation (dismiss and recreate).

**How it works:** `POST /api/alerts` with title, description and trigger date; stored as type CUSTOM.

**Related features:** F-ALERT-001.

**Sources:** `apps/web/src/pages/alerts/AlertsPage.tsx:269`, `apps/web/src/pages/alerts/AlertsPage.tsx:273`, `apps/web/src/pages/alerts/AlertsPage.tsx:307`, `packages/api/src/controllers/alerts.controller.ts:21`, `packages/api/src/services/notifications/alerts.service.ts:76`

### Scan now <!-- F-ALERT-004 -->

**What it does:** **Scan now** runs all of EveryPaisa's alert checks for your account immediately instead of waiting for the nightly run, then reloads the list with "Scan complete — N new alerts".

**Why it exists:** Inferred from behavior: see new alerts right after adding a policy, vehicle, loan or deposit.

**Where to find it:** **Alerts → Scan now**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click **Scan now**. Its icon spins.
2. "Scan complete — N new alerts" appears and the list reloads.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Scan now** | Button | Runs the checks | Disabled while running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** New alerts are added for: vehicle expiries (PUC, Insurance, Fitness Certificate, Road Tax at 30, 15, 7 and 1 days), overdue rent, post-office scheme maturities, loan EMIs, money lent coming due, credit-card dues, property tax/possession dates, deposit reminders, insurance renewals and insurance claims. The vehicle and rent checks skip alerts they have already created for the same item and threshold.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A red message such as "Request failed with status code 500" | A check failed | Try again later |

**Limitations:** The number in "Scan complete — N new alerts" counts only vehicle and rent alerts; alerts created by the other checks are added but not counted (see DOCUMENTATION_GAPS.md).

**How it works:** `POST /api/alerts/scan` runs the ten checks in parallel for your user id and returns a count per check.

**Related features:** F-ALERT-005, D-ALERT-001 (alert sources in other chapters).

**Sources:** `apps/web/src/pages/alerts/AlertsPage.tsx:353`, `apps/web/src/pages/alerts/AlertsPage.tsx:355`, `packages/api/src/controllers/alerts.controller.ts:72`, `packages/api/src/services/notifications/alerts.service.ts:13`, `packages/api/src/services/notifications/alerts.service.ts:339`

### Daily alert scan <!-- F-ALERT-005 -->

**What it does:** Every day at 20:45 India time, the same checks as **Scan now** run for every account, so new alerts are waiting for you.

**Why it exists:** Code comment: scheduled "after insurance renewal cron at 20:30".

**Where to find it:** Not a page; results appear on **Alerts** and in the bell count.

**Who can use it:** Automatic for every account.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** None.

**Settings and toggles here:** None for users. Operators can switch it off (`ENABLE_ALERT_CRONS=false`).

**Results:** As F-ALERT-004, for everyone.

**Errors and troubleshooting:** None visible — one account's failure is logged and the rest continue.

**Limitations:** Runs once a day; use **Scan now** for an immediate check.

**How it works:** Lists all users with system access, then runs each user's checks within that user's data context (without it, the database's row security would return nothing).

**Related features:** F-ALERT-004.

**Sources:** `packages/api/src/jobs/alertJobs.ts:25`, `packages/api/src/jobs/alertJobs.ts:45`, `packages/api/src/jobs/alertJobs.ts:48`

### What this area doesn't do
- You cannot edit or snooze an alert, or restore a dismissed one.
- Custom reminders do not repeat and have no time of day.
- Alert e-mail/notification preferences are not set here (see Settings → notifications, D-ALERT-002).
- Family members' alerts are not shown, even in family view.

<!-- END MODULES -->

## Roles and profiles

Role definitions are global (see the merged manual). How each role behaves in the chapters above is summarised here; full detail is in USER_ROLES_AND_PERMISSIONS.md.

### Signed-out visitor <!-- R-VISITOR -->
Cannot reach any page in this fragment; every address here sends a signed-out visitor to the sign-in page.

### Free user <!-- R-FREE -->
Full use of the Dashboard, Transactions, Bank Accounts, Alerts and the app frame; 1 portfolio; portfolio groups over that portfolio; the AI Assistant shows one locked preview only. Sees the Dashboard upgrade banner, the header **Upgrade** button and the **Go Plus** card.

### Plus subscriber <!-- R-PLUS -->
As Free, plus up to 5 portfolios and the AI Assistant with 100 questions a day.

### Family subscriber <!-- R-FAMILY -->
As Plus, AI Assistant 200 questions a day; up to 5 portfolios.

### Pro/Advisor subscriber <!-- R-PRO -->
As Family, unlimited portfolios, AI Assistant 500 questions a day; no upgrade prompts.

### Administrator <!-- R-ADMIN -->
No admin-only powers in these chapters; an administrator has the access of their own plan.

### Family owner <!-- R-FAMOWNER -->
In family view: the Dashboard, Portfolios and Transactions show every active member's data in full; may edit or delete family-shared portfolios. Cannot add, edit or delete transactions in portfolios they did not create.

### Family contributor <!-- R-FAMCONTRIB -->
In family view: other members' figures are filtered by their permitted asset classes and categories; their own data is always shown in full. Cannot add transactions to family-shared portfolios created by others.

### Family viewer <!-- R-FAMVIEWER -->
Same as a family contributor in these chapters.

### Managing a family member's account <!-- R-MANAGER -->
Every page in this fragment shows and changes the managed person's data, with the manager's plan; the AI Assistant does not work while managing (questions fail with "Chat session not found").

### Professional acting for a client <!-- R-PROF -->
Not applicable in these chapters — a client's books are opened from **Client books**, not from these pages.

### AI chatbot connection <!-- R-AICONN -->
Not applicable — external chatbots use their own read-only connection, not these pages.

### Succession nominee <!-- R-NOMINEE -->
Not applicable — nominees cannot reach these pages.

## Glossary

| Term | Meaning |
|---|---|
<!-- BEGIN GLOSSARY -->
| Hide values | The eye button in the top bar that covers amounts and numbers across the app with grey bars; remembered on this browser. |
| Net after debts | Dashboard figure: Total Net Worth minus outstanding loans and credit-card balances. |
| Net worth over time | Dashboard chart of your net worth after liabilities, from one snapshot taken each night at 23:45 IST. |
| Portfolio value over time | Dashboard chart of the market value of the selected portfolios by day; only stocks use past prices, other holdings are at cost on past days. |
| XIRR | Annualised return that accounts for when money went in and out. Shown per holding on a portfolio page; the Dashboard shows a simple average of the portfolios' XIRRs. |
| TWR | Time-weighted return for your whole account, shown beside XIRR on the Dashboard. |
| CMP | Current market price of one unit of a holding. |
| cost basis / at cost | A holding with no market price is valued at what you paid for it. |
| accrued | An interest-earning holding valued at principal plus interest earned so far. |
| no price | No current price is available for the holding, so no profit or loss is shown. |
| Duplicate / Probably fine | Labels in **Find duplicates**: a set that is almost certainly recorded twice (pre-ticked), or a set with a likely reason to be separate (not ticked). |
| Record it anyway | Button that saves a transaction even though an identical one already exists. |
| Customer ID | The bank-issued customer number (CIF); the same for all your accounts at one bank. |
| IFSC | The 11-character bank branch code (for example HDFC0001234). |
| live / live from Gmail | A bank balance last updated automatically from a bank alert e-mail. |
| Recorded balances | Dated balances you entered for a bank account; they draw its balance history. |
| Overdue / This week / This month / Later | Alert bands: past due; due in 7 days or fewer; in 30 days or fewer; beyond 30 days. |
| Reminder | An alert you create yourself on the Alerts page (type Custom). |
| Scan now | Runs all alert checks for your account immediately. |
| Portfolio Assistant | The AI Assistant chat panel opened from the floating button. |
| AI-use notice | "How EveryPaisa uses AI in advice" — must be accepted before the assistant answers. |
| Free preview | The single locked answer a Free account can see in the AI Assistant. |
<!-- END GLOSSARY -->
