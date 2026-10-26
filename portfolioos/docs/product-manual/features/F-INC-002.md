---
id: F-INC-002
title: "Add or edit income"
module: "Income"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-INC-001, S-INC-002]
related: [F-INC-001]
---

[← Income](../modules/income.md) · [Index](../INDEX.md)

# Add or edit income

`F-INC-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** **Add income** (or **Edit income**) records type, source, monthly amount, typical credit day, active flag and notes. For **Rental**, **Interest / Dividend** and **Trading**, a **Fetch from your data** box offers suggestions you can click to fill the form.

**Why it exists:** Empty-state text: "Add your salary, business, trading, or any other income stream so Health Score and other features can use a real number instead of guessing from bank emails."

**Where to find it:** **Overview → Income → Add income**, or the pencil on a card.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Click **Add income**. The dialog opens with type **Salary**, credit day 1 and **Currently active** ticked.
2. Pick **Income type**; the source label changes (**Employer**, **Business name**, **Broker / platform**, **Client / platform**, **Property**, **Bank / fund**, **Asset / broker**, **Source**).
3. For Rental, Interest / Dividend or Trading, click a suggestion to fill source, amount (and day), or "Nothing found yet — enter it manually below."
4. Fill **Monthly amount (₹)** ("For irregular income (trading, freelance), use your recent average.") and **Typical credit day**.
5. Click **Add** (or **Save**). The toast "Income added" / "Income updated" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Suggestion rows | Buttons | Fill the form | Only for Rental, Interest / Dividend, Trading |
| **Currently active** | Checkbox | Active flag | — |
| **Cancel** / **Add** / **Save** | Buttons | Close / save | Save disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Income type** | Select (8) | No | — | Salary | — |
| Source (label per type) | Text | Yes | 1–200 | Empty | "<label> required" (for example "Employer required") |
| **Monthly amount (₹)** | Number | Yes | > 0 | Empty | "Monthly amount required" |
| **Typical credit day** | Number | No | 1–31 | 1 | "Pay day must be between 1 and 31" |
| **Notes** | Text area | No | Up to 2000 | Empty | — |

**Settings and toggles here:** [S-INC-001](../settings/income.md#s-inc-001) **Income type**; [S-INC-002](../settings/income.md#s-inc-002) **Currently active**.

**Results:** The entry is saved; Health Score refreshes.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Pay day must be between 1 and 31" | The credit-day box is empty or outside 1–31 | Type a day from 1 to 31 |
| "Monthly amount must be positive" (server) | Zero amount sent through the API | Enter a positive amount |

**Limitations:** Suggestions: Rental — one per active tenancy at its rent and due day; Interest / Dividend — 12-month average of dividend and interest transactions; Trading — 12-month average of realised F&O P&L (only when positive). The trading suggestion note says it varies.

**How it works:** `POST /api/income` / `PATCH /api/income/:id`; suggestions `GET /api/income/suggestions?type=`.

**Related features:** [F-INC-001](F-INC-001.md), [D-INC-001](../dependencies.md#d-inc-001), [D-INC-002](../dependencies.md#d-inc-002).

**Sources:** `apps/web/src/pages/income/IncomeDialog.tsx:29`, `apps/web/src/pages/income/IncomeDialog.tsx:63`, `apps/web/src/pages/income/IncomeDialog.tsx:104`, `apps/web/src/pages/income/incomeTypeMeta.ts:15`, `packages/api/src/controllers/income.controller.ts:14`, `packages/api/src/services/income/income.service.ts:135`, `packages/api/src/services/income/income.service.ts:154`, `packages/api/src/services/income/income.service.ts:180`
