---
id: F-TAX-007
title: "F&O (Sec. 43(5)) tab"
module: "Tax Planning"
status: Live
roles: "R-PRO (others: blank tab)"
settings: [S-TAX-001]
related: [F-TAX-002]
---

[← Tax Planning](../modules/tax-planning.md) · [Index](../INDEX.md)

# F&O (Sec. 43(5)) tab

`F-TAX-007` · Live · Roles: [R-PRO](../roles.md#r-pro) (others: blank tab)

**What it does:** "F&O Schedule 43 / ITR-3 Schedule BP · FY …": Gross Profit, Gross Loss, Net P&L, Turnover (ICAI), Trades, an audit note, and a **Per-instrument breakdown** (Underlying, Type, Strike, Expiry, Side, P&L, Turnover, Trades).

**Why it exists:** F&O results are non-speculative business income reported in ITR-3; the turnover decides whether a tax audit applies. From the on-screen text.

**Where to find it:** **Planning → Tax Planning → F&O (Sec. 43(5))**.

**Who can use it:** [R-PRO](../roles.md#r-pro) only (server gate). Other plans see the tab but it stays blank.

**Steps**
1. Open the tab and choose the year.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| None | — | — | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-TAX-001](../settings/tax-planning.md#s-tax-001).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Tab is blank | Your plan is below Pro/Advisor; the server answers "This feature requires the PRO_ADVISOR plan or higher" and the page shows nothing | Upgrade on **Pricing** |
| "No F&O trades closed in this FY." | No closed trades | — |

**Limitations:** No lock card or message for lower plans (see DOCUMENTATION_GAPS.md). The audit check assumes the ₹10 Cr limit for ≥95% digital transactions.

**How it works:** `GET /api/tax/schedule-43?fy`, gated by `requireFeature('FNO_SCHEDULE_43')`. Turnover is summed per closed trade; audit note "Turnover exceeds ₹10 Cr — §44AB tax audit applicable. Consult a CA." or "Turnover within §44AB threshold (₹10 Cr for ≥95% digital transactions)."

**Related features:** [F-TAX-002](F-TAX-002.md).

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:761`, `apps/web/src/pages/tax/TaxPage.tsx:806`, `apps/web/src/pages/tax/TaxPage.tsx:848`, `packages/api/src/routes/tax.routes.ts:39`, `packages/api/src/services/reports/schedule43.report.ts:68`
