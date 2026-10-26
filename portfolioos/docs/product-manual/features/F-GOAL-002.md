---
id: F-GOAL-002
title: "Create or edit a goal"
module: "Goals"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-GOAL-001, S-GOAL-002, S-GOAL-003, S-GOAL-004, S-GOAL-005, S-GOAL-006]
related: [F-GOAL-001]
---

[← Goals](../modules/goals.md) · [Index](../INDEX.md)

# Create or edit a goal

`F-GOAL-002` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** **Create goal** (or **Edit goal**) sets name, category, priority, target and initial amounts, target date, status (edit only), inflation rate, expected return, linked portfolios and notes. **Quick start** buttons fill four templates: **Retirement at 60** (₹5 crore, 6% / 12%), **Child's higher education** (₹50 lakh, 8% / 11%), **Emergency fund (6 months)** (₹6 lakh, 6% / 7%), **FIRE corpus (25× expenses)** (₹3 crore, 6% / 12%).

**Why it exists:** Empty-state text: "Set a target amount and date, link contributing portfolios, and watch progress accrue."

**Where to find it:** **Planning → Goals → New goal**, or **Edit** on a card.

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) per the manager's plan.

**Steps**
1. Click **New goal**. **Create goal** opens with category **Custom**, priority **Medium**, initial amount 0, inflation 0.06, expected return 0.12 and a target date 5 years from today.
2. Optionally click a **Quick start** template.
3. Fill **Name**, **Target amount (₹)**, **Target date**; adjust the rest; tick **Linked portfolios**.
4. Click **Create** (or **Save**). The toast "Goal created" / "Goal updated" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Quick start** template buttons | Buttons | Fill name, category, priority, target, rates | Create only |
| **Linked portfolios** checkboxes | Checkboxes | Choose portfolios counted | "No portfolios yet — create one first." when none |
| **Cancel** / **Create** / **Save** | Buttons | Close / save | Save disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Name** | Text | Yes | 1–200 | Empty | "Name required" |
| **Category** | Select (9) | No | — | Custom | — |
| **Priority** | Select: High, Medium, Low | No | — | Medium | — |
| **Target amount (₹)** | Number | Yes | > 0 | Empty | "Target amount required" |
| **Initial amount (₹)** | Number | No | ≥ 0 | 0 | — |
| **Target date** | Date | Yes | YYYY-MM-DD | Today + 5 years | "Target date required" |
| **Status** | Select: Active, Achieved, Paused, Abandoned | No | Edit only | Current | — |
| **Inflation rate (decimal)** | Number | No | Fraction (0.06 = 6%), below 10 | 0.06 | "Validation failed" (server) |
| **Expected return (decimal)** | Number | No | Fraction, below 10 | 0.12 | "Validation failed" (server) |
| **Notes** | Text area | No | Up to 4000 | Empty | — |

**Settings and toggles here:** [S-GOAL-001](../settings/goals.md#s-goal-001) **Category** (Emergency fund changes what counts); [S-GOAL-002](../settings/goals.md#s-goal-002) **Priority**; [S-GOAL-003](../settings/goals.md#s-goal-003) **Status**; [S-GOAL-004](../settings/goals.md#s-goal-004) **Inflation rate**; [S-GOAL-005](../settings/goals.md#s-goal-005) **Expected return** (drives **Off-track**); [S-GOAL-006](../settings/goals.md#s-goal-006) **Linked portfolios**.

**Results:** The goal is saved and the list recomputes. Setting **Achieved** stamps the achieved date.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This feature requires the PLUS plan or higher" | Free plan | Upgrade |
| "Validation failed" | A rate of 10 or more, or a bad amount | Enter rates as fractions |

**Limitations:** On the Free plan the **New goal** button still opens the form, and saving fails with "This feature requires the PLUS plan or higher". Rates are entered as fractions, not percentages. Every save of an **Achieved** goal re-stamps the achieved date. Linked portfolios you no longer own are silently ignored.

**How it works:** `POST /api/goals` / `PATCH /api/goals/:id`. The start date is set to today on creation.

**Related features:** [F-GOAL-001](F-GOAL-001.md).

**Sources:** `apps/web/src/pages/goals/GoalDialog.tsx:41`, `apps/web/src/pages/goals/GoalDialog.tsx:128`, `apps/web/src/pages/goals/GoalDialog.tsx:272`, `apps/web/src/pages/goals/GoalDialog.tsx:303`, `packages/api/src/controllers/goals.controller.ts:23`, `packages/api/src/services/goals/goals.service.ts:79`, `packages/api/src/services/goals/goals.service.ts:115`
