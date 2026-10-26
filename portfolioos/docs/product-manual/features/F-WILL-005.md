---
id: F-WILL-005
title: "Step 2: Your details"
module: "Will Maker"
status: Live
roles: "R-PLUS+"
settings: [S-WILL-001, S-WILL-002]
related: [F-WILL-001, F-WILL-004, F-WILL-010]
---

[← Will Maker](../modules/will-maker.md) · [Index](../INDEX.md)

# Step 2: Your details

`F-WILL-005` · Live · Roles: [R-PLUS](../roles.md#r-plus)+

**What it does:** Collects your identity and family situation: full legal name, how you are described ("Son of …"), date of birth, country whose law applies, religion / personal law, address, marital status, children and dependents.

**Why it exists:** Side panel "Why we ask": "Your religion decides which succession law applies." "Marriage and children decide who your family is in law, and whether a guardian is needed."

**Where to find it:** Wizard step **Your details** (`/will/:id/details`).

**Who can use it:** Same as [F-WILL-001](F-WILL-001.md).

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

**Settings and toggles here:** [S-WILL-001](../settings/will-maker.md#s-will-001) **Country whose law applies**; [S-WILL-002](../settings/will-maker.md#s-will-002) **Religion / personal law**.

**Results:** Saved to the draft; blockers stop generation.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Foreign-law or Muslim-law notice | Unsupported law | Will Maker cannot produce this will; consult an advocate |

**Limitations:** Only wills under Indian law and non-Muslim personal law can be generated.

**How it works:** Saved via the `details` section; checked by rules JURISDICTION_INDIA_ONLY, MUSLIM_LAW_UNSUPPORTED, REQUIRED_FIELDS, TESTATOR_ADULT and INVALID_DATE (all blockers on step 2).

**Related features:** [F-WILL-004](F-WILL-004.md), [F-WILL-010](F-WILL-010.md).

**Sources:** `apps/web/src/pages/will/steps/DetailsStep.tsx:19`, `apps/web/src/pages/will/steps/DetailsStep.tsx:63`, `apps/web/src/pages/will/steps/DetailsStep.tsx:70`, `apps/web/src/pages/will/parts.tsx:16`, `packages/shared/src/will/validation/rules.ts:54`, `packages/shared/src/will/validation/rules.ts:76`
