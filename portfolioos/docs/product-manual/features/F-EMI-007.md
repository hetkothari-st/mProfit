---
id: F-EMI-007
title: "Live rates"
module: "EMI Calculator"
status: Live
roles: "All signed-in"
settings: [S-EMI-011]
related: [F-EMI-001, F-EMI-010, F-LOAN-010]
---

[← EMI Calculator](../modules/emi-calculator.md) · [Index](../INDEX.md)

# Live rates

`F-EMI-007` · Live · Roles: All signed-in

**What it does:** The **Live rates** tab lists indicative published rates by lender for one **Loan type** (Home, Car, Two-wheeler, Personal, Education, Gold, Loan against property, Loan against securities, Business), lowest first: **Lender**, **Rate (% p.a.)** ("from X%" or "X% - Y%"), **Basis** (Repo-linked, MCLR, Fixed, Other), **As of** (with "w.e.f." date and a **Stale** badge) and a link to the lender's rates page. The lowest non-stale row is highlighted **Lowest**. A line above shows the RBI repo rate and its last change. **Use this rate** copies a lender's minimum rate into the Calculate tab.

**Why it exists:** Inferred from behavior: to start a calculation from a realistic market rate. The tab notes: "Indicative. Your rate depends on credit score, loan amount and tenure."

**Where to find it:** **Tools → EMI Calculator → Live rates** (route `/emi?tab=rates`).

**Who can use it:** All signed-in users (any plan).

**Steps**
1. Click **Live rates**. Home loan rates load.
2. Choose another **Loan type** if needed.
3. Click **Use this rate** on a row. The Calculate tab opens with that rate; the toast reads "Using <lender> <rate>% - check it against your own offer".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Loan type** | Select | Chooses the loan type | — |
| Lender page link (aria "<lender> rates page") | External link | Opens the lender's page in a new tab | — |
| **Use this rate** | Button | Applies the rate and switches to Calculate | — |
| **Try again** | Button | Reloads | Shown only after a failed load; disabled while loading |

**Fields and rules:** Not applicable.

**Settings and toggles here:** [S-EMI-011](../settings/emi-calculator.md#s-emi-011) **Loan type** (this tab only; not saved).

**Results:** **Use this rate** changes only the calculator's rate and tax **Loan for**.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load rates right now. The calculator still works." | Request failed | **Try again** |
| "Rates not available yet" | No effective rate for this loan type | Try another type; rates refresh daily |
| **Stale** badge | The lender page has not been read successfully for more than 7 days | Treat the rate with caution |

**Limitations:** Rates come from lenders' public pages read once a day ([F-EMI-010](F-EMI-010.md)) or entered by an administrator; a lender with no current reading is simply absent. Results are cached in your browser for 10 minutes.

**How it works:** `GET /api/loan-rates?loanType=…` (any signed-in user). The server lists each lender source for the type with its effective rate — suspect readings are never shown; a manual override from the admin page takes precedence — sorted by minimum rate then lender, with `asOf` = the page's last successful read (automatic) or the admin entry time (manual), and **Stale** when an automatic source has had no success for 7 days. The repo line shows the latest RBI repo rate and, if the two latest readings differ, the signed change.

**Related features:** [F-EMI-001](F-EMI-001.md), [F-EMI-010](F-EMI-010.md), [F-LOAN-010](F-LOAN-010.md), [D-EMI-001](../dependencies.md#d-emi-001).

**Sources:** `apps/web/src/pages/emi/LiveRatesTab.tsx:45`, `apps/web/src/pages/emi/LiveRatesTab.tsx:51`, `apps/web/src/pages/emi/LiveRatesTab.tsx:74`, `apps/web/src/pages/emi/LiveRatesTab.tsx:82`, `apps/web/src/pages/emi/LiveRatesTab.tsx:88`, `apps/web/src/pages/emi/LiveRatesTab.tsx:117`, `apps/web/src/pages/emi/liveRates.ts:11`, `apps/web/src/pages/emi/EmiCalculatorPage.tsx:42`, `packages/api/src/routes/loanRates.routes.ts:9`, `packages/api/src/controllers/loanRates.controller.ts:11`, `packages/api/src/services/loans/loanRates/loanRates.service.ts:14`, `packages/api/src/services/loans/loanRates/loanRates.service.ts:46`, `packages/api/src/services/loans/loanRates/sanity.ts:67`, `packages/shared/src/loans/loanRates.ts:9`
