[Index](../INDEX.md)

# Settings — Family

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-fam-001"></a>
### Their place in the family
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
| Who can change | [R-FAMOWNER](../roles.md#r-famowner) (on add); later only via [F-FAM-014](../features/F-FAM-014.md) for signed-in members — no role control exists for managed members after adding |
| Sources | `apps/web/src/pages/family/FamilyPage.tsx:1088`, `apps/web/src/pages/family/FamilyPage.tsx:1365`, `packages/api/src/routes/families.routes.ts:138` |

<a id="s-fam-002"></a>
### Who keeps their books
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
| Who can change | [R-FAMOWNER](../roles.md#r-famowner); the current keeper via API |
| Sources | `apps/web/src/pages/family/FamilyPage.tsx:1097`, `apps/web/src/pages/family/FamilyPage.tsx:1609`, `packages/api/src/services/family/family.service.ts:998`, `packages/api/src/services/family/managedProfile.service.ts:76` |

<a id="s-fam-009"></a>
### Related to / As their
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
| Who can change | [R-FAMOWNER](../roles.md#r-famowner) |
| Sources | `apps/web/src/components/family/RelationPicker.tsx:20`, `packages/shared/src/familyRelations.ts:34`, `packages/api/src/services/family/family.service.ts:949` |

<a id="s-fam-003"></a>
### What they can do
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Invite by email** and **Edit <member>** |
| Purpose | The member's family role |
| Default | `CONTRIBUTOR` (`apps/web/src/pages/family/FamilyPage.tsx:1409`; server `packages/api/src/services/family/family.service.ts:575`) |
| Values | **Owner — sees everything, can manage the family** · **Contributor — filtered view, can add to the family** · **Viewer — filtered view, read-only** |
| Depends on | Owner disables [S-FAM-004](../settings/family.md#s-fam-004)/[S-FAM-005](../settings/family.md#s-fam-005) |
| Persists | Yes — server |
| Stored in | `FamilyInvitation.role` → `FamilyMember.role` |
| Backend effect | Owner: no caps, can manage members, write family portfolios. Contributor: caps apply, can write family-shared portfolios. Viewer: caps apply, no family writes. The last owner can't be demoted |
| Who can change | [R-FAMOWNER](../roles.md#r-famowner) |
| Sources | `apps/web/src/pages/family/FamilyPage.tsx:1505`, `packages/api/src/services/family/familyScope.service.ts:182`, `packages/api/src/services/family/family.service.ts:237` |

<a id="s-fam-004"></a>
### Asset classes (visibility)
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
| Who can change | [R-FAMOWNER](../roles.md#r-famowner) |
| Sources | `apps/web/src/pages/family/FamilyPage.tsx:1860`, `apps/web/src/pages/family/FamilyPage.tsx:1897`, `packages/api/src/services/family/familyScope.service.ts:208` |

<a id="s-fam-005"></a>
### Non-portfolio categories (visibility)
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
| Who can change | [R-FAMOWNER](../roles.md#r-famowner) |
| Sources | `apps/web/src/pages/family/FamilyPage.tsx:1905`, `apps/web/src/pages/family/FamilyPage.tsx:1945`, `packages/api/src/services/family/familyScope.service.ts:44`, `packages/api/src/services/family/familyScope.service.ts:265` |

<a id="s-fam-006"></a>
### Viewing as family
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
| Who can change | [R-FAMOWNER](../roles.md#r-famowner), [R-FAMCONTRIB](../roles.md#r-famcontrib), [R-FAMVIEWER](../roles.md#r-famviewer) |
| Sources | `apps/web/src/components/family/FamilyScopeSwitcher.tsx:57`, `apps/web/src/api/client.ts:42`, `apps/web/src/lib/sessionBoundary.ts:36`, `packages/api/src/lib/familyHeader.ts:16` |

<a id="s-fam-007"></a>
### Managing (acting as)
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
| Who can change | [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/stores/actingAs.store.ts:28`, `apps/web/src/api/client.ts:48`, `packages/api/src/middleware/authenticate.ts:40` |

<a id="s-fam-008"></a>
### Sidebar family expansion
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
