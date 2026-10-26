---
id: F-PORT-007
title: "Portfolio group detail"
module: "Portfolios"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-PORT-004, F-PORT-006]
---

[← Portfolios](../modules/portfolios.md) · [Index](../INDEX.md)

# Portfolio group detail

`F-PORT-007` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Shows a group: "Members:" chips (each opens that portfolio), cards **Combined value**, **Invested**, **Unrealised P&L**, **Today's change**, and **Combined holdings** where the same asset in several member portfolios is merged into one row.

**Why it exists:** Inferred from behavior: see several portfolios as one.

**Where to find it:** **Portfolios → group card → Inspect** (route `/portfolio-groups/:id`).

**Who can use it:** The group's owner only.

**Steps**
1. Read the cards and table; click a member chip to open that portfolio.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Back to portfolios** | Link | Opens `/portfolios` | — |
| Member chips | Links | Open `/portfolios/:id` | Hidden when the group has no members |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No holdings in this group — Add member portfolios with holdings to see combined positions here." | Empty group or members without holdings | Edit the group |
| "Portfolio group not found" | Deleted or not yours | — |

**Limitations:** **Today's change** counts stocks only (unlike a single portfolio, which also counts funds, crypto and gold). There is no XIRR for groups. When a merged asset's members are priced differently, CMP shows the last member's price. P&L is blank if any member's holding lacks a price.

**How it works:** Summary and holdings are computed over all member portfolios' holdings; merged rows sum quantity, cost and value, with average cost = cost ÷ quantity.

**Related features:** [F-PORT-006](F-PORT-006.md), [F-PORT-004](F-PORT-004.md).

**Sources:** `apps/web/src/pages/portfolios/PortfolioGroupDetailPage.tsx:28`, `apps/web/src/pages/portfolios/PortfolioGroupDetailPage.tsx:71`, `apps/web/src/pages/portfolios/PortfolioGroupDetailPage.tsx:87`, `packages/api/src/services/holdings/portfolioGroup.service.ts:239`, `packages/api/src/services/holdings/portfolioGroup.service.ts:283`, `packages/api/src/services/holdings/portfolioGroup.service.ts:327`
