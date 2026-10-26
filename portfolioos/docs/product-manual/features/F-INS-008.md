---
id: F-INS-008
title: "Policy page"
module: "Insurance"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-INS-003, F-INS-004, F-INS-016]
---

[← Insurance](../modules/insurance.md) · [Index](../INDEX.md)

# Policy page

`F-INS-008` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Shows one policy in full: a certificate-style header (insurer, plan, type, policyholder, **Sum assured** or **Cover**, masked policy number), an urgent banner when a premium is due soon or overdue, key facts (**Premium**, **Next premium**, **Started**, **Matures** / **Cover ends**, **Grace period**, **Critical illness**, linked **Vehicle**), the catalogue brief when the plan is recognised, **Nominees**, **Who to call**, **Claims**, **Health cover** (health policies with details on file), **From your imported statements**, **Premiums**, **Surrender value** (savings policies) and **Policy documents**.

**Why it exists:** One place to find cover, what's due, nominees and claim contacts for a policy. Inferred from the page's sections.

**Where to find it:** Click a policy card on **Asset Classes → Insurance** (route `/insurance/:id`). `/insurance/:id#claims` scrolls to **Claims**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Click a policy card. The page loads (grey placeholders while loading).
2. Use **All policies** to go back, **Edit** to edit ([F-INS-003](F-INS-003.md)), the bin to delete ([F-INS-004](F-INS-004.md)).
3. If a premium is urgent, click **Record payment** in the banner.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **All policies** | Link | Back to `/insurance` | Never |
| **Edit** | Button | Opens **Edit policy** | Never |
| Bin (aria "Delete policy") | Button | Deletes after confirmation | Disabled while deleting |
| **Record payment** (banner) | Button | Opens **Record premium payment** for the next premium | Shown when the premium is due soon, in grace or at lapse risk |
| Vehicle link | Link | Opens `/vehicles/:id` | Shown when a vehicle is linked |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing changes by viewing.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Policy not found. Back to your policies" | Wrong id, or the policy was deleted / belongs to someone else | Use the link back |

**Limitations:** The **Health cover** panel (members, room rent, co-pay, pre-existing wait, sub-limits) appears only when health-cover details are on file, and no screen in this area sets them. A vehicle can be linked to a motor policy only from outside this module.

**How it works:** `GET /api/insurance/policies/:id` returns the policy with all premium payments and claims. The catalogue brief is shown when insurer and plan name match a catalogue product. The critical-illness hint shows when the catalogue lists critical illness as an add-on and your policy has it "Not recorded".

**Related features:** [F-INS-003](F-INS-003.md) to [F-INS-016](F-INS-016.md), [D-INS-003](../dependencies.md#d-ins-003), [D-INS-004](../dependencies.md#d-ins-004).

**Sources:** `apps/web/src/pages/insurance/InsuranceDetailPage.tsx:185`, `apps/web/src/pages/insurance/InsuranceDetailPage.tsx:84`, `apps/web/src/pages/insurance/InsuranceDetailPage.tsx:154`, `apps/web/src/pages/insurance/InsuranceDetailPage.tsx:231`, `apps/web/src/pages/insurance/InsuranceDetailPage.tsx:201`, `packages/api/src/services/insurance/insurance.service.ts:465`
