---
id: F-FAM-015
title: "Edit a managed member"
module: "Family"
status: Live
roles: "R-FAMOWNER (UI); keeper (API)"
settings: [S-FAM-002]
related: [F-FAM-009, F-FAM-016, F-FAM-024]
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Edit a managed member

`F-FAM-015` · Live · Roles: [R-FAMOWNER](../roles.md#r-famowner) (UI); keeper (API)

**What it does:** For a member with no login, changes how they are related (owners) and who keeps their books.

**Why it exists:** Code comment: "A managed member never signs in, so roles and visibility filters mean nothing for them. What can change is how they are related and who keeps their books."

**Where to find it:** Tree → click the managed member → **Edit**. The dialog subtitle reads "Managed by <name>" (or "nobody yet").

**Who can use it:** Owners ([R-FAMOWNER](../roles.md#r-famowner)) through the UI. The server also lets the current keeper change the keeper, but the **Edit** button is shown only to owners.

**Steps**
1. Click **Edit** on a managed member's card.
2. Change **Related to** / **As their** (owners) and **Who keeps their books**.
3. Click **Save**. The toast "Saved" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Who keeps their books** | Select | Chooses the keeper; "Choose someone" when none | Members with no login are disabled ("<name> — no login yet") |
| **Hand the account to them** | Button | Starts [F-FAM-016](F-FAM-016.md) | — |
| **Save** / **Cancel** | Buttons | Save / close | Disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Keeper | Select | Yes | Active member with a login | Current keeper | "The manager must be an active member of this family." / "Managed member not found in this family." |

**Settings and toggles here:** [S-FAM-002](../settings/family.md#s-fam-002) **Who keeps their books** — "Any member with their own login can keep them — they do not need to be an owner… The change applies the moment you save."

**Results:** The new keeper sees the profile in "Accounts you manage"; the old keeper loses access on their next request.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "OWNER role required." | Non-owner who is not the keeper | Ask an owner |

**Limitations:** A keeper who is not an owner cannot reach this dialog in the UI (see DOCUMENTATION_GAPS.md).

**How it works:** Relation changes use the permissions endpoint; the keeper change uses `PATCH /api/families/:familyId/members/:memberUserId/manager` — allowed for the current keeper or an owner.

**Related features:** [F-FAM-009](F-FAM-009.md), [F-FAM-016](F-FAM-016.md), [F-FAM-024](F-FAM-024.md).

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:1543`, `apps/web/src/pages/family/FamilyPage.tsx:1598`, `apps/web/src/pages/family/FamilyPage.tsx:1609`, `packages/api/src/routes/families.routes.ts:273`, `packages/api/src/services/family/family.service.ts:1277`
