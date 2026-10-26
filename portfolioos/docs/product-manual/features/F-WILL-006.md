---
id: F-WILL-006
title: "Step 3: People & roles"
module: "Will Maker"
status: Live
roles: "R-PLUS+"
settings: [S-WILL-006]
related: [F-WILL-001, F-WILL-004, F-WILL-008, F-WILL-010]
---

[← Will Maker](../modules/will-maker.md) · [Index](../INDEX.md)

# Step 3: People & roles

`F-WILL-006` · Live · Roles: [R-PLUS](../roles.md#r-plus)+

**What it does:** Builds the list of people and organisations in your will and assigns the executor, back-up executor, guardian and back-up guardian. Tabs: **Beneficiaries**, **Executor**, **Guardian**, **Others** (charities and organisations). Family members on EveryPaisa are offered as one-click additions.

**Why it exists:** Tab text: "The executor collects your assets, pays your debts and shares out the rest as your will says."

**Where to find it:** Wizard step **People & roles** (`/will/:id/people`).

**Who can use it:** Same as [F-WILL-001](F-WILL-001.md).

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

**Settings and toggles here:** [S-WILL-006](../settings/will-maker.md#s-will-006) **If they die before you, their gifts go to** (back-up beneficiary).

**Results:** People and roles are saved; removing a person also removes their shares and gifts.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "An executor or guardian must be an adult individual, not an organisation or a child." | Ineligible choice | Choose an adult individual |
| "Add a date of birth for N people so we can tell whether anyone is under 18." | Warning | Add dates of birth |

**Limitations:** The family quick-pick reads your family memberships under row-level security; for contributors and viewers it probably lists nobody (see DOCUMENTATION_GAPS.md).

**How it works:** Saved as the `people` section (people + roles). `GET /api/will/people/suggestions` returns active members of your families (not you), with the relation mapped to a will relationship only when the relation was recorded against you.

**Related features:** [F-WILL-004](F-WILL-004.md), [F-WILL-008](F-WILL-008.md), [F-WILL-010](F-WILL-010.md).

**Sources:** `apps/web/src/pages/will/steps/PeopleStep.tsx:29`, `apps/web/src/pages/will/steps/PeopleStep.tsx:82`, `apps/web/src/pages/will/steps/PeopleStep.tsx:110`, `apps/web/src/pages/will/steps/PersonForm.tsx:10`, `apps/web/src/pages/will/parts.tsx:7`, `packages/api/src/services/will/will.service.ts:210`, `packages/shared/src/will/validation/rules.ts:89`
