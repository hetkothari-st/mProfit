---
id: F-PORT-009
title: "Automatic corporate-action application"
module: "Portfolios"
status: Live
roles: "All users"
settings: []
related: [F-PORT-008, F-PORT-010, F-TXN-001]
---

[← Portfolios](../modules/portfolios.md) · [Index](../INDEX.md)

# Automatic corporate-action application

`F-PORT-009` · Live · Roles: All users

**What it does:** After the daily 20:00 corporate-action download, EveryPaisa adds stock splits, bonus issues and cash dividends to the affected stock holdings as transactions, so quantities and income stay right.

**Why it exists:** Code comment: "fold newly-fetched splits/bonuses into holdings (idempotent)".

**Where to find it:** Results appear as SPLIT, BONUS and DIVIDEND PAYOUT rows on **Transactions** and in holdings quantities.

**Who can use it:** Automatic for every portfolio with stock holdings.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** None.

**Settings and toggles here:** None (runs inside the corporate-actions price job).

**Results:** For each stock holding and each action whose ex-date has passed, based on the quantity held before the ex-date: SPLIT adds quantity × (ratio − 1) at no cost; BONUS adds quantity × ratio at zero cost; DIVIDEND adds a dividend payout of amount per share × quantity (no change to quantity or cost). Holdings are then recalculated.

**Errors and troubleshooting:** None visible.

**Limitations:** Mergers, demergers, rights issues and buybacks are not applied automatically (they need your choice or data the feed lacks). Only holdings linked to a listed stock are processed. An action is applied once per holding; an identical row already on the books is not added again.

**How it works:** Each created row carries a fixed identity (`ca:<action>:<holding>`) and is also checked against existing identical transactions, so re-runs add nothing.

**Related features:** [F-PORT-008](F-PORT-008.md), [F-PORT-010](F-PORT-010.md), [F-TXN-001](F-TXN-001.md).

**Sources:** `packages/api/src/jobs/priceJobs.ts:209`, `packages/api/src/jobs/corporateActionApplyJob.ts:10`, `packages/api/src/services/corporateActions/corporateActionApply.service.ts:14`, `packages/api/src/services/corporateActions/corporateActionApply.service.ts:48`, `packages/api/src/services/corporateActions/corporateActionApply.service.ts:63`
