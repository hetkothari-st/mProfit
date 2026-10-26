[Index](../INDEX.md)

# Settings — Succession

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-succ-001"></a>
### Trigger
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Planning → Succession → When to share** |
| Purpose | What starts the release |
| Default | `INACTIVITY` (`apps/web/src/pages/legacy/LegacyPage.tsx:43`) |
| Values | **If I'm inactive** (inactivity, then 3 weekly reminders and a 7-day notice) · **On a date** (reminders 30/7/1 days before, release on the date) · **Whichever comes first** (both) |
| Depends on | Date triggers need [S-SUCC-003](../settings/succession.md#s-succ-003); test mode forces inactivity |
| Persists | Yes — server |
| Stored in | `LegacyPlan.triggerMode` |
| Backend effect | Drives the daily state machine ([F-SUCC-006](../features/F-SUCC-006.md)) |
| Who can change | [R-PLUS](../roles.md#r-plus) and above, while Off/On/Paused, with step-up |
| Sources | `apps/web/src/pages/legacy/LegacyPage.tsx:126`, `packages/api/src/services/legacy/stateMachine.ts:63` |

<a id="s-succ-002"></a>
### Inactive for (days)
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
| Who can change | [R-PLUS](../roles.md#r-plus) and above |
| Sources | `apps/web/src/pages/legacy/LegacyPage.tsx:147`, `packages/api/src/schemas/legacy.schemas.ts:8`, `packages/api/src/services/legacy/plan.service.ts:112` |

<a id="s-succ-003"></a>
### Release date
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
| Who can change | [R-PLUS](../roles.md#r-plus) and above |
| Sources | `apps/web/src/pages/legacy/LegacyPage.tsx:155`, `packages/api/src/services/legacy/plan.service.ts:42`, `packages/shared/src/legacy.ts:16` |

<a id="s-succ-004"></a>
### Personal letter
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
| Who can change | [R-PLUS](../roles.md#r-plus) and above |
| Sources | `apps/web/src/pages/legacy/LegacyPage.tsx:160`, `packages/api/src/services/legacy/plan.service.ts:111` |

<a id="s-succ-005"></a>
### Test mode: 1 minute (admins only)
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
| Who can change | [R-ADMIN](../roles.md#r-admin) |
| Sources | `apps/web/src/pages/legacy/LegacyPage.tsx:132`, `packages/api/src/services/legacy/plan.service.ts:91` |

<a id="s-succ-006"></a>
### Pause until
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

<a id="s-succ-007"></a>
### What they can see
| Attribute | Value |
|---|---|
| Control type | Checkboxes |
| Location | **Add nominee / Edit nominee** |
| Purpose | Categories released to this nominee |
| Default | Insurance + Bank accounts (`apps/web/src/pages/legacy/NomineeDialog.tsx:13`) |
| Values | Investments, Bank accounts, Insurance, Loans & credit cards, Property, Vehicles, Provident fund & NPS, Documents, Personal letter (≥ 1) |
| Depends on | Documents enables [S-SUCC-011](../settings/succession.md#s-succ-011) |
| Persists | Yes — server |
| Stored in | `LegacyNominee.categories` |
| Backend effect | Only these categories are loaded for the nominee view |
| Who can change | [R-PLUS](../roles.md#r-plus) and above |
| Sources | `packages/shared/src/legacy.ts:5`, `packages/api/src/services/legacy/view.service.ts:44` |

<a id="s-succ-008"></a>
### Show amounts
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
| Who can change | [R-PLUS](../roles.md#r-plus) and above |
| Sources | `apps/web/src/pages/legacy/NomineeDialog.tsx:87`, `packages/api/src/services/legacy/view.service.ts:121` |

<a id="s-succ-009"></a>
### Verifier
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
| Who can change | [R-PLUS](../roles.md#r-plus) and above |
| Sources | `apps/web/src/pages/legacy/NomineeDialog.tsx:91`, `packages/api/src/services/legacy/runner.service.ts:65`, `packages/api/src/services/legacy/plan.service.ts:163` |

<a id="s-succ-010"></a>
### Priority
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
| Who can change | [R-PLUS](../roles.md#r-plus) and above |
| Sources | `apps/web/src/pages/legacy/NomineeDialog.tsx:52`, `packages/api/src/services/legacy/runner.service.ts:22` |

<a id="s-succ-011"></a>
### Documents to share
| Attribute | Value |
|---|---|
| Control type | Checkboxes |
| Location | Nominee dialog (when Documents is ticked) |
| Purpose | Vault documents the nominee may download |
| Default | None |
| Values | ≤ 50 of your own documents; replaced wills only shown if already shared |
| Depends on | [S-SUCC-007](../settings/succession.md#s-succ-007) includes Documents |
| Persists | Yes — server |
| Stored in | `LegacyNominee.documentIds` |
| Backend effect | Unknown or non-owned ids are dropped |
| Who can change | [R-PLUS](../roles.md#r-plus) and above |
| Sources | `apps/web/src/pages/legacy/NomineeDialog.tsx:67`, `packages/api/src/services/legacy/plan.service.ts:124` |
