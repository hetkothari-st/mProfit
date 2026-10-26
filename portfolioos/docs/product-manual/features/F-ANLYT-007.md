---
id: F-ANLYT-007
title: "Tax block: financial year and "What you'll owe""
module: "Analytics"
status: Live
roles: "R-FREE and up; R-MANAGER"
settings: [S-ANLYT-004]
related: [F-TAX-002]
---

[← Analytics](../modules/analytics.md) · [Index](../INDEX.md)

# Tax block: financial year and "What you'll owe"

`F-ANLYT-007` · Live · Roles: [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager)

**What it does:** Under the heading **Tax**, a financial-year selector (labelled "FY 2026-27" etc.) and the card **What you'll owe**: the tax on gains booked so far in that FY and, when it is ₹10,000 or more, the four advance-tax instalments (15 June 15%, 15 September 45%, 15 December 75%, 15 March 100%) with the cumulative amount due, status ("Nothing due", "x% of the year", or "Missed · ₹… interest") and an estimate of interest on missed instalments at 1% a month (section 234C).

**Why it exists:** "The two things they ask at tax time now live here too: pick the year, and see what is owed on it." (code comment).

**Where to find it:** **Analytics → Overview**, section **Tax**.

**Who can use it:** [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Choose the FY (current FY is always offered, plus years with activity).
2. Read the amount and instalments.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| FY selector | Select | [S-ANLYT-004](../settings/analytics.md#s-anlyt-004) | — |

**Fields and rules:** Not applicable.

**Settings and toggles here:** [S-ANLYT-004](../settings/analytics.md#s-anlyt-004) **Tax financial year** — drives only this block and the harvest card.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not work out the tax for FY …" | Request failed | Reload |
| "Nothing to pay on investments for FY … — no gains have been booked." | No gains | — |
| "… covered by exemptions and set-off." | Gains fully exempt or offset | — |
| "… That is under the ₹10,000 mark, so there is nothing to pay in instalments — it settles with your return." | Total below ₹10,000 | — |

**Limitations:** "Covers investment income this app can see — capital gains, intraday and crypto. Salary, TDS already deducted, other income and deductions are not included, so treat it as a floor rather than a tax return." Advance tax already paid is not known to the app. Slab-rated amounts assume 30% unless your slab is recorded.

**How it works:** `GET /api/tax/advance?fy`. Tax is computed as at each instalment date; a gain counts only from the instalment after it is booked (234C proviso). Interest = shortfall × 1% × 3 months for each of the first three instalments, 1 month for the last, once the date has passed. Below ₹10,000 total, nothing is due in instalments (sec 208).

**Related features:** [F-TAX-002](F-TAX-002.md).

**Sources:** `apps/web/src/pages/analytics/AnalyticsPage.tsx:196`, `apps/web/src/pages/analytics/widgets/TaxYearWidgets.tsx:23`, `apps/web/src/pages/analytics/widgets/TaxYearWidgets.tsx:69`, `apps/web/src/pages/analytics/widgets/TaxYearWidgets.tsx:103`, `apps/web/src/pages/analytics/widgets/TaxYearWidgets.tsx:146`, `packages/api/src/services/tax/advanceTaxMath.ts:24`, `packages/api/src/services/tax/advanceTaxMath.ts:38`, `packages/api/src/services/tax/advanceTax.service.ts:62`
