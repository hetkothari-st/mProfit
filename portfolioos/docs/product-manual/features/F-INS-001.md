---
id: F-INS-001
title: "Insurance page overview"
module: "Insurance"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-INS-006, S-INS-008, S-INS-009, S-INS-010]
related: [F-INS-002, F-INS-003, F-INS-004, F-INS-005, F-INS-006, F-INS-007, F-INS-008, F-INS-009, F-INS-013, F-INS-014, F-INS-017, F-INS-018, F-INS-019, F-INS-020, F-INS-021]
---

[← Insurance](../modules/insurance.md) · [Index](../INDEX.md)

# Insurance page overview

`F-INS-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Shows your policies as certificate-style cards, with a three-figure summary on top — **Life cover** (sum assured of active term, whole life, ULIP and endowment policies), **Health cover** (sum assured of active health policies) and **Premiums a year** (yearly premium outgo of active policies). Below the summary come the **Coming up** panel ([F-INS-006](F-INS-006.md)), **Claims in progress** ([F-INS-013](F-INS-013.md)), **Tax on your premiums** ([F-INS-014](F-INS-014.md)), a nominee warning, the active policy cards, and a **Lapsed, matured and closed** section for any policy whose status is not Active. The Gmail cards ([F-INS-017](F-INS-017.md), [F-INS-018](F-INS-018.md)) sit above the summary.

**Why it exists:** The page header states it: "Your policies, what's due, and who to call when you need to claim."

**Where to find it:** **Asset Classes → Insurance** (route `/insurance`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (no plan gate). [R-MANAGER](../roles.md#r-manager) sees and changes the managed person's policies. In family view ([R-FAMOWNER](../roles.md#r-famowner), [R-FAMCONTRIB](../roles.md#r-famcontrib), [R-FAMVIEWER](../roles.md#r-famviewer)) the page still shows only your own policies.

**Steps**
1. Open **Asset Classes → Insurance**. While loading, three grey placeholder cards show.
2. With no policies, the empty state "No policies yet" offers **Add your first policy**.
3. Read the summary and panels. Click any policy card to open its page ([F-INS-008](F-INS-008.md)).
4. Use the header buttons: **Coverage check**, **Family sheet** (only once you have at least one policy), **Help and rights**, the report download button, and **Add policy**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Coverage check** | Link button | Opens `/insurance/coverage` ([F-INS-019](F-INS-019.md)) | Never |
| **Family sheet** | Link button | Opens `/insurance/emergency-sheet` ([F-INS-020](F-INS-020.md)) | Hidden when you have no policies |
| **Help and rights** | Link button | Opens `/insurance/help` ([F-INS-021](F-INS-021.md)) | Never |
| Download report button | Button | Insurance report ([D-INS-002](../dependencies.md#d-ins-002)) | Never |
| **Add policy** / **Add your first policy** | Button | Opens **Add a policy** ([F-INS-002](F-INS-002.md)) | Never |
| Policy card | Link | Opens `/insurance/:id` | Never |
| Pencil (aria "Edit <insurer> <plan>") | Icon button | Opens **Edit policy** ([F-INS-003](F-INS-003.md)) | Never |
| Bin (aria "Delete <insurer> <plan>") | Icon button | Turns the card into a delete confirmation ([F-INS-004](F-INS-004.md)) | Spinner while deleting |
| Eye button | Toggle | Shows or hides the full policy number ([F-INS-005](F-INS-005.md)) | Disabled while loading |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None on this page itself; the Gmail search toggle ([S-INS-006](../settings/insurance.md#s-ins-006)) and tax settings ([S-INS-008](../settings/insurance.md#s-ins-008), [S-INS-009](../settings/insurance.md#s-ins-009), [S-INS-010](../settings/insurance.md#s-ins-010)) live in cards on this page and are described with their features.

**Results:** Nothing changes by viewing.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A matured or lapsed policy still shows in the active list | The app has no control to change a policy's status (see Limitations) | Delete the policy, or keep it and ignore its reminders |
| Amber banner "… has no nominee recorded." | An active life or personal-accident policy has no nominee | Add nominees on the policy page ([F-INS-009](F-INS-009.md)) |

**Limitations:** A policy's status (Active, Lapsed, Surrendered, Matured, Claimed) can only be changed through the API: neither the add/edit form nor any other screen sends a status, so the **Lapsed, matured and closed** section stays empty in normal use (see DOCUMENTATION_GAPS.md). **Premiums a year** counts a single-premium policy as ₹0. Cover figures are shown in compact form (for example "₹1.5 Cr").

**How it works:** The page calls `GET /api/insurance/policies`, which returns your policies newest-added first, each with its 5 latest premium payments, all claims (newest first) and any linked vehicle. The policy number is never sent — only its last 4 digits and a "has number" flag. Each policy carries `premiumDue`, computed on the server from the stored next due date and the grace period ([F-INS-007](F-INS-007.md)). **Premiums a year** converts each premium with monthly × 12, quarterly × 4, half-yearly × 2, annual × 1, single × 0. The nominee warning lists active term, whole life, ULIP, endowment and personal-accident policies with no nominee. Card colours come from the insurer's brand; unknown insurers get a colour per policy type.

**Related features:** [F-INS-002](F-INS-002.md), [F-INS-005](F-INS-005.md), [F-INS-006](F-INS-006.md), [F-INS-008](F-INS-008.md), [F-INS-013](F-INS-013.md), [F-INS-014](F-INS-014.md), [F-INS-017](F-INS-017.md), [F-INS-018](F-INS-018.md), [D-INS-002](../dependencies.md#d-ins-002).

**Sources:** `apps/web/src/pages/insurance/InsuranceListPage.tsx:28`, `apps/web/src/pages/insurance/InsuranceListPage.tsx:33`, `apps/web/src/pages/insurance/InsuranceListPage.tsx:124`, `apps/web/src/pages/insurance/InsuranceListPage.tsx:203`, `apps/web/src/lib/insurance.ts:30`, `packages/shared/src/insurance/premiumSchedule.ts:73`, `packages/api/src/services/insurance/insurance.service.ts:448`, `packages/api/src/services/insurance/insurance.service.ts:421`, `apps/web/src/components/insurance/PolicyCard.tsx:30`
