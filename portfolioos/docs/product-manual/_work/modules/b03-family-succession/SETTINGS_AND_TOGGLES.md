# Settings and Toggles Reference — Family, Succession, Will Maker (B03)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Family, Succession, Will Maker

<!-- BEGIN SETTINGS -->
## Family → Add member / Edit managed member

### Their place in the family <!-- S-FAM-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Family → Members & sharing → Add member → Add them now / Add several** |
| Purpose | Role of a managed member: describes how they are counted; grants nothing because they never sign in |
| Default | `CONTRIBUTOR` (source: `apps/web/src/pages/family/FamilyPage.tsx:971`; server default `packages/api/src/services/family/family.service.ts:1028`) |
| Values | **Contributor — counted in the household** · **Viewer — listed, but kept to the side** (bulk form: plural labels). Owner is not offered and is refused by the server |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `FamilyMember.role` |
| Backend effect | None on access (the profile cannot sign in); shown on the tree (eye icon for Viewer) |
| Who can change | R-FAMOWNER (on add); later only via F-FAM-014 for signed-in members — no role control exists for managed members after adding |
| Sources | `apps/web/src/pages/family/FamilyPage.tsx:1088`, `apps/web/src/pages/family/FamilyPage.tsx:1365`, `packages/api/src/routes/families.routes.ts:138` |

### Who keeps their books <!-- S-FAM-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Add them now**, **Add several**, and **Edit <managed member>** |
| Purpose | Chooses the one member allowed to open the managed member's account |
| Default | You (`apps/web/src/pages/family/FamilyPage.tsx:968`); server default caller (`packages/api/src/services/family/family.service.ts:1033`) |
| Values | Any ACTIVE member with a login; managed members are listed but disabled ("<name> — no login yet") |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `User.managedById` of the managed profile |
| Backend effect | Decides who passes the `X-Act-As` check; changing it ends the old keeper's access on their next request; appears in the keeper's "Accounts you manage" |
| Who can change | R-FAMOWNER; the current keeper via API |
| Sources | `apps/web/src/pages/family/FamilyPage.tsx:1097`, `apps/web/src/pages/family/FamilyPage.tsx:1609`, `packages/api/src/services/family/family.service.ts:998`, `packages/api/src/services/family/managedProfile.service.ts:76` |

### Related to / As their <!-- S-FAM-009 -->
| Attribute | Value |
|---|---|
| Control type | Select + chip group (with **Other…** free text, placeholder "e.g. Uncle, Guardian") |
| Location | Add member (all modes), Edit member, Edit managed member |
| Purpose | Records how the person is related and places them on the tree |
| Default | **Related to**: you, or the person whose card opened the dialog; relation: none (`apps/web/src/pages/family/FamilyPage.tsx:845`) |
| Values | Father, Mother, Father-in-law, Mother-in-law, Grandfather, Grandmother (above); Spouse, Wife, Husband (partner); Brother, Sister (beside); Son, Daughter, Son-in-law, Daughter-in-law, Grandson, Granddaughter (below); any typed relation goes below |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `FamilyMember.relation`, `FamilyMember.relatedToId`; tree in `Family.treeLayout` |
| Backend effect | Re-places the person on the tree; refused if it makes a loop; also feeds Will Maker family suggestions |
| Who can change | R-FAMOWNER |
| Sources | `apps/web/src/components/family/RelationPicker.tsx:20`, `packages/shared/src/familyRelations.ts:34`, `packages/api/src/services/family/family.service.ts:949` |

## Family → Invite by email / Edit member

### What they can do <!-- S-FAM-003 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Invite by email** and **Edit <member>** |
| Purpose | The member's family role |
| Default | `CONTRIBUTOR` (`apps/web/src/pages/family/FamilyPage.tsx:1409`; server `packages/api/src/services/family/family.service.ts:575`) |
| Values | **Owner — sees everything, can manage the family** · **Contributor — filtered view, can add to the family** · **Viewer — filtered view, read-only** |
| Depends on | Owner disables S-FAM-004/S-FAM-005 |
| Persists | Yes — server |
| Stored in | `FamilyInvitation.role` → `FamilyMember.role` |
| Backend effect | Owner: no caps, can manage members, write family portfolios. Contributor: caps apply, can write family-shared portfolios. Viewer: caps apply, no family writes. The last owner can't be demoted |
| Who can change | R-FAMOWNER |
| Sources | `apps/web/src/pages/family/FamilyPage.tsx:1505`, `packages/api/src/services/family/familyScope.service.ts:182`, `packages/api/src/services/family/family.service.ts:237` |

### Asset classes (visibility) <!-- S-FAM-004 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox list with **All** / **None** |
| Location | **Invite by email** and **Edit <member>** → "Asset classes (n/N)" |
| Purpose | Which asset classes of the other members a contributor or viewer may see |
| Default | Empty list (`apps/web/src/pages/family/FamilyPage.tsx:1412`; schema `packages/api/prisma/schema.prisma:3813`) |
| Values | Ticked classes are visible. **Empty = nothing visible** (server). The UI hint says "Empty = no restriction" — this is wrong |
| Depends on | Ignored when role is Owner |
| Persists | Yes — server |
| Stored in | `FamilyMember.visibleAssetClasses` |
| Backend effect | Filters holdings, transactions and wealth of other members in family view, family dashboard and member pages; never filters the member's own data |
| Who can change | R-FAMOWNER |
| Sources | `apps/web/src/pages/family/FamilyPage.tsx:1860`, `apps/web/src/pages/family/FamilyPage.tsx:1897`, `packages/api/src/services/family/familyScope.service.ts:208` |

### Non-portfolio categories (visibility) <!-- S-FAM-005 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox list with **All** / **None** |
| Location | **Invite by email** and **Edit <member>** → "Non-portfolio categories (n/N)" |
| Purpose | Which non-portfolio categories of other members a contributor or viewer may see |
| Default | Empty list (`packages/api/prisma/schema.prisma:3812`) |
| Values | Vehicle, Rental, Insurance, Loan, Credit card, Bank account, Owned property, Goal. **Empty = nothing visible** (server); UI hint says "Empty = no restriction (member sees vehicles, insurance, loans, etc.)" — wrong |
| Depends on | Ignored when role is Owner |
| Persists | Yes — server |
| Stored in | `FamilyMember.visibleCategories` |
| Backend effect | Gates other members' vehicles, rentals, insurance, loans, cards, bank accounts, property and goals in family view and the family dashboard |
| Who can change | R-FAMOWNER |
| Sources | `apps/web/src/pages/family/FamilyPage.tsx:1905`, `apps/web/src/pages/family/FamilyPage.tsx:1945`, `packages/api/src/services/family/familyScope.service.ts:44`, `packages/api/src/services/family/familyScope.service.ts:265` |

## Header → Switch view; Sidebar; User menu

### Viewing as family <!-- S-FAM-006 -->
| Attribute | Value |
|---|---|
| Control type | Menu selection |
| Location | Header **Switch view**; **View this family across the app**; dashboard strip **Personal view** |
| Purpose | Shows every scope-aware page as the selected family's combined data |
| Default | `null` = Personal view (`apps/web/src/stores/familyScope.store.ts:26`) |
| Values | Personal view · one of your ACTIVE families |
| Depends on | Cleared on sign-out, account switch, and entering/leaving a managed account |
| Persists | This device only (localStorage `everypaisa.familyScope`) |
| Stored in | localStorage `everypaisa.familyScope` |
| Backend effect | Adds `X-Viewing-As-Family` to every API call; server refuses non-members with 403 "You are not an active member of this family." |
| Who can change | R-FAMOWNER, R-FAMCONTRIB, R-FAMVIEWER |
| Sources | `apps/web/src/components/family/FamilyScopeSwitcher.tsx:57`, `apps/web/src/api/client.ts:42`, `apps/web/src/lib/sessionBoundary.ts:36`, `packages/api/src/lib/familyHeader.ts:16` |

### Managing (acting as) <!-- S-FAM-007 -->
| Attribute | Value |
|---|---|
| Control type | Menu selection / button |
| Location | User menu **Accounts you manage**; tree card **Record something for …**; **Back to my account** |
| Purpose | Makes this tab act for a managed member |
| Default | `null` (your own account) (`apps/web/src/stores/actingAs.store.ts:31`) |
| Values | Your account · one profile you keep |
| Depends on | Left automatically if another account signs in |
| Persists | This tab only (sessionStorage `everypaisa.actingAs`) |
| Stored in | sessionStorage `everypaisa.actingAs` |
| Backend effect | Adds `X-Act-As` to data requests (not account routes); server re-checks each request; audit row on entering |
| Who can change | R-MANAGER |
| Sources | `apps/web/src/stores/actingAs.store.ts:28`, `apps/web/src/api/client.ts:48`, `packages/api/src/middleware/authenticate.ts:40` |

### Sidebar family expansion <!-- S-FAM-008 -->
| Attribute | Value |
|---|---|
| Control type | Chevron toggle per family |
| Location | Sidebar family tree |
| Purpose | Remembers which families are expanded |
| Default | All expanded until first toggle (`apps/web/src/components/layout/FamilyNavTree.tsx:58`) |
| Values | Comma-separated list of expanded family ids |
| Depends on | — |
| Persists | This device only |
| Stored in | localStorage `sidebar_families_expanded` |
| Backend effect | Members are fetched only for expanded families |
| Who can change | Any family member |
| Sources | `apps/web/src/components/layout/FamilyNavTree.tsx:28`, `apps/web/src/components/layout/FamilyNavTree.tsx:60` |

## Succession → When to share

### Trigger <!-- S-SUCC-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Planning → Succession → When to share** |
| Purpose | What starts the release |
| Default | `INACTIVITY` (`apps/web/src/pages/legacy/LegacyPage.tsx:43`) |
| Values | **If I'm inactive** (inactivity, then 3 weekly reminders and a 7-day notice) · **On a date** (reminders 30/7/1 days before, release on the date) · **Whichever comes first** (both) |
| Depends on | Date triggers need S-SUCC-003; test mode forces inactivity |
| Persists | Yes — server |
| Stored in | `LegacyPlan.triggerMode` |
| Backend effect | Drives the daily state machine (F-SUCC-006) |
| Who can change | R-PLUS and above, while Off/On/Paused, with step-up |
| Sources | `apps/web/src/pages/legacy/LegacyPage.tsx:126`, `packages/api/src/services/legacy/stateMachine.ts:63` |

### Inactive for (days) <!-- S-SUCC-002 -->
| Attribute | Value |
|---|---|
| Control type | Number |
| Location | **When to share** → **Inactive for (days, at least 30)** |
| Purpose | Days without activity before the first reminder |
| Default | 90 (`packages/shared/src/legacy.ts:12`) |
| Values | 30–3,650 |
| Depends on | Hidden for **On a date** and in test mode |
| Persists | Yes — server |
| Stored in | `LegacyPlan.inactivityDays` |
| Backend effect | Changing it on an armed plan restarts the clock from now |
| Who can change | R-PLUS and above |
| Sources | `apps/web/src/pages/legacy/LegacyPage.tsx:147`, `packages/api/src/schemas/legacy.schemas.ts:8`, `packages/api/src/services/legacy/plan.service.ts:112` |

### Release date <!-- S-SUCC-003 -->
| Attribute | Value |
|---|---|
| Control type | Date |
| Location | **When to share** → **Release date** |
| Purpose | Scheduled release date |
| Default | Empty |
| Values | A date after today (IST) |
| Depends on | Shown for **On a date** / **Whichever comes first** |
| Persists | Yes — server |
| Stored in | `LegacyPlan.scheduledFor` |
| Backend effect | Owner reminders 30, 7 and 1 days before; release on the day with no notice stage; dropped if it passes during a pause or before re-arming |
| Who can change | R-PLUS and above |
| Sources | `apps/web/src/pages/legacy/LegacyPage.tsx:155`, `packages/api/src/services/legacy/plan.service.ts:42`, `packages/shared/src/legacy.ts:16` |

### Personal letter <!-- S-SUCC-004 -->
| Attribute | Value |
|---|---|
| Control type | Text area |
| Location | **When to share** → **Personal letter (optional)** |
| Purpose | A note shown to nominees who may see "Personal letter" |
| Default | Empty |
| Values | ≤ 20,000 characters |
| Depends on | Shown only to nominees with the Personal letter category |
| Persists | Yes — server, encrypted |
| Stored in | `LegacyPlan.letterEnc` |
| Backend effect | Included in the nominee view and PDF |
| Who can change | R-PLUS and above |
| Sources | `apps/web/src/pages/legacy/LegacyPage.tsx:160`, `packages/api/src/services/legacy/plan.service.ts:111` |

### Test mode: 1 minute (admins only) <!-- S-SUCC-005 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | **When to share** (admins only) |
| Purpose | 1-minute inactivity and stages for testing |
| Default | Off (`packages/api/src/schemas/legacy.schemas.ts:14`) |
| Values | On: release in about 5 minutes · Off: normal days |
| Depends on | Requires the inactivity trigger |
| Persists | Yes — server |
| Stored in | `LegacyPlan.testMode` |
| Backend effect | Per-minute cron advances the plan |
| Who can change | R-ADMIN |
| Sources | `apps/web/src/pages/legacy/LegacyPage.tsx:132`, `packages/api/src/services/legacy/plan.service.ts:91` |

## Succession → Status

### Pause until <!-- S-SUCC-006 -->
| Attribute | Value |
|---|---|
| Control type | Date + **Pause** button |
| Location | **Succession** status card |
| Purpose | Stops the countdown until a date |
| Default | Empty |
| Values | After today, ≤ 180 days ahead |
| Depends on | Shown only while counting |
| Persists | Yes — server |
| Stored in | `LegacyPlan.pausedUntil`, `LegacyPlan.status = PAUSED` |
| Backend effect | Daily tick resumes on the date with a fresh clock; pausing during the notice stage emails nominees |
| Who can change | Plan owner on any plan (step-up required) |
| Sources | `apps/web/src/pages/legacy/LegacyPage.tsx:109`, `packages/api/src/services/legacy/plan.service.ts:231` |

## Succession → Nominee dialog

### What they can see <!-- S-SUCC-007 -->
| Attribute | Value |
|---|---|
| Control type | Checkboxes |
| Location | **Add nominee / Edit nominee** |
| Purpose | Categories released to this nominee |
| Default | Insurance + Bank accounts (`apps/web/src/pages/legacy/NomineeDialog.tsx:13`) |
| Values | Investments, Bank accounts, Insurance, Loans & credit cards, Property, Vehicles, Provident fund & NPS, Documents, Personal letter (≥ 1) |
| Depends on | Documents enables S-SUCC-011 |
| Persists | Yes — server |
| Stored in | `LegacyNominee.categories` |
| Backend effect | Only these categories are loaded for the nominee view |
| Who can change | R-PLUS and above |
| Sources | `packages/shared/src/legacy.ts:5`, `packages/api/src/services/legacy/view.service.ts:44` |

### Show amounts <!-- S-SUCC-008 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | Nominee dialog |
| Purpose | Whether balances and values are shown |
| Default | Off (`apps/web/src/pages/legacy/NomineeDialog.tsx:13`) |
| Values | On: amounts and "Total of listed assets" · Off: "they see only what exists and where" |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `LegacyNominee.showAmounts` |
| Backend effect | With off, no figure is sent at all |
| Who can change | R-PLUS and above |
| Sources | `apps/web/src/pages/legacy/NomineeDialog.tsx:87`, `packages/api/src/services/legacy/view.service.ts:121` |

### Verifier <!-- S-SUCC-009 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | Nominee dialog |
| Purpose | The one nominee asked to confirm during the 7-day notice |
| Default | Off |
| Values | On: gets "Please confirm: is <owner> OK?" — can release now or reset · Off |
| Depends on | Only one per plan (setting it clears the others) |
| Persists | Yes — server |
| Stored in | `LegacyNominee.isVerifier` |
| Backend effect | Verify link valid 14 days, only during the notice stage |
| Who can change | R-PLUS and above |
| Sources | `apps/web/src/pages/legacy/NomineeDialog.tsx:91`, `packages/api/src/services/legacy/runner.service.ts:65`, `packages/api/src/services/legacy/plan.service.ts:163` |

### Priority <!-- S-SUCC-010 -->
| Attribute | Value |
|---|---|
| Control type | Number |
| Location | Nominee dialog |
| Purpose | Ordering of nominees |
| Default | 1 |
| Values | 1–20 |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `LegacyNominee.priority` |
| Backend effect | Nominees are listed and emailed in ascending priority; no other effect found |
| Who can change | R-PLUS and above |
| Sources | `apps/web/src/pages/legacy/NomineeDialog.tsx:52`, `packages/api/src/services/legacy/runner.service.ts:22` |

### Documents to share <!-- S-SUCC-011 -->
| Attribute | Value |
|---|---|
| Control type | Checkboxes |
| Location | Nominee dialog (when Documents is ticked) |
| Purpose | Vault documents the nominee may download |
| Default | None |
| Values | ≤ 50 of your own documents; replaced wills only shown if already shared |
| Depends on | S-SUCC-007 includes Documents |
| Persists | Yes — server |
| Stored in | `LegacyNominee.documentIds` |
| Backend effect | Unknown or non-owned ids are dropped |
| Who can change | R-PLUS and above |
| Sources | `apps/web/src/pages/legacy/NomineeDialog.tsx:67`, `packages/api/src/services/legacy/plan.service.ts:124` |

## Will Maker → Your details

### Country whose law applies <!-- S-WILL-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | Will wizard step 2 |
| Purpose | Jurisdiction of the will |
| Default | India (`apps/web/src/pages/will/steps/DetailsStep.tsx:57`) |
| Values | India · Another country (blocks generation) |
| Depends on | — |
| Persists | Yes — server, encrypted draft |
| Stored in | Will payload `details.jurisdiction` |
| Backend effect | JURISDICTION_INDIA_ONLY blocker |
| Who can change | R-PLUS and above |
| Sources | `apps/web/src/pages/will/steps/DetailsStep.tsx:56`, `packages/shared/src/will/validation/rules.ts:54` |

### Religion / personal law <!-- S-WILL-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | Will wizard step 2 |
| Purpose | Decides which succession law applies |
| Default | Not chosen |
| Values | Hindu, Sikh, Jain, Buddhist, Christian, Parsi, Muslim (blocks generation), Other / none |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Will payload `details.personalLaw` |
| Backend effect | MUSLIM_LAW_UNSUPPORTED blocker |
| Who can change | R-PLUS and above |
| Sources | `apps/web/src/pages/will/steps/DetailsStep.tsx:64`, `packages/shared/src/will/validation/rules.ts:58` |

## Will Maker → People, Estate, Allocate

### If they die before you, their gifts go to <!-- S-WILL-006 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | Will step 3 person form |
| Purpose | Back-up beneficiary per person |
| Default | "Shared among the others (default)" |
| Values | Default · any other person |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Will payload `people[].contingentId` |
| Backend effect | CONTINGENT_IS_SELF blocker |
| Who can change | R-PLUS and above |
| Sources | `apps/web/src/pages/will/steps/PersonForm.tsx:60`, `packages/shared/src/will/validation/rules.ts:122` |

### Ownership <!-- S-WILL-004 -->
| Attribute | Value |
|---|---|
| Control type | Select + percentage |
| Location | Will step 4 item rows |
| Purpose | How you own an item |
| Default | From the data; Joint sets 50%, others 100% |
| Values | **Sole**, **Joint** (your %), **Nominee only** (not counted; can't be gifted), **HUF** (your %) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Will payload `estate.items[].ownership` |
| Backend effect | Only your share counts; warnings JOINT_OWNERSHIP_ONLY_SHARE, HUF_COPARCENARY_SHARE |
| Who can change | R-PLUS and above |
| Sources | `apps/web/src/pages/will/steps/EstateStep.tsx:59`, `packages/shared/src/will/validation/rules.ts:175` |

### Include / Exclude <!-- S-WILL-005 -->
| Attribute | Value |
|---|---|
| Control type | Buttons |
| Location | Will step 4 item rows |
| Purpose | Whether an item is part of the will's estate |
| Default | Fetched items start as **Needs review**; manual items **Confirmed** |
| Values | Confirmed · Needs review · Excluded · Not found on refresh |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Will payload `estate.items[].review` |
| Backend effect | Excluded items can't receive gifts (blocker) |
| Who can change | R-PLUS and above |
| Sources | `apps/web/src/pages/will/steps/EstateStep.tsx:89`, `packages/shared/src/will/validation/rules.ts:222` |

### How long must someone outlive you to inherit? <!-- S-WILL-003 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | Will step 5 |
| Purpose | Survival period before a beneficiary inherits |
| Default | 30 days (`packages/shared/src/will/schema.ts:131`) |
| Values | No waiting period, 7, 15, 30, 60, 90 days |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Will payload `allocation.survivalDays` |
| Backend effect | Printed in the will |
| Who can change | R-PLUS and above |
| Sources | `apps/web/src/pages/will/steps/AllocationStep.tsx:242`, `packages/shared/src/will/schema.ts:42` |
<!-- END SETTINGS -->

## Client-side storage
| Key / cookie | What's stored | Written when | Refreshed when | Can go stale? |
|---|---|---|---|---|
<!-- BEGIN CLIENT-STORAGE -->
| localStorage `everypaisa.familyScope` | Selected family view id and name | Switch view, **View this family across the app**, accept invitation (cleared) | On every change; cleared on sign-out/account switch/entering or leaving a managed account | Yes — a removed member keeps the stale id until switching to Personal view (server then refuses with 403) |
| sessionStorage `everypaisa.actingAs` | Managed profile id, name and the manager's id | Entering a managed account | Cleared by **Back to my account**, tab close, or another account signing in | Yes — if keeper access ends, data requests fail with "You cannot act for this profile." |
| localStorage `sidebar_families_expanded` | Expanded family ids in the sidebar | Chevron toggle | On toggle | No |
| sessionStorage `legacy.session.<first 12 chars of link>` | Nominee view session token | After a correct one-time code | Session expires after 30 minutes server-side | Yes — expired sessions are dropped on the next load |
| In-memory Succession step-up grant | 15-minute grant (14 minutes client-side) | After **Confirm** | Lost on reload | No |
<!-- END CLIENT-STORAGE -->

## Operator configuration (not user-facing)
| Env var name | Purpose | Effect when unset |
|---|---|---|
<!-- BEGIN OPERATOR-CONFIG -->
| `ENABLE_FAMILY` | Mounts `/api/families` and `/api/managed-profiles` | Default `true`; when `false` the family APIs are absent |
| `ENABLE_LEGACY_CRON` | Starts the Succession jobs (daily 10:00 IST tick, hourly :20 outbox retry, per-minute test tick) | Jobs run unless set to `false` |
| `ENABLE_ALERT_CRONS` | Starts the will review reminder job (09:15 IST) | Job runs unless set to `false` |
| `RAZORPAY_KEY_ID` | Purpose: public key for the extra-seat checkout (with the Razorpay secret configured for billing) | Seat payments refused with "… Payments are not configured on this server." |
| `FRONTEND_URL` | Base of links in Succession and invitation emails | Defaults to `http://localhost:3000` |
<!-- END OPERATOR-CONFIG -->
