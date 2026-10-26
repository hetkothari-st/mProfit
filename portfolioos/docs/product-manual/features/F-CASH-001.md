---
id: F-CASH-001
title: "Scheduled cashflow forecast"
module: "Cash Activity"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-CASH-002]
---

[← Cash Activity](../modules/cash-activity.md) · [Index](../INDEX.md)

# Scheduled cashflow forecast

`F-CASH-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** The **Scheduled cashflow** card ("Forecast · next 12 months") shows **Expected inflows**, **Expected outflows** and **Net**, a monthly bar chart of inflows and outflows, "Negative cashflow month ahead" when any month nets below zero, and the next 6 **Upcoming events** (Loan EMI, Rent due, Premium, FD matures, RD matures).

**Why it exists:** Code comment: aggregates the next N months of scheduled inflows and outflows.

**Where to find it:** **Overview → Cash Activity**, top card.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps:** Not applicable — view only.

**Controls:** Chart tooltip on hover.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** None shown; the card is hidden if loading fails.

**Limitations:** Each insurance policy contributes only its next premium, so a monthly or quarterly premium appears once in 12 months. FD and RD maturities show the amount invested, not the maturity value. Rent shows the full expected amount even for a partly paid month. The chart can show a 13th month for an event exactly 12 months away.

**How it works:** `GET /api/cashflows/forecast?horizonMonths=12` (1–36 accepted). Events from today to today + 12 months: unpaid EMIs from each active loan's schedule; rent receipts expected, overdue or partial; the stored next premium due of active policies; FD/RD buy transactions maturing in range. Totals use decimal arithmetic.

**Related features:** [F-CASH-002](F-CASH-002.md), [D-CASH-002](../dependencies.md#d-cash-002).

**Sources:** `apps/web/src/pages/cashflows/CashflowForecastSection.tsx:25`, `apps/web/src/pages/cashflows/CashflowForecastSection.tsx:62`, `packages/api/src/services/analytics/cashflowForecast.service.ts:67`, `packages/api/src/services/analytics/cashflowForecast.service.ts:136`, `packages/api/src/services/analytics/cashflowForecast.service.ts:170`, `packages/api/src/controllers/cashflows.controller.ts:9`
