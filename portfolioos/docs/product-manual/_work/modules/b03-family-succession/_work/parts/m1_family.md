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
