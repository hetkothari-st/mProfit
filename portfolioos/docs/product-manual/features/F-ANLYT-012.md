---
id: F-ANLYT-012
title: "Risk: swings, worst fall, return correlation"
module: "Analytics"
status: Live
roles: "R-FREE and up; R-MANAGER"
settings: [S-ANLYT-001, S-ANLYT-002]
related: [F-ANLYT-001]
---

[← Analytics](../modules/analytics.md) · [Index](../INDEX.md)

# Risk: swings, worst fall, return correlation

`F-ANLYT-012` · Live · Roles: [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager)

**What it does:** Cards **How much it swings** (annualised volatility from month-to-month value changes) and **Worst fall** (largest peak-to-trough fall in the period); grid **Return correlation by asset class** (−1 to +1 between pairs of up to 8 largest classes with price history), with "Not shown — no price history: …".

**Why it exists:** Shows how bumpy the ride is and how diversified your asset classes really are. From info text. Sharpe and beta were removed because they are distorted by money you add (code comment).

**Where to find it:** **Analytics → Detail**.

**Who can use it:** [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager).

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "i" buttons | Popovers | Definitions | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-ANLYT-001](../settings/analytics.md#s-anlyt-001), [S-ANLYT-002](../settings/analytics.md#s-anlyt-002).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Needs at least two asset classes with price history and 6+ months of data in the selected period." | Not enough data | Choose a longer period |

**Limitations:** Volatility and worst fall use total value, so deposits and withdrawals look like swings. Deposits and other unpriced classes are not in the correlation.

**How it works:** `GET /api/analytics/risk?portfolioId&period` — one monthly valuation pass feeds volatility, max drawdown and class correlation (Pearson over monthly price returns, minimum observations from the server, 6 by default on screen). The NIFTY fetch for beta is capped at 6 seconds.

**Related features:** [F-ANLYT-001](F-ANLYT-001.md).

**Sources:** `apps/web/src/pages/analytics/widgets/RiskWidget.tsx:27`, `apps/web/src/pages/analytics/widgets/RiskWidget.tsx:98`, `apps/web/src/pages/analytics/widgets/RiskWidget.tsx:115`, `packages/api/src/controllers/analytics.controller.ts:87`, `packages/api/src/services/analytics/analytics.risk.ts:108`, `packages/api/src/services/analytics/analytics.risk.ts:264`, `apps/web/src/pages/analytics/infoCopy.ts:150`
