---
id: F-FAM-003
title: "Family workspace header and seats"
module: "Family"
status: Live
roles: "Members"
settings: [S-FAM-006]
related: [F-FAM-012, F-FAM-013, F-FAM-022]
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Family workspace header and seats

`F-FAM-003` · Live · Roles: Members

**What it does:** Shows the selected family's name, description, the number of active members, your role, a seat-usage line, and the **View this family across the app** button.

**Why it exists:** The code comment on the seat line: an open invitation holds a seat, and "'you have 2 members, pay for a third' reads as a bug unless the invitation is named here."

**Where to find it:** Top card of the selected family on `/family`.

**Who can use it:** Any member of the family ([R-FAMOWNER](../roles.md#r-famowner), [R-FAMCONTRIB](../roles.md#r-famcontrib), [R-FAMVIEWER](../roles.md#r-famviewer)).

**Steps**
1. Open **Overview → Family** and select a family.
2. Read "N active members · your role: …" and the seat line "X of Y seats used — N members, M open invitations".
3. Click **View this family across the app** to switch the whole app into this family's view (same effect as [F-FAM-022](F-FAM-022.md)). A toast "Viewing as <family name>" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **View this family across the app** | Button | Turns on family view for this family and refetches all data | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-FAM-006](../settings/family.md#s-fam-006) **Viewing as family** — set by this button (full detail: Settings reference).

**Results:** With the button, every scope-aware page now shows the family's combined data until you switch back to **Personal view**.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Seat line turns amber with ". Cancel an invitation to free one." | Seats used ≥ included seats and at least one invitation is open | Cancel an unaccepted invitation ([F-FAM-013](F-FAM-013.md)) or pay for a seat when adding ([F-FAM-012](F-FAM-012.md)) |

**Limitations:** For contributors and viewers the seat line is probably wrong (it is likely to count only their own membership) because the seat count runs under row-level security that hides other members' rows from non-owners — see DOCUMENTATION_GAPS.md.

**How it works:** Seats used = ACTIVE members (managed members included) + invitations not yet accepted and not expired, excluding hand-over invitations for a managed profile. Included seats default to 3. The active-member count comes from the members list (read with elevated privileges after a membership check), so it is correct for every role.

**Related features:** [F-FAM-012](F-FAM-012.md), [F-FAM-013](F-FAM-013.md), [F-FAM-022](F-FAM-022.md).

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:318`, `apps/web/src/pages/family/FamilyPage.tsx:337`, `apps/web/src/pages/family/FamilyPage.tsx:537`, `packages/api/src/services/family/family.service.ts:765`, `packages/api/src/services/family/family.service.ts:103`
