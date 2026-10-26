## Professional workspace (Client books)

The professional workspace lets an accountant, CA or adviser open the books of people who have given them access. It has two halves: the account holder decides who can see their books and what they may change (sidebar **Account Access**, documented in the account-access chapter, D-CA-001); the professional works in **Client books** (`/ca`). Acting for someone who invited you is free on any plan. Inviting clients of your own needs the Pro/Advisor plan. Every page in the workspace needs two-factor sign-in that is switched on and was used for the current session.

### Client books entry and two-factor gate <!-- F-CA-001 -->
**What it does:** Adds **Client books** to the sidebar (next to **Account Access**) once you hold at least one client relationship, and guards `/ca` and `/ca/clients/:id` with a two-factor check. Without two-factor sign-in the page shows **Two-factor sign-in required** and either **Turn on two-factor sign-in** (opens Settings) or, if it is on but this session started without a code, **Sign out and sign in again**.

**Why it exists:** Gate text: "The professional workspace shows your clients' financial data, so it needs two-factor sign-in: a code from an authenticator app each time you sign in." The sidebar entry is "driven by grants HELD, not by plan" so people on the top plan who act for nobody are not shown an empty workspace (code comment).

**Where to find it:** Sidebar **Client books** (route `/ca`).

**Who can use it:** R-PROF (any plan) and R-PRO practices with clients. Not R-MANAGER (the `/api/ca` routes are refused while managing someone else's account). Not R-VISITOR, R-AICONN, R-NOMINEE.

**Steps**
1. If **Client books** is not in the sidebar, you hold no client relationship yet; accept an invitation (F-CA-006) or invite a client (F-CA-004).
2. Click **Client books**. If the two-factor card appears, follow its button, then come back.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Client books** | Sidebar link | Opens `/ca` | Hidden while you hold no client rows |
| **Turn on two-factor sign-in** | Button | Opens **Settings** (D-CA-002) | Shown when two-factor is off |
| **Sign out and sign in again** | Button | Clears the session and returns to `/login?next=/ca` | Shown when two-factor is on but not used this session |

**Fields and rules:** None.

**Settings and toggles here:** None (two-factor sign-in is set in Settings, D-CA-002).

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Turn on two-factor sign-in (Settings) to use the professional workspace. It protects your clients' data" | Two-factor off | Turn it on in Settings |
| "Sign out and sign in again with your authenticator code to use the professional workspace…" | Session started without a code | Sign out and in again with the code |

**Limitations:** The sidebar checks for client rows every 30 seconds and on window focus, so a new grant can take up to 30 s to show the entry. Revoked (past) relationships still count, so the entry stays after all your clients have left.

**How it works:** The sidebar calls `GET /api/ca/clients`, which is open to every signed-in user (an empty list needs no two-factor) but checks two-factor as soon as the list is non-empty; a `TWO_FACTOR_REQUIRED` answer is treated as "has clients" so the entry still appears. Every other `/api/ca` route runs `requireProfessionalSecondFactor`; every client-specific route also re-checks the grant (`getCaScope`) on each request. The web gate reads the two-factor status (`enabled`, `sessionVerified`).

**Related features:** F-CA-002, D-CA-001, D-CA-002.

**Sources:** `apps/web/src/components/layout/SidebarNav.tsx:170`, `apps/web/src/components/ca/ProfessionalTwoFactorGate.tsx:27`, `apps/web/src/components/ca/ProfessionalTwoFactorGate.tsx:45`, `apps/web/src/components/ca/ProfessionalTwoFactorGate.tsx:56`, `packages/api/src/routes/ca.routes.ts:71`, `packages/api/src/routes/ca.routes.ts:73`, `packages/api/src/controllers/ca.controller.ts:66`, `packages/api/src/lib/professionalMfa.ts:29`

### Clients list <!-- F-CA-002 -->
**What it does:** The **Clients** page (eyebrow "Practice") lists the people whose books you keep in three groups: **Your clients** (active; each card shows name, email, "Client since <date>", and a strip **Shared with you** — "All of their books" or "Part of their books", **You can** — "Keep the books", "Make some changes" or "View only", **Until** — end date or "No end date"), **Waiting to accept** (invited, with "Link expires <date>"), and a collapsed **Past engagements (N)** ("Ended <date>. What was done stays on the record.").

**Why it exists:** Page text: "The people whose books you keep. Each of them decides what you can see and do, and can withdraw it at any time."

**Where to find it:** **Client books** (route `/ca`).

**Who can use it:** R-PROF, R-PRO (with two-factor).

**Steps**
1. Open **Client books**.
2. Click **Open books** on a client to work in their books (F-CA-007).
3. Click **Past engagements** to show ended relationships.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Open books** | Button | Opens `/ca/clients/:id` | Active clients only |
| **Close** | Button | Starts closing the engagement (F-CA-003) | Active clients only |
| **Past engagements (N)** | Toggle | Shows/hides ended relationships | Only when there are any |
| **Invite a client** | Button | F-CA-004 | Only on Pro/Advisor |
| **Invite your own clients** | Link button | Meant to open the plans page | Shown below Pro/Advisor; see Limitations |

**Fields and rules:** None — view only.

**Settings and toggles here:** None here; reach and edit rights are set by each client on Account Access (D-CA-001).

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No clients yet" | No relationships | Wait for an invitation or invite a client |

**Limitations:** Known defect: **Invite your own clients** links to `/settings/billing`, which is not a route, so it shows the not-found page (see DOCUMENTATION_GAPS.md); use **Pricing** instead. Pending invitations you sent can't be resent, cancelled or copied from this page after the invite dialog is closed.

**How it works:** `GET /api/ca/clients` returns every client row where you are the professional (revoked included), ordered by status then name; the name and email shown are of the person whose books they are (for a client-initiated grant, that person's account name/email). The page refreshes every 5 seconds while visible and on focus, because the client changes access from their own session.

**Related features:** F-CA-001, F-CA-003, F-CA-004, F-CA-007, D-CA-001, D-CA-007.

**Sources:** `apps/web/src/pages/ca/CaWorkspacePage.tsx:45`, `apps/web/src/pages/ca/CaWorkspacePage.tsx:53`, `apps/web/src/pages/ca/CaWorkspacePage.tsx:83`, `apps/web/src/pages/ca/CaWorkspacePage.tsx:134`, `apps/web/src/pages/ca/CaWorkspacePage.tsx:155`, `apps/web/src/components/ca/AccessParts.tsx:72`, `apps/web/src/components/ca/accessModel.ts:21`, `packages/api/src/services/ca/caAccess.service.ts:175`

### Close an engagement <!-- F-CA-003 -->
**What it does:** Ends your access to one client's books from your side.

**Why it exists:** Code comment: "Either side may: the client withdrawing consent, or the CA closing an engagement."

**Where to find it:** **Client books →** an active client → **Close**.

**Who can use it:** R-PROF, R-PRO.

**Steps**
1. Click **Close** on the client card. The card asks "Close this engagement?".
2. Click **Close engagement** (or **Keep** to cancel). The toast "Engagement closed" appears and the client moves to **Past engagements**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Close** | Button | Asks for confirmation | — |
| **Close engagement** | Button | Revokes the grant | While closing |
| **Keep** | Button | Cancels | — |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** The relationship becomes Revoked immediately; your next request for that client is refused. The client's activity feed records "Your CA closed the engagement for <name>."

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A generic error toast | Request failed (the page shows the browser's error text, not the server's) | Retry |

**Limitations:** Only the client can restore a relationship that was a real invitation ("Only the client can restore this access. Ask them, or send a fresh invitation."). Files you already downloaded cannot be recalled.

**How it works:** `POST /api/ca/clients/:clientId/revoke` sets status REVOKED, the revoke time and who revoked, clears any invitation token and writes a `GRANT_REVOKED` audit row, in one transaction. Nothing is cached, so it takes effect on the next request.

**Related features:** F-CA-002, D-CA-001.

**Sources:** `apps/web/src/pages/ca/CaWorkspacePage.tsx:59`, `apps/web/src/pages/ca/CaWorkspacePage.tsx:244`, `packages/api/src/routes/ca.routes.ts:100`, `packages/api/src/services/ca/caAccess.service.ts:538`, `packages/api/src/services/ca/caAccess.service.ts:832`

### Invite a client (practice) <!-- F-CA-004 -->
**What it does:** A Pro/Advisor practice invites someone to share their books. **Invite a client** opens a dialog asking **Client name** and **Their email**; **Create invitation** creates it, then the dialog becomes **Send the invitation**: a composer showing **To**, editable **Subject** and **Your message**, a live **Preview**, the accept link with a copy button, sends remaining, and **Send email** / **Later**.

**Why it exists:** Code comment: "What the advisor plan buys is a practice of your own — onboarding your own clients." The fixed link and expiry in the email are "what lets them tell this apart from a phishing mail" (composer text).

**Where to find it:** **Client books → Invite a client** (also on the empty state).

**Who can use it:** R-PRO only (with two-factor). R-PROF on a lower plan sees **Invite your own clients** instead.

**Steps**
1. Click **Invite a client**.
2. Enter **Client name** and **Their email** (the address on their account). Click **Create invitation**.
3. Edit **Subject** and **Your message** if you want; the preview updates after you stop typing.
4. Click **Send email**. The toast "Sent to <address>" appears and the dialog confirms the expiry date. Or copy the link and send it yourself, then click **Later**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Invite a client** | Button | Opens the dialog | Hidden below Pro/Advisor |
| **Create invitation** | Button | Creates the pending invitation | Name or email empty; while creating |
| **Cancel** | Button | Closes without creating | — |
| **Subject**, **Your message** | Text fields | Edit the email | — |
| Copy link | Icon button | Copies the accept link | — |
| **Send email** | Button | Emails the invitation | Email not configured on the server; no sends left; while sending |
| **Later** | Button | Closes the dialog | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Client name | Text | Yes | 1–200 characters | — | "A client name is required." |
| Their email | Text | Yes | Valid email | — | Server validation message |
| Subject | Text | No | Up to 160 characters, one line | Server draft | "Subject is too long (max 160 characters)." / "Subject must be a single line." |
| Your message | Text | No | Up to 4,000 characters | Server draft | "Message is too long (max 4000 characters)." |

**Settings and toggles here:** None.

**Results:** A pending client row appears under **Waiting to accept**. The link (`/ca/invitations/<token>/accept`) works once and expires after 14 days; it can be accepted only by an account with the invited email. Nothing of theirs is visible to you until they accept.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This invitation has already been emailed 5 times. Copy the link and send it yourself, or start a fresh invitation." | Per-invitation send limit | Copy the link |
| "You have sent a lot of invitations in the last hour. Try again shortly." | 20 sends per hour reached | Wait |
| "Email is not configured on this server, so copy the link above and send it yourself." | No SMTP | Copy the link |
| "This feature requires the PRO_ADVISOR plan or higher" | Not on Pro/Advisor | Upgrade |

**Limitations:** The invitation email can only be sent from this dialog; once closed there is no resend from the clients list. Errors on **Create invitation** show the browser's generic text rather than the server message.

**How it works:** `POST /api/ca/clients/invite` (gated by CA_WORKSPACE = PRO_ADVISOR) creates an INVITED, PENDING client row with a hashed token and an audit entry, and returns the token. `POST /api/ca/clients/:id/invite-email/preview` and `/send` render the same draft; send is limited to 5 per invitation and 20 per hour, replies go to your address, and it records an audit entry.

**Related features:** F-CA-002, F-CA-005, D-CA-008.

**Sources:** `apps/web/src/pages/ca/CaWorkspacePage.tsx:79`, `apps/web/src/pages/ca/CaWorkspacePage.tsx:375`, `apps/web/src/components/ca/InviteEmailComposer.tsx:145`, `apps/web/src/components/ca/InviteEmailComposer.tsx:200`, `apps/web/src/components/ca/InviteEmailComposer.tsx:223`, `packages/api/src/routes/ca.routes.ts:95`, `packages/api/src/services/ca/caAccess.service.ts:43`, `packages/api/src/services/ca/caAccess.service.ts:410`, `packages/api/src/services/ca/caInviteEmail.service.ts:42`, `packages/api/src/services/ca/caInviteEmail.service.ts:200`, `packages/api/src/services/ca/caInviteEmail.service.ts:231`

### Accept a practice's invitation (account holder) <!-- F-CA-005 -->
**What it does:** The page **Give your accountant access** explains what accepting grants and lets you **Accept** or choose **Not now**. It lists: "They cannot create or delete portfolios, or change your login.", "They cannot see your saved credentials or connected mailboxes.", "Every change they make is recorded, and you can read all of it.", "You can withdraw access at any time, and it stops immediately."

**Why it exists:** Code comment: "The page states what is being granted before it is granted… this is the only moment the person gets to decide."

**Where to find it:** The link in the practice's email (`/ca/invitations/<token>/accept`); you must be signed in.

**Who can use it:** Any signed-in account (R-FREE and up) whose email matches the invitation. Not R-MANAGER (account route).

**Steps**
1. Open the link and sign in with the invited email.
2. Click **Accept**. You are taken to **Account Access** (D-CA-001), where the practice now appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Accept** | Button | Accepts the invitation | While accepting |
| **Not now** | Button | Goes to the dashboard; the invitation stays open | — |

**Fields and rules:** None.

**Settings and toggles here:** After accepting, what the practice can see and change is set on Account Access (D-CA-001). A new grant starts view-only.

**Results:** The relationship becomes active; the practice can read your books from now on, within the scope you set.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "That invitation was sent to a different email address." | Signed in with another account | Sign in with the invited address |
| "That invitation has expired. Ask your CA to send a new one." | Older than 14 days | Ask for a new one |
| "That invitation has already been used." | Already accepted | None |
| "That invitation is no longer valid." | Withdrawn | Ask for a new one |
| "Invitation not found." | Wrong or old link | Ask for a new one |

**Limitations:** The page's wording says accepting lets them "keep your books: creating and editing vouchers, your chart of accounts, and corrections to your records", but a new grant starts view-only until you widen it on Account Access (see DOCUMENTATION_GAPS.md). The page does not show who invited you.

**How it works:** `POST /api/me/professional-access/invitations/:token/accept` runs as system inside one transaction: finds the row by token hash, checks it is an INVITED, unaccepted, unexpired, non-revoked invitation sent to your email, sets you as the subject, marks it ACTIVE, clears the token (single use) and records `GRANT_ACCEPTED`.

**Related features:** F-CA-004, D-CA-001.

**Sources:** `apps/web/src/pages/ca/AcceptCaInvitationPage.tsx:28`, `apps/web/src/pages/ca/AcceptCaInvitationPage.tsx:40`, `apps/web/src/pages/ca/AcceptCaInvitationPage.tsx:51`, `packages/api/src/routes/ca.routes.ts:187`, `packages/api/src/services/ca/caAccess.service.ts:463`, `packages/api/src/services/ca/caAccess.service.ts:490`, `packages/api/src/services/ca/caAccess.service.ts:496`

### Accept an account holder's invitation (professional) <!-- F-CA-006 -->
**What it does:** When an account holder invites their professional from Account Access, the emailed link opens a page — viewable before signing in — titled "<Name> would like you to see their books", stating which email may accept and the expiry date. After signing in with that email, **Accept and open their books** grants access; the confirmation "You can now see <Name>'s books" offers **Open their books**, **Set up my portfolio** and **See advisor plans**.

**Why it exists:** Code comment: "the person opening this link may never have heard of the product. So the page answers 'who is asking, and for what' BEFORE asking them to sign in." Accepting is free.

**Where to find it:** Email link `/professional-invitations/<token>` (outside the signed-in area).

**Who can use it:** R-VISITOR can view the invitation; accepting needs a signed-in account with the invited email and two-factor sign-in used this session (any plan). Becomes R-PROF.

**Steps**
1. Open the link. The page shows who invited you.
2. If not signed in, click **Sign in** or **Create account** (both return to this page). If signed in as another address, click **Sign in as <invited email>**.
3. Click **Accept and open their books**.
4. Click **Open their books** to go to **Client books**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Sign in** / **Create account** | Links | Go to login/register and back | Shown when signed out |
| **Sign in as <email>** | Button | Signs out and returns to login | Shown when signed in with another email |
| **Accept and open their books** | Button | Accepts | Shown only when the email matches; disabled while accepting |
| **Open their books** | Button | Opens `/ca` | After accepting |
| **Set up my portfolio** | Link | Opens the dashboard | After accepting |
| **See advisor plans** | Link | Meant to open the plans page | After accepting; see Limitations |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** You become the professional on that relationship; it appears under **Your clients**.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This invitation isn't open" + "That invitation has expired. Ask them to send a new one." / "That invitation was withdrawn." / "That invitation has already been used." / "Invitation not found." | Link no longer valid | Ask the person to invite you again |
| "That invitation was sent to a different email address." | Wrong account | Sign in with the invited email |
| "You cannot accept your own invitation." | You invited yourself | — |
| "Turn on two-factor sign-in (Settings) to use the professional workspace…" | Two-factor off or not used this session | Turn it on / sign in again with the code |

**Limitations:** Known defect: **See advisor plans** links to `/settings/billing`, which does not exist (not-found page). The page does not warn before you click Accept that two-factor sign-in is required.

**How it works:** `GET /api/professional-invitations/:token` (no sign-in) returns only the inviter's name (or "An EveryPaisa user"), the invited email and the expiry. `POST /api/professional-invitations/:token/accept` runs `authenticate` and the two-factor check, then (as system, in one transaction) validates the token, email and expiry, sets you as the professional, marks it ACTIVE, clears the token and records `GRANT_ACCEPTED`.

**Related features:** F-CA-001, F-CA-007, D-CA-001, D-CA-007.

**Sources:** `apps/web/src/App.tsx:133`, `apps/web/src/pages/ca/AcceptProfessionalInvitePage.tsx:69`, `apps/web/src/pages/ca/AcceptProfessionalInvitePage.tsx:135`, `apps/web/src/pages/ca/AcceptProfessionalInvitePage.tsx:151`, `apps/web/src/pages/ca/AcceptProfessionalInvitePage.tsx:194`, `packages/api/src/routes/ca.routes.ts:206`, `packages/api/src/routes/ca.routes.ts:210`, `packages/api/src/services/ca/caAccess.service.ts:1033`, `packages/api/src/services/ca/caAccess.service.ts:1078`

### Client books header and live access changes <!-- F-CA-007 -->
**What it does:** At the top of `/ca/clients/:id`: **All clients** back link, the client's name and email, a badge (**Keep the books** / **Make some changes** / **View only**), the access strip, and a note — "View only. You can read everything here and download reports, but not post entries or change transactions. <Name> can widen this from their Account Access page." — or, when you can edit, "<Name> can see every change you make here, and can withdraw access at any time." Below is a tab bar: **Chart of accounts**, **Vouchers**, **Trial balance** | **Transactions**, **FMV (31 Jan 2018)** | **Reports**, **Documents** | **Activity**. If the client changes your access while the page is open, a toast says "<Name> has withdrawn your access.", "<Name> changed your access to view only." or "<Name> updated what you can do in their books." and buttons appear or disappear.

**Why it exists:** Code comment: "Everything here belongs to somebody else, who can read every change and end the arrangement; the page says so instead of implying it."

**Where to find it:** **Client books →** a client → **Open books**.

**Who can use it:** R-PROF, R-PRO with an active grant and two-factor.

**Steps**
1. Click a tab to open that section.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **All clients** | Link | Back to `/ca` | — |
| Section tabs (8) | Tabs | Switch section (not saved; opens on **Chart of accounts**) | — |

**Fields and rules:** None.

**Settings and toggles here:** Edit rights (books, transactions, imports, fair market values), portfolio/asset-class/category scope and the access window are set by the client (D-CA-001); each edit button below appears only when the matching right is on.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "That client is not yours." | Not your client (or doesn't exist) | Use **All clients** |
| "Your access to this client has been revoked." | Ended | — |
| "That client has not accepted your invitation yet." | Pending | Wait |
| "This access starts on <date>." / "This access ended on <date>. Ask the client to extend it." | Outside the client's access window (dates in IST) | Ask the client |
| "<Name> has given you view-only access, so you cannot <action>. They can change that from Account Access." | Missing edit right | Ask the client |

**Limitations:** Hiding a button is a convenience; the database enforces the same limits.

**How it works:** The page re-reads the client list every 5 seconds while visible. Every `/api/ca/clients/:id/*` request runs `getCaScope`, which checks two-factor, ownership, status and the access window (whole IST days) and returns the scope and the four edit flags; database row-level policies apply the same limits.

**Related features:** F-CA-008 to F-CA-017, D-CA-001.

**Sources:** `apps/web/src/pages/ca/ClientBooksPage.tsx:80`, `apps/web/src/pages/ca/ClientBooksPage.tsx:128`, `apps/web/src/pages/ca/ClientBooksPage.tsx:148`, `apps/web/src/pages/ca/ClientBooksPage.tsx:297`, `apps/web/src/pages/ca/ClientBooksPage.tsx:718`, `apps/web/src/pages/ca/ClientBooksPage.tsx:754`, `packages/api/src/services/ca/caAccess.service.ts:119`, `packages/api/src/services/ca/caAccess.service.ts:132`

### Chart of accounts <!-- F-CA-008 -->
**What it does:** The **Chart of accounts** tab lists the client's ledger heads (**Code**, **Account**, **Type**). With the books right you can add (**New account**), rename/recode (pencil) and delete (bin) accounts.

**Why it exists:** Tab hint: "The ledger heads every voucher posts to."

**Where to find it:** **Client books →** client → **Chart of accounts**.

**Who can use it:** View: R-PROF/R-PRO with a grant. Change: only with the client's books right.

**Steps**
1. Click **New account**, enter **Code**, **Name**, **Type** and optional **Opening balance (optional)**, click **Create account** ("Account created").
2. To edit, click the pencil, change code or name, **Save changes** ("Account updated").
3. To delete, click the bin ("Account deleted") — there is no confirmation.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **New account** | Button | Opens **New account** | Hidden without books right |
| Edit (pencil, "Edit <name>") | Icon | Opens **Edit account** | Hidden without books right |
| Delete (bin, "Delete <name>") | Icon | Deletes immediately | Hidden without books right |
| **Create account** / **Save changes** / **Cancel** | Buttons | Save or close | Save disabled until Code and Name are filled and the balance is valid |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Code | Text | Yes | 1–20 characters | — | — |
| Name | Text | Yes | 1–200 characters | — | — |
| Type | Select | Yes (new only) | Asset, Liability, Income, Expense, Equity (S-CA-001) | Asset | — |
| Opening balance (optional) | Number | No | Positive, digits and optional decimal point | — | "Enter a positive amount, digits and an optional decimal point only." |

**Settings and toggles here:** S-CA-001 **Account type** — fixed once created; to change it, delete and re-create.

**Results:** The client's chart changes; each change is recorded in both parties' activity.

**Errors and troubleshooting:** "Could not save the account" / "Could not delete the account" with the server reason.

**Limitations:** Type cannot be edited. Deletion has no confirmation step. Opening the tab with the books right creates the default chart the first time (recorded as "Created the default chart of accounts (N accounts).").

**How it works:** `GET /api/ca/clients/:id/accounts/flat`, `POST …/accounts`, `PATCH …/accounts/:id`, `DELETE …/accounts/:id`, each after `getCaScope` and (for writes) the books right; each write and its audit row share one transaction. Reading with the books right first seeds the default chart and derives vouchers (F-CA-010).

**Related features:** F-CA-009, F-CA-010, D-CA-005.

**Sources:** `apps/web/src/pages/ca/ClientBooksPage.tsx:349`, `apps/web/src/pages/ca/ClientBooksPage.tsx:381`, `apps/web/src/components/ca/AccountFormDialog.tsx:127`, `apps/web/src/components/ca/AccountFormDialog.tsx:136`, `apps/web/src/components/ca/AccountFormDialog.tsx:149`, `packages/api/src/schemas/accounting.schema.ts:38`, `packages/api/src/controllers/caAccounting.controller.ts:105`, `packages/api/src/controllers/caAccounting.controller.ts:296`

### Vouchers and receipts <!-- F-CA-009 -->
**What it does:** The **Vouchers** tab lists double-entry vouchers (**No.**, **Type**, **Date**, **Narration**). Each row can show its receipt (eye) or download it as PDF. **Receipts ZIP** downloads every rent, premium and loan receipt as one PDF each; **Excel** downloads the same receipts as one totalled spreadsheet. With the books right you can **Post voucher** and delete vouchers.

**Why it exists:** Tab hint: "The double-entry record behind the trial balance, P&L and balance sheet."

**Where to find it:** **Client books →** client → **Vouchers**.

**Who can use it:** View and download: R-PROF/R-PRO with a grant. Post/delete: books right.

**Steps**
1. Click **Post voucher**. Choose **Type**, check the suggested **Number**, set **Date** and optional **Narration (optional)**.
2. For each entry pick a **Debit** account, a **Credit** account and an **Amount**; **Add entry** for more lines.
3. Click **Post voucher** ("Voucher posted").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Receipts ZIP** | Button | Downloads receipt PDFs as a ZIP | — |
| **Excel** | Button | Downloads receipts workbook | — |
| **Generate from activity** | Button | F-CA-010 | Hidden without books right |
| **Post voucher** | Button | Opens the dialog / posts it | Hidden without books right; disabled until valid |
| View receipt (eye) / Download receipt | Icons | Receipt PDF for a voucher | — |
| Delete voucher (bin) | Icon | Deletes immediately | Hidden without books right |
| **Add entry** / remove entry | Buttons | Add or remove debit/credit lines | Remove disabled with one entry |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Type | Select | Yes | Journal, Payment, Receipt, Contra, Purchase, Sales (S-CA-002) | Journal | — |
| Number | Text | Yes | 1–50 characters | Next number for the type | — |
| Date | Date | Yes | YYYY-MM-DD | Today | — |
| Narration (optional) | Text | No | Up to 500 characters | — | — |
| Entry debit / credit / amount | Selects + number | Yes | Different accounts; amount digits with optional decimals | — | "An entry cannot debit and credit the same account." / "Amounts take digits and an optional decimal point only." |

**Settings and toggles here:** S-CA-002 **Voucher type**.

**Results:** The voucher posts to the client's ledger and appears in their activity.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This client has no chart of accounts yet. Open the Chart of accounts tab once to create the defaults." | No accounts | Open **Chart of accounts** (books right needed) |
| "Could not post the voucher" / "Could not delete the voucher" + reason | Server refused | Read the reason |
| "Could not produce that receipt" / "Could not build that download" | Receipt generation failed | Retry |

**Limitations:** Vouchers cannot be edited in the page (API only, F-CA-019). Deleting has no confirmation.

**How it works:** `GET …/vouchers`, `GET …/vouchers/next-no?type=`, `POST …/vouchers` (each entry is one debit/credit pair, so the voucher balances by construction), `DELETE …/vouchers/:id`, receipts via `GET …/vouchers/:id/receipt.pdf`, `…/receipts.zip`, `…/receipts.xlsx` (these first bring the books up to date when the books right is on).

**Related features:** F-CA-008, F-CA-010, F-CA-011, D-CA-005.

**Sources:** `apps/web/src/pages/ca/ClientBooksPage.tsx:406`, `apps/web/src/pages/ca/ClientBooksPage.tsx:421`, `apps/web/src/pages/ca/ClientBooksPage.tsx:484`, `apps/web/src/components/ca/VoucherFormDialog.tsx:170`, `apps/web/src/components/ca/VoucherFormDialog.tsx:176`, `apps/web/src/components/ca/VoucherFormDialog.tsx:253`, `packages/api/src/schemas/accounting.schema.ts:55`, `packages/api/src/controllers/caAccounting.controller.ts:344`, `packages/api/src/controllers/caAccounting.controller.ts:844`

### Generate from activity <!-- F-CA-010 -->
**What it does:** Derives vouchers from what the client recorded (trades, loan payments, rent, premiums). It happens automatically when you open a books tab with the books right; the **Generate from activity** button repeats it on demand and reports "Generated N vouchers" or "Books are already up to date".

**Why it exists:** Code comment: projecting on open "is what makes the screen and the download agree"; the button covers "the client added transactions while the CA had the page open".

**Where to find it:** **Vouchers** and **Trial balance** tabs.

**Who can use it:** R-PROF/R-PRO with the books right.

**Steps**
1. Click **Generate from activity**. The icon spins, then the toast reports the count.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Generate from activity** | Button | Derives vouchers now | Hidden without books right; disabled while running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** New vouchers in the client's books.

**Errors and troubleshooting:** "Could not generate vouchers" with the reason (the button reports errors; the automatic pass logs them and shows existing figures).

**Limitations:** With view-only access nothing is derived, so you see only what the client's own books already hold.

**How it works:** `POST /api/ca/clients/:id/vouchers/generate` seeds the default chart if missing and runs the same projection the accounting module uses (D-CA-005), recording audit rows.

**Related features:** F-CA-009, F-CA-011.

**Sources:** `apps/web/src/pages/ca/ClientBooksPage.tsx:202`, `apps/web/src/pages/ca/ClientBooksPage.tsx:217`, `packages/api/src/controllers/caAccounting.controller.ts:193`, `packages/api/src/controllers/caAccounting.controller.ts:203`, `packages/api/src/controllers/caAccounting.controller.ts:223`

### Trial balance <!-- F-CA-011 -->
**What it does:** Shows every account's **Opening**, **Debit**, **Credit** and **Balance**, with a **Total** row and a badge "Debits and credits agree" or "Out of balance by ₹…".

**Why it exists:** Tab hint: "Every account's opening, movement and closing balance. The two totals must agree."

**Where to find it:** **Client books →** client → **Trial balance**.

**Who can use it:** R-PROF/R-PRO with a grant.

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Generate from activity** | Button | F-CA-010 | Hidden without books right or when nothing is posted |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** "Nothing posted yet" — no vouchers yet; generate them from activity.

**Limitations:** Always as of today in the page (the API accepts an as-of date; the page does not send one).

**How it works:** `GET /api/ca/clients/:id/trial-balance` (brings the books up to date first when the books right is on). Totals are summed with decimal arithmetic to 4 places.

**Related features:** F-CA-009, F-CA-010, F-CA-015.

**Sources:** `apps/web/src/pages/ca/ClientBooksPage.tsx:912`, `packages/api/src/controllers/caAccounting.controller.ts:426`

### Client transactions <!-- F-CA-012 -->
**What it does:** The **Transactions** tab lists the client's trades (**Date**, **Asset**, **Type**, **Qty**, **Price**, **Net**). With the transactions right you can **Add transaction** and correct a trade (pencil → **Correct transaction**).

**Why it exists:** Tab hint: "Trades as this client recorded them. Corrections here flow into the vouchers." Code comment: a professional "may add a transaction and correct one, but never delete one".

**Where to find it:** **Client books →** client → **Transactions**.

**Who can use it:** View: R-PROF/R-PRO with a grant. Add/correct: transactions right.

**Steps**
1. **Add transaction**: pick **Type** and **Asset class**; fill **Scheme name**/**AMC** (mutual funds), **Symbol**/**Name** (equity, ETF, foreign equity) or **Asset name** (others), optional **ISIN (optional)**, **Trade date**, **Quantity**, **Price**, optional charges (**Add charges (optional)**: Brokerage, STT, Stamp duty, Exchange, GST, SEBI, Other, Broker) and **Narration (optional)**. Click **Add transaction** ("Transaction recorded").
2. **Correct**: click the pencil, change **Trade date**, **Quantity**, **Price**, **Asset name** or **Narration** ("Why this was corrected"), click **Save correction** ("Transaction corrected").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add transaction** | Button | Opens the add dialog / saves | Hidden without transactions right; save disabled until date, quantity, price and a name are valid |
| Correct (pencil) | Icon | Opens **Correct transaction** | Hidden without transactions right |
| **Add charges (optional)** / **Hide charges** | Toggle | Shows charge fields | — |
| **Save correction** | Button | Saves changed fields only | Disabled until something changed and values are valid |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Type | Select | Yes | Buy, Sell, SIP, Switch in, Switch out, Dividend payout, Dividend reinvest, Bonus, Split, Redemption (S-CA-003) | Buy | — |
| Asset class | Select | Yes | 26 classes (S-CA-003) | Equity | — |
| Quantity, Price | Number | Yes | Digits and one decimal point | — | "Digits and one decimal point." |
| Trade date | Date | Yes | — | Today | — |
| Charges | Number | No | Decimal strings | — | — |

**Settings and toggles here:** S-CA-003 **Transaction type and asset class**.

**Results:** Holdings and capital gains recalculate for the client. A correction re-derives gross and net amounts from quantity, price and charges, and the client sees the before and after values in their activity.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "None of the portfolios this client shared with you can take these entries. Ask the client to share one." | Grant narrowed to portfolios and none is usable | Ask the client |
| "Transaction not found for this client" | Wrong row | Reload |
| "Could not record the transaction" / "Could not save the correction" | Server refused | Read the reason |

**Limitations:** Transactions can't be deleted by a professional. Portfolio, asset class and buy/sell direction can't be corrected. Only the newest 200 transactions are listed. A new transaction goes into the client's first portfolio you can see; if the client has no portfolio and your grant covers all portfolios, a portfolio "My Portfolio" is created for them. Known defect: on correction, net amount adds charges only for **Buy**; for SIP, Switch in and Dividend reinvest the charges are subtracted (see DOCUMENTATION_GAPS.md).

**How it works:** `GET …/transactions` (newest 200), `POST …/transactions` (same schema and service as the client's own manual entry, minus the portfolio field), `PATCH …/transactions/:id` (write and audit in one transaction; holdings recompute after commit). There is no DELETE route and no database policy that would allow one.

**Related features:** F-CA-010, F-CA-013, D-CA-005.

**Sources:** `apps/web/src/pages/ca/ClientBooksPage.tsx:527`, `apps/web/src/components/ca/AddTransactionDialog.tsx:72`, `apps/web/src/components/ca/AddTransactionDialog.tsx:301`, `apps/web/src/components/ca/CorrectTransactionDialog.tsx:110`, `apps/web/src/components/ca/CorrectTransactionDialog.tsx:129`, `apps/web/src/api/ca.api.ts:406`, `packages/api/src/routes/ca.routes.ts:131`, `packages/api/src/controllers/caAccounting.controller.ts:154`, `packages/api/src/controllers/caAccounting.controller.ts:474`, `packages/api/src/controllers/caAccounting.controller.ts:591`, `packages/api/src/controllers/caAccounting.controller.ts:714`

### Import a statement for a client <!-- F-CA-013 -->
**What it does:** **Import file** uploads a statement, contract note or CAS into the client's books and parses it in the background ("File uploaded — parsing in the background"). **Recent imports** lists files with **Type**, **Status**, **Rows** (success / total) and **Uploaded**.

**Why it exists:** Code comment: it reuses "the SAME upload middleware, request body schema, createImportJob call and parser pipeline the client's own POST /api/imports route does".

**Where to find it:** **Client books →** client → **Transactions → Import file**.

**Who can use it:** R-PROF/R-PRO with the imports right.

**Steps**
1. Click **Import file** and choose a file (.pdf, .csv, .tsv, .xlsx, .xls, .html, .htm).
2. Watch **Recent imports**; pending rows update every 4 seconds until done.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Import file** | Button + file picker | Uploads a file | Hidden without imports right; disabled while uploading |

**Fields and rules:** File types as above; the type is inferred from the file name.

**Settings and toggles here:** None.

**Results:** Parsed rows land in the client's first visible portfolio, limited to the asset classes in your grant.

**Errors and troubleshooting:** "Upload failed" with the reason (for example a regulatory document type that isn't accepted, or a file that is not a supported kind).

**Limitations:** The page has no password field, so password-protected files can't be unlocked here (the API accepts a password).

**How it works:** `POST /api/ca/clients/:id/imports` (multipart field `file`) → `createImportJob` for the client with `caAllowedAssetClasses` from the grant; audit `IMPORT_JOB_CREATED`. `GET …/imports` lists the client's import jobs. Import processing is the shared pipeline (D-CA-004).

**Related features:** F-CA-012, D-CA-004.

**Sources:** `apps/web/src/pages/ca/ClientBooksPage.tsx:261`, `apps/web/src/pages/ca/ClientBooksPage.tsx:501`, `apps/web/src/pages/ca/ClientBooksPage.tsx:522`, `apps/web/src/pages/ca/ClientBooksPage.tsx:576`, `packages/api/src/routes/ca.routes.ts:150`, `packages/api/src/controllers/caAccounting.controller.ts:755`, `packages/api/src/controllers/caAccounting.controller.ts:819`

### Fair market value on 31 Jan 2018 <!-- F-CA-014 -->
**What it does:** The **FMV (31 Jan 2018)** tab lists per-scrip values used to grandfather long-term equity gains under Section 55(2)(ac) (**ISIN**, **Scrip**, **Source** — "Set here" or "Reference", **FMV per unit**). With the FMV right you can **Set a value**, edit or remove your own overrides.

**Why it exists:** Dialog text: "Changing it changes your client's taxable gain, so the previous figure is kept on the record."

**Where to find it:** **Client books →** client → **FMV (31 Jan 2018)**.

**Who can use it:** View: R-PROF/R-PRO with a grant. Change: FMV right.

**Steps**
1. Click **Set a value**, enter **ISIN**, optional **Scrip name (optional)** and **FMV per unit**, click **Save value** ("Fair market value saved").
2. To remove an override click its bin ("Override removed"); no confirmation.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Set a value** | Button | Opens the dialog | Hidden without FMV right |
| Edit / Remove | Icons | Edit or delete an override | Only on "Set here" rows and with FMV right |
| **Save value** | Button | Saves | Disabled until ISIN and value are valid |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| ISIN | Text | Yes | 2 letters + 9 alphanumerics + 1 digit; locked when editing | — | "An ISIN is 12 characters: two letters, then nine alphanumerics, then a digit." |
| Scrip name (optional) | Text | No | Up to 200 characters | — | — |
| FMV per unit | Number | Yes | Digits and optional decimal point | — | "Digits and an optional decimal point only." |

**Settings and toggles here:** None.

**Results:** The client's capital-gains calculations use the override for that ISIN.

**Errors and troubleshooting:** "No override set for that ISIN" when removing a missing one.

**Limitations:** Reference (shared) values cannot be edited here.

**How it works:** `GET …/fmv`, `PUT …/fmv/:isin` (upsert), `DELETE …/fmv/:isin`, with audit rows that keep the previous value.

**Related features:** F-CA-012, F-CA-015.

**Sources:** `apps/web/src/pages/ca/ClientBooksPage.tsx:614`, `apps/web/src/pages/ca/ClientBooksPage.tsx:653`, `apps/web/src/components/ca/FmvFormDialog.tsx:99`, `apps/web/src/components/ca/FmvFormDialog.tsx:104`, `apps/web/src/components/ca/FmvFormDialog.tsx:141`, `packages/api/src/routes/ca.routes.ts:160`, `packages/api/src/controllers/caAccounting.controller.ts:652`

### Client reports <!-- F-CA-015 -->
**What it does:** The **Reports** tab runs the app's report catalogue (D-CA-003) against the client's data. Filters **Financial year** (current and 5 previous), **As-of date**, **From**, **To**; a search box ("Search reports"); per-report download buttons; and two extra exports: **Provident fund** (Excel for the chosen year) and **Everything for <FY>** (a ZIP of every statement for the year; a failed report is named inside the ZIP).

**Why it exists:** Code comment: every download carries the client id, so the professional reads the client's data "through the read policies instead" of becoming the client.

**Where to find it:** **Client books →** client → **Reports**.

**Who can use it:** R-PROF/R-PRO with a grant — but see Limitations.

**Steps**
1. Set the filters a report needs.
2. Click its format button. The file downloads.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Financial year**, **As-of date**, **From**, **To** | Select / dates | Report parameters (S-CA-004) | — |
| Search reports | Text | Filters the list | — |
| Report format buttons | Buttons | Download PDF/Excel/XML/ZIP | While a download runs |
| **Provident fund** | Button | PF statement for the FY | While a download runs |
| **Everything for <FY>** | Button | Year bundle ZIP | While a download runs |

**Fields and rules:** None beyond the filters.

**Settings and toggles here:** S-CA-004 **Report period filters**.

**Results:** Files download; every download is recorded.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Browser alert with "This feature requires the PLUS plan or higher" or "…PRO_ADVISOR plan or higher" | Report gates check the professional's own plan | See Limitations |
| Browser alert "Download failed" | Other failure | Retry |

**Limitations:** Known defect: the report endpoints are gated on the caller's plan, so a professional on Free cannot download any catalogue report, Provident fund or the year bundle for a client, and anyone below Pro/Advisor cannot download the accounting reports (trial balance, ledger, P&L, balance sheet, chart of accounts), even though acting for a client who invited you is meant to be free (see DOCUMENTATION_GAPS.md). Errors appear as a raw browser alert.

**How it works:** Downloads call `/api/reports/download/<report>?clientId=…`, `/api/reports/statement/provident-fund?…&clientId=…` and `/api/reports/fy-bundle?fy=…&clientId=…`. The routes apply `requireFeature('TAX_REPORT_CATALOG')` (Plus) or `requireFeature('ACCOUNTING_MODULE')` (Pro/Advisor) to the signed-in professional before resolving the client.

**Related features:** F-CA-011, F-CA-014, D-CA-003.

**Sources:** `apps/web/src/components/ca/ClientReportsTab.tsx:37`, `apps/web/src/components/ca/ClientReportsTab.tsx:72`, `apps/web/src/components/ca/ClientReportsTab.tsx:81`, `apps/web/src/components/ca/ClientReportsTab.tsx:198`, `apps/web/src/components/ca/ClientReportsTab.tsx:216`, `packages/api/src/routes/reports.routes.ts:85`, `packages/api/src/routes/reports.routes.ts:111`, `packages/api/src/routes/reports.routes.ts:114`, `packages/api/src/routes/reports.routes.ts:128`, `packages/api/src/middleware/requirePlan.ts:16`

### Client documents <!-- F-CA-016 -->
**What it does:** The **Documents** tab lists files the client attached to properties, vehicles, policies and portfolios (name, owner type, category, size, date). Tick files (or **Select all**) and click **Download selected** to get `documents.zip`.

**Why it exists:** Inferred from behavior: lets the professional collect the client's supporting papers in one download.

**Where to find it:** **Client books →** client → **Documents**.

**Who can use it:** R-PROF/R-PRO with a grant.

**Steps**
1. Tick the files you want (or **Select all**).
2. Click **Download selected**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| File checkboxes | Checkbox | Select files | — |
| **Select all** / **Clear** | Button | Select or clear all | — |
| **Download selected** | Button | Downloads a ZIP | Nothing selected; while downloading |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** A ZIP downloads.

**Errors and troubleshooting:** "No documents" when the client has none; a browser alert "Download failed" on error.

**Limitations:** No per-file preview.

**How it works:** `GET /api/documents/all?clientId=…` and `POST /api/documents/bulk-download?clientId=…` with the selected ids (D-CA-006).

**Related features:** D-CA-006.

**Sources:** `apps/web/src/components/ca/ClientDocumentsTab.tsx:67`, `apps/web/src/components/ca/ClientDocumentsTab.tsx:107`, `apps/web/src/components/ca/ClientDocumentsTab.tsx:143`, `packages/api/src/routes/documents.routes.ts:39`

### Client activity <!-- F-CA-017 -->
**What it does:** The **Activity** tab, **Everything you have done here**, is a day-grouped timeline of your changes to this client's books (and access events), each with time and, where recorded, the previous value ("Was …").

**Why it exists:** Code comment: the same rows are shown to both sides "so neither party can be shown a version of events the other cannot see".

**Where to find it:** **Client books →** client → **Activity**.

**Who can use it:** R-PROF/R-PRO with a grant.

**Steps:** Not applicable — view only.

**Controls:** None.

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** "You haven't made any changes to these books yet." when empty.

**Limitations:** Shows the newest 100 entries only. Summaries are worded for the account holder (for example "You granted your CA access to your books.").

**How it works:** `GET /api/ca/activity?clientId=…` (checks the grant first) returns audit rows where you are the actor or subject, newest first, default 100, maximum 500.

**Related features:** D-CA-001.

**Sources:** `apps/web/src/pages/ca/ClientBooksPage.tsx:700`, `packages/api/src/controllers/ca.controller.ts:106`, `packages/api/src/services/ca/caAccess.service.ts:586`

**What this area doesn't do**
- A professional can't delete a client's transactions, create a second portfolio for a client, change the client's login or see their saved credentials or mailboxes.
- You can't widen your own access; only the client can (on Account Access).
- New records for clients without a login can no longer be created.
- There is no resend or cancel for a practice invitation on the clients list.
- The ledger, P&L and balance-sheet views exist only as API endpoints and report downloads, not as tabs.
