---
id: F-FAM-002
title: "Create a family"
module: "Family"
status: Live
roles: "R-FAMILY, R-PRO"
settings: []
related: [F-FAM-001, F-FAM-003, F-FAM-025]
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Create a family

`F-FAM-002` · Live · Roles: [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Creates a new family with a name and makes you its first **Owner**.

**Why it exists:** The card text explains the intended use: "You become the OWNER. Add other OWNERs later for joint families (grandpa + father + uncle each as OWNER is the canonical joint-family setup)."

**Where to find it:** **Overview → Family → New family** (or **Create a family** in the empty state), route `/family`.

**Who can use it:** [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro). [R-FREE](../roles.md#r-free) and [R-PLUS](../roles.md#r-plus) see a lock card "Family Sharing is locked" with **View plans** instead of the form. Not available while managing someone's account ([R-MANAGER](../roles.md#r-manager)) because `/api/families` is an account route.

**Steps**
1. Click **New family**. The card "Create a new family" appears.
2. Type the family name (placeholder "e.g. Kothari Family").
3. Click **Create**. A toast "Family created" appears and the new family is selected.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Family name box | Text input | The family's name | Disabled while saving |
| **Create** | Button | Creates the family | Disabled when the name is blank or while saving |
| **Cancel** | Button | Closes the card and clears the name | — |
| **View plans** | Link (lock card) | Opens `/pricing` ([D-FAM-001](../dependencies.md#d-fam-001)) | Shown only below the FAMILY plan |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Family name | Text | Yes | 1–120 characters after trimming (server) | Empty | "Family name is required." |

**Settings and toggles here:** None.

**Results:** A family is created, you are added as an ACTIVE Owner, and it gets 3 included seats and a ₹199 extra-seat price (schema defaults, marked as placeholder values in the code).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This feature requires the FAMILY plan or higher" (toast "Create failed" fallback) | Your effective plan is below FAMILY | Upgrade on **Pricing** |
| "Family Sharing is locked" card | Same, caught by the page before you type | **View plans** |

**Limitations:** There is no screen to rename a family, change its description or delete it; the rename endpoint exists without a UI ([F-FAM-025](F-FAM-025.md)).

**How it works:** `POST /api/families` behind `requireFeature('FAMILY_SHARING')`; the service creates the `Family` row and an ACTIVE `OWNER` `FamilyMember` row in one transaction.

**Related features:** [F-FAM-001](F-FAM-001.md), [F-FAM-003](F-FAM-003.md), [F-FAM-025](F-FAM-025.md), [D-FAM-001](../dependencies.md#d-fam-001).

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:102`, `apps/web/src/pages/family/FamilyPage.tsx:136`, `apps/web/src/pages/family/FamilyPage.tsx:171`, `packages/api/src/routes/families.routes.ts:178`, `packages/api/src/services/family/family.service.ts:67`, `packages/api/prisma/schema.prisma:3789`
