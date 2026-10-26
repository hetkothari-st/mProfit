---
id: F-ANLYT-001
title: "Analytics page controls"
module: "Analytics"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER"
settings: [S-ANLYT-001, S-ANLYT-002, S-ANLYT-003]
related: [F-ANLYT-002, F-ANLYT-013]
---

[← Analytics](../modules/analytics.md) · [Index](../INDEX.md)

# Analytics page controls

`F-ANLYT-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager)

**What it does:** A portfolio selector (**All portfolios (N)** or one portfolio), period pills **1M**, **3M**, **6M**, **1Y**, **3Y**, **5Y**, **All**, and two views, **Overview** and **Detail**. With no portfolios it shows "No portfolios yet — Create a portfolio and add transactions to unlock analytics." with **Get started**.

**Why it exists:** Lets you scope the analysis to one book and a time window. The view is in the URL "so a view can be linked and reloaded into" (code comment).

**Where to find it:** **Overview → Analytics** (route `/analytics`; `/analytics?view=detail` opens Detail).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (AI Insights needs [R-PLUS](../roles.md#r-plus)); [R-MANAGER](../roles.md#r-manager) (managed person's data).

**Steps**
1. Open **Analytics**. Overview loads for all portfolios and 1Y.
2. Choose a portfolio and/or period. Cards reload (loading placeholders show meanwhile).
3. Click **Detail** for the second set of charts; **Overview** to go back.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Portfolio selector | Select | [S-ANLYT-001](../settings/analytics.md#s-anlyt-001) | — |
| **1M** … **All** | Pills | [S-ANLYT-002](../settings/analytics.md#s-anlyt-002) | — |
| **Overview** / **Detail** | Tabs | [S-ANLYT-003](../settings/analytics.md#s-anlyt-003) | — |
| **Get started** | Link | Opens `/onboarding` | Only with no portfolios |
| "i" buttons | Popovers | Explain each card | — |

**Fields and rules:** Not applicable — selectors only.

**Settings and toggles here:** [S-ANLYT-001](../settings/analytics.md#s-anlyt-001) **Portfolio** — all or one; [S-ANLYT-002](../settings/analytics.md#s-anlyt-002) **Period** — 30, 90, 180, 365, 1095, 1825 days or all history, used only by cards that say "Follows the period selected at the top."; [S-ANLYT-003](../settings/analytics.md#s-anlyt-003) **View** — kept in the URL. Portfolio and period reset on reload.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Placeholders never fill | The snapshot request failed (no message is shown) | Reload; in family view choose **All portfolios** |

**Limitations:** In a family view the selector also lists other members' portfolios, but the API accepts only your own (403) — choose **All portfolios** (see DOCUMENTATION_GAPS.md). The data is cached in the browser for 5 minutes (risk for 15).

**How it works:** One call `GET /api/analytics/snapshot?portfolioId&period` returns all cheap widgets; `GET /api/analytics/risk` is fetched only on **Detail**. Period values outside the list are rejected: "Invalid period "…". Use one of: 1M, 3M, 6M, 1Y, 3Y, 5Y, All".

**Related features:** [F-ANLYT-002](F-ANLYT-002.md) to [F-ANLYT-013](F-ANLYT-013.md), [D-ANLYT-001](../dependencies.md#d-anlyt-001).

**Sources:** `apps/web/src/pages/analytics/AnalyticsPage.tsx:27`, `apps/web/src/pages/analytics/AnalyticsPage.tsx:50`, `apps/web/src/pages/analytics/AnalyticsPage.tsx:57`, `apps/web/src/pages/analytics/AnalyticsPage.tsx:77`, `apps/web/src/pages/analytics/AnalyticsPage.tsx:97`, `apps/web/src/pages/analytics/AnalyticsPage.tsx:123`, `packages/api/src/controllers/analytics.controller.ts:52`, `packages/api/src/controllers/analytics.controller.ts:67`, `packages/api/src/services/analytics/analytics.service.ts:43`, `apps/web/src/App.tsx:166`
