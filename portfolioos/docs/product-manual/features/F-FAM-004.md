---
id: F-FAM-004
title: "Family dashboard: household wealth"
module: "Family"
status: Live
roles: "Members on FAMILY+ plan"
settings: [S-FAM-004, S-FAM-005]
related: [F-FAM-005, F-FAM-006, F-FAM-007, F-FAM-014, F-FAM-021]
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Family dashboard: household wealth

`F-FAM-004` · Live · Roles: Members on FAMILY+ plan

**What it does:** On the **Overview** tab, shows the household's gross assets, liabilities and net of liabilities, a breakdown of "Who the household's wealth sits with" (per member: net worth, invested, share), and "What the household owns, combined" (merged allocation). Members whose data you may only partly see are marked **Partial**.

**Why it exists:** The page comment: "Overview is the household's financial picture: wealth and who it sits with, shared goals, protection and liabilities, and a ranked feed of what needs attention."

**Where to find it:** **Overview → Family → Overview** tab (default tab).

**Who can use it:** Any active member whose own plan is FAMILY or higher ([R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) acting as [R-FAMOWNER](../roles.md#r-famowner) / [R-FAMCONTRIB](../roles.md#r-famcontrib) / [R-FAMVIEWER](../roles.md#r-famviewer)). A member on FREE or PLUS sees the lock card "Family dashboard is locked" even though they belong to the family.

**Steps**
1. Open **Overview → Family**, select the family; the **Overview** tab opens first.
2. Read the wealth card. Hover a bar segment to see "<member> — ₹… (x.x%)".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Overview** | Tab | Shows the dashboard cards | — |
| **View plans** | Link (lock card) | Opens `/pricing` | Shown only below FAMILY |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-FAM-004](../settings/family.md#s-fam-004) **Asset classes** and [S-FAM-005](../settings/family.md#s-fam-005) **Non-portfolio categories** (your caps) decide which of the other members' data is counted.

**Results:** Nothing changes; read-only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No member's holdings are shared with you. N members in this family, all restricted." | Your caps hide every sibling's wealth | Ask an owner to widen your visibility ([F-FAM-014](F-FAM-014.md)) |
| "No holdings recorded yet. Once members add portfolios, their share of the household shows up here." | Nobody has holdings | Add holdings |
| "Family dashboard is locked" | Your own plan is below FAMILY | Upgrade, even though you are a member of someone else's family |

**Limitations:** Your own data is never capped; other members' data is filtered by your caps. An empty caps list hides everything in that dimension (see [F-FAM-014](F-FAM-014.md)). Totals are "as of" the moment of the request (no caching beyond 30 s client freshness).

**How it works:** `GET /api/families/:familyId/dashboard/wealth` (`requireFeature('FAMILY_SHARING')` on the caller's plan). The service resolves the caller's scope (403 "You are not an active member of this family." for non-members), then runs the personal dashboard net-worth calculation once per member, each in that member's own security context, limited to that member's personal portfolios plus portfolios shared with this family. Family-shared portfolios are counted once (in their creator's slice). Household net worth = sum of member net worth; unrealised P&L % = household P&L ÷ household invested × 100; each member's share % = member net worth ÷ household net worth × 100 (0 when the household total is 0). Allocation slices are merged by key and re-percented against the household total, sorted by value. `hiddenMemberCount` counts members whose wealth is fully hidden (no asset class and neither Vehicle nor Rental category).

**Related features:** [F-FAM-005](F-FAM-005.md), [F-FAM-006](F-FAM-006.md), [F-FAM-007](F-FAM-007.md), [F-FAM-021](F-FAM-021.md), [F-FAM-014](F-FAM-014.md).

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:359`, `apps/web/src/pages/family/FamilyPage.tsx:568`, `apps/web/src/pages/family/widgets/FamilyWealthCard.tsx:266`, `packages/api/src/routes/families.routes.ts:461`, `packages/api/src/services/family/familyAggregate.service.ts:163`, `packages/api/src/services/family/familyAggregate.service.ts:278`, `packages/api/src/services/family/familyAggregate.service.ts:355`
