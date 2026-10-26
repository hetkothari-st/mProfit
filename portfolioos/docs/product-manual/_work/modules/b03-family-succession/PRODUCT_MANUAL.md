# EveryPaisa User Manual — Family, Succession and Will Maker (B03 fragment)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Family (`/family`, `/family/members/:userId`, `/families/invitations/:token/accept`, `/family/claims/:token`, header **Switch view**, user-menu "Accounts you manage", managing banner, sidebar family tree), Succession (`/legacy`, `/legacy/ok|ack|verify|access/:token`), Will Maker (`/will`, `/will/:id/:step`, `/will/:id/execute`)

## Contents
- [Family](#family)
- [Succession](#succession)
- [Will Maker](#will-maker)
- [Roles and profiles](#roles-and-profiles)
- [Glossary](#glossary)

<!-- BEGIN MODULES -->
## Family

The **Family** area lets one household keep its finances together. A family is a group of EveryPaisa accounts linked by memberships, each with a role — **Owner**, **Contributor** or **Viewer** — and, for contributors and viewers, a list of asset classes and categories they may see. Owners add relatives two ways: by email invitation (the relative signs in themselves) or directly as a **managed member** (a profile with no login whose books another member keeps). The family page has two tabs: **Overview** (the household dashboard) and **Members & sharing** (tree, invitations, shared portfolios). Around the app, a header **Switch view** menu shows the whole app "as" a family, the sidebar shows a family tree, and the user menu lets the person who keeps a relative's books open that relative's account.

### Family page and family selector <!-- F-FAM-001 -->
**What it does:** Lists every family you belong to and shows one of them at a time. With one family it opens that family straight away; with two or more, a row of family buttons (each showing the family name and your role in lower case) appears above the workspace so you can pick one. With no family it shows an empty state.

**Why it exists:** The page comment states the feature "has real weight" and so gets a full page rather than a Settings section; the header text says it gives "One picture of the family's wealth, shared goals, protection and open items — with the per-member breakdown behind it".

**Where to find it:** **Overview → Family** (route `/family`), or the family name row in the sidebar family tree (F-FAM-023).

**Who can use it:** Every signed-in user (R-FREE, R-PLUS, R-FAMILY, R-PRO). Creating a family needs R-FAMILY or R-PRO (F-FAM-002). Members of someone else's family (R-FAMOWNER, R-FAMCONTRIB, R-FAMVIEWER) see that family here whatever their own plan.

**Steps**
1. Open **Overview → Family**. The page header reads "The household, whole".
2. If you belong to no family, the empty state "No families yet" appears with **Create a family**.
3. If you belong to two or more families, click a family button to switch the workspace below to it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **New family** | Button (header) | Opens the "Create a new family" card (F-FAM-002) | Never hidden |
| **Create a family** | Button (empty state) | Same as **New family** | Shown only when you belong to no family |
| Family buttons (name + role) | Toggle buttons | Select which family the workspace shows | Shown only when you belong to two or more families |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing is changed; the selection is kept only while the page is open (it is not saved).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No families yet" — "Create a family to invite members and manage shared portfolios. If an OWNER already sent you an invite, click the link they shared." | You have no active or pending membership | Create a family (F-FAM-002) or open the invitation link you were sent (F-FAM-019) |

**Limitations:** The selected family is not part of the URL. Opening `/family` (including from a sidebar family row) always selects the first family in the list, ordered by when you joined. The list refreshes every 30 seconds and when the window regains focus.

**How it works:** `GET /api/families` returns every membership with status ACTIVE or PENDING, ordered by join date, with the family name, description, your role, your status, join date and a seat summary (F-FAM-003). The page auto-selects the first family when nothing is selected. The same query key is shared with the header switcher (F-FAM-022) and sidebar tree (F-FAM-023), so creating or accepting a family updates all three.

**Related features:** F-FAM-002, F-FAM-003, F-FAM-022, F-FAM-023.

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:71`, `apps/web/src/pages/family/FamilyPage.tsx:91`, `apps/web/src/pages/family/FamilyPage.tsx:185`, `apps/web/src/pages/family/FamilyPage.tsx:195`, `packages/api/src/routes/families.routes.ts:171`, `packages/api/src/services/family/family.service.ts:97`

### Create a family <!-- F-FAM-002 -->
**What it does:** Creates a new family with a name and makes you its first **Owner**.

**Why it exists:** The card text explains the intended use: "You become the OWNER. Add other OWNERs later for joint families (grandpa + father + uncle each as OWNER is the canonical joint-family setup)."

**Where to find it:** **Overview → Family → New family** (or **Create a family** in the empty state), route `/family`.

**Who can use it:** R-FAMILY, R-PRO. R-FREE and R-PLUS see a lock card "Family Sharing is locked" with **View plans** instead of the form. Not available while managing someone's account (R-MANAGER) because `/api/families` is an account route.

**Steps**
1. Click **New family**. The card "Create a new family" appears.
2. Type the family name (placeholder "e.g. Kothari Family").
3. Click **Create**. A toast "Family created" appears and the new family is selected.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Family name box | Text input | The family's name | Disabled while saving |
| **Create** | Button | Creates the family | Disabled when the name is blank or while saving |
| **Cancel** | Button | Closes the card and clears the name | — |
| **View plans** | Link (lock card) | Opens `/pricing` (D-FAM-001) | Shown only below the FAMILY plan |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Family name | Text | Yes | 1–120 characters after trimming (server) | Empty | "Family name is required." |

**Settings and toggles here:** None.

**Results:** A family is created, you are added as an ACTIVE Owner, and it gets 3 included seats and a ₹199 extra-seat price (schema defaults, marked as placeholder values in the code).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This feature requires the FAMILY plan or higher" (toast "Create failed" fallback) | Your effective plan is below FAMILY | Upgrade on **Pricing** |
| "Family Sharing is locked" card | Same, caught by the page before you type | **View plans** |

**Limitations:** There is no screen to rename a family, change its description or delete it; the rename endpoint exists without a UI (F-FAM-025).

**How it works:** `POST /api/families` behind `requireFeature('FAMILY_SHARING')`; the service creates the `Family` row and an ACTIVE `OWNER` `FamilyMember` row in one transaction.

**Related features:** F-FAM-001, F-FAM-003, F-FAM-025, D-FAM-001.

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:102`, `apps/web/src/pages/family/FamilyPage.tsx:136`, `apps/web/src/pages/family/FamilyPage.tsx:171`, `packages/api/src/routes/families.routes.ts:178`, `packages/api/src/services/family/family.service.ts:67`, `packages/api/prisma/schema.prisma:3789`

### Family workspace header and seats <!-- F-FAM-003 -->
**What it does:** Shows the selected family's name, description, the number of active members, your role, a seat-usage line, and the **View this family across the app** button.

**Why it exists:** The code comment on the seat line: an open invitation holds a seat, and "'you have 2 members, pay for a third' reads as a bug unless the invitation is named here."

**Where to find it:** Top card of the selected family on `/family`.

**Who can use it:** Any member of the family (R-FAMOWNER, R-FAMCONTRIB, R-FAMVIEWER).

**Steps**
1. Open **Overview → Family** and select a family.
2. Read "N active members · your role: …" and the seat line "X of Y seats used — N members, M open invitations".
3. Click **View this family across the app** to switch the whole app into this family's view (same effect as F-FAM-022). A toast "Viewing as <family name>" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **View this family across the app** | Button | Turns on family view for this family and refetches all data | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-FAM-006 **Viewing as family** — set by this button (full detail: Settings reference).

**Results:** With the button, every scope-aware page now shows the family's combined data until you switch back to **Personal view**.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Seat line turns amber with ". Cancel an invitation to free one." | Seats used ≥ included seats and at least one invitation is open | Cancel an unaccepted invitation (F-FAM-013) or pay for a seat when adding (F-FAM-012) |

**Limitations:** For contributors and viewers the seat line is probably wrong (it is likely to count only their own membership) because the seat count runs under row-level security that hides other members' rows from non-owners — see DOCUMENTATION_GAPS.md.

**How it works:** Seats used = ACTIVE members (managed members included) + invitations not yet accepted and not expired, excluding hand-over invitations for a managed profile. Included seats default to 3. The active-member count comes from the members list (read with elevated privileges after a membership check), so it is correct for every role.

**Related features:** F-FAM-012, F-FAM-013, F-FAM-022.

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:318`, `apps/web/src/pages/family/FamilyPage.tsx:337`, `apps/web/src/pages/family/FamilyPage.tsx:537`, `packages/api/src/services/family/family.service.ts:765`, `packages/api/src/services/family/family.service.ts:103`

### Family dashboard: household wealth <!-- F-FAM-004 -->
**What it does:** On the **Overview** tab, shows the household's gross assets, liabilities and net of liabilities, a breakdown of "Who the household's wealth sits with" (per member: net worth, invested, share), and "What the household owns, combined" (merged allocation). Members whose data you may only partly see are marked **Partial**.

**Why it exists:** The page comment: "Overview is the household's financial picture: wealth and who it sits with, shared goals, protection and liabilities, and a ranked feed of what needs attention."

**Where to find it:** **Overview → Family → Overview** tab (default tab).

**Who can use it:** Any active member whose own plan is FAMILY or higher (R-FAMILY, R-PRO acting as R-FAMOWNER / R-FAMCONTRIB / R-FAMVIEWER). A member on FREE or PLUS sees the lock card "Family dashboard is locked" even though they belong to the family.

**Steps**
1. Open **Overview → Family**, select the family; the **Overview** tab opens first.
2. Read the wealth card. Hover a bar segment to see "<member> — ₹… (x.x%)".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Overview** | Tab | Shows the dashboard cards | — |
| **View plans** | Link (lock card) | Opens `/pricing` | Shown only below FAMILY |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-FAM-004 **Asset classes** and S-FAM-005 **Non-portfolio categories** (your caps) decide which of the other members' data is counted.

**Results:** Nothing changes; read-only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No member's holdings are shared with you. N members in this family, all restricted." | Your caps hide every sibling's wealth | Ask an owner to widen your visibility (F-FAM-014) |
| "No holdings recorded yet. Once members add portfolios, their share of the household shows up here." | Nobody has holdings | Add holdings |
| "Family dashboard is locked" | Your own plan is below FAMILY | Upgrade, even though you are a member of someone else's family |

**Limitations:** Your own data is never capped; other members' data is filtered by your caps. An empty caps list hides everything in that dimension (see F-FAM-014). Totals are "as of" the moment of the request (no caching beyond 30 s client freshness).

**How it works:** `GET /api/families/:familyId/dashboard/wealth` (`requireFeature('FAMILY_SHARING')` on the caller's plan). The service resolves the caller's scope (403 "You are not an active member of this family." for non-members), then runs the personal dashboard net-worth calculation once per member, each in that member's own security context, limited to that member's personal portfolios plus portfolios shared with this family. Family-shared portfolios are counted once (in their creator's slice). Household net worth = sum of member net worth; unrealised P&L % = household P&L ÷ household invested × 100; each member's share % = member net worth ÷ household net worth × 100 (0 when the household total is 0). Allocation slices are merged by key and re-percented against the household total, sorted by value. `hiddenMemberCount` counts members whose wealth is fully hidden (no asset class and neither Vehicle nor Rental category).

**Related features:** F-FAM-005, F-FAM-006, F-FAM-007, F-FAM-021, F-FAM-014.

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:359`, `apps/web/src/pages/family/FamilyPage.tsx:568`, `apps/web/src/pages/family/widgets/FamilyWealthCard.tsx:266`, `packages/api/src/routes/families.routes.ts:461`, `packages/api/src/services/family/familyAggregate.service.ts:163`, `packages/api/src/services/family/familyAggregate.service.ts:278`, `packages/api/src/services/family/familyAggregate.service.ts:355`

### Family dashboard: needs attention <!-- F-FAM-005 -->
**What it does:** A feed titled **Needs attention** listing open items across members: deposits maturing within 90 days, insurance premiums due within 30 days, loan EMIs overdue or due within 30 days, members with stale prices, and members who have added no account at all. The header shows "N overdue of M open".

**Why it exists:** Code comment ("FAIRNESS POLICY"): the feed is built so "one member with a messy month cannot occupy the whole feed".

**Where to find it:** **Overview → Family → Overview** tab, second card.

**Who can use it:** Same as F-FAM-004.

**Steps**
1. Open the **Overview** tab and read the list. Not applicable beyond reading — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Item rows | Display | One open item each, with member, urgency and amount | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-FAM-004, S-FAM-005 (your caps) filter siblings' items.

**Results:** Read-only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load the household's alerts. Try again shortly." | Request failed | Reload |
| "Nothing needs attention among the members you can see. Items belonging to the hidden members would not appear here." | Empty feed while some members are fully hidden from you | Ask an owner for wider visibility |
| "Nothing needs attention right now." | Empty feed, nothing hidden | — |

**Limitations:** At most 5 items per member are shown. Items cannot be dismissed or opened from here. "Has not added any account yet" is only claimed for members whose data is not filtered for you.

**How it works:** `GET /api/families/:familyId/dashboard/attention`. Per member: FD/RD/NSC/KVP/SCSS/SSY/Post Office deposit transactions (BUY, DEPOSIT, OPENING_BALANCE) maturing in the next 90 days (urgency HIGH ≤ 7 days, MEDIUM ≤ 30, LOW otherwise); ACTIVE insurance policies with next premium due within 30 days and loan EMIs (first unpaid instalment of the amortisation schedule) — urgency HIGH if overdue or ≤ 7 days, MEDIUM ≤ 15, LOW otherwise; overdue EMIs are always HIGH; one "N holdings with a stale price" row per member (LOW); "X has not added any account yet" (MEDIUM) when a member has no active bank account and no holding. Each member's items are sorted by urgency then soonest, capped at 5, then interleaved round-robin (every member's first item before anyone's second), each round sorted by urgency.

**Related features:** F-FAM-004, F-FAM-021, D-FAM-008.

**Sources:** `apps/web/src/pages/family/widgets/FamilyAttentionCard.tsx:60`, `packages/api/src/services/family/familyAggregate.service.ts:801`, `packages/api/src/services/family/familyAggregate.service.ts:828`, `packages/api/src/services/family/familyAggregate.service.ts:849`, `packages/api/src/services/family/familyAggregate.service.ts:899`

### Family dashboard: household goals <!-- F-FAM-006 -->
**What it does:** Card "What the household is saving for": every goal of every member you may see, with owner, target, current value, shortfall, inflation-adjusted figures and the monthly SIP needed, plus per-member and household totals.

**Why it exists:** Inferred from behavior: lets the household see all members' goals and their combined shortfall in one place.

**Where to find it:** **Overview → Family → Overview** tab, goals card.

**Who can use it:** Same as F-FAM-004. A sibling's goals are visible only if your caps include the **Goals** category.

**Steps**
1. Open the **Overview** tab and read the goals card — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Goal rows | Display | One per goal; "Due today" / "No target date" shown where relevant | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-FAM-005 (Goals category in your caps).

**Results:** Read-only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No goals are shared with you. The household may well have goals, but their owners have not granted you the Goals category." | Goals category not in your caps | Ask an owner |
| "No goals yet. Once a member creates one, it shows here with its owner, shortfall, and the monthly SIP it needs." | No goals exist | Create goals on **Goals** (D-FAM-007) |

**Limitations:** Asset-class caps are deliberately not applied to goal progress; visibility is all-or-nothing per member via the Goals category.

**How it works:** `GET /api/families/:familyId/dashboard/goals`. Your own goals load uncapped; siblings' goals load per member in their security context and are skipped entirely when your caps deny GOAL. Shortfall = max(0, target − current); the required monthly SIP funds the inflation-adjusted shortfall when one exists (expected return converted from a fraction to a percentage). Goals sort by target date. Household progress % is recomputed from summed current ÷ summed target.

**Related features:** F-FAM-004, D-FAM-007.

**Sources:** `apps/web/src/pages/family/widgets/FamilyGoalsCard.tsx:91`, `packages/api/src/services/family/familyAggregate.service.ts:405`, `packages/api/src/services/family/familyAggregate.service.ts:431`

### Family dashboard: protection and liabilities <!-- F-FAM-007 -->
**What it does:** Card "Cover, gaps and what falls due": per member life cover, recommended cover, gap, health cover, annual premium, debt outstanding and monthly EMI; household totals; members with no cover; renewals due within 30 days.

**Why it exists:** Code comment: life-cover adequacy uses "the same 10x-annual-income heuristic the health score shows, so the two pages cannot disagree about whether a member is underinsured."

**Where to find it:** **Overview → Family → Overview** tab, protection card.

**Who can use it:** Same as F-FAM-004; siblings' insurance needs the Insurance category, loans the Loans category, cards the Credit cards category.

**Steps**
1. Open the **Overview** tab and read the protection card — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Member table | Display | Columns **Member**, **Life cover**, **Recommended**, **Health cover**, **Annual premium**, **Debt outstanding**, **Monthly EMI** | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-FAM-005 (Insurance, Loans, Credit cards categories).

**Results:** Read-only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No member's policies are shared with you — N members in this family, all restricted." | Your caps hide all siblings' protection data | Ask an owner |
| "No policies recorded. Add life and health cover to see the household against what it needs." | No active policies | Add policies on **Insurance** |
| Recommended shows a hover note "No income on file, so the 10x rule cannot size this" | The member has no active monthly income | Record income (D-FAM-008) |

**Limitations:** Members with no income are left out of the household requirement and gap totals (counted in "unsized" members). A hidden member is never listed as "no cover".

**How it works:** `GET /api/families/:familyId/dashboard/protection`. Per member, ACTIVE policies are summed by type (life types, HEALTH, other); annual premium uses each policy's frequency; renewals are policies whose next premium is due within 30 days. Required life cover = 10 × annual income (annual income = active monthly income × 12); gap = max(0, required − life cover). Loan outstanding comes from each ACTIVE loan's amortisation summary (falls back to principal if the loan cannot be scheduled); card outstanding uses the stored outstanding balance or the statement summary. Household totals sum members; requirement and gap sum only sized members.

**Related features:** F-FAM-004, F-FAM-021, D-FAM-008.

**Sources:** `apps/web/src/pages/family/widgets/FamilyProtectionCard.tsx:127`, `packages/api/src/services/family/familyAggregate.service.ts:546`, `packages/api/src/services/family/familyAggregate.service.ts:608`, `packages/api/src/services/family/familyAggregate.service.ts:674`

### Family tree <!-- F-FAM-008 -->
**What it does:** On **Members & sharing**, draws the family as an indented tree: each person as a pill (crown icon for Owners, eye icon for Viewers), spouses side by side joined by a dashed "Married" line, children stepped in with the relation ("son", "daughter") on the line. Clicking a person opens a card with what you can do for them.

**Why it exists:** Code comment: "a wall-chart has to be shrunk to fit a phone, and a shrunk chart is one nobody can read. Here every name is full size at every family size".

**Where to find it:** **Overview → Family → Members & sharing** → **Family tree** card.

**Who can use it:** Any member can view. Only owners (R-FAMOWNER) get **Add a relative**, **Edit**, **Remove**, **Move under…** and **To the top**. Whoever keeps a managed member's books (owner or not) gets **Record something for <first name>**.

**Steps**
1. Open **Members & sharing**. The tree loads with a legend ("Parent to child", "Married") and "N people".
2. Click a person. Their card opens with "<relation> of <name>", "Kept by <name>" or their email.
3. Owners: choose a person in **Move under…** to place this person (and their spouse's row) under someone, or click **To the top** to make them the head. A toast "Tree rearranged" appears.
4. Click the empty board or **Close** (×) to close the card.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Person pill | Button | Opens/closes that person's card | — |
| **Add member** | Button (card header) | Opens "Add a family member" (F-FAM-009) | Owners only |
| **Record something for <first name>** | Button | Opens their account (F-FAM-024) | Only if you keep this managed member's books |
| **Add a relative** | Button | Opens "Add a relative of <name>" | Owners only |
| **Edit** | Button | Opens F-FAM-014 or F-FAM-015 | Owners only |
| **Remove** | Button | Starts F-FAM-017 | Owners only |
| **Move under…** | Select | Places the person under the chosen member | Owners only; disabled while saving |
| **To the top** | Button | Makes the person the head of the tree | Owners only; hidden for the current head; disabled while saving |
| **Close** (×) | Icon button | Closes the card | — |

**Fields and rules:** Not applicable — no data entry.

**Settings and toggles here:** None.

**Results:** Rearranging saves the family's tree layout for every member.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Nobody on the tree yet. Add a family member to start it." | No members returned | Add a member |
| "That arrangement puts someone under themselves." (toast "Could not rearrange the tree" fallback) | The move would create a loop | Choose a different parent |
| "OWNER role required." | You are not an owner | Ask an owner |

**Limitations:** Positions are not dragged; placement is automatic from relations plus the saved "who is under whom" choices. Removed members disappear entirely (they are not greyed out).

**How it works:** Reads `GET /api/families/:familyId/tree-layout` (any active member) and the members list; couples are the saved pairs plus pairs implied by spouse relations. Rearranging sends `PUT /api/families/:familyId/tree-layout` (owner only) with `parents` (child → parent or null) and `partners`; the server drops invalid entries and rejects loops. **To the top** sets the person's parent to none and moves every other unattached row under them; **Move under…** moves a couple together. Adding someone with a relation places them automatically (a father above, a wife beside, a son below); removing someone moves their children up to the surviving spouse or to their own parent.

**Related features:** F-FAM-009, F-FAM-014, F-FAM-015, F-FAM-017, F-FAM-024.

**Sources:** `apps/web/src/components/family/FamilyTreeBoard.tsx:83`, `apps/web/src/components/family/FamilyTreeBoard.tsx:133`, `apps/web/src/components/family/FamilyTreeBoard.tsx:144`, `apps/web/src/components/family/FamilyTreeBoard.tsx:424`, `apps/web/src/pages/family/FamilyPage.tsx:365`, `packages/api/src/services/family/family.service.ts:1486`, `packages/api/src/services/family/family.service.ts:1534`, `packages/api/src/services/family/family.service.ts:375`

### Add a member directly (managed member) <!-- F-FAM-009 -->
**What it does:** Adds a relative who has no email or login — a grandparent, a child — as a **managed member**: a real EveryPaisa profile that cannot sign in, kept by a member you choose, with its own default portfolio "<first name>'s portfolio". This is the default choice in the add dialog (**Add them now**).

**Why it exists:** Dialog comment: "Adding someone directly is the common case — a grandparent, a child, a spouse whose books the family already keeps." Service comment: "A grandparent without an email still has FDs, a pension and an LIC policy, and somebody in the family keeps them."

**Where to find it:** **Family → Members & sharing → Add member** (or a tree card's **Add a relative**) → **Add them now**.

**Who can use it:** Owners only (R-FAMOWNER).

**Steps**
1. Click **Add member**. The dialog "Add a family member" (or "Add a relative of <name>") opens with **Add them now** selected.
2. Enter **Their name**; optionally **Their email (optional)**.
3. In the relation picker, choose **Related to** and a relation under **As their** (or **Other…** and type one).
4. Choose **Their place in the family** and **Who keeps their books**.
5. Click **Add to family**. If a seat is free, the toast "<name> added to the family" appears and the dialog says "<name> is on the tree." If no seat is free, the seat payment starts (F-FAM-012).
6. If you keep their books, click **Open <name>'s account** to start recording for them (F-FAM-024); otherwise **Done**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add them now** / **Add several** / **Invite by email** | Radio cards | Choose how to add | Hidden after a member or invitation is created |
| **Add to family** | Button | Creates the managed member | Disabled until name, relation and keeper are set, or while saving |
| **Cancel** | Button | Closes | Disabled while saving |
| **Open <name>'s account** | Button | Enters their account | Shown only if you chose yourself as keeper |
| **Done** | Button | Closes | — |
| **Close** (×) / Escape | Button / key | Closes the dialog | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Their name** | Text | Yes | ≤ 80 characters | Empty | "Their name is required." / "That name is too long." |
| **Their email (optional)** | Email | No | Must contain "@" | Empty | "That email does not look right." |
| **Related to** | Select | Yes (UI) | An active member | You (or the tree card's person) | "They must be related to an active member of this family." |
| **As their** | Chips / free text | Yes (UI) | ≤ 40 characters stored | None | — |
| **Their place in the family** | Select | No | Contributor / Viewer | Contributor | — |
| **Who keeps their books** | Select | Yes | An active member with a login | You | "The manager must be an active member of this family." / "A managed profile cannot manage another one." |

**Settings and toggles here:** S-FAM-001 **Their place in the family** — Contributor: "counted in the household"; Viewer: "listed, but kept to the side" (it grants nothing, the person never signs in). S-FAM-002 **Who keeps their books** — only this person can open the account. S-FAM-009 **Related to / As their** — places them on the tree.

**Results:** A new profile, membership and default portfolio exist; the profile appears on the tree, in the portfolios list and in the keeper's "Accounts you manage" menu. The email is noted for a later hand-over and is never emailed.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "OWNER role required." | You are not an owner | Ask an owner |
| Seat message then payment window | No free seat | Pay (F-FAM-012) or cancel an invitation |
| "… Payments are not configured on this server." | No free seat and payments not set up | Free a seat |

**Limitations:** A managed member can never be made an Owner. Members without a login are greyed out as keepers ("— no login yet").

**How it works:** `POST /api/families/:familyId/members/managed` (owner check in the service). Creates a `User` with an unroutable placeholder email under `.invalid`, an unusable password hash, role INVESTOR, plan FREE, `isShadowClient` true and `managedById` = keeper; an ACTIVE membership; and a default INVESTMENT portfolio in INR. Every sign-in path refuses such profiles. Tree placement happens after the commit and never undoes the add.

**Related features:** F-FAM-010, F-FAM-012, F-FAM-015, F-FAM-016, F-FAM-024.

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:836`, `apps/web/src/pages/family/FamilyPage.tsx:947`, `apps/web/src/pages/family/FamilyPage.tsx:1088`, `apps/web/src/pages/family/FamilyPage.tsx:1126`, `apps/web/src/components/family/RelationPicker.tsx:76`, `packages/api/src/routes/families.routes.ts:132`, `packages/api/src/services/family/family.service.ts:862`, `packages/api/src/services/family/family.service.ts:1018`, `packages/api/src/services/family/managedProfile.service.ts:57`

### Add several members at once <!-- F-FAM-010 -->
**What it does:** Adds up to 25 managed members in one go. Each line is a person with a relation that can point at an existing member or at someone listed above on the same form; the keeper and place apply to everyone.

**Why it exists:** Code comment: "a grandmother, three uncles and their wives is nine trips through the same four fields."

**Where to find it:** **Family → Members & sharing → Add member → Add several**.

**Who can use it:** Owners only (R-FAMOWNER).

**Steps**
1. Choose **Add several**. Two empty lines appear (columns "Name", "Is the", "Of").
2. For each line enter a name, choose a relation ("Relation…") and who they are related to (existing members, or "<name> — added above").
3. Click **Add another** for more lines (up to 25) or the × to remove a line.
4. Choose **Who keeps their books** and **Their place in the family** for the whole list.
5. Click **Add N people** (or **Add to family** for one). The toast "N people added to the family" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add another** | Button | Adds a line | Disabled at 25 lines or while saving |
| Remove person N (×) | Icon button | Removes a line; anyone related to it falls back to the default anchor | Disabled when only one line remains |
| **Add N people** / **Add to family** | Button | Creates everyone | Disabled until every named line has a relation and anchor and a keeper is set |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Name (per line) | Text | For lines to be added | ≤ 80 characters; blank lines are skipped | Empty | "Row N: a name is needed." / "Row N: that name is too long." |
| Relation (per line) | Select | Yes | From the fixed list | "Relation…" | — |
| Of (per line) | Select | Yes | An existing member or a line above | You / the tree card's person | "Row N: can only be related to someone listed above them." |
| List size | — | — | 1–25 people | 2 lines | "Add at least one person." / "You can add up to 25 people at a time." |

**Settings and toggles here:** S-FAM-001, S-FAM-002 (applied to every line).

**Results:** All people are created together or none; each gets a default portfolio and is placed on the tree in list order.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Your family's N included seats are taken by … You are adding N people with … left — add them one at a time to pay per seat, or remove some from the list." | Not enough free seats | Remove lines or add one at a time with payment (F-FAM-012) |

**Limitations:** No seat payment in bulk; no per-line email or role.

**How it works:** `POST /api/families/:familyId/members/managed/bulk` with up to 25 rows; seats are checked for the whole batch first, every row is validated before anything is written, and all profiles are created in one transaction.

**Related features:** F-FAM-009, F-FAM-012.

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:1158`, `apps/web/src/pages/family/FamilyPage.tsx:1332`, `apps/web/src/pages/family/FamilyPage.tsx:1382`, `packages/api/src/routes/families.routes.ts:142`, `packages/api/src/services/family/family.service.ts:1112`, `packages/api/src/services/family/family.service.ts:1149`

### Invite a member by email <!-- F-FAM-011 -->
**What it does:** Creates an invitation for someone with an email address, then lets you read, edit and send the invitation email from the app, or copy the link and send it yourself. The person joins only when they accept (F-FAM-019).

**Why it exists:** Dialog text: "They sign in themselves. Nothing shows until they accept." Service comment: the owner writes the subject and a personal note; the link and expiry are fixed.

**Where to find it:** **Family → Members & sharing → Add member → Invite by email**.

**Who can use it:** Owners only (R-FAMOWNER).

**Steps**
1. Choose **Invite by email**.
2. Enter **Their name** (optional) and **Email**, pick **Related to** / **As their**.
3. Choose **What they can do** (Owner / Contributor / Viewer) and, for contributors and viewers, tick visible **Asset classes** and **Non-portfolio categories**.
4. Click **Next: write the email**. The invitation is created (or seat payment starts, F-FAM-012).
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

**Settings and toggles here:** S-FAM-003 **What they can do**; S-FAM-004 **Asset classes**; S-FAM-005 **Non-portfolio categories**; S-FAM-009 relation.

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

**Related features:** F-FAM-012, F-FAM-013, F-FAM-014, F-FAM-019.

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:1389`, `apps/web/src/pages/family/FamilyPage.tsx:1505`, `apps/web/src/pages/family/FamilyPage.tsx:1516`, `apps/web/src/components/ca/InviteEmailComposer.tsx:184`, `packages/api/src/services/family/family.service.ts:494`, `packages/api/src/services/family/family.service.ts:54`, `packages/api/src/services/family/familyInviteEmail.service.ts:23`, `packages/api/src/services/family/familyInviteEmail.service.ts:247`

### Pay for an extra family seat <!-- F-FAM-012 -->
**What it does:** When adding one more person (by invitation or as a managed member) would exceed the family's included seats, the app explains what is using the seats and opens a Razorpay checkout for one extra seat; the person is added only after the payment verifies.

**Why it exists:** Service comment: an earlier version allowed adding "on credit", which "meant a user could add a paid seat, use it, and churn before the deferred charge ever landed — pay-per-seat upfront closes that gap."

**Where to find it:** Appears automatically from F-FAM-009 or F-FAM-011.

**Who can use it:** Owners only (R-FAMOWNER).

**Steps**
1. Click **Add to family** or **Next: write the email** when the family is full. A toast explains: "Your family's 3 included seats are taken by … Pay ₹199 to add a seat…".
2. Complete payment in the Razorpay window ("Extra family seat").
3. The person is added (or the invitation created) and the flow continues.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Razorpay checkout | External payment window | Collects the seat price | Closing it cancels silently |

**Fields and rules:** Not applicable — payment handled by Razorpay.

**Settings and toggles here:** None.

**Results:** The family's included seats increase by 1 and the pending member or invitation becomes real.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This seat payment request has expired — start the invite again." | More than 30 minutes passed | Start again |
| "Order does not match this pending invite." / "This payment does not match this seat request." | Payment details did not verify | Start again |
| "… Payments are not configured on this server." | Razorpay keys missing | Free a seat instead |

**Limitations:** Seat price comes from the family record (default ₹199, a placeholder per the schema comment). Abandoned pending seat requests are not cleaned up but block nothing.

**How it works:** The add/invite call returns `seat_payment_required` with a Razorpay order; the pending payload is kept for 30 minutes in `PendingFamilyInvite`. `POST /api/families/:familyId/members/invite/verify-payment` checks the signature, re-reads the order notes from Razorpay, then increments `includedSeats` and creates the invitation or managed member atomically.

**Related features:** F-FAM-003, F-FAM-009, F-FAM-011, D-FAM-002.

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:793`, `packages/api/src/services/family/family.service.ts:40`, `packages/api/src/services/family/family.service.ts:519`, `packages/api/src/services/family/family.service.ts:610`, `packages/api/src/services/family/family.service.ts:801`

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

## Succession

**Succession** (called "Legacy Transfer" in code and URLs) makes sure the people you name — your **nominees** — learn about your finances if you stop using EveryPaisa for a long time, or on a date you choose. You pick what each nominee may see. Before anything is shared there are three weekly reminder emails to you and a 7-day notice to nominees; signing in or clicking "I'm OK" stops it. Nominees then get a read-only view behind an emailed one-time code. The page footer states: "Succession shares information only. It is not a will and does not transfer any asset. Nominees never get edit access."

### Succession status and controls <!-- F-SUCC-001 -->
**What it does:** Shows the plan's **Status** badge and a one-line next event, and offers the controls that fit the status: **Turn on**, **Pause** (with a date), **Resume**, **Revoke all access**, **Turn off**.

**Why it exists:** Page description: "Make sure your loved ones are never left in the dark about your finances."

**Where to find it:** **Planning → Succession** (route `/legacy`).

**Who can use it:** Configuring and turning on needs R-PLUS or higher (R-PLUS, R-FAMILY, R-PRO). R-FREE can open the page and see the card "Succession is part of the PLUS plan." — if a plan already runs they can still pause, resume, turn off, revoke and remove nominees. Not available while managing someone's account (R-MANAGER).

**Steps**
1. Open **Planning → Succession**.
2. With at least one nominee, click **Turn on**. Confirm it's you (F-SUCC-005). Toast "Succession is on"; status becomes **On**.
3. To pause while counting, pick a **Pause until** date and click **Pause** (toast "Paused"); click **Resume** to restart (toast "Resumed").
4. After release, click **Revoke all access** (toast "Access withdrawn"); the plan re-arms.
5. Click **Turn off** at any time after turning on (toast "Succession is off").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Turn on** | Button | Arms the plan | Shown only when Off; disabled below PLUS or with no nominees ("Add a nominee to turn it on.") |
| **Pause until** | Date | Date the pause ends | Shown only while counting (On, reminders, nominees notified) |
| **Pause** | Button | Pauses the plan | Disabled with no date |
| **Resume** | Button | Re-arms a paused plan | Shown only when Paused |
| **Revoke all access** | Button | Withdraws every nominee's access and re-arms | Shown only when Shared with nominees |
| **Turn off** | Button | Back to Off; every link and session stops | Hidden when Off |
| **See plans** | Link | Opens `/pricing` | Shown only below PLUS |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Pause until** | Date | Yes for Pause | After today, at most 180 days ahead | Empty | "Pause for up to 180 days." |

**Settings and toggles here:** S-SUCC-006 **Pause until**.

**Results:** Status labels: Off, On, Reminder sent, Second reminder sent, Final reminder sent, Nominees notified, Shared with nominees, Paused. Turning on emails each unconfirmed nominee a "Confirm" invitation. Every change emails you "Your Succession plan was changed" and is audit-logged.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Add at least one nominee first." | Turning on with none | Add a nominee |
| "Pick a future release date first." | Date trigger without a future date | Set a date |
| "The plan is already on." | Already armed | — |
| "Only an active plan can be paused." / "The plan is not paused." / "Nothing has been shared yet." | Wrong status | Refresh |
| "Confirm it is you first." | No valid step-up confirmation | Enter the code (F-SUCC-005) |
| "Switch back to your own account to do this." | You are managing someone's account | **Back to my account** |

**Limitations:** Pausing during "Nominees notified" sends each nominee an "Update about <you>" email. A scheduled release date that passed during a pause is dropped (the plan falls back to inactivity). You can remove the last nominee of a running plan; it then has nobody to notify.

**How it works:** `GET /api/legacy` (no plan gate) creates the plan on first visit (status DRAFT) and returns status, settings, letter, nominees and the next-event sentence. `POST /api/legacy/activate|pause|resume|deactivate|revoke` all require a step-up grant header; activate also needs LEGACY_TRANSFER. Turning off wipes all nominee links, codes and sessions; revoking all access does the same and re-arms with a fresh clock. Plan status alone drives the countdown — a plan armed on PLUS keeps running after the subscription lapses.

**Related features:** F-SUCC-002, F-SUCC-004, F-SUCC-005, F-SUCC-006.

**Sources:** `apps/web/src/pages/legacy/LegacyPage.tsx:24`, `apps/web/src/pages/legacy/LegacyPage.tsx:91`, `apps/web/src/pages/legacy/LegacyPage.tsx:103`, `apps/web/src/pages/legacy/LegacyPage.tsx:203`, `packages/api/src/routes/legacy.routes.ts:19`, `packages/api/src/services/legacy/plan.service.ts:67`, `packages/api/src/services/legacy/plan.service.ts:217`, `packages/api/src/services/legacy/plan.service.ts:231`, `packages/api/src/services/legacy/plan.service.ts:264`, `packages/api/src/services/legacy/plan.service.ts:278`, `packages/api/src/services/legacy/runner.service.ts:12`

### When to share <!-- F-SUCC-002 -->
**What it does:** Sets what starts the countdown — **If I'm inactive**, **On a date**, or **Whichever comes first** — the inactivity period, the release date and an optional personal letter for nominees.

**Why it exists:** Inferred from behavior: owners choose between an inactivity "dead man's switch" and a fixed release date.

**Where to find it:** **Planning → Succession → When to share** card.

**Who can use it:** R-PLUS and above; editable only while the plan is Off, On or Paused.

**Steps**
1. Choose **Trigger**.
2. For inactivity, set **Inactive for (days, at least 30)**. For a date, set **Release date**.
3. Optionally write a **Personal letter (optional)** (placeholder "e.g. FD papers are in the SBI locker #42").
4. Click **Save** and confirm it's you. Toast "Saved".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Trigger** | Select | Inactivity / date / whichever first | Disabled when not editable or below PLUS |
| **Inactive for (days, at least 30)** | Number | Inactivity period | Hidden for **On a date** and in test mode |
| **Release date** | Date | Scheduled release | Hidden for **If I'm inactive** |
| **Personal letter (optional)** | Text area | Letter shown to nominees who may see it | Disabled when not editable |
| **Save** | Button | Saves settings | Disabled when not editable or invalid |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Trigger | Select | Yes | INACTIVITY / SCHEDULED / BOTH | If I'm inactive | — |
| Inactive for | Integer days | Yes | 30–3,650 | 90 | "Inactivity period must be at least 30 days" |
| Release date | Date | For date triggers | YYYY-MM-DD, after today (IST) | Empty | "Pick a release date." / "The release date must be in the future." / "Use YYYY-MM-DD" |
| Personal letter | Text | No | ≤ 20,000 characters; stored encrypted | Empty | — |

**Settings and toggles here:** S-SUCC-001 **Trigger**, S-SUCC-002 **Inactive for**, S-SUCC-003 **Release date**, S-SUCC-004 **Personal letter**, S-SUCC-005 **Test mode** (admins).

**Results:** On an armed plan, changing the inactivity days restarts the inactivity clock from now.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Settings are locked while reminders are going out or after release. Pause or revoke first." | Status is a reminder stage, Nominees notified or Shared | Pause or revoke |
| "The plan is counting down or released. Pause or revoke it first." | Same, from the server | Same |

**Limitations:** Inactivity counts IST calendar days; app activity is recorded at most once an hour.

**How it works:** `PUT /api/legacy/settings` (LEGACY_TRANSFER + step-up grant). The letter is encrypted at rest. See F-SUCC-006 for how the trigger drives the countdown.

**Related features:** F-SUCC-001, F-SUCC-003, F-SUCC-006.

**Sources:** `apps/web/src/pages/legacy/LegacyPage.tsx:122`, `apps/web/src/pages/legacy/LegacyPage.tsx:147`, `apps/web/src/pages/legacy/LegacyPage.tsx:167`, `packages/api/src/schemas/legacy.schemas.ts:6`, `packages/api/src/services/legacy/plan.service.ts:89`, `packages/shared/src/legacy.ts:11`

### Succession test mode (admins) <!-- F-SUCC-003 -->
**What it does:** For administrators only, a checkbox **Test mode: 1 minute (admins only)** makes inactivity and every reminder stage last 1 minute, so nominees get access in about 5 minutes. The status shows a red badge "Test mode · 1 minute".

**Why it exists:** Code comment: "Test mode can release someone's finances in ~5 minutes: admins only, server-enforced."

**Where to find it:** **Planning → Succession → When to share** (visible only to admins).

**Who can use it:** R-ADMIN (who also has PLUS or higher).

**Steps**
1. Tick **Test mode: 1 minute (admins only)**. The trigger switches to **If I'm inactive**.
2. Click **Save**, then **Turn on**. Use test nominee emails.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Test mode: 1 minute (admins only)** | Checkbox | Switches to 1-minute units | Hidden for non-admins; disabled when not editable |

**Fields and rules:** Test mode requires the inactivity trigger ("Test mode works with the inactivity trigger only."); non-admins get "Test mode is for admins only."

**Settings and toggles here:** S-SUCC-005 **Test mode**.

**Results:** A per-minute job advances the plan; the help text warns "Browsing the app only counts as activity once an hour, so use the "I'm OK" email link to test a reset."

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Test mode is for admins only." | Non-admin request | — |

**Limitations:** Real emails are sent to the nominees entered.

**How it works:** `testMode` on the plan; the state machine counts minutes instead of IST days; a cron runs every minute for test-mode plans only.

**Related features:** F-SUCC-006.

**Sources:** `apps/web/src/pages/legacy/LegacyPage.tsx:132`, `packages/api/src/services/legacy/plan.service.ts:91`, `packages/api/src/services/legacy/stateMachine.ts:51`, `packages/api/src/jobs/legacyTransferJob.ts:31`

### Nominees <!-- F-SUCC-004 -->
**What it does:** Lists up to 10 nominees (name, relationship, **Verifier** badge, email with confirmation state, what they can see, whether amounts are shown) and lets you add, edit, remove or (after release) revoke one nominee's access.

**Why it exists:** Inferred from behavior: each nominee can be given exactly the categories, documents and level of detail the owner chooses.

**Where to find it:** **Planning → Succession → Nominees** card.

**Who can use it:** Adding and editing need R-PLUS or above; removing and revoking work on any plan.

**Steps**
1. Click **Add nominee**. The dialog "Add nominee" opens.
2. Enter **Name**, **Email**, **Relationship** (placeholder "Spouse"), **Priority**.
3. Tick **What they can see** categories; if **Documents** is ticked, tick **Documents to share** from your vault.
4. Tick **Show amounts (balances, values). Off means they see only what exists and where.** and/or **Verifier: asked to confirm before access opens. Only one per plan.**
5. Click **Save**, then confirm it's you. Toast "Saved".
6. Use **Edit**, **Remove** (toast "Nominee removed") or, after release, **Revoke** (toast "Access withdrawn").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add nominee** | Button | Opens the dialog | Disabled below PLUS |
| **Edit** | Button | Opens "Edit nominee" | Disabled below PLUS |
| **Remove** | Button | Deletes the nominee; their links and sessions end | — |
| **Revoke** | Button | Ends this nominee's access | Shown only after release |
| **Save** / **Cancel** | Buttons (dialog) | Save / close | **Save** disabled until name, a valid-looking email, relationship and ≥ 1 category are set |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Name** | Text | Yes | 1–120 characters | Empty | — |
| **Email** | Email | Yes | Valid email, lower-cased; unique per plan | Empty | "This email is already a nominee." |
| **Relationship** | Text | Yes | 1–60 characters | Empty | — |
| **Priority** | Number | Yes | 1–20 | 1 | — |
| **What they can see** | Checkboxes | ≥ 1 | Investments, Bank accounts, Insurance, Loans & credit cards, Property, Vehicles, Provident fund & NPS, Documents, Personal letter | Insurance + Bank accounts | "Pick at least one category" |
| **Documents to share** | Checkboxes | No | ≤ 50; only your own documents | None | — |
| Nominees per plan | — | — | ≤ 10 | — | "You can add up to 10 nominees." |

**Settings and toggles here:** S-SUCC-007 **What they can see**, S-SUCC-008 **Show amounts**, S-SUCC-009 **Verifier**, S-SUCC-010 **Priority**, S-SUCC-011 **Documents to share**.

**Results:** On a running plan a new nominee (or one whose email changed) gets a "<you> named you as a trusted contact" email with **Confirm**; on a released plan they also get access at once. Until they confirm, the list shows "⚠ email not confirmed yet". Making someone the verifier removes the badge from anyone else.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Nominee not found" | Already removed | Refresh |
| "No documents in your vault yet." | Documents ticked but vault empty | Upload in **Documents** (D-SUCC-001) |

**Limitations:** A replaced will document is offered in the picker only where it is already shared, so it can be unticked. Changing a nominee's email cancels their old links and unsent emails.

**How it works:** `POST/PUT /api/legacy/nominees[/:id]` (LEGACY_TRANSFER + grant), `DELETE /api/legacy/nominees/:id` (grant only), `POST /api/legacy/revoke` with `nomineeId`. Names and emails are stored encrypted; document ids that are not yours are dropped.

**Related features:** F-SUCC-001, F-SUCC-005, F-SUCC-008, D-SUCC-001.

**Sources:** `apps/web/src/pages/legacy/LegacyPage.tsx:170`, `apps/web/src/pages/legacy/NomineeDialog.tsx:11`, `apps/web/src/pages/legacy/NomineeDialog.tsx:38`, `packages/api/src/schemas/legacy.schemas.ts:18`, `packages/api/src/services/legacy/plan.service.ts:28`, `packages/api/src/services/legacy/plan.service.ts:133`, `packages/api/src/services/legacy/plan.service.ts:159`, `packages/api/src/services/legacy/plan.service.ts:210`, `packages/shared/src/legacy.ts:22`

### Confirm it's you (step-up) <!-- F-SUCC-005 -->
**What it does:** Before any change to Succession, asks for a fresh code: your authenticator code (or a backup code) if two-factor sign-in is on, otherwise a 6-digit code emailed to you. A confirmation lasts about 15 minutes in that tab.

**Why it exists:** Code comment: "Every owner mutation needs a fresh step-up grant."

**Where to find it:** Opens automatically from any Succession change (dialog "Confirm it's you").

**Who can use it:** The plan owner.

**Steps**
1. Make a change. The dialog reads "Enter the code from your authenticator app (or a backup code)." or "We emailed you a 6-digit code."
2. Enter **Code** and click **Confirm** (or press Enter). The change then runs.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Code** | Text | The code | — |
| **Confirm** | Button | Verifies | Disabled under 6 characters or while busy |
| **Cancel** | Button | Abandons the change | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Code** | Text | Yes | 6–20 characters; emailed codes expire in 10 minutes; 5 wrong tries lock for 30 minutes | Empty | "That code didn't match." / "That code has expired. Request a new one." / "Too many attempts. Try again in 30 minutes." |

**Settings and toggles here:** None (two-factor sign-in is set in Settings, D-SUCC-002).

**Results:** A 15-minute grant is held in memory; a page reload asks again.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "We couldn't send the code. Try again shortly." | Email send failed | Retry |
| Rate limit error | More than 5 step-up requests a minute | Wait a minute |

**Limitations:** The grant is not shared across tabs.

**How it works:** `POST /api/legacy/step-up` then `/step-up/verify` (both limited to 5 per minute) return a grant sent as the `X-Legacy-Grant` header on changes.

**Related features:** F-SUCC-001, F-SUCC-002, F-SUCC-004, D-SUCC-002.

**Sources:** `apps/web/src/pages/legacy/StepUpDialog.tsx:11`, `apps/web/src/api/legacy/legacy.api.ts:26`, `packages/api/src/controllers/legacy.controller.ts:23`, `packages/api/src/services/legacy/tokens.service.ts:18`, `packages/api/src/services/legacy/tokens.service.ts:143`

### Countdown, reminders and release <!-- F-SUCC-006 -->
**What it does:** Runs the plan automatically. Inactivity: after the chosen days without activity you get "Are you OK? (first Succession reminder)", then a second and a final reminder a week apart, then nominees are told access opens in 7 days ("Nominees notified"), then access is released. Date: reminders 30, 7 and 1 day before, then release on the date. Signing in or clicking "I'm OK" resets the countdown.

**Why it exists:** UI text: "Then 3 email reminders a week apart, and a 7-day notice to nominees, before anything is shared."

**Where to find it:** Automatic; the status card on `/legacy` shows the current stage and next event (e.g. "First warning on <date> if you stay inactive.").

**Who can use it:** Runs for every armed plan regardless of the owner's current plan.

**Steps**
1. Not applicable — automatic. To stop a countdown, sign in or click **I'm OK** in a reminder email (F-SUCC-007).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| None on screen | — | — | — |

**Fields and rules:** Not applicable — automatic.

**Settings and toggles here:** S-SUCC-001, S-SUCC-002, S-SUCC-003, S-SUCC-005.

**Results:** Emails, in order: owner reminders (with **I'm OK — reset the countdown**), owner "Your nominees will get access in 7 days" and nominee "About <you>'s Succession plan", a verifier "Please confirm: is <you> OK?", then nominee "<you> has shared their financial information with you" with **View information**, and owner "Your Succession plan was released". A reset from the notice stage emails nominees "Update about <you>".

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Reminders keep arriving | You haven't signed in since the stage started | Sign in or click **I'm OK** |

**Limitations:** The daily run is at 10:00 IST, so stages move once a day. App activity counts at most once an hour. Scheduled release has no 7-day notice stage. Unsent emails retry with backoff (10 min doubling, capped at 6 h) and never drop.

**How it works:** `legacyTransferJob`: daily tick 10:00 IST, outbox retry hourly at :20, test-mode tick every minute (disable with `ENABLE_LEGACY_CRON=false`). A pure state machine decides the step from status, trigger, inactivity days, stage start, last activity and IST days; activity after a stage began always wins (reset). Stage length 7 days; reminders at 30/7/1 days for a date trigger. Each step and its emails commit together (outbox, sent once per plan/kind/cycle/recipient). Activity is any authenticated request by the owner (not when managing someone), throttled to once per hour.

**Related features:** F-SUCC-001, F-SUCC-007, F-SUCC-008.

**Sources:** `packages/api/src/jobs/legacyTransferJob.ts:45`, `packages/api/src/services/legacy/stateMachine.ts:66`, `packages/api/src/services/legacy/stateMachine.ts:101`, `packages/api/src/services/legacy/runner.service.ts:58`, `packages/api/src/services/legacy/runner.service.ts:141`, `packages/api/src/services/legacy/outbox.service.ts:25`, `packages/api/src/services/legacy/emails.ts:40`, `packages/api/src/services/legacy/activity.service.ts:13`, `packages/api/src/middleware/authenticate.ts:40`

### Email link actions: I'm OK, Confirm, Verifier answer <!-- F-SUCC-007 -->
**What it does:** Three no-login pages behind emailed links. **I'm OK** resets the owner's countdown. **Confirm** lets a new nominee confirm their email works. The verifier page asks "Has something happened to them?" with **Yes, share their information now** (releases immediately) or **No, they're fine** (resets the countdown).

**Why it exists:** Code comment: "Nothing happens on load: the action is a button click, so email link scanners that open URLs can't trigger it."

**Where to find it:** Email links `/legacy/ok/:token`, `/legacy/ack/:token`, `/legacy/verify/:token`.

**Who can use it:** Whoever holds the link (R-VISITOR): the owner for I'm OK, a nominee for Confirm, the verifier nominee for the verifier page.

**Steps**
1. Open the link. The card "EveryPaisa Succession" appears.
2. Click the button. Messages: "Thanks. Your countdown has been reset." / "Confirmed. Thank you." / "Thank you. Their nominees now have access." / "Thank you. The countdown has been reset."

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **I'm OK** | Button | Resets the countdown | Disabled while busy |
| **Confirm** | Button | Confirms the nominee email | Disabled while busy |
| **Yes, share their information now** | Button | Releases now | Verifier page only |
| **No, they're fine** | Button | Resets | Verifier page only |

**Fields and rules:** Not applicable — no data entry.

**Settings and toggles here:** None.

**Results:** As above; verifier answers are audit-logged and the owner gets "Your verifier said you are OK" after a **No, they're fine**.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This link is no longer valid." | Expired, used, from an older cycle, or the plan moved on | Nothing to do; the owner can sign in |

**Limitations:** Link lifetimes: Confirm 365 days, I'm OK 30 days, verifier 14 days. A verifier answer counts only during the 7-day notice stage and only if the owner has shown no activity since it began. An old cycle's I'm OK link still records activity but doesn't reset a newer stage. Limited to 10 requests a minute.

**How it works:** `POST /api/legacy-public/ok|ack/:token`, `GET/POST /api/legacy-public/verify/:token` (body CONFIRM or FINE).

**Related features:** F-SUCC-006, F-SUCC-008.

**Sources:** `apps/web/src/pages/legacy/LegacyLinkPage.tsx:16`, `packages/api/src/routes/legacy.routes.ts:39`, `packages/api/src/services/legacy/publicLinks.service.ts:25`, `packages/api/src/services/legacy/publicLinks.service.ts:74`, `packages/api/src/services/legacy/tokens.service.ts:18`

### Nominee view of shared information <!-- F-SUCC-008 -->
**What it does:** After release, a nominee opens their link, receives a one-time code by email, and sees "<owner>'s financial information": the owner's letter, one section per allowed category (items with last 4 digits, nominee names, notes and — if allowed — amounts), "How to claim" checklists, shared documents to download, and **Download PDF**.

**Why it exists:** Release email text: "<owner> set up EveryPaisa Succession so that you would not be left in the dark about their finances."

**Where to find it:** Email link `/legacy/access/:token`.

**Who can use it:** R-NOMINEE (holds the access link and the emailed code). Read-only.

**Steps**
1. Open the link; "Shared financial information" appears. Click **Send code**.
2. Enter the 6-digit code ("We sent a code to <masked email>. It expires in 10 minutes.") and click **Open** (or **Resend**).
3. Read the sections; open **How to claim**; click **Download PDF** or a document's **Download**.
4. If the link has expired, click **Email me a fresh link**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Send code** / **Resend** | Buttons | Emails a code | Disabled while busy |
| **Open** | Button | Opens the view | Disabled until 6 digits |
| **Email me a fresh link** | Button | Mails a new link to the nominee's address | Shown after an error |
| **Download PDF** | Button | Downloads "legacy-information.pdf" | — |
| **Download** (per document) | Button | Downloads the document | — |
| **How to claim** | Expander | Shows the claim checklist | Hidden for categories without one |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Code | Digits | Yes | Exactly 6 digits; 10-minute expiry; 5 wrong tries lock 30 minutes | Empty | "Enter the 6-digit code" / "That code didn't match." / "That code has expired. Request a new one." / "Too many attempts. Try again in 30 minutes." |

**Settings and toggles here:** S-SUCC-007, S-SUCC-008, S-SUCC-011 (decided by the owner).

**Results:** A 30-minute session kept in this tab only. Every view, PDF and document download is audit-logged to the owner's account.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This link is no longer valid." | Access ended or link expired (90 days) | **Email me a fresh link** — "If this link was sent to you, a fresh one is on its way to the same email address." |
| "Session expired. Open your link again." | 30-minute session ended | Open the link again |
| "We couldn't send the code. Try again shortly." | Email failed | Retry |

**Limitations:** "Total of listed assets" sums Investments, Bank accounts, Property, Vehicles and Provident fund & NPS only, and only when amounts are allowed. Investments list every holding in portfolios the owner created (including family-shared ones they created). Access link and code requests are limited to 15 per 15 minutes.

**How it works:** `POST /api/legacy-public/access/:token/otp|session|reissue`, then `GET /api/legacy-view`, `/pdf`, `/documents/:id` with the `X-Legacy-Session` header — a nominee session can reach nothing else. Data is read in the owner's security context, only for allowed categories; with amounts off, no figure is sent.

**Related features:** F-SUCC-004, F-SUCC-006, D-SUCC-001.

**Sources:** `apps/web/src/pages/legacy/LegacyAccessPage.tsx:28`, `apps/web/src/pages/legacy/LegacyAccessPage.tsx:60`, `apps/web/src/pages/legacy/LegacyAccessPage.tsx:101`, `packages/api/src/controllers/legacy.controller.ts:105`, `packages/api/src/middleware/legacySession.ts:10`, `packages/api/src/services/legacy/view.service.ts:25`, `packages/api/src/services/legacy/view.service.ts:111`, `packages/api/src/services/legacy/tokens.service.ts:22`, `packages/shared/src/legacy.ts:35`

### What this area doesn't do
- It does not transfer any asset or act as a will; it shares information only.
- Nominees never get edit access or a login.
- You can't set different release rules per nominee; one trigger applies to the whole plan.
- A manager can't set up or view Succession for a managed family member.
- There is no SMS reminder; all notices are email.

## Will Maker

**Will Maker** helps you "Write a simple will under Indian law from your EveryPaisa data, check it, and download it to sign." It is an 8-step wizard (Overview, Your details, People & roles, Assets & liabilities, Allocate, Instructions, Review, Preview) followed by step 9, **Sign and store**. Your asset list is pulled from your EveryPaisa accounts; rules check the will before a PDF can be generated; signed copies are stored and a review reminder fires every two years. Every page carries the disclaimer: "This is not legal advice. Passing these checks does not guarantee that your will is legally valid. Get it reviewed by a qualified advocate before you sign it."

### Will Maker overview <!-- F-WILL-001 -->
**What it does:** Shows your will's status (**Not created**, **Draft**, **Generated**, **Executed**), the current draft or latest generated version with its actions, an indicative estate (Assets, Liabilities, Net worth), a "Key things to prepare" list and the disclaimer.

**Why it exists:** Page description: "Write a simple will under Indian law from your EveryPaisa data, check it, and download it to sign."

**Where to find it:** **Planning → Will Maker** (route `/will`).

**Who can use it:** R-PLUS, R-FAMILY, R-PRO. Below PLUS the page shows the lock card "Will Maker is locked" plus "Your will documents" (F-WILL-013). While managing someone's account (R-MANAGER) it shows "Will Maker works on your own account only. Switch back to your own account to make or view your will."

**Steps**
1. Open **Planning → Will Maker**.
2. With nothing yet, click **Create my will** ("About 15-20 minutes. Your progress is saved as you go."). The wizard opens at **Your details**.
3. With a draft: **Continue** or **Discard draft** (confirm "Discard this draft?" — "You can't get it back." → **Discard**; toast "Draft discarded").
4. With a generated will: **Download PDF**, **Sign and store** (or **Signed copy** once signed), **Start a new version** (not yet signed) or **My circumstances changed** (signed).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Create my will** | Button | Starts a draft | Only when no draft and no generated will; disabled while starting |
| **Continue** | Button | Opens the draft at its saved step | Only with a draft |
| **Discard draft** | Button | Deletes the draft after confirmation | Only with a draft |
| **Download PDF** | Button | Downloads the latest version's PDF | Only with a generated will; disabled while any download runs |
| **Sign and store** / **Signed copy** | Link | Opens step 9 (F-WILL-012) | Only with a generated will |
| **Start a new version** | Button | New draft copied from the latest version | Only when generated, not signed, and no draft |
| **My circumstances changed** | Button | New draft copied from the signed version | Only when signed and no draft |

**Fields and rules:** Not applicable — no data entry.

**Settings and toggles here:** None.

**Results:** Drafts are created as the next version number. If a draft already exists, any create action opens it instead.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load Will Maker" | Overview request failed | Reload |
| "Couldn't start your will" / "Couldn't start a new version" | Server refused | Retry |
| "N source(s) could not be read right now." | Some asset sources failed while totalling the estate | Refresh later |

**Limitations:** The estate tiles are indicative ("From your EveryPaisa accounts today. Insurance paid to nominees (₹…) is not counted.") and are recomputed on each visit. Only one draft can exist at a time ("You already have a draft will. Continue it or discard it first.").

**How it works:** `GET /api/will` (WILL_MAKER plan, refuses managing). Collects the estate from all asset sources (bank accounts, investments, provident fund, property, rental property, vehicles, insurance, money lent, loans, credit cards; at most 400 items) and totals assets, liabilities, net and nominee-only amounts. `POST /api/will/drafts` (optionally from an earlier will) and `DELETE /api/will/drafts/:id`. Will contents are stored encrypted per user.

**Related features:** F-WILL-002, F-WILL-003, F-WILL-004, F-WILL-012, F-WILL-013.

**Sources:** `apps/web/src/pages/will/WillOverviewPage.tsx:19`, `apps/web/src/pages/will/WillOverviewPage.tsx:26`, `apps/web/src/pages/will/WillOverviewPage.tsx:141`, `apps/web/src/pages/will/WillOverviewPage.tsx:163`, `apps/web/src/pages/will/WillOverviewPage.tsx:202`, `packages/api/src/routes/will.routes.ts:51`, `packages/api/src/services/will/will.service.ts:72`, `packages/api/src/services/will/will.service.ts:83`, `packages/api/src/services/will/will.service.ts:114`, `packages/api/src/services/will/estate/registry.ts:36`, `packages/shared/src/will/wire.ts:117`

### Will history <!-- F-WILL-002 -->
**What it does:** Card **History** listing every version (newest first) with its status badge and a line such as "Started … - generated … - signed … - replaced by version N - next review …", with **PDF** and **Signed copy** buttons where they exist.

**Why it exists:** Inferred from behavior: keeps every earlier version and its signed copy reachable after a new version replaces it.

**Where to find it:** **Planning → Will Maker → History** card.

**Who can use it:** Same as F-WILL-001.

**Steps**
1. Find a version and click **PDF** to download it or **Signed copy** to open its step-9 page.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **PDF** | Button | Downloads that version | Only for generated versions; disabled during any download |
| **Signed copy** | Link | Opens `/will/<id>/execute` | Only when a signed copy is stored |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Downloads only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't download the PDF" / "The PDF for this version is no longer stored" | File missing | Generate a new version |

**Limitations:** Discarded drafts are not listed.

**How it works:** History comes from the overview response; PDFs are served by `GET /api/will/versions/:vid/pdf` (no plan gate) with an integrity check.

**Related features:** F-WILL-001, F-WILL-012.

**Sources:** `apps/web/src/pages/will/WillHistoryCard.tsx:10`, `apps/web/src/pages/will/WillHistoryCard.tsx:19`, `packages/api/src/routes/will.routes.ts:48`, `packages/api/src/services/will/willGenerate.service.ts:156`

### Will review reminders <!-- F-WILL-003 -->
**What it does:** Two years after you sign (and every two years after a review), a banner "Time to review your will" appears on Will Maker and an alert "Time to review your will" is created. You can answer **Reviewed - no changes** or **My circumstances changed**.

**Why it exists:** Banner text: "Check your will every two years, and whenever your family or finances change - a marriage, a birth, a death, or buying or selling property."

**Where to find it:** **Planning → Will Maker** (banner) and **Tools → Alerts** (D-WILL-001).

**Who can use it:** Owners of a signed will on PLUS or above (the reminder alert is created on any plan).

**Steps**
1. When due, open Will Maker and read "Version N was due for a review on <date>…".
2. Click **Reviewed - no changes** — toast "Thanks. We'll remind you again on <date>." — or **My circumstances changed** to start a new version.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Reviewed - no changes** | Button | Moves the next review two years from today and closes the alert | Disabled while busy |
| **My circumstances changed** | Button | Starts a new draft from the signed will | Disabled while busy |

**Fields and rules:** Not applicable — no data entry.

**Settings and toggles here:** None.

**Results:** Next review date = today + 2 years. Generating a new version closes open review alerts.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't save your review" | Request failed | Retry |

**Limitations:** The alert is created by a daily job at 09:15 IST, so it can appear up to a day after the due date. Users who are inactive or scheduled for deletion are skipped. The job is off when `ENABLE_ALERT_CRONS=false`.

**How it works:** `POST /api/will/wills/:id/reviewed`. `willReviewJob` reads due users under a system context, then runs each user's alert sync in that user's own context; one alert per will per due date, older ones are closed.

**Related features:** F-WILL-001, F-WILL-012, D-WILL-001.

**Sources:** `apps/web/src/pages/will/WillReviewBanner.tsx:6`, `apps/web/src/pages/will/WillOverviewPage.tsx:125`, `packages/api/src/jobs/willReviewJob.ts:72`, `packages/api/src/services/will/willReview.service.ts:55`, `packages/api/src/services/will/willReview.service.ts:102`, `packages/shared/src/will/execution.ts:11`

### Will wizard: navigation and saving <!-- F-WILL-004 -->
**What it does:** The frame around steps 2–8: a stepper (full row on wide screens, "Step N of 8" bar on narrow), **Back** and **Next**, a save status ("Saving...", "All changes saved", "Not saved"), automatic saving, and protection against edits from another tab.

**Why it exists:** Overview text: "Your progress is saved as you go."

**Where to find it:** `/will/:id/<step>` (details, people, estate, allocation, instructions, review, preview).

**Who can use it:** Same as F-WILL-001.

**Steps**
1. Edit the step; changes save automatically about 0.8 s after you stop typing.
2. Click **Next** (or a step in the stepper). The page saves first and then moves.
3. If a save fails, click **Retry** next to "Could not save your changes. Check your connection and try again."
4. If another tab changed the will, click **Reload**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Stepper steps | Buttons | Save and go to that step | Wide screens only (≥ 900 px) |
| **Back** | Button | Save and go back (step 2 goes to the overview) | After two failed saves you may leave anyway |
| **Next** | Button | Save and go forward | Disabled while loading, and on **Review** while any blocker remains; hidden on **Preview** |
| **Retry** | Button | Retries the save | Shown after a failed save |
| **Reload** | Button | Reloads the latest version | Shown on a conflict |

**Fields and rules:** Not applicable here (see each step).

**Settings and toggles here:** None.

**Results:** Each section is saved separately with the revision it builds on.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This will was changed in another tab or device. Reload to see the latest version - your last change here was not saved." | Revision conflict | **Reload** |
| "This draft could not be opened." | Draft missing or discarded | **Back to Will Maker** |
| "This request is too large." | Body over 512 KB | Shorten text |

**Limitations:** While a conflict is shown, the step is read-only.

**How it works:** `GET /api/will/drafts/:id`, `PUT /api/will/drafts/:id/sections/:section` with revision; a revision mismatch returns 409 "This will was changed in another tab or device. Reload to continue." Rules (`runWillRules`) run in the browser on every change.

**Related features:** F-WILL-005 to F-WILL-011.

**Sources:** `apps/web/src/pages/will/WillWizardPage.tsx:24`, `apps/web/src/pages/will/WillWizardPage.tsx:50`, `apps/web/src/pages/will/WillWizardPage.tsx:66`, `apps/web/src/pages/will/WillWizardPage.tsx:101`, `apps/web/src/pages/will/willSteps.ts:3`, `apps/web/src/pages/will/useWillDraft.ts:9`, `apps/web/src/pages/will/useWillDraft.ts:36`, `packages/api/src/routes/will.routes.ts:24`, `packages/api/src/services/will/willStore.ts:60`

### Step 2: Your details <!-- F-WILL-005 -->
**What it does:** Collects your identity and family situation: full legal name, how you are described ("Son of …"), date of birth, country whose law applies, religion / personal law, address, marital status, children and dependents.

**Why it exists:** Side panel "Why we ask": "Your religion decides which succession law applies." "Marriage and children decide who your family is in law, and whether a guardian is needed."

**Where to find it:** Wizard step **Your details** (`/will/:id/details`).

**Who can use it:** Same as F-WILL-001.

**Steps**
1. Fill in each field (required ones are marked *).
2. Read any notice (foreign law, Muslim law) and finding below the form.
3. Click **Next**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Full legal name** * | Text | "As on your PAN or passport." | — |
| **Described as** | Select | Leave out / Son of / Daughter of / Wife of / Husband of / Child of / Spouse of | — |
| **Father's, mother's or spouse's full name** | Text | Printed after your name | Disabled until **Described as** is chosen |
| **Date of birth** * | Date | — | — |
| **Country whose law applies** * | Select | India / Another country | — |
| **Religion / personal law** * | Select | Hindu, Sikh, Jain, Buddhist, Christian, Parsi, Muslim, Other / none | — |
| **Address** * | Text area | — | — |
| **Marital status** * | Select | Single, Married, Widowed, Divorced, Separated | — |
| **Do you have children?** * | Select | Yes / No | — |
| **Anyone else depends on you?** | Select | Yes / No | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Full legal name | Text | Yes | ≤ 120 | Empty | "Fill in your … ." |
| Date of birth | Date | Yes | 1900-01-01 to today; you must be 18+ | Empty | "Your date of birth is not a real date, or is in the future." / "You must be 18 or older to make a will." |
| Address | Text | Yes | ≤ 400 | Empty | — |
| Country | Select | Yes | India only is supported | India | Blocker (foreign-law notice) |
| Personal law | Select | Yes | Muslim personal law not supported | — | Blocker (Muslim-law notice) |

**Settings and toggles here:** S-WILL-001 **Country whose law applies**; S-WILL-002 **Religion / personal law**.

**Results:** Saved to the draft; blockers stop generation.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Foreign-law or Muslim-law notice | Unsupported law | Will Maker cannot produce this will; consult an advocate |

**Limitations:** Only wills under Indian law and non-Muslim personal law can be generated.

**How it works:** Saved via the `details` section; checked by rules JURISDICTION_INDIA_ONLY, MUSLIM_LAW_UNSUPPORTED, REQUIRED_FIELDS, TESTATOR_ADULT and INVALID_DATE (all blockers on step 2).

**Related features:** F-WILL-004, F-WILL-010.

**Sources:** `apps/web/src/pages/will/steps/DetailsStep.tsx:19`, `apps/web/src/pages/will/steps/DetailsStep.tsx:63`, `apps/web/src/pages/will/steps/DetailsStep.tsx:70`, `apps/web/src/pages/will/parts.tsx:16`, `packages/shared/src/will/validation/rules.ts:54`, `packages/shared/src/will/validation/rules.ts:76`

### Step 3: People & roles <!-- F-WILL-006 -->
**What it does:** Builds the list of people and organisations in your will and assigns the executor, back-up executor, guardian and back-up guardian. Tabs: **Beneficiaries**, **Executor**, **Guardian**, **Others** (charities and organisations). Family members on EveryPaisa are offered as one-click additions.

**Why it exists:** Tab text: "The executor collects your assets, pays your debts and shares out the rest as your will says."

**Where to find it:** Wizard step **People & roles** (`/will/:id/people`).

**Who can use it:** Same as F-WILL-001.

**Steps**
1. On **Beneficiaries**, click a name under "From your family on EveryPaisa" or **Add a person**; fill the person form and click **Save person**.
2. On **Executor**, choose **Executor** and **Back-up executor** (adults only).
3. On **Guardian**, choose a **Guardian** and **Back-up guardian** if you have children under 18 (otherwise "You have no children under 18 in your list, so a guardian is not needed.").
4. On **Others**, **Add an organisation**.
5. **Edit** or **Remove** people; removing asks "Remove <name>?" — "Their shares and gifts will be removed from your will, and any role they hold will be cleared." → **Remove person**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Family quick-pick buttons ("Add <name>") | Buttons | Add a family member as a person | Hidden when none left to add |
| **Add a person** / **Add an organisation** | Buttons | Open the person form | — |
| **Edit** / **Remove** | Buttons | Edit / remove a person | — |
| **Executor**, **Back-up executor**, **Guardian**, **Back-up guardian** | Selects | Assign roles ("Not chosen" default); an ineligible current choice shows "(not eligible)" | Guardian selects only with minors |
| Person form: **Name** *, **Relationship**, **Date of birth** ("Tells us whether they are under 18."), **Phone or email (optional)**, **If they die before you, their gifts go to** | Fields | Person details | Date of birth hidden for organisations |
| **Save person** / **Save organisation** / **Cancel** | Buttons | Save / close the form | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Name | Text | Yes | ≤ 120 | Empty | "Enter a name." |
| Relationship | Select | No | Spouse, Son, Daughter, Father, Mother, Brother, Sister, Grandson, Granddaughter, Son-in-law, Daughter-in-law, Nephew, Niece, Other relative, Friend, Other (organisations: Charity, Other) | Son / Charity | — |
| Back-up beneficiary | Select | No | Another person | "Shared among the others (default)" | "A person cannot be their own back-up beneficiary." |
| Executor | Select | Yes (blocker) | Adult individual | Not chosen | "Choose an executor - the person who will carry out your will." / "The back-up executor must be a different person." |
| Guardian | Select | If minors | Adult individual | Not chosen | "You have a child under 18 - choose a guardian." |

**Settings and toggles here:** S-WILL-006 **If they die before you, their gifts go to** (back-up beneficiary).

**Results:** People and roles are saved; removing a person also removes their shares and gifts.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "An executor or guardian must be an adult individual, not an organisation or a child." | Ineligible choice | Choose an adult individual |
| "Add a date of birth for N people so we can tell whether anyone is under 18." | Warning | Add dates of birth |

**Limitations:** The family quick-pick reads your family memberships under row-level security; for contributors and viewers it probably lists nobody (see DOCUMENTATION_GAPS.md).

**How it works:** Saved as the `people` section (people + roles). `GET /api/will/people/suggestions` returns active members of your families (not you), with the relation mapped to a will relationship only when the relation was recorded against you.

**Related features:** F-WILL-004, F-WILL-008, F-WILL-010.

**Sources:** `apps/web/src/pages/will/steps/PeopleStep.tsx:29`, `apps/web/src/pages/will/steps/PeopleStep.tsx:82`, `apps/web/src/pages/will/steps/PeopleStep.tsx:110`, `apps/web/src/pages/will/steps/PersonForm.tsx:10`, `apps/web/src/pages/will/parts.tsx:7`, `packages/api/src/services/will/will.service.ts:210`, `packages/shared/src/will/validation/rules.ts:89`

### Step 4: Assets & liabilities <!-- F-WILL-007 -->
**What it does:** Lists the assets and liabilities fetched from your EveryPaisa accounts with value, ownership (**Sole**, **Joint**, **Nominee only**, **HUF**) and your share, and a review status per item (**Confirmed**, **Needs review**, **Excluded**, **Not found on refresh**). You can refresh from your accounts and add items by hand.

**Why it exists:** Inferred from behavior: the will's estate schedule is built from the data already in EveryPaisa, with the owner confirming each item.

**Where to find it:** Wizard step **Assets & liabilities** (`/will/:id/estate`).

**Who can use it:** Same as F-WILL-001.

**Steps**
1. On first open the list is fetched ("Fetching your assets...").
2. For each item set **Ownership** (Joint/HUF ask for your share %), then **Confirm**, **Exclude** or **Include**.
3. Click **Add an asset or liability**, enter **What is it**, **Type**, **Value**, click **Add**. Manual items can be **Edit value**d or **Remove**d.
4. Click **Refresh from my accounts** to re-read your accounts.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Refresh from my accounts** | Button | Re-reads your accounts | Disabled while refreshing |
| **Retry** | Button | Retries a failed first fetch | Only after a failed first fetch |
| Ownership select | Select | Sole / Joint (50% default) / Nominee only / HUF | — |
| Share % | Decimal field | Your share | Joint and HUF only |
| **Confirm** | Button | Marks reviewed | Needs review / Not found on refresh |
| **Exclude** / **Include** | Button | Leaves the item out / back in | — |
| **Edit value** / **Done** / **Remove** | Buttons | Edit or remove a manual item | Manual items only |
| **Add an asset or liability** → **Add** / **Cancel** | Buttons | Add a manual item | **Add** disabled until name and valid value |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Share % | Decimal | For Joint/HUF | > 0 and ≤ 100, up to 2 decimals | 50 (Joint), 100 | "Enter a percentage above 0, like 25 or 33.33" |
| Value (manual) | Decimal | Yes | > 0, up to 13 digits and 2 decimals; ₹ and commas ignored | Empty | "Enter an amount above 0, like 50000 or 50000.50" |
| **What is it** | Text | Yes | ≤ 160 | Empty | — |

**Settings and toggles here:** S-WILL-004 **Ownership**; S-WILL-005 **Include / Exclude**.

**Results:** Totals Assets / Liabilities / Net update; "Paid to nominees and not counted: ₹…" for nominee-only items.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "We could not read your <sources> just now. Try refreshing, or add them by hand." | A source failed | Refresh or add by hand |
| "Some items were left out because the list is very long." | More than 400 items | Add missing items by hand |
| "This item has gifts in step 5 - they will be flagged." | Excluded or nominee-only item has gifts | Remove the gifts |
| "Your asset list is more than 30 days old - refresh it." | Warning | Refresh |

**Limitations:** Values are estimates as of the fetch date. Nominee-only items pass to the nominee and cannot be gifted.

**How it works:** `POST /api/will/drafts/:id/estate/refresh` collects from each source adapter and reconciles with saved items (your edits are kept; items no longer found are marked **Not found on refresh** unless the list was truncated). Rules on step 4 are warnings: ITEMS_NEED_REVIEW, ESTATE_STALE (> 30 days), ESTATE_SOURCE_FAILED, JOINT_OWNERSHIP_ONLY_SHARE, HUF_COPARCENARY_SHARE, plus an info note on nominations.

**Related features:** F-WILL-004, F-WILL-008.

**Sources:** `apps/web/src/pages/will/steps/EstateStep.tsx:17`, `apps/web/src/pages/will/steps/EstateStep.tsx:59`, `apps/web/src/pages/will/steps/EstateStep.tsx:89`, `apps/web/src/pages/will/steps/EstateStep.tsx:176`, `apps/web/src/pages/will/steps/EstateStep.tsx:224`, `apps/web/src/pages/will/DecimalField.tsx:8`, `apps/web/src/pages/will/allocationMath.ts:3`, `packages/api/src/services/will/estate/registry.ts:36`, `packages/shared/src/will/validation/rules.ts:150`

### Step 5: Allocate <!-- F-WILL-008 -->
**What it does:** Decides who gets what: **By percentage** (the residuary estate shared in percentages that must total 100%, shown in a donut chart), **Specific gifts** (a share of a particular asset to a person), **Fixed amounts** (a rupee amount to a person), and how long someone must outlive you to inherit.

**Why it exists:** Tab text: "Everything not given away as a specific gift or a fixed amount is shared in these percentages."

**Where to find it:** Wizard step **Allocate** (`/will/:id/allocation`).

**Who can use it:** Same as F-WILL-001.

**Steps**
1. **By percentage**: use **Add someone to the split** (new rows take the remaining %), adjust each share, or click **Split equally**. The total line reads "Total 100.00%" in green when correct.
2. **Specific gifts**: choose **Asset** ("… - N% left") and **To**, click **Add gift**, then adjust the share.
3. **Fixed amounts**: choose **Person**, enter **Amount**, click **Add amount**.
4. Choose **How long must someone outlive you to inherit?**

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **By percentage** / **Specific gifts** / **Fixed amounts** | Tabs | Switch section | — |
| **Add someone to the split** | Select | Adds a person with the remaining % | Disabled at 100% ("Lower someone's share first."); hidden when everyone is in |
| **Split equally** | Button | Equal shares to 2 decimals, remainder to the first | Shown with ≥ 2 people |
| Share fields | Decimal fields | Edit percentages | — |
| **Add gift** | Button | Adds a specific gift | Disabled until asset and person chosen, for a duplicate pair, or when the asset has 0% left |
| **Add amount** | Button | Adds a fixed gift | Disabled until person and valid amount |
| **Remove** | Buttons | Remove a row | — |
| **How long must someone outlive you to inherit?** | Select | No waiting period, 7, 15, 30, 60 or 90 days | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Percentage | Decimal | Yes | > 0, ≤ 100, 2 decimals | Remaining % | "Enter a percentage above 0, like 25 or 33.33" |
| Residuary total | — | Blocker | Exactly 100% | — | "The percentage split adds up to X% - it must be exactly 100%." / "Share the rest of your estate - the percentages must add up to 100%." |
| Specific gift | — | Blocker | ≤ 100% per asset; real, included asset | — | "An asset is given away more than 100%." / "A gift names an asset that is excluded, is a liability, or is no longer in your list." |
| Amount | Decimal | Yes | > 0 | Empty | "Enter an amount above 0, like 50000 or 50000.50" |

**Settings and toggles here:** S-WILL-003 **How long must someone outlive you to inherit?** — default 30 days; "If they die within this period, their gifts go to their back-up, or else into the rest of your estate. 30 days is common."

**Results:** Saved as the `allocation` section.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "<name> already has a share of this asset. Change that share above instead." | Same asset/person pair | Edit the existing share |
| "Your money gifts add up to more than your estimated net estate." | Warning | Lower amounts |
| "A beneficiary is under 18 - their share will be managed by their guardian until they turn 18." | Warning | — |

**Limitations:** Nominee-only and excluded assets can't be gifted.

**How it works:** Shares use decimal arithmetic. Step-5 blockers: RESIDUARY_SUMS_100, SPECIFIC_ITEM_OVERALLOCATED, GIFT_ON_EXCLUDED_OR_LIABILITY, DANGLING_REFERENCE; warnings: MINOR_BENEFICIARY, FIXED_GIFTS_EXCEED_NET_ESTATE, UNALLOCATED_ASSETS.

**Related features:** F-WILL-006, F-WILL-007, F-WILL-010.

**Sources:** `apps/web/src/pages/will/steps/AllocationStep.tsx:27`, `apps/web/src/pages/will/steps/AllocationStep.tsx:91`, `apps/web/src/pages/will/steps/AllocationStep.tsx:180`, `apps/web/src/pages/will/steps/AllocationStep.tsx:242`, `apps/web/src/pages/will/allocationMath.ts:20`, `packages/shared/src/will/schema.ts:42`, `packages/shared/src/will/validation/rules.ts:211`

### Step 6: Instructions <!-- F-WILL-009 -->
**What it does:** One optional text box, **Additional instructions (optional)**, for wishes such as funeral arrangements or organ donation, "printed word for word in your will".

**Why it exists:** Field hint: "Wishes such as funeral arrangements or organ donation."

**Where to find it:** Wizard step **Instructions** (`/will/:id/instructions`).

**Who can use it:** Same as F-WILL-001.

**Steps**
1. Type your instructions; a counter shows "N / 1000".
2. Click **Next**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Additional instructions (optional)** | Text area | Free-text wishes | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Additional instructions | Text | No | ≤ 1,000 characters | Empty | — |

**Settings and toggles here:** None.

**Results:** Saved as the `instructions` section and printed verbatim.

**Errors and troubleshooting:** None specific to this step (see F-WILL-004 for save errors).

**Limitations:** Text is printed exactly as typed; it is not checked.

**How it works:** Saved via `PUT /api/will/drafts/:id/sections/instructions`.

**Related features:** F-WILL-004.

**Sources:** `apps/web/src/pages/will/steps/InstructionsStep.tsx:6`

### Step 7: Review <!-- F-WILL-010 -->
**What it does:** A checklist of every rule with a tick, warning or cross and the message for each problem, a **Fix** button that jumps to the right step (and tab), "Your will at a glance" totals, and a "Legal review recommended" note. **Next** stays disabled while any blocker remains.

**Why it exists:** Heading text: "N things to fix before you can preview" / "Ready to preview".

**Where to find it:** Wizard step **Review** (`/will/:id/review`).

**Who can use it:** Same as F-WILL-001.

**Steps**
1. Read each check. Click **Fix** next to a problem to jump there.
2. When the heading says "Ready to preview", click **Next**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Fix** | Button | Goes to the step/tab that fixes the check | Only on failing checks |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing saved here.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Something needs another look" | A finding from a rule not in the list | **Fix** |

**Limitations:** Passing every check does not mean the will is legally valid (disclaimer).

**How it works:** Lists `WILL_RULES` except the legal-review info rule; "At a glance" shows Assets, Liabilities, Net estate, People named, Specific gifts and Money gifts.

**Related features:** F-WILL-005 to F-WILL-009, F-WILL-011.

**Sources:** `apps/web/src/pages/will/steps/ReviewStep.tsx:9`, `apps/web/src/pages/will/steps/ReviewStep.tsx:15`, `apps/web/src/pages/will/WillWizardPage.tsx:107`, `packages/shared/src/will/validation/rules.ts:303`

### Step 8: Preview and generate the PDF <!-- F-WILL-011 -->
**What it does:** Shows a summary and the full text of the will as it will print, asks you to tick the acknowledgement, and generates the PDF as a new numbered version.

**Why it exists:** Code comment: "A preview is what the user consents to, so it is never served from cache".

**Where to find it:** Wizard step **Preview** (`/will/:id/preview`).

**Who can use it:** Same as F-WILL-001.

**Steps**
1. Wait for "Preparing your preview...". Read the summary and document.
2. Tick: "I understand that EveryPaisa is not a law firm, that this will is produced from a fixed template, and that I should have it reviewed by a qualified advocate before I sign it."
3. Click **Generate PDF**. "Version N is ready" appears with next steps.
4. Click **Download PDF**, **Next: sign and store** or **Back to Will Maker**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Acknowledgement checkbox | Checkbox | Consent | Resets whenever the preview reloads |
| **Generate PDF** | Button | Generates the version | Disabled until ticked, with blockers, or while generating |
| **Download PDF** / **Next: sign and store** / **Back to Will Maker** | Buttons | After generation | — |
| **Go to Review** / **Reload preview** / **Retry** | Buttons | Recovery actions | Shown only in those states |

**Fields and rules:** Acknowledgement required ("Please confirm you have read the note about legal review").

**Settings and toggles here:** None.

**Results:** The draft becomes **Generated**; any earlier generated or signed version becomes superseded ("replaced by version N"); open review reminders close; the PDF is stored in your documents.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Fix the items on the Review step first." | Blockers | **Go to Review** |
| "Your preview is from an earlier day - reload it to see the will with today's date before you generate." | The date changed | **Reload preview** |
| "Your will changed since this preview. Reload the preview to see the latest version before you generate." | Revision changed | **Reload preview** |
| "Couldn't prepare the preview" / "Couldn't create your will" | Server error | **Retry** |

**Limitations:** Generation is limited to 5 per minute. The PDF footer reads "Prepared with EveryPaisa Will Maker from a fixed template. Not legal advice - have it reviewed by a qualified advocate."

**How it works:** `GET /api/will/drafts/:id/preview` (audit "will_viewed") and `POST /api/will/drafts/:id/generate` with revision, acknowledgement and the preview date. The server re-checks rules, renders the PDF with the running head "Last Will and Testament of <name>", stores it as a document named "will-v<N>.pdf", seals a snapshot, and writes the audit row "will_generated".

**Related features:** F-WILL-010, F-WILL-012, D-WILL-002.

**Sources:** `apps/web/src/pages/will/steps/PreviewStep.tsx:18`, `apps/web/src/pages/will/steps/PreviewStep.tsx:48`, `apps/web/src/pages/will/steps/PreviewStep.tsx:129`, `packages/api/src/routes/will.routes.ts:60`, `packages/api/src/services/will/willGenerate.service.ts:72`, `packages/api/src/services/will/willGenerate.service.ts:116`, `packages/shared/src/will/wire.ts:120`

### Sign and store (step 9) <!-- F-WILL-012 -->
**What it does:** Explains how to sign the will correctly, links to free legal help, and records the signing date and two witnesses with a scan or photo of the signed will. Once stored, the will shows as **Executed** and the next review is set two years ahead.

**Why it exists:** Page description: "Step 9: sign your will the right way, then keep a copy of the signed will here."

**Where to find it:** **Will Maker → Sign and store** (route `/will/:id/execute`).

**Who can use it:** Same as F-WILL-001 for storing; downloading a stored signed copy works on any plan.

**Steps**
1. Follow the guide: Print the will; Read it once more; Choose two witnesses; Sign in front of both witnesses; Register it with the Sub-Registrar (optional); Store it safely.
2. Enter **Date you signed**, **Witness 1 - full name**, **Witness 2 - full name** and choose the **Signed copy (PDF or photo, up to 20 MB)**.
3. Click **Store signed copy**. The toast "Your signed will is stored" appears; the card shows "Signed on <date>", the witnesses and "Next review <date>".
4. Later use **Download signed copy** or **Replace the copy or fix details** (leave the file empty to keep the stored copy).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download PDF** | Button | Downloads the generated will | — |
| **Store signed copy** | Button | Saves the record | Disabled while saving |
| **Download signed copy** | Button | Downloads the stored copy | Only when stored |
| **Replace the copy or fix details** | Button | Reopens the form | Only for the current will |
| **Cancel** | Button | Closes the edit form | Only when editing |
| Tele-Law / NALSA links | Links | Free legal help (NALSA helpline 15100) | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Date you signed** | Date | Yes | Not in the future; not before the generation date | Empty | "Enter the date you signed." / "The signing date cannot be in the future." / "The signing date cannot be before the will was generated (<date>)." |
| **Witness 1/2 - full name** | Text | Yes | ≥ 2 characters each, ≤ 120, two different people, not you | Empty | "Enter the full name of both witnesses." / "Your two witnesses must be two different people." / "You cannot be a witness to your own will. Choose someone else." |
| **Signed copy** | File | First time only | PDF, JPEG, PNG or WebP (checked by content), ≤ 20 MB | — | "Attach the signed copy." / "Upload the signed will as a PDF or a photo (JPEG, PNG or WebP)." / "The file is larger than 20 MB." |

**Settings and toggles here:** None.

**Results:** Status **Executed**; witness names stored encrypted ("Witness names are stored encrypted and shown only to you."); the signed copy stored as "will-v<N>-signed.<ext>"; next review = signing date + 2 years (correcting witnesses with the same date keeps the review date).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This will can't be signed and stored here: it is still a draft or was discarded." | Not generated | Generate first |
| "This will can't be signed and stored any more" | It was replaced meanwhile | Open the current version |
| "This will changed while you were saving. Reload and try again." | Concurrent change | Reload |
| Amber warning "One of your witnesses has the same name as a beneficiary…" | Witness name matches a beneficiary | Speak to a lawyer; consider re-signing |

**Limitations:** A superseded version's record is read-only ("This version was replaced by a newer version. Its record is kept here as history."). Uploads are limited to 10 per minute.

**How it works:** `GET /api/will/wills/:id/execution`; `POST /api/will/wills/:id/execution` (multipart, one file, multer limit 20 MB, type sniffed from bytes); `GET /api/will/wills/:id/signed-copy` (no plan gate).

**Related features:** F-WILL-003, F-WILL-011, F-WILL-013.

**Sources:** `apps/web/src/pages/will/execute/WillExecutePage.tsx:19`, `apps/web/src/pages/will/execute/WillExecutePage.tsx:84`, `apps/web/src/pages/will/execute/SignedCopyForm.tsx:33`, `apps/web/src/pages/will/execute/executeCopy.ts:5`, `apps/web/src/pages/will/execute/executeCopy.ts:52`, `packages/shared/src/will/execution.ts:13`, `packages/api/src/services/will/willExecute.service.ts:43`, `packages/api/src/services/will/willExecute.service.ts:113`, `packages/api/src/middleware/willUpload.ts:16`

### Will documents after a plan lapse <!-- F-WILL-013 -->
**What it does:** Below PLUS, Will Maker is locked but the card "Your will documents" still offers **Download PDF** and **Download signed copy** for your current version: "Version N stays yours to download on any plan."

**Why it exists:** Code comment: "A user always keeps their own will, whatever their plan".

**Where to find it:** **Planning → Will Maker** when your plan is below PLUS.

**Who can use it:** R-FREE (and any plan) with a generated will.

**Steps**
1. Open **Planning → Will Maker**. Under the lock card, click **Download PDF** or **Download signed copy**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download PDF** | Button | Downloads the current version | Card hidden with no generated will |
| **Download signed copy** | Button | Downloads the signed copy | Only when stored |

**Fields and rules:** Not applicable — downloads only.

**Settings and toggles here:** None.

**Results:** Files download; nothing changes.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't download the file" | Download failed | Retry |

**Limitations:** Editing, new versions and storing a signed copy need PLUS.

**How it works:** `GET /api/will/documents`, `/versions/:vid/pdf`, `/wills/:id/signed-copy` are mounted before the WILL_MAKER gate (still refused while managing).

**Related features:** F-WILL-001, F-WILL-012.

**Sources:** `apps/web/src/pages/will/WillGuards.tsx:25`, `apps/web/src/pages/will/WillGuards.tsx:61`, `packages/api/src/routes/will.routes.ts:47`

### What this area doesn't do
- It does not support wills under foreign law or Muslim personal law.
- It does not give legal advice or register the will; registration is your step at the Sub-Registrar.
- You can't make or view a will for a managed family member, even as their keeper.
- You can't edit a generated version; changes need a new version.
- Only one draft can exist at a time.

<!-- END MODULES -->

## Roles and profiles

Role definitions are global (see the merged manual); headings are repeated here so this fragment can be audited on its own. Module-specific behaviour is in each feature's **Who can use it** and in USER_ROLES_AND_PERMISSIONS.md.

### Signed-out visitor <!-- R-VISITOR -->
Can open family invitation and hand-over links and every Succession email link; must sign in to accept a family invitation.

### Free user <!-- R-FREE -->
Can join a family by invitation, view the Family page and family view, and keep or download an existing will; can pause, revoke or turn off an existing Succession plan. Cannot create a family, see the family dashboard, use Will Maker or set up Succession.

### Plus subscriber <!-- R-PLUS -->
Adds Will Maker and Succession setup. Cannot create a family or see the family dashboard.

### Family subscriber <!-- R-FAMILY -->
Adds creating families and the family dashboard and member pages.

### Pro/Advisor subscriber <!-- R-PRO -->
Same as Family subscriber in these modules.

### Administrator <!-- R-ADMIN -->
Admin-only power here: Succession **Test mode: 1 minute (admins only)**.

### Family owner <!-- R-FAMOWNER -->
Manages members, invitations, seats, visibility and the tree; sees all members' data uncapped in family view.

### Family contributor <!-- R-FAMCONTRIB -->
Sees other members' data within their caps; can create and share family portfolios.

### Family viewer <!-- R-FAMVIEWER -->
Sees other members' data within their caps; read-only on family portfolios.

### Managing a family member's account <!-- R-MANAGER -->
Records data for a managed member; Will Maker, Succession and family management are refused while managing.

### Professional acting for a client <!-- R-PROF -->
Not applicable to these modules.

### AI chatbot connection <!-- R-AICONN -->
Not applicable to these pages (the connector's "Will and succession" area is defined by B06).

### Succession nominee <!-- R-NOMINEE -->
Opens the released information with an emailed one-time code; read-only.

## Glossary
| Term | Meaning |
|---|---|
<!-- BEGIN GLOSSARY -->
| Family | A group of EveryPaisa accounts linked by memberships with roles Owner, Contributor or Viewer. |
| Owner (family) | Family member who manages members and sees every member's data without caps. |
| Contributor (family) | Member who sees other members' data within their visibility caps and can add to family-shared portfolios. |
| Viewer (family) | Member who sees other members' data within their caps, read-only. |
| Managed member | A family member with no login whose books another member keeps; cannot sign in until they take the account over. |
| Who keeps their books | The member (keeper) allowed to open a managed member's account. |
| Accounts you manage | User-menu list of managed members whose books you keep. |
| Family view / Switch view | Header menu that shows the app as a family's combined data instead of your Personal view. |
| Personal view | The default view: only your own data. |
| Seat | A place in a family; held by each active member and each unaccepted invitation. 3 included by default. |
| Shared portfolio | A portfolio attached to a family, visible to all members and writable by owners and contributors. |
| Visibility caps | The asset classes and non-portfolio categories a contributor or viewer may see of other members. |
| Hand the account to them | Inviting a managed member to take over their profile with their own email and password. |
| Succession | Feature that shares chosen financial information with nominees after inactivity or on a date (called Legacy Transfer in code). |
| Nominee (Succession) | A person who receives read-only access to the information you chose after release. |
| Verifier | The one nominee asked to confirm, during the notice period, whether something has happened to you. |
| I'm OK | Email link that resets the Succession countdown. |
| Nominees notified | Succession stage in which nominees are told access opens in 7 days. |
| Shared with nominees | Succession stage after release. |
| Will Maker | Wizard that produces a will under Indian law from a fixed template. |
| Executor | Person who carries out the will. |
| Guardian | Adult appointed for children under 18. |
| Residuary (By percentage) | Everything not given as a specific gift or fixed amount, shared in percentages totalling 100%. |
| Specific gift | A share of a particular asset given to a person. |
| Nominee only (will ownership) | An asset paid to its nominee rather than passing under the will; cannot be gifted. |
| Sign and store | Step 9: recording the signing date, two witnesses and a copy of the signed will. |
| Executed (will) | A generated will whose signing has been recorded. |
<!-- END GLOSSARY -->
