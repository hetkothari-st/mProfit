---
id: F-SHELL-002
title: "Asset Classes sidebar customisation"
module: "App layout and navigation"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-ADMIN"
settings: [S-SHELL-003, S-SHELL-004]
related: [F-DASH-010, F-DASH-011, F-DASH-012, F-SHELL-001]
---

[← App layout and navigation](../modules/app-layout-and-navigation.md) · [Index](../INDEX.md)

# Asset Classes sidebar customisation

`F-SHELL-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-ADMIN](../roles.md#r-admin)

**What it does:** Lets you choose which asset classes appear in the sidebar, in what order, and whether they are sorted by how much you hold. You can drag classes into your own order, hide classes you don't use, add the optional classes (Bonds, Crypto, Forex, NPS, Post Office) and remove them again. Your saved order and hidden classes also control the Dashboard: holdings, pie slices and summary cards of hidden classes are left out there.

**Why it exists:** Inferred from behavior and code comments: most people hold only a few of the 19 classes; optional classes are "absent (not hidden) until they do" so the list stays short, and "By value" puts what matters most at the top.

**Where to find it:** Sidebar → **Asset Classes** heading (full-width sidebar only; the buttons are not shown on the icon rail or while folded).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-ADMIN](../roles.md#r-admin).

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

**Settings and toggles here:** [S-SHELL-003](../settings/app-layout-and-navigation.md#s-shell-003) **By value / My order** — By value (the starting choice): biggest class first, classes with nothing in them below and shown faded; My order: your saved order. Stored on this browser. [S-SHELL-004](../settings/app-layout-and-navigation.md#s-shell-004) **Asset class order and visibility** — saved on your account, so it follows you to every device; hidden classes are also removed from the Dashboard.

**Results:** The sidebar shows your order; hidden classes disappear from the sidebar and from the Dashboard's holdings list, pie and summary cards. Optional classes you remove are no longer offered as hidden — they return to **Add asset class**.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Red text under the heading (the server's error, or "Failed to save") | Saving the list failed | Click **Done** again; adding a class that fails to save is undone automatically |
| A class page exists but the class is not in the sidebar | It is an optional class you have not added, or it is hidden | Use **Add asset class**, or **Edit** → show it |

**Limitations:** In By value mode the sidebar ranks by: current value for assets, balance for bank accounts (all accounts, including closed ones), amount owed for loans and credit cards (by size, not sign), and yearly premium for insurance. While By value is on, dragging is not possible — editing always shows the saved order. The Dashboard pie maps some non-holding slices to the wrong sidebar entry (Vehicles follows **Others**, rental property follows **Real Estate**) — see DOCUMENTATION_GAPS.md.

**How it works:** Preferences are read from and written to `/api/user/preferences` (stored in the account's `preferences.assetSections`). On read, the server keeps your saved entries in saved order and appends any core class you have not seen yet (visible, at the end); optional classes are kept only if you added them after the "opt-in" change (version 2 of the saved format). Saving stamps the current version. Values for By value come from the dashboard net-worth figures, the bank-accounts list and the real-estate summary, and the list waits until they have loaded so it does not reshuffle. Ties keep your saved order.

**Related features:** [F-SHELL-001](F-SHELL-001.md), [F-DASH-010](F-DASH-010.md), [F-DASH-011](F-DASH-011.md), [F-DASH-012](F-DASH-012.md).

**Sources:** `apps/web/src/components/layout/AssetClassSectionList.tsx:61`, `apps/web/src/components/layout/AssetClassSectionList.tsx:91`, `apps/web/src/components/layout/AssetClassSectionList.tsx:104`, `apps/web/src/components/layout/AssetClassSectionList.tsx:169`, `apps/web/src/components/layout/AssetClassSectionList.tsx:179`, `apps/web/src/components/layout/SortableAssetClassItem.tsx:44`, `apps/web/src/stores/assetSections.store.ts:71`, `apps/web/src/stores/assetSections.store.ts:92`, `apps/web/src/hooks/useSidebarClassValues.ts:50`, `apps/web/src/lib/sidebarClassValues.ts:85`, `apps/web/src/lib/sidebarClassValues.ts:113`, `packages/api/src/controllers/userPreferences.controller.ts:7`, `packages/api/src/services/account/userPreferences.service.ts:45`, `packages/shared/src/types/preferences.ts:17`
