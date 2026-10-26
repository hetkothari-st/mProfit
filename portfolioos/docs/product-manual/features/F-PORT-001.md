---
id: F-PORT-001
title: "Portfolios list"
module: "Portfolios"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-PORT-002, F-PORT-004, F-PORT-006, F-PORT-007, F-SHELL-009]
---

[← Portfolios](../modules/portfolios.md) · [Index](../INDEX.md)

# Portfolios list

`F-PORT-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** The Portfolios page ("Allocation — Portfolios: Group holdings by goal, strategy, or account. Bundle multiple portfolios into a family group for a consolidated view.") shows your groups under **Family groups** (when any exist) and your portfolios under **Individual portfolios**. Each portfolio card shows its type, name (a star marks the default), description, currency, number of holdings and **Current value**, with **Edit** and **Inspect**. On plans with a limit, a badge reads "N of M portfolios used".

**Why it exists:** Inferred from the page text: separate long-term investments, trading and goal-based money, and see them together when needed.

**Where to find it:** **Overview → Portfolios** (route `/portfolios`); phone tab **Portfolios**.

**Who can use it:** [R-FREE](../roles.md#r-free) (1 portfolio), [R-PLUS](../roles.md#r-plus) and [R-FAMILY](../roles.md#r-family) (5), [R-PRO](../roles.md#r-pro) (unlimited). In family view the list also includes family-shared portfolios and other members' personal portfolios.

**Steps**
1. Open Portfolios. Cards load (grey placeholders first).
2. Click **Inspect** on a card to open it ([F-PORT-004](F-PORT-004.md)), or **Edit** to change it ([F-PORT-002](F-PORT-002.md)).
3. Click **New portfolio** or **New group** to create one.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "N of M portfolios used" | Badge | Shows usage against your plan | Hidden on Pro/Advisor |
| **New group** | Button | Opens the group dialog ([F-PORT-006](F-PORT-006.md)) | Disabled when you have no portfolios |
| **New portfolio** | Button | Opens the portfolio dialog | Disabled at your plan's limit (tooltip "Upgrade to add more portfolios") |
| "upgrade to add more" | Link | Opens `/pricing` | Shown only at the limit |
| **Create your first portfolio** | Button | Opens the portfolio dialog | Empty list only |
| **Edit** (portfolio card) | Button | Opens the portfolio dialog | — |
| **Inspect** (portfolio card) | Link | Opens `/portfolios/:id` | — |
| **Edit** / **Inspect** (group card) | Button / link | Edit group / open `/portfolio-groups/:id` | — |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| **New portfolio** is greyed out | You reached your plan's portfolio limit | Upgrade, or delete a portfolio |
| "No portfolios yet" | None created | **Create your first portfolio** |

**Limitations:** Current value shows "—" for a portfolio with no holdings. In family view the "N of M portfolios used" badge counts every portfolio in the list, including other members', while the server counts only portfolios you created — see DOCUMENTATION_GAPS.md. Groups are always yours only.

**How it works:** `GET /api/portfolios` returns portfolios with holding and transaction counts and current value (sum of holdings' current value, cost when unpriced), default first then oldest first. `GET /api/portfolio-groups` returns your groups.

**Related features:** [F-PORT-002](F-PORT-002.md), [F-PORT-004](F-PORT-004.md), [F-PORT-006](F-PORT-006.md), [F-PORT-007](F-PORT-007.md), [F-SHELL-009](F-SHELL-009.md).

**Sources:** `apps/web/src/pages/portfolios/PortfolioListPage.tsx:25`, `apps/web/src/pages/portfolios/PortfolioListPage.tsx:46`, `apps/web/src/pages/portfolios/PortfolioListPage.tsx:59`, `apps/web/src/pages/portfolios/PortfolioListPage.tsx:67`, `apps/web/src/pages/portfolios/PortfolioListPage.tsx:73`, `apps/web/src/pages/portfolios/PortfolioListPage.tsx:192`, `packages/api/src/services/holdings/portfolio.service.ts:85`, `packages/api/src/services/holdings/portfolio.service.ts:182`, `packages/shared/src/entitlements.ts:82`
