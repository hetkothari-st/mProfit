---
id: F-SET-011
title: "Withdraw, restore, cancel invitation"
module: "Account Access"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-SET-008, F-SET-012]
---

[← Account Access](../modules/account-access.md) · [Index](../INDEX.md)

# Withdraw, restore, cancel invitation

`F-SET-011` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Ends a professional's access (**Withdraw**), gives it back (**Restore**), or cancels an invitation nobody has accepted (**Cancel invitation**).

**Why it exists:** The code comment: "A revoke button that needed a subscription would not be a revoke button."

**Where to find it:** **Account Access** rows.

**Who can use it:** The account holder ([R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)). The professional can also end an engagement from their side (B09), but only you can restore it.

**Steps**
1. Active row: click **Withdraw**, then confirm "Withdraw their access?" with **Withdraw** (or **Keep**). Toast "Access withdrawn".
2. Invited row: click **Cancel invitation**. Toast "Invitation cancelled".
3. **Past access**: click **Restore**. Toast "Access restored".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Withdraw** → **Withdraw** / **Keep** | Buttons | Two-step withdraw | Disabled while withdrawing |
| **Cancel invitation** | Button | Cancels | Disabled while cancelling |
| **Restore** | Button | Restores | Hidden for invitations nobody accepted; disabled while restoring |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** Withdraw/cancel: status becomes REVOKED and the link is invalidated; the professional loses access at once. Restore: status ACTIVE again with the previous scope.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "That invitation was accepted — withdraw the access instead." | Tried to cancel an accepted invitation | Use **Withdraw** |
| "That invitation was never accepted, so there is nothing to restore — send a new one." | Restoring a cancelled invitation | Invite again |
| "Could not withdraw access" / "Could not cancel that invitation" / "Could not restore access" | Other failures | Retry |

**Limitations:** None.

**How it works:** POST `/api/me/professional-access/<id>/revoke`, `/cancel`, `/reinstate`. Each writes an entry to the professional activity log ("You revoked your CA’s access to your books.", "You cancelled the invitation to …").

**Related features:** [F-SET-008](F-SET-008.md), [F-SET-012](F-SET-012.md).

**Sources:** `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:84`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:336`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:455`, `packages/api/src/services/ca/caAccess.service.ts:538`, `packages/api/src/services/ca/caAccess.service.ts:820`, `packages/api/src/services/ca/caAccess.service.ts:1115`
