---
id: F-FAM-024
title: "Managing a family member's account"
module: "Family"
status: Live
roles: "R-MANAGER"
settings: [S-FAM-007]
related: [F-FAM-009, F-FAM-015]
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Managing a family member's account

`F-FAM-024` · Live · Roles: [R-MANAGER](../roles.md#r-manager)

**What it does:** Lets the person who keeps a managed member's books switch the browser tab into that member's account to add their FDs, insurance and anything else. While managing, a full-width strip says "You are managing <name>'s account. Everything you add here is theirs." with **Back to my account**.

**Why it exists:** Service comment: a managed profile "is a real User row that owns that data, so every existing page — stocks, FDs, insurance, reports, tax — works for them unchanged."

**Where to find it:** User menu (top right) → **Accounts you manage** → a name; or the tree card's **Record something for <first name>**; or **Open <name>'s account** right after adding them.

**Who can use it:** The keeper ([R-MANAGER](../roles.md#r-manager)) — must be the profile's keeper, and both must be active in the same family. Features follow the keeper's plan.

**Steps**
1. Open the user menu and click a name under **Accounts you manage**. The toast "Now managing <name>'s account" appears and the dashboard opens with the managing strip.
2. Use any data page; everything you add belongs to that person.
3. Click **Back to my account** (strip or user menu). The dashboard opens in your own account.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Accounts you manage** items | Menu items | Enter that account | Hidden when you keep nobody; the current one is disabled |
| **Record something for <first name>** | Button (tree card) | Enter that account | Only for profiles you keep |
| **Back to my account** | Button (strip and user menu) | Leave the managed account | Shown only while managing |

**Fields and rules:** Not applicable — no data entry.

**Settings and toggles here:** [S-FAM-007](../settings/family.md#s-fam-007) **Managing (acting as)** — per browser tab; closing the tab ends it.

**Results:** Data requests run as the managed person; family view is cleared; caches are emptied on enter and leave.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "You cannot act for this profile." (toast fallback "You cannot open this account.") | Not their keeper, or a membership ended | Ask an owner |
| "Switch back to your own account to do this." | Sign-in, billing, family, professional access, Gmail, mailboxes and Succession are refused while managing | Click **Back to my account** |
| "Will Maker works on your own account only. Switch back to your own account to make or view your will." | Will Maker refuses managing | Same |

**Limitations:** Onboarding redirects to `/portfolios` while managing. The Succession page shows the refusal message instead of the page. Entering a profile is audit-logged once per switch, not per action.

**How it works:** `GET /api/managed-profiles` lists profiles you keep; `POST /api/managed-profiles/:profileId/enter` checks and writes an audit row "managed_profile_enter". The tab stores the profile in sessionStorage and the client adds `X-Act-As` to data requests (not account routes); the server re-checks keeper and both memberships on every request and binds row-level security to the profile, with role INVESTOR and the keeper's plan.

**Related features:** [F-FAM-009](F-FAM-009.md), [F-FAM-015](F-FAM-015.md), [D-FAM-003](../dependencies.md#d-fam-003).

**Sources:** `apps/web/src/components/layout/Header.tsx:60`, `apps/web/src/components/layout/Header.tsx:236`, `apps/web/src/components/family/ActingAsBanner.tsx:13`, `apps/web/src/hooks/useManageProfile.ts:18`, `apps/web/src/stores/actingAs.store.ts:28`, `apps/web/src/lib/sessionBoundary.ts:44`, `packages/api/src/middleware/authenticate.ts:13`, `packages/api/src/services/family/managedProfile.service.ts:37`, `packages/api/src/services/family/managedProfile.service.ts:76`, `packages/api/src/routes/managedProfiles.routes.ts:39`
