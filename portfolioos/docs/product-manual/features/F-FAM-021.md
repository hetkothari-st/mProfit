---
id: F-FAM-021
title: "Family member page"
module: "Family"
status: Live
roles: "Members on FAMILY+ plan"
settings: [S-FAM-004, S-FAM-005]
related: [F-FAM-004, F-FAM-023]
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Family member page

`F-FAM-021` · Live · Roles: Members on FAMILY+ plan

**What it does:** One member in full: net worth, gross assets, invested, unrealised P&L, liabilities, allocation chart ("What they own"), position-by-position holdings, their goals, protection and open items — with clear "Not shared" labels where your caps hide something.

**Why it exists:** Code comment: the page "exists as much to say WHAT IT COULD NOT SHOW as to show what it can".

**Where to find it:** Sidebar family tree → member row (route `/family/members/:userId?familyId=…`).

**Who can use it:** Active members whose own plan is FAMILY or higher (same plan gate as [F-FAM-004](F-FAM-004.md)). Other members' data is filtered by your caps; your own row is never filtered.

**Steps**
1. Click a member in the sidebar family tree. The page header shows "<family> · Member" and their name (or "You").
2. Read the cards; click **Back to the household** to return to `/family`.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Back to the household** | Link | Opens `/family` | — |
| Holdings table | Display | **Asset**, **Class**, **Quantity**, **Invested**, **Current value**, **Unrealised P&L** | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-FAM-004](../settings/family.md#s-fam-004), [S-FAM-005](../settings/family.md#s-fam-005) (your caps).

**Results:** Read-only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "We couldn't find that person in any family you belong to. They may have left, or their membership may have been revoked." | No family contains them | — |
| "Couldn't load this member. You may no longer have permission to see them." | Any load failure — including your own plan being below FAMILY | Upgrade if you are below FAMILY |
| "Goals aren't shared with you" / "Protection isn't shared with you" / "Debt isn't shared with you" | Categories outside your caps | Ask an owner |

**Limitations:** At most 200 holdings (largest current value first) and at most 5 open items are shown. Defect: a FREE/PLUS member gets the generic permission error instead of a plan lock (see DOCUMENTATION_GAPS.md).

**How it works:** `GET /api/families/:familyId/members/:userId/detail` (FAMILY plan gate). Refuses members outside your scope with "That member is not part of a family you can see." Figures reuse the household calculations ([F-FAM-004](F-FAM-004.md)–007) so they agree with the Overview tab.

**Related features:** [F-FAM-004](F-FAM-004.md), [F-FAM-023](F-FAM-023.md).

**Sources:** `apps/web/src/pages/family/FamilyMemberPage.tsx:123`, `apps/web/src/pages/family/FamilyMemberPage.tsx:208`, `apps/web/src/pages/family/FamilyMemberPage.tsx:222`, `packages/api/src/routes/families.routes.ts:485`, `packages/api/src/services/family/familyAggregate.service.ts:1094`, `packages/api/src/services/family/familyAggregate.service.ts:1144`
