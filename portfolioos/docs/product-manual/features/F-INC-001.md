---
id: F-INC-001
title: "Income list and total"
module: "Income"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-INC-002]
related: [F-INC-002, F-INC-003, F-INS-019]
---

[← Income](../modules/income.md) · [Index](../INDEX.md)

# Income list and total

`F-INC-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Shows **Total active monthly income** and cards in **Active** and **Inactive** sections, each with source name, type, **Inactive** badge, monthly amount ("/mo"), "Credited on day N" and notes.

**Why it exists:** Page description: "Salary, business, trading, freelance, rental, or any other recurring income. Used to score your financial health (investment rate, debt burden, insurance) and wherever your income matters."

**Where to find it:** **Overview → Income** (route `/income`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Open **Income**. With none: "No income entries yet" and **Add your first income**.
2. Use the pencil (title "Edit") or bin (title "Delete") on a card.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add income** / **Add your first income** | Button | Opens **Add income** | — |
| Pencil (title "Edit") | Button | Opens **Edit income** | — |
| Bin (title "Delete") | Button | Deletes immediately ([F-INC-003](F-INC-003.md)) | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-INC-002](../settings/income.md#s-inc-002) **Currently active** decides the section and the total.

**Results:** None.

**Errors and troubleshooting:** None specific.

**Limitations:** Amounts are monthly; there is no yearly or history view.

**How it works:** `GET /api/income` returns entries active first, then oldest first. The total adds active entries' monthly amounts.

**Related features:** [F-INC-002](F-INC-002.md), [F-INC-003](F-INC-003.md), [D-INC-001](../dependencies.md#d-inc-001), [F-INS-019](F-INS-019.md).

**Sources:** `apps/web/src/pages/income/IncomePage.tsx:16`, `apps/web/src/pages/income/IncomePage.tsx:85`, `apps/web/src/pages/income/IncomePage.tsx:169`, `packages/api/src/services/income/income.service.ts:59`, `packages/api/src/services/income/income.service.ts:113`
