---
id: F-PORT-002
title: "Create or edit a portfolio"
module: "Portfolios"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-PORT-001, S-PORT-002, S-PORT-003]
related: [F-PORT-001, F-PORT-003, F-SHELL-009]
---

[← Portfolios](../modules/portfolios.md) · [Index](../INDEX.md)

# Create or edit a portfolio

`F-PORT-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** The dialog "Create a new portfolio" / "Edit portfolio" ("A portfolio groups holdings by strategy, goal, or account.") sets a portfolio's **Name**, **Description (optional)**, **Type**, **Currency** and **Set as default portfolio**.

**Why it exists:** Inferred from behavior: organise holdings your way.

**Where to find it:** **Portfolios → New portfolio**, or **Edit** on a card.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) within their portfolio limit. Editing: the portfolio's creator, or any active OWNER of the family a portfolio is shared into ([R-FAMOWNER](../roles.md#r-famowner)). While managing an account ([R-MANAGER](../roles.md#r-manager)) the limit is the manager's plan.

**Steps**
1. Click **New portfolio** (or **Edit**).
2. Fill **Name** and the optional fields.
3. Click **Create** (or **Save changes**). "Portfolio created" / "Portfolio updated" appears and the dialog closes.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Name** | Text | Portfolio name (placeholder "Long Term Equity") | — |
| **Description (optional)** | Text area | Notes | — |
| **Type** | Select | Investment, Trading, Goal-based, Strategy | — |
| **Currency** | Select | INR, USD, EUR, GBP | — |
| **Set as default portfolio** | Checkbox | Makes it the default | — |
| **Delete** | Button | [F-PORT-003](F-PORT-003.md) | Edit only |
| **Cancel** / **Create** / **Save changes** | Buttons | Close / save | Save disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Name | Text | Yes | 1–100 characters | Empty | "Name is required" |
| Description | Text | No | Up to 500 characters | Empty | Server validation message |
| Type | Select | Yes | INVESTMENT, TRADING, GOAL, STRATEGY | Investment | — |
| Currency | Select | Yes | 3 letters | INR | — |
| Set as default | Checkbox | No | — | Off | — |

**Settings and toggles here:** [S-PORT-001](../settings/portfolios.md#s-port-001) **Type** — a label shown on the card (no calculation uses it). [S-PORT-002](../settings/portfolios.md#s-port-002) **Currency** — the portfolio's currency code; groups only combine portfolios with the same currency. [S-PORT-003](../settings/portfolios.md#s-port-003) **Set as default portfolio** — on: this portfolio is listed first with a star and the previous default is cleared.

**Results:** The portfolio is saved and the lists refresh.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Your FREE plan allows 1 portfolio. Upgrade to PLUS for multiple." (similar for PLUS/FAMILY with their limit) | Plan limit reached | Upgrade or delete a portfolio |
| "Forbidden" or "Save failed" | You are not allowed to edit this portfolio | Ask its creator or a family owner |

**Limitations:** Amounts are still shown in rupees regardless of the portfolio currency. The setup wizard's portfolio creation never adds a second portfolio (it reuses your oldest).

**How it works:** `POST /api/portfolios` checks the count of portfolios you created against your plan (Free 1, Plus 5, Family 5, Pro/Advisor unlimited — placeholders in code) and creates the row; `PATCH /api/portfolios/:id` requires ownership. Setting a default clears the default flag on your other portfolios in the same transaction.

**Related features:** [F-PORT-001](F-PORT-001.md), [F-PORT-003](F-PORT-003.md), [F-SHELL-009](F-SHELL-009.md).

**Sources:** `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:25`, `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:76`, `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:134`, `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:143`, `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:156`, `packages/api/src/controllers/portfolio.controller.ts:23`, `packages/api/src/controllers/portfolio.controller.ts:55`, `packages/api/src/lib/planLimits.ts:11`, `packages/api/src/services/holdings/portfolio.service.ts:219`, `packages/api/src/services/holdings/portfolio.service.ts:310`, `packages/api/src/services/holdings/portfolio.service.ts:339`
