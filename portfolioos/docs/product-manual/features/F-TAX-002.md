---
id: F-TAX-002
title: "Tax summary (estimated tax by section)"
module: "Tax Planning"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER"
settings: [S-TAX-001]
related: [F-ANLYT-007, F-TAX-003, F-TAX-007]
---

[← Tax Planning](../modules/tax-planning.md) · [Index](../INDEX.md)

# Tax summary (estimated tax by section)

`F-TAX-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager)

**What it does:** Three cards — **Total Realised Gain** (FY), **Estimated Tax Liability** ("Excludes surcharge & cess") and **Effective Rate** (Tax / Realised Gain) — and a **Capital Gains Breakdown** table with Section, Description, Gain, Taxable, Rate, Tax for: Sec. 111A (STCG on listed equity, STT paid); Sec. 112A (LTCG on listed equity, "exemption used ₹X of ₹Y"); Sec. 112 (LTCG on other assets, with / without indexation); Slab (STCG on non-equity — debt, bonds, gold, etc.); Sec. 43(5) intraday speculative income; Sec. 115BBH virtual digital assets (only when non-zero); Sec. 43(5) F&O non-speculative (with "· Sec. 44AB audit" when turnover exceeds ₹10 Cr). Below: losses to carry forward, and **Other Income (taxed at slab — outside this estimate)** with Dividends, Interest, Maturity Proceeds.

**Why it exists:** An estimate of the tax on investment gains, aligned to the ITR sections, to plan payments and share with a CA. Inferred from behavior and page title.

**Where to find it:** **Planning → Tax Planning → Summary**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Open the page; **Summary** is the first tab.
2. Read the breakdown; click **Download PDF** (or **CA Tax Report (PDF)**) for the CA report ([F-TAX-003](F-TAX-003.md)).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download PDF** | Button | [F-TAX-003](F-TAX-003.md) | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-TAX-001](../settings/tax-planning.md#s-tax-001). The slab rate used comes from the tax slab in your most recent risk-profile assessment ([D-TAX-001](../dependencies.md#d-tax-001)); without it 30% is used and the page says "Slab-rate lines use 30% because your income-tax slab is not on file. Add it in your risk profile for an exact figure."

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Effective Rate "—" | Total gain is zero or negative | — |
| Slab lines at 30% | No tax slab on file | Record your slab in the Advisor risk profile |

**Limitations:** Excludes surcharge, cess, deductions (80C/80D) and brought-forward losses. The footnote also says the estimate excludes "any FMV adjustment for pre-31-Jan-2018 equity (grandfathering)", but the Sec. 112A figures do use grandfathered cost (see DOCUMENTATION_GAPS.md). F&O non-speculative profit is computed and shown here on every plan, though the F&O tab itself is Pro/Advisor only.

**How it works:** `GET /api/tax/summary?fy`. Rows are bucketed by each sale's transfer date using the rules table: rule set from 1-Apr-2018 — STCG listed equity 15%, LTCG listed equity 10%, LTCG with indexation 20%, without 20%, listed bonds without indexation 10%, VDA 30%; from 23-Jul-2024 — 20%, 12.5%, 20% (indexed, property bought before 23-Jul-2024), 12.5%, 12.5%, 30%. Sec. 112A exemption ₹1,00,000 (from FY 2018-19), ₹1,25,000 (from FY 2024-25), applied once per FY to the higher-rate part first. Set-off within the year: short-term losses against any capital gain, long-term losses only against long-term gains, highest-rate gains first (Sec. 112 before 112A); intraday losses stay within speculation; VDA losses offset nothing. F&O: net P&L of closed trades in the FY, taxed at the slab rate if positive; audit flag when turnover > ₹10,00,00,000. "Rate" column shows tax ÷ taxable, or the statutory rate when nothing is taxable.

**Related features:** [F-TAX-003](F-TAX-003.md), [F-TAX-007](F-TAX-007.md), [F-ANLYT-007](F-ANLYT-007.md).

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:386`, `apps/web/src/pages/tax/TaxPage.tsx:480`, `apps/web/src/pages/tax/TaxPage.tsx:546`, `apps/web/src/pages/tax/TaxPage.tsx:572`, `apps/web/src/pages/tax/TaxPage.tsx:615`, `packages/api/src/services/tax/tax.service.ts:245`, `packages/api/src/services/tax/taxComputation.ts:85`, `packages/shared/src/finance/capitalGainsTaxRules.ts:45`, `packages/shared/src/finance/capitalGainsTaxRules.ts:91`, `packages/shared/src/finance/capitalGainsTaxRules.ts:117`, `packages/api/src/services/reports/schedule43.report.ts:68`
