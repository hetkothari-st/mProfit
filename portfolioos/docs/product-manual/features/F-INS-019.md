---
id: F-INS-019
title: "Coverage check"
module: "Insurance"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-INS-011]
related: [F-GOAL-001, F-INC-001, F-INC-002, F-INS-002]
---

[← Insurance](../modules/insurance.md) · [Index](../INDEX.md)

# Coverage check

`F-INS-019` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Answers "Are you covered enough, and where are the gaps?" for four areas — **Life cover**, **Health cover**, **Vehicles**, **Home** — each with a verdict (**Covered**, **Short**, **Missing**, **Nothing to cover**, **Needs your figures**, or **Worth a look** for home), an explanation and a next step. Every figure is seeded from your data and editable; edits recompute on the spot and are not saved.

**Why it exists:** Stated in the page header: "Worked out from what you've recorded — change any figure below and the answer updates."

**Where to find it:** **Asset Classes → Insurance → Coverage check** (route `/insurance/coverage`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Open **Coverage check**. Read the summary and **Also worth a look**.
2. In **Life cover**, adjust **Yearly income**, **Yearly household expenses**, **Years your family would need support**, **Loans outstanding**, the goals to fund and whether to count **Savings and deposits** and **Other investments**.
3. In **Health cover**, adjust **Health cover to compare against** and answer **Do your parents rely on you for their medical bills?** (**Yes**, **No**, **Not sure**).
4. Click a next step to add a policy or go to the linked page. **Use my recorded figures** resets your edits.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Use my recorded figures** | Button | Discards edits | Shown after an edit |
| **Policies** | Link | Back to `/insurance` | Never |
| Next-step buttons (for example **Add your income**, **Add its motor policy**) | Button/link | Opens **Add a policy** or a page | Per verdict |
| **Try again** | Button | Reloads after an error | Shown on error |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Money fields | Text | No | Digits only | From your data | "Enter an amount in rupees using digits only, like 1200000." |
| **Years your family would need support** | Number | No | 0–60 | 20 | "Enter a number of years from 0 to 60." |
| **Health cover to compare against** | Text | No | Digits | ₹10,00,000 | as money fields |

**Settings and toggles here:** [S-INS-011](../settings/insurance.md#s-ins-011) Coverage assumptions (not saved).

**Results:** None saved. Adding a policy from a next step refreshes the check.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load your coverage. Check your connection and try again." | Request failed | **Try again** |
| Life verdict **Needs your figures** | No income, expenses, loans or goals | Add income ([F-INC-002](F-INC-002.md)) or type figures |

**Limitations:** Edits are lost when you leave the page. **Add policy** next steps open an empty **Add a policy** form even when the step names a policy type. Rules of thumb (10× income, ₹10 lakh health benchmark) are marked as such and are not advice.

**How it works:** `GET /api/insurance/coverage` returns facts — active income × 12, estimated spending, loans outstanding, liquid and other investments, life and health cover, goals with amount still to fund, health policies, vehicles with registration insurance expiry and linked motor policy, properties, home policies — and seeded defaults (support years 20, health benchmark ₹10,00,000, child-education goals ticked, both savings boxes ticked, parents "Not sure"). Life need = (expenses, or income, × support years) + loans + ticked goals − counted savings − counted investments, floored at 0; gap = need − life cover. The rule-of-thumb figure is 10 × yearly income.

**Related features:** [F-INS-002](F-INS-002.md), [F-INC-001](F-INC-001.md), [F-GOAL-001](F-GOAL-001.md), [D-INS-004](../dependencies.md#d-ins-004).

**Sources:** `apps/web/src/pages/insurance/CoveragePage.tsx:37`, `apps/web/src/pages/insurance/CoveragePage.tsx:53`, `apps/web/src/components/insurance/coverage/verdict.ts:4`, `apps/web/src/components/insurance/coverage/LifeCoverCard.tsx:78`, `apps/web/src/components/insurance/coverage/fields.tsx:86`, `packages/shared/src/insurance/coverage.ts:47`, `packages/shared/src/insurance/coverage.ts:54`, `packages/shared/src/insurance/coverage.ts:293`, `packages/shared/src/insurance/coverage.ts:310`, `packages/api/src/services/insurance/insuranceCoverage.service.ts:4`
