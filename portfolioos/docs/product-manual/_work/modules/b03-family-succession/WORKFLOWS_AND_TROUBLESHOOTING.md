# Workflows and Troubleshooting — Family, Succession, Will Maker (B03)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Family, Succession, Will Maker

<!-- BEGIN WORKFLOWS -->
## Set up a family and keep a grandparent's books <!-- W-FAM-001 -->
**Goal:** Create a family, add a relative with no email, and record their holdings.
**Who:** R-FAMILY or R-PRO (becomes R-FAMOWNER); then R-MANAGER.
**Before you start:** FAMILY plan or higher.

| # | You do | The app does |
|---|---|---|
| 1 | **Overview → Family → New family**, type a name, **Create** | Toast "Family created"; you are Owner; Overview tab opens (F-FAM-002) |
| 2 | **Members & sharing → Add member** | "Add a family member" opens on **Add them now** |
| 3 | Enter **Their name**, choose **Related to** you and **As their** (e.g. Father), leave **Who keeps their books** as you, click **Add to family** | Toast "<name> added to the family"; "<name> is on the tree."; a "<first name>'s portfolio" is created (F-FAM-009) |
| 4 | Click **Open <name>'s account** | Toast "Now managing <name>'s account"; dashboard opens with the amber strip "You are managing …" (F-FAM-024) |
| 5 | Add their FDs, insurance etc. on the usual pages | Everything is saved to their account |
| 6 | Click **Back to my account** | Dashboard opens in your own account |

**Success:** The relative appears on the tree, in the sidebar family tree and in "Accounts you manage".
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Family Sharing is locked" | Plan below FAMILY | Upgrade on **Pricing** |
| Seat payment message | 3 included seats used | Pay ₹199 for a seat (F-FAM-012) or cancel an open invitation |
| "You cannot act for this profile." | You are not the keeper or a membership ended | Ask an owner to set you as keeper (F-FAM-015) |

## Invite a relative by email and have them join <!-- W-FAM-002 -->
**Goal:** Give a relative with their own email a place in the family.
**Who:** R-FAMOWNER invites; the invitee (any plan) accepts.
**Before you start:** A free seat, or Razorpay configured for a paid seat.

| # | You do | The app does |
|---|---|---|
| 1 | **Add member → Invite by email**, fill **Email**, relation, **What they can do** | — |
| 2 | For a contributor or viewer, click **All** in both visibility lists (or tick what they may see) | — |
| 3 | **Next: write the email** | Invitation created (14 days); composer opens (F-FAM-011) |
| 4 | Edit subject/message, **Send email** (or copy the link) | Toast "Sent to <email>"; **Pending invitations** lists it |
| 5 | Invitee opens the link, signs in with the invited email, clicks **Accept** | Toast "Invitation accepted"; they land on Settings; the family appears in their switcher and sidebar (F-FAM-019) |

**Success:** The member shows on the tree; seat line counts them as a member.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Contributor/viewer sees none of the household's data | Both visibility lists were left empty (deny-all) despite the "Empty = no restriction" hint | Owner edits the member and clicks **All** (F-FAM-014) |
| "This invitation was sent to a different email address." | Signed in with another account | Sign in with the invited email |
| "Invitation expired." | Older than 14 days | Cancel and invite again |
| Overview tab locked for the new member | Their own plan is below FAMILY | They upgrade; family view still works |

## Hand a managed account to its owner <!-- W-FAM-003 -->
**Goal:** Let a relative whose books were kept for them take over their own account.
**Who:** R-FAMOWNER sends; the relative (R-VISITOR) claims.
**Before you start:** The relative's email must not already have an EveryPaisa account.

| # | You do | The app does |
|---|---|---|
| 1 | Tree → managed member → **Edit** → **Hand the account to them** | **Their email** appears, pre-filled |
| 2 | **Next**, then **Send email** | Email "<you> has set up your EveryPaisa account" with **Take over my account** (F-FAM-016) |
| 3 | Relative opens the link, sets a password twice, clicks **Take over my account** | Toast "This account is yours now"; dashboard opens (F-FAM-020) |

**Success:** The profile is no longer managed; holdings and family place are unchanged; it leaves the keeper's "Accounts you manage".
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "<email> already has an EveryPaisa account…" | Address in use | Use another address |
| "That link has expired." | 14 days passed | Send a new hand-over |

## Turn on Succession <!-- W-SUCC-001 -->
**Goal:** Arrange for nominees to receive your financial information if you become inactive.
**Who:** R-PLUS, R-FAMILY, R-PRO (on your own account).
**Before you start:** Access to your email (or authenticator) for confirmation codes.

| # | You do | The app does |
|---|---|---|
| 1 | **Planning → Succession**; choose **Trigger** and days/date; optional letter; **Save** | "Confirm it's you" asks for a code; toast "Saved" (F-SUCC-002, F-SUCC-005) |
| 2 | **Add nominee**; fill name, email, relationship; tick categories; **Save** | Nominee listed (F-SUCC-004) |
| 3 | **Turn on** | Toast "Succession is on"; status **On**; nominees get a "Confirm" email; you get "Your Succession plan was changed" |
| 4 | Nominees click **Confirm** in their email | List shows "· confirmed" |

**Success:** Status **On** with "First warning on <date> if you stay inactive."
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Add at least one nominee first." | No nominees | Add one |
| "⚠ email not confirmed yet" stays | Nominee hasn't clicked Confirm | Check the address; edit to resend |
| "Switch back to your own account to do this." | You are managing a relative | **Back to my account** |

## Stop or complete a Succession countdown <!-- W-SUCC-002 -->
**Goal:** Understand what happens when you are inactive, and how to stop it.
**Who:** Plan owner (any plan once armed); verifier nominee.

| # | You do | The app does |
|---|---|---|
| 1 | Stay inactive for the chosen days | Daily 10:00 IST: "Are you OK? (first Succession reminder)" (F-SUCC-006) |
| 2 | (Inactive 7 more days each) | Second, then final reminder |
| 3 | (Inactive 7 more days) | Status "Nominees notified"; owner gets "Your nominees will get access in 7 days"; nominees get a notice; verifier gets "Please confirm: is <you> OK?" |
| 4 | Click **I'm OK** in any reminder, or sign in | Countdown resets to **On**; nominees get "Update about <you>" if they were notified (F-SUCC-007) |
| 5 | If nothing happens for 7 days (or the verifier clicks **Yes, share their information now**) | Released: nominees get **View information**; owner gets "Your Succession plan was released" |
| 6 | Owner clicks **Revoke all access** if it was a mistake | Access ends; nominees get "<you> withdrew access"; plan re-arms |

**Success:** Either the countdown is reset, or nominees have read-only access.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Settings locked | Plan is in a reminder or notice stage | **Pause** first |
| "This link is no longer valid." on I'm OK | Old link or plan moved on | Sign in instead |

## A nominee opens the shared information <!-- W-SUCC-003 -->
**Goal:** Read what the owner shared after release.
**Who:** R-NOMINEE.

| # | You do | The app does |
|---|---|---|
| 1 | Open **View information** from the release email | "Shared financial information" page |
| 2 | **Send code**, enter the 6-digit code, **Open** | Owner's letter, sections, documents (F-SUCC-008) |
| 3 | **Download PDF** / document **Download** | Files download; each access is logged for the owner |

**Success:** The information is visible for 30 minutes per session.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "This link is no longer valid." | Link expired (90 days) or access revoked | **Email me a fresh link** |
| "Too many attempts. Try again in 30 minutes." | 5 wrong codes | Wait 30 minutes |
| "Session expired. Open your link again." | 30 minutes passed | Open the link again |

## Write and generate a will <!-- W-WILL-001 -->
**Goal:** Produce a will PDF from your EveryPaisa data.
**Who:** R-PLUS, R-FAMILY, R-PRO on their own account.

| # | You do | The app does |
|---|---|---|
| 1 | **Planning → Will Maker → Create my will** | Wizard opens at **Your details** (F-WILL-001) |
| 2 | Fill **Your details**, **Next** | Saved automatically; blockers listed (F-WILL-005) |
| 3 | **People & roles**: add beneficiaries, choose executor (and guardian if any child is under 18) | F-WILL-006 |
| 4 | **Assets & liabilities**: review each item, set ownership | F-WILL-007 |
| 5 | **Allocate**: shares to 100%, gifts, survival period | F-WILL-008 |
| 6 | **Instructions** (optional), **Review**: fix every cross | **Next** enabled at "Ready to preview" (F-WILL-010) |
| 7 | **Preview**: tick the acknowledgement, **Generate PDF** | "Version N is ready" (F-WILL-011) |

**Success:** Status **Generated**; **Download PDF** available.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "This will was changed in another tab or device…" | Edited elsewhere | **Reload** |
| "Your preview is from an earlier day…" | Date changed | **Reload preview** |
| Foreign/Muslim law notice | Unsupported | Consult an advocate |

## Sign, store and review a will <!-- W-WILL-002 -->
**Goal:** Record the signed will and keep it current.
**Who:** R-PLUS and above (downloads on any plan).

| # | You do | The app does |
|---|---|---|
| 1 | **Sign and store**; follow the six signing steps | Guide and lawyer links (F-WILL-012) |
| 2 | Enter **Date you signed**, two witnesses, attach the scan, **Store signed copy** | Toast "Your signed will is stored"; status **Executed**; next review in 2 years |
| 3 | When due, read "Time to review your will" | Banner on Will Maker and an alert (F-WILL-003) |
| 4 | **Reviewed - no changes** or **My circumstances changed** | Next review +2 years, or a new draft from the signed will |

**Success:** "Signed on <date>" with "Next review <date>".
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "The signing date cannot be before the will was generated (<date>)." | Date too early | Correct the date |
| "You cannot be a witness to your own will. Choose someone else." | Own name as witness | Use other witnesses |
| Witness-is-beneficiary warning | Witness matches a beneficiary | Speak to a lawyer; consider re-signing |
<!-- END WORKFLOWS -->

## General troubleshooting
| Symptom / message | Why | How to recover |
|---|---|---|
<!-- BEGIN TROUBLESHOOTING -->
| "Switch back to your own account to do this." | Family management, Succession and other account routes are refused while managing a relative's account | Click **Back to my account** |
| "You are not an active member of this family." on data pages | Your browser is still in a family's view after you were removed | **Switch view → Personal view** |
| Family dashboard locked although you are a member | The dashboard checks your own plan (FAMILY or higher) | Upgrade, or use family view on other pages |
| Contributor/viewer sees zeros for other members | Empty visibility lists mean "see nothing" | Owner clicks **All** in both lists (F-FAM-014) |
| "Confirm it is you first." | Succession step-up grant missing or older than 15 minutes (or page reloaded) | Enter the new code |
| "This request is too large." in Will Maker | Request over 512 KB | Shorten long text |
<!-- END TROUBLESHOOTING -->
