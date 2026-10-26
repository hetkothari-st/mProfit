[Index](../INDEX.md)

# Settings — Will Maker

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-will-001"></a>
### Country whose law applies
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
| Who can change | [R-PLUS](../roles.md#r-plus) and above |
| Sources | `apps/web/src/pages/will/steps/DetailsStep.tsx:56`, `packages/shared/src/will/validation/rules.ts:54` |

<a id="s-will-002"></a>
### Religion / personal law
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
| Who can change | [R-PLUS](../roles.md#r-plus) and above |
| Sources | `apps/web/src/pages/will/steps/DetailsStep.tsx:64`, `packages/shared/src/will/validation/rules.ts:58` |

<a id="s-will-006"></a>
### If they die before you, their gifts go to
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
| Who can change | [R-PLUS](../roles.md#r-plus) and above |
| Sources | `apps/web/src/pages/will/steps/PersonForm.tsx:60`, `packages/shared/src/will/validation/rules.ts:122` |

<a id="s-will-004"></a>
### Ownership
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
| Who can change | [R-PLUS](../roles.md#r-plus) and above |
| Sources | `apps/web/src/pages/will/steps/EstateStep.tsx:59`, `packages/shared/src/will/validation/rules.ts:175` |

<a id="s-will-005"></a>
### Include / Exclude
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
| Who can change | [R-PLUS](../roles.md#r-plus) and above |
| Sources | `apps/web/src/pages/will/steps/EstateStep.tsx:89`, `packages/shared/src/will/validation/rules.ts:222` |

<a id="s-will-003"></a>
### How long must someone outlive you to inherit?
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
| Who can change | [R-PLUS](../roles.md#r-plus) and above |
| Sources | `apps/web/src/pages/will/steps/AllocationStep.tsx:242`, `packages/shared/src/will/schema.ts:42` |
