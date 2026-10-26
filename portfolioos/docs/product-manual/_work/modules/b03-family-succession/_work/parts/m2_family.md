### Pending invitations <!-- F-FAM-013 -->
**What it does:** Lists invitations that have not been accepted and have not expired (email, role, expiry date) and lets owners cancel them.

**Why it exists:** Inferred from behavior: an open invitation holds a seat (F-FAM-003), so owners need to see and withdraw unanswered ones.

**Where to find it:** **Family → Members & sharing → Pending invitations** card (shown only when there is at least one).

**Who can use it:** Owners only (R-FAMOWNER); the card is not shown to others.

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
| "Invitation already accepted." | They accepted meanwhile | Nothing to cancel; remove the member instead (F-FAM-017) |
| "Invitation not found." | Already cancelled | Refresh |

**Limitations:** No resend button here; to email it again use the composer right after creating it, or create a new invitation.

**How it works:** `GET /api/families/:familyId/invitations` (owner only; unaccepted and unexpired, newest first) and `DELETE /api/families/:familyId/invitations/:invitationId`.

**Related features:** F-FAM-003, F-FAM-011.

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:405`, `apps/web/src/pages/family/FamilyPage.tsx:735`, `packages/api/src/services/family/family.service.ts:1306`, `packages/api/src/services/family/family.service.ts:1323`

### Edit a member's role and visibility <!-- F-FAM-014 -->
**What it does:** Changes a signed-in member's relation, role (**What they can do**) and the asset classes and non-portfolio categories they may see of the other members.

**Why it exists:** Service comment: owners can "Change a member's role or visibility caps"; the visibility caps decide what a contributor or viewer sees of the household.

**Where to find it:** **Family → Members & sharing →** click a person on the tree → **Edit** (members with their own login).

**Who can use it:** Owners only (R-FAMOWNER).

**Steps**
1. Open the person's card and click **Edit**. The dialog "Edit <name>" opens with their email.
2. Change **Related to** / **As their**, **What they can do**, and tick **Asset classes (n/N)** and **Non-portfolio categories (n/N)**.
3. Click **Save**. The toast "Saved" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **What they can do** | Select | Owner / Contributor / Viewer | — |
| Asset class checkboxes + **All** / **None** | Checkboxes | Choose visible asset classes | Greyed out when role is Owner |
| Category checkboxes + **All** / **None** | Checkboxes | Choose visible categories (Vehicle, Rental, Insurance, Loan, Credit card, Bank account, Owned property, Goal) | Greyed out when role is Owner |
| **Save** / **Cancel** | Buttons | Save / close | Disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Role | Select | No | OWNER/CONTRIBUTOR/VIEWER | Current role | "Cannot demote the last OWNER of a family." / "A managed member cannot be an owner; they cannot sign in." |
| Relation | Picker | No | ≤ 40 characters | Current | "Someone cannot be related to themselves." / "That relation would put someone under their own descendant on the tree." |

**Settings and toggles here:** S-FAM-003 **What they can do** — Owner sees everything and manages the family; Contributor sees a filtered view and can add to family-shared portfolios; Viewer sees a filtered view, read-only. S-FAM-004 **Asset classes** and S-FAM-005 **Non-portfolio categories** — ticked items are visible; an empty list hides everything in that dimension (the on-screen hint says the opposite — see Limitations).

**Results:** The change applies on the member's next request.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Update failed" toast with a server message | See the messages above | Correct and retry |

**Limitations:** Defect: the dialog note says "Owners see everything. Empty lists mean no restriction." and the matrix says "Empty = no restriction. Check specific classes to whitelist them." The server does the reverse: an empty list is deny-all for a contributor or viewer. Use **All** to grant full visibility. Caps apply only to other members' data; a member always sees their own data.

**How it works:** `PATCH /api/families/:familyId/members/:memberUserId/permissions` (owner check). The family scope gives an Owner no caps; a contributor or viewer gets exactly the stored lists, where an empty list means nothing is allowed. Changing the relation re-places the person on the tree and fails if that would create a loop.

**Related features:** F-FAM-004–F-FAM-007, F-FAM-011, F-FAM-021, F-FAM-022.

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:1729`, `apps/web/src/pages/family/FamilyPage.tsx:1808`, `apps/web/src/pages/family/FamilyPage.tsx:1826`, `apps/web/src/pages/family/FamilyPage.tsx:1897`, `packages/api/src/services/family/family.service.ts:213`, `packages/api/src/services/family/familyScope.service.ts:44`, `packages/api/src/services/family/familyScope.service.ts:208`

### Edit a managed member <!-- F-FAM-015 -->
**What it does:** For a member with no login, changes how they are related (owners) and who keeps their books.

**Why it exists:** Code comment: "A managed member never signs in, so roles and visibility filters mean nothing for them. What can change is how they are related and who keeps their books."

**Where to find it:** Tree → click the managed member → **Edit**. The dialog subtitle reads "Managed by <name>" (or "nobody yet").

**Who can use it:** Owners (R-FAMOWNER) through the UI. The server also lets the current keeper change the keeper, but the **Edit** button is shown only to owners.

**Steps**
1. Click **Edit** on a managed member's card.
2. Change **Related to** / **As their** (owners) and **Who keeps their books**.
3. Click **Save**. The toast "Saved" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Who keeps their books** | Select | Chooses the keeper; "Choose someone" when none | Members with no login are disabled ("<name> — no login yet") |
| **Hand the account to them** | Button | Starts F-FAM-016 | — |
| **Save** / **Cancel** | Buttons | Save / close | Disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Keeper | Select | Yes | Active member with a login | Current keeper | "The manager must be an active member of this family." / "Managed member not found in this family." |

**Settings and toggles here:** S-FAM-002 **Who keeps their books** — "Any member with their own login can keep them — they do not need to be an owner… The change applies the moment you save."

**Results:** The new keeper sees the profile in "Accounts you manage"; the old keeper loses access on their next request.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "OWNER role required." | Non-owner who is not the keeper | Ask an owner |

**Limitations:** A keeper who is not an owner cannot reach this dialog in the UI (see DOCUMENTATION_GAPS.md).

**How it works:** Relation changes use the permissions endpoint; the keeper change uses `PATCH /api/families/:familyId/members/:memberUserId/manager` — allowed for the current keeper or an owner.

**Related features:** F-FAM-009, F-FAM-016, F-FAM-024.

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:1543`, `apps/web/src/pages/family/FamilyPage.tsx:1598`, `apps/web/src/pages/family/FamilyPage.tsx:1609`, `packages/api/src/routes/families.routes.ts:273`, `packages/api/src/services/family/family.service.ts:1277`

### Hand a managed account to its owner <!-- F-FAM-016 -->
**What it does:** Sends the person a managed profile belongs to an invitation to take it over: they set a password and the profile becomes their own account with the same holdings and place in the family.

**Why it exists:** Code comment: "The profile already holds their FDs, policies and history; this offers the key to it rather than a second account."

**Where to find it:** Tree → managed member → **Edit** → "Has <name> got an email now?" → **Hand the account to them**.

**Who can use it:** Owners through the UI (the server also allows the keeper to create the invitation, but sending the email needs an owner).

**Steps**
1. Click **Hand the account to them**. **Their email** appears, pre-filled from the noted contact email.
2. Click **Next**. The email composer opens with the subject "<you> has set up your EveryPaisa account".
3. Edit and click **Send email**, or copy the link.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Hand the account to them** | Button | Opens the email field | — |
| **Next** | Button | Creates the claim invitation | Disabled when empty or while saving |
| **Send email** / copy link / **Later** | Buttons | As in F-FAM-011 | As in F-FAM-011 |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Their email** | Email | Yes | Must not already have an EveryPaisa account | Noted contact email | "A valid email is required." / "<email> already has an EveryPaisa account. Ask them to sign in with it — or use another address for this profile." |

**Settings and toggles here:** None.

**Results:** A hand-over invitation valid for 14 days exists (it does not take a seat). After they claim, nobody keeps their books any more.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "That member is no longer in this family." | Membership not active | — |
| "Could not send that invitation" toast | Server refused | Read the server message |

**Limitations:** Two accounts cannot be merged; the address must be unused.

**How it works:** `POST /api/families/:familyId/members/:memberUserId/claim-invite` creates a `FamilyInvitation` with `claimForUserId` set; the email button reads "Take over my account" and links to `/family/claims/:token` (F-FAM-020).

**Related features:** F-FAM-015, F-FAM-020.

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:1650`, `apps/web/src/pages/family/FamilyPage.tsx:1692`, `packages/api/src/services/family/familyClaim.service.ts:39`, `packages/api/src/services/family/familyClaim.service.ts:54`, `packages/api/src/services/family/familyInviteEmail.service.ts:59`

### Remove a member <!-- F-FAM-017 -->
**What it does:** Removes someone from the family. A member with a login leaves the family but keeps their account and data. A managed member is **deleted permanently** with everything recorded for them.

**Why it exists:** Service comment: a managed profile "has no login, and its manager's access came only through this family — so keeping it would only keep someone's finances somewhere no one can see or erase them."

**Where to find it:** Tree → person → **Remove**.

**Who can use it:** Owners only (R-FAMOWNER). You cannot remove yourself here.

**Steps**
1. Click **Remove**. A browser confirmation appears:
   - managed member: "Delete <name> from the family? Their account and everything recorded in it — portfolios, FDs, insurance — will be deleted permanently. This cannot be undone."
   - member with login: "Remove <name> from the family? They keep their own EveryPaisa account and data; they just leave this family."
2. Confirm. The toast "Removed from the family" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Remove** | Button | Removes after confirmation | Owners only |

**Fields and rules:** Not applicable — no data entry.

**Settings and toggles here:** None.

**Results:** The membership row is deleted (managed: the whole profile is purged). Their children on the tree move up; managed members they were keeping pass to the owner who removed them.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Use \"leave family\" to revoke your own access." | Removing yourself | No leave button exists in the UI (F-FAM-026) |
| "Cannot revoke the last OWNER of a family." | Target is the only owner | Promote someone first |

**Limitations:** Deleting a managed member cannot be undone.

**How it works:** `DELETE /api/families/:familyId/members/:memberUserId` (owner check). Detaches from the tree, reassigns kept profiles to the caller, then purges a managed profile (account-deletion purge) or deletes the membership row.

**Related features:** F-FAM-008, F-FAM-026.

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:393`, `packages/api/src/routes/families.routes.ts:220`, `packages/api/src/services/family/family.service.ts:306`, `packages/api/src/services/family/family.service.ts:355`

### Shared portfolios <!-- F-FAM-018 -->
**What it does:** Lists the family's shared portfolios (name, currency, holdings, transactions) and lets owners and contributors create a new shared portfolio or attach one of their own personal portfolios to the family.

**Why it exists:** Schema comment: portfolios carry an optional family id "for the family-shared pot (HUF, ancestral fund, joint bank account)".

**Where to find it:** **Family → Members & sharing → Shared portfolios**.

**Who can use it:** All members see the list; **Share existing** and **New shared portfolio** appear for owners and contributors (R-FAMOWNER, R-FAMCONTRIB). Viewers are refused by the server ("VIEWER cannot create family portfolios.").

**Steps**
1. Click **New shared portfolio**, enter **Name**, optional **Description (optional)** and **Currency**, click **Create** — toast "Shared portfolio created".
2. Or click **Share existing**, pick one of your personal portfolios, click **Share** — toast "Portfolio shared with family".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Share existing** | Button | Opens "Share an existing portfolio" | Owners/contributors only |
| **New shared portfolio** | Button | Opens "Create shared portfolio" | Owners/contributors only |
| Portfolio radio list | Radio | Picks the portfolio to share (only your own, not already shared) | — |
| **Share** / **Create** / **Cancel** | Buttons | Submit / close | Disabled until a choice/name, or while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Name** | Text | Yes | 1–100 characters | Empty | "Portfolio name is required." |
| **Description (optional)** | Text | No | ≤ 500 characters | Empty | — |
| **Currency** | Text | No | 3 letters, upper-cased | INR | — |

**Settings and toggles here:** None.

**Results:** The portfolio becomes visible to every active member in family view and writable by owners and contributors.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No shared portfolios yet" — "Contributors and viewers can only see own personal + family-shared data (rule A)…" | None exist | Create or share one (note: this hint is outdated — members see each other's personal data within their caps) |
| "No personal portfolios available to share…" | All your portfolios are already shared | — |
| "Portfolio is already shared with a different family. Unshare it first." | Shared elsewhere | Unshare is not available in the UI (F-FAM-027) |
| "You can only share portfolios you own." | Not yours | — |

**Limitations:** No unshare button. The empty-state hint still describes the old "rule A" (see DOCUMENTATION_GAPS.md).

**How it works:** The list filters `GET /api/portfolios` for portfolios whose family id is this family. `POST /api/families/:familyId/portfolios` creates a portfolio owned by you with this family id; `POST …/portfolios/:portfolioId/share` sets the family id on your own portfolio.

**Related features:** F-FAM-004, F-FAM-027, D-FAM-004.

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:419`, `apps/web/src/pages/family/FamilyPage.tsx:448`, `apps/web/src/pages/family/FamilyPage.tsx:635`, `apps/web/src/pages/family/FamilyPage.tsx:1955`, `packages/api/src/services/family/family.service.ts:1584`, `packages/api/src/services/family/family.service.ts:1633`

### Accept a family invitation <!-- F-FAM-019 -->
**What it does:** The page behind the invitation email's link. It shows who invited you, the family and the role, and lets you **Accept** or **Decline**.

**Why it exists:** Code comment: "Public accept-invite landing."

**Where to find it:** Email link `/families/invitations/:token/accept`.

**Who can use it:** Anyone with the link can see the preview; accepting needs you to be signed in with the invited email address (R-VISITOR is sent to sign in first).

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

**Related features:** F-FAM-011, D-FAM-005, D-FAM-006.

**Sources:** `apps/web/src/pages/family/AcceptInvitationPage.tsx:19`, `apps/web/src/pages/family/AcceptInvitationPage.tsx:52`, `apps/web/src/pages/family/AcceptInvitationPage.tsx:118`, `packages/api/src/routes/families.routes.ts:65`, `packages/api/src/services/family/family.service.ts:1342`, `packages/api/src/services/family/family.service.ts:1376`

### Take over your account <!-- F-FAM-020 -->
**What it does:** The page behind a hand-over email. The person sets a password and the managed profile becomes their own account; they are signed straight in.

**Why it exists:** Code comment: "It is not a sign-up: the account already exists, with their holdings in it, and this hands it over rather than creating another."

**Where to find it:** Email link `/family/claims/:token`.

**Who can use it:** Anyone holding the link (R-VISITOR); the email is fixed to the one the link was sent to.

**Steps**
1. Open the link. "Take over your account" appears with "<keeper> has been keeping <name>'s finances on EveryPaisa, in <family>…".
2. Enter **Choose a password** and **Type it again**.
3. Click **Take over my account**. The toast "This account is yours now" appears and the dashboard opens.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Your email** | Read-only text | Shows the sign-in address | Always read-only |
| **Take over my account** | Button | Claims the account | Disabled until the password is ≥ 8 characters and both match |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Choose a password** | Password | Yes | 8–100 characters | Empty | "Use at least 8 characters." |
| **Type it again** | Password | Yes | Must match | Empty | "These do not match." |

**Settings and toggles here:** None.

**Results:** The profile gets the email and password, stops being managed, keeps its holdings and family place, and takes the invitation's role; an audit row "managed_profile_claimed" is written.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This link isn't open" + "That link is not valid." / "That link has expired." / "That account has already been taken over." | Bad, expired (14 days) or used link | Ask the keeper to send it again |
| "<email> already has an EveryPaisa account." | Address taken | Keeper must invite with another address |

**Limitations:** None beyond the above.

**How it works:** `GET /api/families/claims/:token/peek` and `POST /api/families/claims/:token` (both public, before authentication) — validated body email + password (8–100). Returns a session.

**Related features:** F-FAM-016.

**Sources:** `apps/web/src/pages/family/ClaimProfilePage.tsx:25`, `apps/web/src/pages/family/ClaimProfilePage.tsx:72`, `packages/api/src/routes/families.routes.ts:83`, `packages/api/src/services/family/familyClaim.service.ts:142`, `packages/api/src/services/family/familyClaim.service.ts:180`

### Family member page <!-- F-FAM-021 -->
**What it does:** One member in full: net worth, gross assets, invested, unrealised P&L, liabilities, allocation chart ("What they own"), position-by-position holdings, their goals, protection and open items — with clear "Not shared" labels where your caps hide something.

**Why it exists:** Code comment: the page "exists as much to say WHAT IT COULD NOT SHOW as to show what it can".

**Where to find it:** Sidebar family tree → member row (route `/family/members/:userId?familyId=…`).

**Who can use it:** Active members whose own plan is FAMILY or higher (same plan gate as F-FAM-004). Other members' data is filtered by your caps; your own row is never filtered.

**Steps**
1. Click a member in the sidebar family tree. The page header shows "<family> · Member" and their name (or "You").
2. Read the cards; click **Back to the household** to return to `/family`.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Back to the household** | Link | Opens `/family` | — |
| Holdings table | Display | **Asset**, **Class**, **Quantity**, **Invested**, **Current value**, **Unrealised P&L** | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-FAM-004, S-FAM-005 (your caps).

**Results:** Read-only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "We couldn't find that person in any family you belong to. They may have left, or their membership may have been revoked." | No family contains them | — |
| "Couldn't load this member. You may no longer have permission to see them." | Any load failure — including your own plan being below FAMILY | Upgrade if you are below FAMILY |
| "Goals aren't shared with you" / "Protection isn't shared with you" / "Debt isn't shared with you" | Categories outside your caps | Ask an owner |

**Limitations:** At most 200 holdings (largest current value first) and at most 5 open items are shown. Defect: a FREE/PLUS member gets the generic permission error instead of a plan lock (see DOCUMENTATION_GAPS.md).

**How it works:** `GET /api/families/:familyId/members/:userId/detail` (FAMILY plan gate). Refuses members outside your scope with "That member is not part of a family you can see." Figures reuse the household calculations (F-FAM-004–007) so they agree with the Overview tab.

**Related features:** F-FAM-004, F-FAM-023.

**Sources:** `apps/web/src/pages/family/FamilyMemberPage.tsx:123`, `apps/web/src/pages/family/FamilyMemberPage.tsx:208`, `apps/web/src/pages/family/FamilyMemberPage.tsx:222`, `packages/api/src/routes/families.routes.ts:485`, `packages/api/src/services/family/familyAggregate.service.ts:1094`, `packages/api/src/services/family/familyAggregate.service.ts:1144`

### Switch view (family view across the app) <!-- F-FAM-022 -->
**What it does:** The header menu **Switch view** lets you see the app as **Personal view** or as one of your families. In family view, data pages show the household's combined data, filtered by your role and caps. The Dashboard shows a strip with the family name, your role, member count and a **Personal view** exit.

**Why it exists:** Code comment: without the dashboard strip, an owner inviting an empty new member "sees no dashboard change and thinks the switch is broken."

**Where to find it:** Header, next to the user menu (person icon / family icon with the current view name). Hidden when you have no active family.

**Who can use it:** Any active family member (R-FAMOWNER, R-FAMCONTRIB, R-FAMVIEWER). Family view is cleared whenever you enter or leave a managed account.

**Steps**
1. Click **Switch view**. The menu lists **Personal view** and each family with your role.
2. Choose a family. All cached data is dropped and pages refetch in family view.
3. To leave, choose **Personal view** in the menu or click **Personal view** on the dashboard strip.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Switch view** | Menu button | Opens the view menu | Hidden with no active family |
| **Personal view** | Menu item | Back to your own data | — |
| Family items | Menu items | Switch to that family | Active memberships only |
| **Personal view** ×(dashboard strip, tooltip "Exit family view") | Button | Back to personal view | Strip shown only in family view |

**Fields and rules:** Not applicable — no data entry.

**Settings and toggles here:** S-FAM-006 **Viewing as family** — stored on this browser, survives reloads, cleared on sign-out/account switch.

**Results:** Every request carries the family selector until you switch back.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "You are not an active member of this family." on data pages | You were removed but the browser still holds the family view | Choose **Personal view** |

**Limitations:** Writes always land on your own data or on family-shared portfolios you can write; nobody can edit another member's personal data in family view.

**How it works:** The web client adds an `X-Viewing-As-Family` header to every API request; the server resolves the caller's scope (owner: all active members' personal data + family-shared portfolios, no caps; contributor/viewer: same members filtered by their caps; contributors may write family-shared portfolios, viewers may not). Query caches are keyed by the view, and switching removes and refetches all queries.

**Related features:** F-FAM-003, F-FAM-014, D-FAM-003.

**Sources:** `apps/web/src/components/family/FamilyScopeSwitcher.tsx:17`, `apps/web/src/components/family/FamilyScopeSwitcher.tsx:57`, `apps/web/src/components/family/FamilyScopeBanner.tsx:18`, `apps/web/src/components/layout/Header.tsx:129`, `apps/web/src/api/client.ts:42`, `apps/web/src/stores/familyScope.store.ts:32`, `packages/api/src/lib/familyHeader.ts:16`, `packages/api/src/services/family/familyScope.service.ts:132`

### Sidebar family tree <!-- F-FAM-023 -->
**What it does:** At the top of the sidebar, for users in at least one family: each family as a row (house icon) that opens `/family`, with a chevron that expands its active members ("You" first, then by name); each member row opens their member page. In the collapsed icon rail each family shows as its first letter.

**Why it exists:** Code comment: "A family is not a feature you visit — it is a set of people whose pages you move between". Users with no family see nothing.

**Where to find it:** Sidebar, above **Overview**.

**Who can use it:** Any family member.

**Steps**
1. Click the chevron to expand or collapse a family ("Loading members" shows while fetching).
2. Click a member to open F-FAM-021, or the family name to open `/family`.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Expand / Collapse <family> | Chevron button | Shows/hides members | — |
| Family row | Link | Opens `/family` | — |
| Member row | Link | Opens `/family/members/<id>?familyId=<family>` | Only ACTIVE members are listed |

**Fields and rules:** Not applicable — navigation.

**Settings and toggles here:** S-FAM-008 **Sidebar family expansion** (this browser only).

**Results:** Navigation only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load members" | Members request failed | Collapse and expand again |

**Limitations:** Every family row opens `/family`, which always shows the first family; clicking a second family's name does not select it.

**How it works:** Shares the `families` and members queries with the Family page; members load only when expanded. Families default to expanded until you first toggle one.

**Related features:** F-FAM-001, F-FAM-021.

**Sources:** `apps/web/src/components/layout/FamilyNavTree.tsx:28`, `apps/web/src/components/layout/FamilyNavTree.tsx:40`, `apps/web/src/components/layout/FamilyNavTree.tsx:150`, `apps/web/src/components/layout/FamilyNavTree.tsx:243`, `apps/web/src/components/layout/SidebarNav.tsx:131`

### Managing a family member's account <!-- F-FAM-024 -->
**What it does:** Lets the person who keeps a managed member's books switch the browser tab into that member's account to add their FDs, insurance and anything else. While managing, a full-width strip says "You are managing <name>'s account. Everything you add here is theirs." with **Back to my account**.

**Why it exists:** Service comment: a managed profile "is a real User row that owns that data, so every existing page — stocks, FDs, insurance, reports, tax — works for them unchanged."

**Where to find it:** User menu (top right) → **Accounts you manage** → a name; or the tree card's **Record something for <first name>**; or **Open <name>'s account** right after adding them.

**Who can use it:** The keeper (R-MANAGER) — must be the profile's keeper, and both must be active in the same family. Features follow the keeper's plan.

**Steps**
1. Open the user menu and click a name under **Accounts you manage**. The toast "Now managing <name>'s account" appears and the dashboard opens with the managing strip.
2. Use any data page; everything you add belongs to that person.
3. Click **Back to my account** (strip or user menu). The dashboard opens in your own account.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Accounts you manage** items | Menu items | Enter that account | Hidden when you keep nobody; the current one is disabled |
| **Record something for <first name>** | Button (tree card) | Enter that account | Only for profiles you keep |
| **Back to my account** | Button (strip and user menu) | Leave the managed account | Shown only while managing |

**Fields and rules:** Not applicable — no data entry.

**Settings and toggles here:** S-FAM-007 **Managing (acting as)** — per browser tab; closing the tab ends it.

**Results:** Data requests run as the managed person; family view is cleared; caches are emptied on enter and leave.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "You cannot act for this profile." (toast fallback "You cannot open this account.") | Not their keeper, or a membership ended | Ask an owner |
| "Switch back to your own account to do this." | Sign-in, billing, family, professional access, Gmail, mailboxes and Succession are refused while managing | Click **Back to my account** |
| "Will Maker works on your own account only. Switch back to your own account to make or view your will." | Will Maker refuses managing | Same |

**Limitations:** Onboarding redirects to `/portfolios` while managing. The Succession page shows the refusal message instead of the page. Entering a profile is audit-logged once per switch, not per action.

**How it works:** `GET /api/managed-profiles` lists profiles you keep; `POST /api/managed-profiles/:profileId/enter` checks and writes an audit row "managed_profile_enter". The tab stores the profile in sessionStorage and the client adds `X-Act-As` to data requests (not account routes); the server re-checks keeper and both memberships on every request and binds row-level security to the profile, with role INVESTOR and the keeper's plan.

**Related features:** F-FAM-009, F-FAM-015, D-FAM-003.

**Sources:** `apps/web/src/components/layout/Header.tsx:60`, `apps/web/src/components/layout/Header.tsx:236`, `apps/web/src/components/family/ActingAsBanner.tsx:13`, `apps/web/src/hooks/useManageProfile.ts:18`, `apps/web/src/stores/actingAs.store.ts:28`, `apps/web/src/lib/sessionBoundary.ts:44`, `packages/api/src/middleware/authenticate.ts:13`, `packages/api/src/services/family/managedProfile.service.ts:37`, `packages/api/src/services/family/managedProfile.service.ts:76`, `packages/api/src/routes/managedProfiles.routes.ts:39`

### What this area doesn't do
- You can't rename a family, change its description or delete a family from the app (rename exists only as an API, F-FAM-025).
- You can't leave a family from the app (F-FAM-026); an owner must remove you.
- You can't unshare a family-shared portfolio from the app (F-FAM-027).
- Owners can't edit another member's personal data, even in family view.
- A managed member can't sign in or be made an Owner until they take the account over.
- There is no per-family URL: `/family` always opens your first family.
- Declining an invitation doesn't notify the owner or cancel it.
