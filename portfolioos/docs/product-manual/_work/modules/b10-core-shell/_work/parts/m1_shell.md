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

