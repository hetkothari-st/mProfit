---
id: F-SHELL-009
title: "Upgrade prompts (header button, sidebar card, lock card)"
module: "App layout and navigation"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY"
settings: []
related: [F-DASH-016]
---

[← App layout and navigation](../modules/app-layout-and-navigation.md) · [Index](../INDEX.md)

# Upgrade prompts (header button, sidebar card, lock card)

`F-SHELL-009` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family)

**What it does:** Three prompts lead to the plans page. The **Upgrade** button in the top bar and the upgrade card at the bottom of the sidebar show on every page unless you are on Pro/Advisor. The card names the next plan: **Go Plus** ("Full reports, AI insights, more portfolios") on Free, **Go Family** ("Share your portfolio with family") on Plus, **Go Pro/Advisor** ("Full accounting module, unlimited clients") on Family. A section your plan does not include shows a lock card: "<feature> is locked — Upgrade to <plan> to unlock <feature>." with **View plans** (or, in its compact form, **Upgrade**), drawn over a blurred preview of the section.

**Why it exists:** Code comment: "showing what's behind the paywall drives upgrades better than hiding the section outright, which just reads as a bug."

**Where to find it:** Top bar (**Upgrade**), sidebar footer (upgrade card), and inside any locked section.

**Who can use it:** Shown to [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family) (and [R-ADMIN](../roles.md#r-admin) by their plan). Hidden for [R-PRO](../roles.md#r-pro).

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

**Related features:** [D-SHELL-007](../dependencies.md#d-shell-007) (Pricing and checkout), [F-DASH-016](F-DASH-016.md).

**Sources:** `apps/web/src/components/layout/Header.tsx:114`, `apps/web/src/components/layout/UpgradeSidebarCard.tsx:5`, `apps/web/src/components/layout/UpgradeSidebarCard.tsx:21`, `apps/web/src/components/common/LockedFeature.tsx:50`, `apps/web/src/components/common/LockedFeature.tsx:59`, `apps/web/src/components/common/LockedFeature.tsx:64`, `packages/api/src/services/auth/auth.service.ts:65`
