---
id: F-FAM-011
title: "Invite a member by email"
module: "Family"
status: Live
roles: "R-FAMOWNER"
settings: [S-FAM-003, S-FAM-004, S-FAM-005, S-FAM-009]
related: [F-FAM-012, F-FAM-013, F-FAM-014, F-FAM-019]
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Invite a member by email

`F-FAM-011` · Live · Roles: [R-FAMOWNER](../roles.md#r-famowner)

**What it does:** Creates an invitation for someone with an email address, then lets you read, edit and send the invitation email from the app, or copy the link and send it yourself. The person joins only when they accept ([F-FAM-019](F-FAM-019.md)).

**Why it exists:** Dialog text: "They sign in themselves. Nothing shows until they accept." Service comment: the owner writes the subject and a personal note; the link and expiry are fixed.

**Where to find it:** **Family → Members & sharing → Add member → Invite by email**.

**Who can use it:** Owners only ([R-FAMOWNER](../roles.md#r-famowner)).

**Steps**
1. Choose **Invite by email**.
2. Enter **Their name** (optional) and **Email**, pick **Related to** / **As their**.
3. Choose **What they can do** (Owner / Contributor / Viewer) and, for contributors and viewers, tick visible **Asset classes** and **Non-portfolio categories**.
4. Click **Next: write the email**. The invitation is created (or seat payment starts, [F-FAM-012](F-FAM-012.md)).
5. Edit **Subject** and **Your message**, check **Preview**, then click **Send email** — toast "Sent to <email>". Or copy the link with the copy button and click **Later**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Next: write the email** | Button | Creates the invitation | Disabled until email and relation are set, or while saving |
| Copy link button | Icon button (tooltip "Copy the link and send it yourself instead") | Copies the accept link | — |
| **Send email** | Button | Sends the email | Disabled when email isn't configured, no sends are left, or while sending |
| **Later** | Button | Closes without sending | — |
| **All** / **None** | Links | Select all / clear the asset-class or category list | Matrix disabled when role is Owner |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Their name** | Text | No | ≤ 120 characters | Empty | — |
| **Email** | Email | Yes | Valid email; lower-cased | Empty | "A valid email is required." / "<email> is already a member of this family." |
| **What they can do** | Select | No | Owner / Contributor / Viewer | Contributor | — |
| **Subject** | Text | No | ≤ 160 characters (service), single line | "<you> invited you to <family> on EveryPaisa" | "Subject is too long (max 160 characters)." / "Subject must be a single line." |
| **Your message** | Text | No | ≤ 4,000 characters (service) | Pre-written note | "Message is too long (max 4000 characters)." |

**Settings and toggles here:** [S-FAM-003](../settings/family.md#s-fam-003) **What they can do**; [S-FAM-004](../settings/family.md#s-fam-004) **Asset classes**; [S-FAM-005](../settings/family.md#s-fam-005) **Non-portfolio categories**; [S-FAM-009](../settings/family.md#s-fam-009) relation.

**Results:** An invitation valid for 14 days exists and holds a seat until accepted, cancelled or expired. The email's button reads "Join the family"; replies go to you.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This invitation has already been emailed 5 times. Copy the link and send it yourself." | Per-invitation send cap | Copy the link |
| "You have sent a lot of invitations in the last hour. Try again shortly." | 20 invitation emails per hour per sender | Wait |
| "Email is not configured on this server. Copy the link and send it yourself." | No mail transport | Copy the link |
| "The email could not be sent just now. Copy the link and send it yourself." | Mail send failed | Retry or copy the link |
| "That invitation has expired. Send a fresh one." | Older than 14 days | Cancel and invite again |

**Limitations:** Defect: the visibility lists say "Empty = no restriction" and "Leave both lists empty to give a contributor or viewer full visibility", but the server treats an empty list as "see nothing" — a contributor or viewer invited with both lists empty sees none of the other members' data. To give full visibility, click **All** in both lists. See DOCUMENTATION_GAPS.md.

**How it works:** `POST /api/families/:familyId/members/invite` creates a `FamilyInvitation` with a 32-byte token (stored hashed, plus encrypted for resending), role (default CONTRIBUTOR), caps and relation; expiry 14 days. The email is built by `POST …/invitations/:id/email/preview` and sent by `…/email/send`; each send writes an audit row used for the caps (5 per invitation, 20 per hour).

**Related features:** [F-FAM-012](F-FAM-012.md), [F-FAM-013](F-FAM-013.md), [F-FAM-014](F-FAM-014.md), [F-FAM-019](F-FAM-019.md).

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:1389`, `apps/web/src/pages/family/FamilyPage.tsx:1505`, `apps/web/src/pages/family/FamilyPage.tsx:1516`, `apps/web/src/components/ca/InviteEmailComposer.tsx:184`, `packages/api/src/services/family/family.service.ts:494`, `packages/api/src/services/family/family.service.ts:54`, `packages/api/src/services/family/familyInviteEmail.service.ts:23`, `packages/api/src/services/family/familyInviteEmail.service.ts:247`
