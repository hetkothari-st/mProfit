## Account Access

**Account Access** (sidebar item for everyone, route `/settings/professional-access`, page title "Account access") is where you, the account holder, bring in your CA or advisor and decide what they can see, what they can do and until when. It is never plan-gated: "Whoever can reach someone's financial position, the person it belongs to must be able to see it and stop it." The professional's side of the same relationship (the **Client books** workspace) is documented by the advice/CA chapter (D-SET-004).

### Account Access overview <!-- F-SET-008 -->
**What it does:** Lists every professional relationship in three groups: **With access** (can open your books now), **Waiting to accept** (invited, nothing shared yet) and **Past access** (withdrawn). Each active row shows a "reach" strip: **Sees**, **Can**, **Until**.

**Why it exists:** The code comment: the page answers "who may look at it, what they may look at, and until when" for each professional "at a glance".

**Where to find it:** Sidebar → **Account Access**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. While managing a family member's account (R-MANAGER) the page shows your own relationships, not theirs.

**Steps**
1. Open **Account Access**. While loading, two grey placeholders show.
2. With no relationships: "Nobody else can see your books" with three numbered steps (Invite them by email — a link that "works once and expires in 14 days"; They accept from their own account — "Signing up is free for them"; You decide what they reach) and **Invite a professional**.
3. Otherwise read **With access N** ("These people can open your books right now.") and **Waiting to accept N** ("Nothing of yours is shared until they accept from their own account.").
4. Click **Past access (N)** to expand withdrawn relationships ("No access since <date>").
5. When a professional accepts while the page is open, a toast says "<name> accepted your invitation."

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Invite a professional** | Button (header and empty state) | F-SET-009 | — |
| **Manage access** / **Close** | Button | F-SET-010 | Active rows only |
| **Withdraw** | Button | F-SET-011 | Active rows only |
| **Send again** | Button | Opens "Send the invitation again" (same link, same expiry) | Invited rows only |
| **Cancel invitation** | Button | F-SET-011 | Invited rows only |
| **Past access (N)** | Expander | Shows withdrawn rows | Hidden when there are none |
| **Restore** | Button | F-SET-011 | Past rows where someone had accepted |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None directly; the reach strip summarises S-SET-004 to S-SET-008.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Page shows the empty state even though you invited someone | The relationship feature is switched off on this server (ENABLE_FAMILY) | Contact the operator |

**Limitations:** Invited rows show "Link expires <date>"; an expired invitation stays in **Waiting to accept** until you cancel it.

**How it works:** GET `/api/me/professional-access/grants` returns every relationship you are the subject of, including unaccepted invitations, refreshed on a short live interval (and the activity feed at twice that interval). **Sees** reads "Everything" or counts of portfolios/categories/asset classes; **Can** reads "View only", "Make some changes" or "Keep your books"; **Until** reads the end date or "No end date".

**Related features:** F-SET-009, F-SET-010, F-SET-011, F-SET-012, F-SET-013, D-SET-004.

**Sources:** `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:55`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:68`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:141`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:187`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:264`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:400`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:470`, `packages/api/src/routes/ca.routes.ts:182`

### Invite a professional (and send the email) <!-- F-SET-009 -->
**What it does:** Creates an invitation for your CA or advisor by name and email, then lets you edit and send the invitation email (or copy the link to send it yourself).

**Why it exists:** The dialog text: "They accept from their own account. Nothing of yours is shared until they do."

**Where to find it:** **Account Access → Invite a professional**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. In this version the email step also needs two-factor sign-in (see Limitations).

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

**Settings and toggles here:** None (scope is set after they accept, F-SET-010).

**Results:** A pending relationship with a single-use link valid for 14 days. The professional opens it at `/professional-invitations/<token>` (B09).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Preparing the email…" never finishes | The email preview is served from the professional workspace, which requires two-factor sign-in used for this session; without it the request is refused and the page keeps waiting | Turn on two-factor sign-in (F-SET-003), sign in again with a code, then use **Send again** |
| "Email is not configured on this server, so copy the link above and send it yourself." | No mail server configured | Copy the link |
| "This invitation has already been emailed 5 times. Copy the link and send it yourself, or start a fresh invitation." / "No sends left — copy the link instead" | 5 sends per invitation | Copy the link |
| "That invitation has expired. Send a fresh one." | Older than 14 days | Cancel it and invite again |
| "Could not create that invitation" / "Could not send the invitation" | Other failures | Retry |

**Limitations:** Confirmed defect: the email/preview step calls the professional workspace API, which is behind the two-factor gate, so an account holder without two-factor sign-in cannot see, send or copy the invitation link at all (the invitation itself is created). There is also an hourly cap of 20 invitation emails per sender.

**How it works:** POST `/api/me/professional-access/invite` creates a `Client` row with no advisor, status PENDING, initiated by the client, an encrypted single-use token and expiry now + 14 days, and records "CLIENT_INVITED" in the professional activity log. The composer posts to `/api/ca/clients/<id>/invite-email/preview` and `/send`; the server builds the email and accept URL, and refuses accepted, withdrawn, expired or tokenless invitations.

**Related features:** F-SET-008, F-SET-010, F-SET-003, D-SET-004, W-SET-003.

**Sources:** `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:559`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:633`, `apps/web/src/components/ca/InviteEmailComposer.tsx:108`, `apps/web/src/components/ca/InviteEmailComposer.tsx:159`, `apps/web/src/components/ca/InviteEmailComposer.tsx:200`, `packages/api/src/controllers/ca.controller.ts:183`, `packages/api/src/services/ca/caAccess.service.ts:43`, `packages/api/src/services/ca/caAccess.service.ts:944`, `packages/api/src/routes/ca.routes.ts:73`, `packages/api/src/routes/ca.routes.ts:98`, `packages/api/src/services/ca/caInviteEmail.service.ts:42`, `packages/api/src/services/ca/caInviteEmail.service.ts:263`

### Manage a professional's access (scope panel) <!-- F-SET-010 -->
**What it does:** Opens a panel under an active professional where you choose what they can do, which portfolios, categories and asset classes they can see, and the dates their access works.

**Why it exists:** The code comment: "the person whose books these are decides which portfolios a professional may open … and between which dates any of it works. A CA can read their own scope and nothing else."

**Where to find it:** **Account Access → With access → Manage access**.

**Who can use it:** The account holder (R-FREE, R-PLUS, R-FAMILY, R-PRO). Never the professional.

**Steps**
1. Click **Manage access**. The panel opens.
2. **What they can do** ("Reading is always included. Changing anything is up to you."): pick **View only** or **Keep my books**, or **Choose each permission** for the four switches.
3. **What they can see**: for **Portfolios**, **Categories** and **Asset classes** pick **All** or **Chosen** and tick items.
4. **When** ("Access stops by itself on the end date. Leave blank for no limit."): set **From** and/or **Until**.
5. The save bar says "You have unsaved changes". Click **Save access** (toast "Access saved") or **Discard**. With nothing changed, **Close**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **View only** / **Keep my books** | Mode cards | All permissions off / on | — |
| **Choose each permission** | Expander | Shows four switches | — |
| **Keep my books**, **Add and correct transactions**, **Upload statements**, **Set fair market values** | Switches | Individual permissions | — |
| **All** / **Chosen (n)** | Segmented control (×3) | Widen or narrow | — |
| Portfolio / category / asset-class chips | Chips | Pick items | — |
| **From**, **Until** | Date fields | Access window | — |
| **Save access** | Button | Saves | Disabled when nothing changed or while saving |
| **Discard** / **Close** | Button | Undo changes / close | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Portfolios | Multi-select | No | Up to 200; must be yours | All | "One of those portfolios is not yours." |
| From / Until | Date | No | YYYY-MM-DD; Until not before From | Blank | "Access cannot end before it starts." / "<field> is not a real date." |

**Settings and toggles here:** S-SET-004 **What they can do** (default view only); S-SET-005 **Portfolios**, S-SET-006 **Categories**, S-SET-007 **Asset classes** (default All); S-SET-008 **When** (default no limit).

**Results:** The professional's access changes on their next request.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not save access" (or the server message) | Validation or permission failure | Read the message and correct |
| "That grant is not yours to manage." | Not your relationship | — |

**Limitations:** None beyond the rules above.

**How it works:** GET `/api/me/professional-access/<id>` returns the grant in full; PATCH `.../scope` accepts any subset: an absent field is untouched and an explicit `null` widens that dimension back to everything. Changes are logged in the professional activity log.

**Related features:** F-SET-008, F-SET-012, D-SET-004.

**Sources:** `apps/web/src/components/ca/GrantScopePanel.tsx:42`, `apps/web/src/components/ca/GrantScopePanel.tsx:145`, `apps/web/src/components/ca/GrantScopePanel.tsx:300`, `apps/web/src/components/ca/GrantScopePanel.tsx:312`, `packages/api/src/controllers/ca.controller.ts:125`, `packages/api/src/services/ca/caAccess.service.ts:711`, `packages/api/src/services/ca/caAccess.service.ts:728`, `packages/api/prisma/schema.prisma:520`

### Withdraw, restore, cancel invitation <!-- F-SET-011 -->
**What it does:** Ends a professional's access (**Withdraw**), gives it back (**Restore**), or cancels an invitation nobody has accepted (**Cancel invitation**).

**Why it exists:** The code comment: "A revoke button that needed a subscription would not be a revoke button."

**Where to find it:** **Account Access** rows.

**Who can use it:** The account holder (R-FREE, R-PLUS, R-FAMILY, R-PRO). The professional can also end an engagement from their side (B09), but only you can restore it.

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

**Related features:** F-SET-008, F-SET-012.

**Sources:** `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:84`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:336`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:455`, `packages/api/src/services/ca/caAccess.service.ts:538`, `packages/api/src/services/ca/caAccess.service.ts:820`, `packages/api/src/services/ca/caAccess.service.ts:1115`

### Activity feed of professionals' actions <!-- F-SET-012 -->
**What it does:** Shows the most recent things done to your books by professionals and by you in this relationship (invited, accepted, scope changes, withdrawals, and the professional's edits).

**Why it exists:** The page header: "…what each of them can reach, and everything they have done."

**Where to find it:** **Account Access**, the **Activity** list near the bottom.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps:** Not applicable — view only. With nothing yet: "Nothing has happened yet. Everything a professional does to your books will appear here."

**Controls:** None.

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** None.

**Limitations:** Up to 100 entries, newest first.

**How it works:** GET `/api/me/professional-access/activity` reads the professional audit log where you are the actor or the subject (database row-level security restricts it to your side).

**Related features:** F-SET-008, F-SET-010, F-SET-011.

**Sources:** `apps/web/src/components/ca/CaActivityFeed.tsx:19`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:223`, `packages/api/src/controllers/ca.controller.ts:106`, `packages/api/src/services/ca/caAccess.service.ts:579`

### "Do you keep books for clients?" card <!-- F-SET-013 -->
**What it does:** For people on the Pro/Advisor plan who have no clients yet, shows a card pointing to the client books workspace.

**Why it exists:** The code comment: the sidebar's **Client books** entry appears only once a professional holds a grant, "so a practice that has just subscribed would otherwise have nowhere to start".

**Where to find it:** **Account Access**, below the relationships.

**Who can use it:** R-PRO with no clients.

**Steps**
1. Read "Do you keep books for clients? Your plan lets you act for other people. Invite your first client to get started."
2. Click **Open client books** (goes to `/ca`, D-SET-004).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Open client books** | Link button | Opens the workspace | Card hidden below Pro/Advisor, when you have clients, or when the client list errors |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** None.

**Limitations:** The workspace itself requires two-factor sign-in.

**How it works:** Checks the CA_WORKSPACE entitlement in the browser and GET `/api/ca/clients`.

**Related features:** D-SET-004, F-SET-003.

**Sources:** `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:522`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:541`, `packages/api/src/routes/ca.routes.ts:71`

**What this area doesn't do**
- It does not show professionals you act for (that is **Client books**).
- It does not let you pick which professional actions are logged; everything is.
- It has no plan gate and no per-professional notification settings.
