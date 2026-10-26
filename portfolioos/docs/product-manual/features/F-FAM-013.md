---
id: F-FAM-013
title: "Pending invitations"
module: "Family"
status: Live
roles: "R-FAMOWNER"
settings: []
related: [F-FAM-003, F-FAM-011, F-FAM-017]
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Pending invitations

`F-FAM-013` · Live · Roles: [R-FAMOWNER](../roles.md#r-famowner)

**What it does:** Lists invitations that have not been accepted and have not expired (email, role, expiry date) and lets owners cancel them.

**Why it exists:** Inferred from behavior: an open invitation holds a seat ([F-FAM-003](F-FAM-003.md)), so owners need to see and withdraw unanswered ones.

**Where to find it:** **Family → Members & sharing → Pending invitations** card (shown only when there is at least one).

**Who can use it:** Owners only ([R-FAMOWNER](../roles.md#r-famowner)); the card is not shown to others.

**Steps**
1. Find the invitation ("<email>", "<role> · expires <date>").
2. Click the bin icon (tooltip "Cancel invitation"). A browser confirmation "Cancel invitation for <email>?" appears.
3. Confirm. The toast "Invitation cancelled" appears and the seat is freed.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Cancel invitation** (bin icon) | Icon button | Deletes the invitation after confirmation | — |

**Fields and rules:** Not applicable — no data entry.

**Settings and toggles here:** None.

**Results:** The invitation is deleted; its link stops working ("Invitation not found or expired.").

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Invitation already accepted." | They accepted meanwhile | Nothing to cancel; remove the member instead ([F-FAM-017](F-FAM-017.md)) |
| "Invitation not found." | Already cancelled | Refresh |

**Limitations:** No resend button here; to email it again use the composer right after creating it, or create a new invitation.

**How it works:** `GET /api/families/:familyId/invitations` (owner only; unaccepted and unexpired, newest first) and `DELETE /api/families/:familyId/invitations/:invitationId`.

**Related features:** [F-FAM-003](F-FAM-003.md), [F-FAM-011](F-FAM-011.md).

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:405`, `apps/web/src/pages/family/FamilyPage.tsx:735`, `packages/api/src/services/family/family.service.ts:1306`, `packages/api/src/services/family/family.service.ts:1323`
