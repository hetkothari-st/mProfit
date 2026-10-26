---
id: F-DASH-007
title: "Tax strip (this financial year)"
module: "Dashboard"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: []
---

[← Dashboard](../modules/dashboard.md) · [Index](../INDEX.md)

# Tax strip (this financial year)

`F-DASH-007` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** "Tax · FY <yyyy-yy>" shows this financial year's **Realised gain**, **Est. tax**, **LTCG exempt** (used / limit, when you have long-term equity gains) and **STCG** (when above zero), with **Report** (downloads a CA-ready capital-gains PDF) and **Details** (opens Tax Planning).

**Why it exists:** Inferred from behavior: a running reminder of tax from sales this year.

**Where to find it:** Dashboard, below the FX strip. Hidden while loading and when both realised gain and estimated tax are zero.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Click **Report**. The button spins, then `capital-gains-tax-<fy>.pdf` downloads.
2. Click **Details** to open `/tax`.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Report** ("Download CA-ready tax report (PDF)") | Button | Downloads the PDF | Disabled while downloading |
| **Details** | Link | Opens `/tax` | — |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** A PDF file is saved by your browser.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not download the tax report" (or the server's message) | Download failed | Try again |

**Limitations:** Amounts of ₹1 crore or more show as "₹x.xxCr", ₹1 lakh or more as "₹x.xxL", smaller amounts rounded to whole rupees. The LTCG figure turns amber at 90% of the exemption; the red state for 100% never shows (see DOCUMENTATION_GAPS.md). The figures are cached for 10 minutes. The financial year is worked out from the UTC date.

**How it works:** `GET /api/tax/summary?fy=` for the figures; the PDF is fetched from `/api/tax/capital-gains-report` with your session.

**Related features:** [D-DASH-009](../dependencies.md#d-dash-009) (Tax Planning).

**Sources:** `apps/web/src/components/dashboard/DashboardTaxStrip.tsx:14`, `apps/web/src/components/dashboard/DashboardTaxStrip.tsx:31`, `apps/web/src/components/dashboard/DashboardTaxStrip.tsx:42`, `apps/web/src/components/dashboard/DashboardTaxStrip.tsx:47`, `apps/web/src/components/dashboard/DashboardTaxStrip.tsx:61`, `apps/web/src/components/dashboard/DashboardTaxStrip.tsx:138`, `apps/web/src/api/tax.api.ts:279`
