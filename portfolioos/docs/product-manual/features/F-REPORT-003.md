---
id: F-REPORT-003
title: "Data checks banner and Fix now"
module: "Reports"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER"
settings: [S-REPORT-001]
related: [F-REPORT-017]
---

[← Reports](../modules/reports.md) · [Index](../INDEX.md)

# Data checks banner and Fix now

`F-REPORT-003` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager)

**What it does:** Above every tab except **Inbox imports**, a line says whether the reports can be trusted: "All data checks passed." with "Data as of: transactions up to … · prices up to …", or a warning/error panel listing what is missing, out of date or inconsistent, with links to fix each item and a **Fix now** button when stored holdings are out of step with transactions.

**Why it exists:** "Reports are computed live from stored data, so they are exactly as good as that data. This sits above every tab and says, in plain words, what is missing, out of date or inconsistent — instead of letting a report print a confident total over a gap" (code comment).

**Where to find it:** **Tools → Reports**, under the filter card.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) — ungated ("knowing whether your own figures are complete is not a paid feature"). [R-MANAGER](../roles.md#r-manager): checks the managed person's data.

**Steps**
1. Open Reports. "Checking your data…" shows while the checks run.
2. If the panel is amber or red, click **See N issues**. Each issue lists up to 20 examples, then "…and N more".
3. For a sale with no purchase behind it, click **Add purchase** (opens the transaction form pre-filled) or **Review N matching purchase(s) from email** (opens the email review page).
4. If **Fix now** is shown, click it. A toast says "Rebuilt N holding(s) from your transactions" or "Everything already matched your transactions", and every report reloads.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **See N issue(s)** / **Hide details** | Toggle link | Opens/closes the issue list | Hidden when all checks pass |
| **Fix now** | Button | Rebuilds stored holdings and capital gains for the selected portfolio(s) | Shown only when an "out of sync" issue exists; disabled while running |
| **Add purchase** | Link | Opens `/transactions` with the missing purchase pre-filled (asset, quantity, "on or before" date) | Per item, when no matching email purchase is waiting |
| **Review N matching purchase(s) from email** | Link | Opens `/ingestion` | Per item, when matching email events are waiting |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None (follows [S-REPORT-001](../settings/reports.md#s-report-001) **Portfolio**).

**Results:** **Fix now** rewrites the stored holdings and capital-gain rows of the portfolio(s) in scope from the transactions; transactions themselves are never changed.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Data checks could not be run, so these reports have not been verified." | The check request failed | Reload the page; the reports still show |
| "Some figures in these reports are incomplete or wrong." | At least one error-level issue | Open the details and fix the items |
| "These reports may not include your latest data." | Only warning-level issues | Optional: finish imports, review email events |
| "Could not rebuild holdings" (toast) | **Fix now** failed | Try again; the nightly job ([F-REPORT-017](F-REPORT-017.md)) also repairs |

**Limitations:** The app never fills in a missing purchase by itself ("a guessed price would put a wrong figure in the tax reports"). Account-wide issues are marked "— across all your portfolios" even when one portfolio is selected.

**How it works:** `GET /api/reports/data-quality?portfolioId=…` (cached in the browser for 60 seconds) runs these checks, in this order: **OVERSOLD** (error) — sales of more units than were bought, booked at zero cost so gains are overstated; **GAINS_NEED_REVIEW** (warning) — gain rows computed with a missing input (for example no CII year); **MISSING_PRICE** (error) — market-priced holdings with no price, valued at cost; **STALE_PRICE** (warning) — price older than 5 days (2 days for crypto); deposits, PF, NPS, insurance, property, bonds and other non-market classes are never stale; **SUSPICIOUS_PRICE** (warning) — latest price moved more than 40% (stocks) or 20% (fund NAVs) from the previous one with no split/bonus/merger within 5 days; **TRADE_PRICE_OFF_MARKET** (warning) — a buy or sell more than 25% away from that day's close/NAV (last 365 days); **HOLDINGS_OUT_OF_SYNC** (error) — stored holding differs from a replay of transactions (tolerance 0.000001 units, ₹0.0001 cost); **STATEMENT_MISMATCH** (error, account) — units on your latest statement differ from transactions; **IMPORTS_NOT_FINISHED**, **EVENTS_AWAITING_REVIEW**, **UNRESOLVED_FAILURES** (warnings, account). **Fix now** calls `POST /api/reports/data-quality/repair`, which re-runs the integrity check with repair for each portfolio in scope and returns the counts. Every downloaded file from Reports also carries "Data as of" and "Data checks" lines from the same checks, or "Could not be run for this file".

**Related features:** [F-REPORT-017](F-REPORT-017.md) (nightly repair), [D-REPORT-001](../dependencies.md#d-report-001) (transaction form), [D-REPORT-002](../dependencies.md#d-report-002) (email review).

**Sources:** `apps/web/src/components/reports/DataQualityBanner.tsx:27`, `apps/web/src/components/reports/DataQualityBanner.tsx:34`, `apps/web/src/components/reports/DataQualityBanner.tsx:55`, `apps/web/src/components/reports/DataQualityBanner.tsx:79`, `apps/web/src/components/reports/DataQualityBanner.tsx:96`, `apps/web/src/components/reports/DataQualityBanner.tsx:143`, `apps/web/src/components/reports/DataQualityBanner.tsx:159`, `packages/api/src/routes/reports.routes.ts:100`, `packages/api/src/controllers/reports.controller.ts:340`, `packages/api/src/controllers/reports.controller.ts:362`, `packages/api/src/services/integrity/reportDataQuality.service.ts:196`, `packages/api/src/services/integrity/reportDataQuality.service.ts:291`, `packages/api/src/services/integrity/reportDataQuality.service.ts:443`, `packages/api/src/services/holdings/priceStaleness.ts:28`, `packages/api/src/services/integrity/storedDataIntegrity.service.ts:38`
