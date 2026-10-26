---
id: F-SET-009
title: "Invite a professional (and send the email)"
module: "Account Access"
status: Partial
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-SET-003, F-SET-008, F-SET-010]
---

[← Account Access](../modules/account-access.md) · [Index](../INDEX.md)

# Invite a professional (and send the email)

`F-SET-009` · Partial · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Creates an invitation for your CA or advisor by name and email, then lets you edit and send the invitation email (or copy the link to send it yourself).

**Why it exists:** The dialog text: "They accept from their own account. Nothing of yours is shared until they do."

**Where to find it:** **Account Access → Invite a professional**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro). In this version the email step also needs two-factor sign-in (see Limitations).

**Steps**
1. Click **Invite a professional**. Enter **Their name** and **Their email**. The note says "They start view-only. Once they accept you can let them keep your books, limit them to particular portfolios, and set a date their access ends by itself."
2. Click **Continue to the email**. The invitation is created and the dialog becomes "Send the invitation".
3. Edit **Subject** and **Your message**; the **Preview** updates. "The accept link, the expiry date and your name are added below your message and cannot be removed — that is what lets them tell this apart from a phishing mail."
4. Click **Send email** (shows "N sends left for this invitation"), or the copy button ("Copy the link and send it yourself instead"), or **Later**.
5. After sending: a confirmation with **Done**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Their name**, **Their email** | Text | Who you invite | — |
| **Continue to the email** | Button | Creates the invitation | Disabled until both are filled, and while creating ("Creating…") |
| **Cancel** | Button | Closes without inviting | — |
| **Subject**, **Your message** | Text, textarea | Email text (160 / 4000 characters in the browser) | — |
| Copy link button | Icon button | Copies the accept link | — |
| **Send email** | Button | Sends | Disabled when the server has no mail set up, no sends are left, or while sending |
| **Later** | Button | Closes; the invitation stays in **Waiting to accept** | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Their name | Text | Yes | 1–200 characters | Empty | "A name is required." |
| Their email | Email | Yes | Valid email; not your own; not someone already invited or with access | Empty | "That is your own address — invite the professional you work with." / "<email> already has access to your books." / "You have already invited <email>. Cancel that invitation first, or send it again." |
| Subject | Text | No | Up to 200 (server) | Server default | — |
| Your message | Text | No | Up to 5000 (server) | Server default | — |

**Settings and toggles here:** None (scope is set after they accept, [F-SET-010](F-SET-010.md)).

**Results:** A pending relationship with a single-use link valid for 14 days. The professional opens it at `/professional-invitations/<token>` (B09).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Preparing the email…" never finishes | The email preview is served from the professional workspace, which requires two-factor sign-in used for this session; without it the request is refused and the page keeps waiting | Turn on two-factor sign-in ([F-SET-003](F-SET-003.md)), sign in again with a code, then use **Send again** |
| "Email is not configured on this server, so copy the link above and send it yourself." | No mail server configured | Copy the link |
| "This invitation has already been emailed 5 times. Copy the link and send it yourself, or start a fresh invitation." / "No sends left — copy the link instead" | 5 sends per invitation | Copy the link |
| "That invitation has expired. Send a fresh one." | Older than 14 days | Cancel it and invite again |
| "Could not create that invitation" / "Could not send the invitation" | Other failures | Retry |

**Limitations:** Confirmed defect: the email/preview step calls the professional workspace API, which is behind the two-factor gate, so an account holder without two-factor sign-in cannot see, send or copy the invitation link at all (the invitation itself is created). There is also an hourly cap of 20 invitation emails per sender.

**How it works:** POST `/api/me/professional-access/invite` creates a `Client` row with no advisor, status PENDING, initiated by the client, an encrypted single-use token and expiry now + 14 days, and records "CLIENT_INVITED" in the professional activity log. The composer posts to `/api/ca/clients/<id>/invite-email/preview` and `/send`; the server builds the email and accept URL, and refuses accepted, withdrawn, expired or tokenless invitations.

**Related features:** [F-SET-008](F-SET-008.md), [F-SET-010](F-SET-010.md), [F-SET-003](F-SET-003.md), [D-SET-004](../dependencies.md#d-set-004), [W-SET-003](../workflows/W-SET-003.md).

**Sources:** `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:559`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:633`, `apps/web/src/components/ca/InviteEmailComposer.tsx:108`, `apps/web/src/components/ca/InviteEmailComposer.tsx:159`, `apps/web/src/components/ca/InviteEmailComposer.tsx:200`, `packages/api/src/controllers/ca.controller.ts:183`, `packages/api/src/services/ca/caAccess.service.ts:43`, `packages/api/src/services/ca/caAccess.service.ts:944`, `packages/api/src/routes/ca.routes.ts:73`, `packages/api/src/routes/ca.routes.ts:98`, `packages/api/src/services/ca/caInviteEmail.service.ts:42`, `packages/api/src/services/ca/caInviteEmail.service.ts:263`
