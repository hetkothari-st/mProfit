[Index](../INDEX.md)

# Settings — Insurance

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-ins-001"></a>
### Type
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Insurance → Add policy / Edit** |
| Purpose | Kind of cover: Term life, Whole life, ULIP, Endowment, Health, Motor, Home, Travel, Personal accident |
| Default | Term life (source: `apps/web/src/components/insurance/PolicyFormDialog.tsx:52`) |
| Values | Life types count in **Life cover**, the nominee warning and section 123; Health in **Health cover**, section 126 and TPA fields; whole life/endowment/ULIP get **Surrender value**; life, health and personal accident allow critical illness; claim guides follow the type; default grace is 30/15 days only for life and health |
| Depends on | — |
| Persists | Yes — server |
| Stored in | InsurancePolicy.type |
| Backend effect | Recomputes the premium schedule and next due date when changed |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `packages/api/src/services/insurance/insurance.service.ts:34`, `packages/shared/src/insurance/premiumSchedule.ts:45` |

<a id="s-ins-002"></a>
### Paid (premium frequency)
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Insurance → Add policy / Edit** |
| Purpose | How often the premium is paid |
| Default | Yearly (source: `apps/web/src/components/insurance/PolicyFormDialog.tsx:57`) |
| Values | Monthly, Quarterly, Half-yearly, Yearly: due every 1/3/6/12 months from the start date; **Single premium**: no schedule, no grace, ₹0 in **Premiums a year**, hides **Next premium due** and **Grace period (days)** |
| Depends on | Start date |
| Persists | Yes — server |
| Stored in | InsurancePolicy.premiumFrequency |
| Backend effect | Schedule and reminders |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `packages/shared/src/insurance/premiumSchedule.ts:18` |

<a id="s-ins-003"></a>
### Next premium due
| Attribute | Value |
|---|---|
| Control type | Date |
| Location | **Insurance → Add policy / Edit** |
| Purpose | The first premium you want tracked; earlier premiums count as paid |
| Default | Blank → today on the server (source: `packages/api/src/services/insurance/insurance.service.ts:494`) |
| Values | A date: unpaid premiums before it become "untracked" |
| Depends on | Hidden for Single premium |
| Persists | Yes — server |
| Stored in | InsurancePolicy.premiumsTrackedFrom (and nextPremiumDue recomputed) |
| Backend effect | Moves the next due date and reminders; on edit sent only when changed |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/components/insurance/PolicyFormDialog.tsx:358` |

<a id="s-ins-004"></a>
### Grace period (days)
| Attribute | Value |
|---|---|
| Control type | Number text |
| Location | **Insurance → Add policy / Edit** |
| Purpose | Days to pay a missed premium before the policy lapses |
| Default | Blank = usual: 30 days (life/health, non-monthly), 15 days (monthly), none otherwise (source: `packages/shared/src/insurance/premiumSchedule.ts:89`) |
| Values | 0–90 days |
| Depends on | Hidden for Single premium |
| Persists | Yes — server |
| Stored in | InsurancePolicy.gracePeriodDays |
| Backend effect | Decides "In grace" vs "May have lapsed" and grace reminders |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `packages/api/src/controllers/insurance.controller.ts:80` |

<a id="s-ins-005"></a>
### Critical illness cover
| Attribute | Value |
|---|---|
| Control type | Select + optional amount |
| Location | **Insurance → Add policy / Edit** |
| Purpose | Records whether the policy pays on a listed illness |
| Default | Not recorded (source: `apps/web/src/components/insurance/PolicyFormDialog.tsx:62`) |
| Values | Not recorded / "Yes — included or added as a rider" (optional amount) / No |
| Depends on | Only life, health and personal-accident types |
| Persists | Yes — server |
| Stored in | InsurancePolicy.criticalIllnessCover, criticalIllnessSumAssured |
| Backend effect | Shown on card and policy page; cleared for other types |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `packages/api/src/services/insurance/insurance.service.ts:340` |

<a id="s-ins-006"></a>
### Find my insurance documents in Gmail (Turn on / Turn off)
| Attribute | Value |
|---|---|
| Control type | Toggle button per Gmail account |
| Location | **Insurance → Find my insurance documents in Gmail** |
| Purpose | Permission to search that inbox for insurance PDFs |
| Default | Off (source: `packages/api/src/services/insurance/insuranceGmailFetch.service.ts:4`) |
| Values | On: first search looks back 3 years, then a nightly search at 05:30 IST, plus **Scan now**; Off: cancels running searches |
| Depends on | A connected Gmail account |
| Persists | Yes — server |
| Stored in | MailboxAccount.insuranceFetchEnabled, insuranceFetchConsentAt |
| Backend effect | Starts INSURANCE Gmail scan jobs; document reading uses the AI model and the monthly reading budget; every change audit-logged |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) |
| Sources | `packages/api/src/services/insurance/insuranceGmailFetch.service.ts:58`, `packages/api/src/jobs/insuranceJobs.ts:18` |

<a id="s-ins-007"></a>
### Remember it (encrypted) for future PDFs
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | **Insurance → Insurance documents from Gmail → Password protected** |
| Purpose | Save the PDF password so later PDFs open on their own |
| Default | On (source: `apps/web/src/components/insurance/InsuranceDocumentsCard.tsx:59`) |
| Values | On: stored encrypted; Off: used once |
| Depends on | — |
| Persists | Yes — server (when on) |
| Stored in | The user's encrypted document-password store |
| Backend effect | Tries the password on every other locked document |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) |
| Sources | `packages/api/src/controllers/insurance.controller.ts:285` |

<a id="s-ins-008"></a>
### Who the policy covers
| Attribute | Value |
|---|---|
| Control type | Select per health policy |
| Location | **Insurance → Tax on your premiums** |
| Purpose | Which section 126 limit the premium counts towards |
| Default | Not set (source: `apps/web/src/components/insurance/TaxSummaryCard.tsx:298`) |
| Values | Not set (not counted), You, spouse and children, Your parents |
| Depends on | Health policies only |
| Persists | Yes — server |
| Stored in | InsurancePolicy.taxBucket |
| Backend effect | Tax summary limits |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `packages/api/src/services/insurance/insurance.service.ts:319` |

<a id="s-ins-009"></a>
### Senior citizen (60+)
| Attribute | Value |
|---|---|
| Control type | Checkbox per health policy |
| Location | **Insurance → Tax on your premiums** |
| Purpose | Raise the limit to ₹50,000 for that bucket |
| Default | Unticked (source: `apps/web/src/components/insurance/TaxSummaryCard.tsx:305`) |
| Values | On: ₹50,000 limit for the bucket; Off: ₹25,000 |
| Depends on | Health policies only |
| Persists | Yes — server |
| Stored in | InsurancePolicy.seniorCitizen |
| Backend effect | Tax summary |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `packages/shared/src/insurance/tax.ts:53` |

<a id="s-ins-010"></a>
### Tax summary open state and financial year
| Attribute | Value |
|---|---|
| Control type | Fold toggle + select |
| Location | **Insurance → Tax on your premiums** |
| Purpose | Show or fold the card; pick the year |
| Default | Folded; current financial year (source: `apps/web/src/components/insurance/TaxSummaryCard.tsx:45`) |
| Values | Open/folded; current FY and the two before |
| Depends on | — |
| Persists | Open state: this device only; year: no |
| Stored in | localStorage `insurance.taxSummary.open` |
| Backend effect | None |
| Who can change | Anyone viewing |
| Sources | `apps/web/src/components/insurance/TaxSummaryCard.tsx:43` |

<a id="s-ins-011"></a>
### Coverage assumptions
| Attribute | Value |
|---|---|
| Control type | Money fields, years field, checkboxes, Yes/No/Not sure |
| Location | **Insurance → Coverage check** |
| Purpose | Figures behind the life and health verdicts |
| Default | Seeded from your data: income × 12, expenses × 12, support 20 years, loans, child-education goals ticked, savings and investments counted, health benchmark ₹10,00,000, parents "Not sure" (source: `packages/shared/src/insurance/coverage.ts:293`) |
| Values | Change any; verdicts recompute instantly |
| Depends on | — |
| Persists | No — lost when you leave; **Use my recorded figures** resets |
| Stored in | Page state only |
| Backend effect | None |
| Who can change | Anyone viewing |
| Sources | `apps/web/src/pages/insurance/CoveragePage.tsx:43` |

<a id="s-ins-012"></a>
### Under 18
| Attribute | Value |
|---|---|
| Control type | Checkbox per nominee |
| Location | **Insurance → policy → Nominees → Add/Edit** |
| Purpose | Marks a minor nominee who needs an appointee |
| Default | Unticked (source: `apps/web/src/components/insurance/NomineesCard.tsx:163`) |
| Values | On: **Appointee** required, **Appointee's relation** optional; Off: appointee cleared |
| Depends on | — |
| Persists | Yes — server |
| Stored in | InsurancePolicy.nominees[].isMinor |
| Backend effect | Server requires an appointee |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `packages/api/src/services/insurance/insurance.service.ts:264` |
