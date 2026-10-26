---
id: F-FAM-019
title: "Accept a family invitation"
module: "Family"
status: Live
roles: "R-VISITOR (peek); signed-in invitee"
settings: []
related: [F-FAM-011]
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Accept a family invitation

`F-FAM-019` · Live · Roles: [R-VISITOR](../roles.md#r-visitor) (peek); signed-in invitee

**What it does:** The page behind the invitation email's link. It shows who invited you, the family and the role, and lets you **Accept** or **Decline**.

**Why it exists:** Code comment: "Public accept-invite landing."

**Where to find it:** Email link `/families/invitations/:token/accept`.

**Who can use it:** Anyone with the link can see the preview; accepting needs you to be signed in with the invited email address ([R-VISITOR](../roles.md#r-visitor) is sent to sign in first).

**Steps**
1. Open the link. If you are signed out, you are taken to sign in (`/login?next=…`) and brought back.
2. Read "<inviter> invited you to <family>." and "Role: … · Sent to <email>".
3. Click **Accept**. The toast "Invitation accepted" appears and you land on **Settings**. Or click **Decline** to go to the dashboard.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Accept** | Button | Joins the family | Disabled when your email doesn't match, or while saving |
| **Decline** | Link | Goes to `/dashboard` (nothing is recorded) | — |
| **Back to dashboard** | Link | On the error card | — |

**Fields and rules:** Not applicable — no data entry.

**Settings and toggles here:** None.

**Results:** You become an ACTIVE member with the role and caps from the invitation; family view is reset to Personal; the switcher and sidebar tree show the family.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Invitation invalid" with "Invitation not found or expired." / "Invitation expired." / "Invitation already accepted." | Bad, expired or used link | Ask the owner for a new one |
| Amber note "This invitation was sent to … but you are signed in as …. Accepting will fail." | Signed in with another email | Sign in with the invited account |
| "This invitation was sent to a different email address." | Same, from the server | Same |

**Limitations:** **Decline** does not tell the owner or cancel the invitation; it just leaves.

**How it works:** `GET /api/families/invitations/:token/peek` (public) and `POST /api/families/invitations/:token/accept` (signed in). Accepting re-activates a previous removed membership if one exists, stamps the invitation used, clears its stored link, and then places you on the tree.

**Related features:** [F-FAM-011](F-FAM-011.md), [D-FAM-005](../dependencies.md#d-fam-005), [D-FAM-006](../dependencies.md#d-fam-006).

**Sources:** `apps/web/src/pages/family/AcceptInvitationPage.tsx:19`, `apps/web/src/pages/family/AcceptInvitationPage.tsx:52`, `apps/web/src/pages/family/AcceptInvitationPage.tsx:118`, `packages/api/src/routes/families.routes.ts:65`, `packages/api/src/services/family/family.service.ts:1342`, `packages/api/src/services/family/family.service.ts:1376`
