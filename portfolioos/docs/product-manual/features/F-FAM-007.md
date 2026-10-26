---
id: F-FAM-007
title: "Family dashboard: protection and liabilities"
module: "Family"
status: Live
roles: "Members on FAMILY+ plan"
settings: [S-FAM-005]
related: [F-FAM-004, F-FAM-021]
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Family dashboard: protection and liabilities

`F-FAM-007` · Live · Roles: Members on FAMILY+ plan

**What it does:** Card "Cover, gaps and what falls due": per member life cover, recommended cover, gap, health cover, annual premium, debt outstanding and monthly EMI; household totals; members with no cover; renewals due within 30 days.

**Why it exists:** Code comment: life-cover adequacy uses "the same 10x-annual-income heuristic the health score shows, so the two pages cannot disagree about whether a member is underinsured."

**Where to find it:** **Overview → Family → Overview** tab, protection card.

**Who can use it:** Same as [F-FAM-004](F-FAM-004.md); siblings' insurance needs the Insurance category, loans the Loans category, cards the Credit cards category.

**Steps**
1. Open the **Overview** tab and read the protection card — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Member table | Display | Columns **Member**, **Life cover**, **Recommended**, **Health cover**, **Annual premium**, **Debt outstanding**, **Monthly EMI** | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-FAM-005](../settings/family.md#s-fam-005) (Insurance, Loans, Credit cards categories).

**Results:** Read-only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No member's policies are shared with you — N members in this family, all restricted." | Your caps hide all siblings' protection data | Ask an owner |
| "No policies recorded. Add life and health cover to see the household against what it needs." | No active policies | Add policies on **Insurance** |
| Recommended shows a hover note "No income on file, so the 10x rule cannot size this" | The member has no active monthly income | Record income ([D-FAM-008](../dependencies.md#d-fam-008)) |

**Limitations:** Members with no income are left out of the household requirement and gap totals (counted in "unsized" members). A hidden member is never listed as "no cover".

**How it works:** `GET /api/families/:familyId/dashboard/protection`. Per member, ACTIVE policies are summed by type (life types, HEALTH, other); annual premium uses each policy's frequency; renewals are policies whose next premium is due within 30 days. Required life cover = 10 × annual income (annual income = active monthly income × 12); gap = max(0, required − life cover). Loan outstanding comes from each ACTIVE loan's amortisation summary (falls back to principal if the loan cannot be scheduled); card outstanding uses the stored outstanding balance or the statement summary. Household totals sum members; requirement and gap sum only sized members.

**Related features:** [F-FAM-004](F-FAM-004.md), [F-FAM-021](F-FAM-021.md), [D-FAM-008](../dependencies.md#d-fam-008).

**Sources:** `apps/web/src/pages/family/widgets/FamilyProtectionCard.tsx:127`, `packages/api/src/services/family/familyAggregate.service.ts:546`, `packages/api/src/services/family/familyAggregate.service.ts:608`, `packages/api/src/services/family/familyAggregate.service.ts:674`
