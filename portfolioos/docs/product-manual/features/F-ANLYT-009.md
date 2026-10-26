---
id: F-ANLYT-009
title: "Capital gains by FY and Income by month"
module: "Analytics"
status: Live
roles: "R-FREE and up; R-MANAGER"
settings: [S-ANLYT-001, S-ANLYT-002]
related: [F-REPORT-004, F-REPORT-007]
---

[← Analytics](../modules/analytics.md) · [Index](../INDEX.md)

# Capital gains by FY and Income by month

`F-ANLYT-009` · Live · Roles: [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager)

**What it does:** On **Detail**: **Capital gains by FY** — grouped bars Intraday, STCG, LTCG for the last 6 financial years; **Income by month** — stacked bars Dividend, Interest, Maturity for up to the last 12 months, including interest accrued on fixed deposits, NSC, RD and post-office schemes.

**Why it exists:** Trends in realised gains and income. From info text.

**Where to find it:** **Analytics → Detail**.

**Who can use it:** [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager).

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Chart tooltips | Hover | Exact amounts | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-ANLYT-001](../settings/analytics.md#s-anlyt-001); [S-ANLYT-002](../settings/analytics.md#s-anlyt-002) (income chart only).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No realised gains" / "No income recorded" | No data | — |

**Limitations:** Gains chart: last 6 FYs only.

**How it works:** Snapshot `cgByFy` and `incomeTrend` (period days).

**Related features:** [F-REPORT-004](F-REPORT-004.md), [F-REPORT-007](F-REPORT-007.md).

**Sources:** `apps/web/src/pages/analytics/widgets/TaxWidgets.tsx:25`, `apps/web/src/pages/analytics/widgets/TaxWidgets.tsx:62`, `packages/api/src/services/analytics/analytics.service.ts:473`, `packages/api/src/services/analytics/analytics.service.ts:581`, `apps/web/src/pages/analytics/infoCopy.ts:127`
