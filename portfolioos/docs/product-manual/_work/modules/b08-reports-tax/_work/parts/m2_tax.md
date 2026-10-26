
## Tax Planning

The **Tax Planning** page (sidebar **Planning → Tax Planning**, route `/tax`; page title "Tax Reports — ITR-aligned capital gains, business income and tax-harvesting across all portfolios") estimates the tax on your investment gains for a financial year, lists the gains the way the income-tax return schedules ask for them, shows which holdings could be sold at a loss to cut tax, and lets you enter the 31-Jan-2018 prices used for grandfathering. It always covers all your portfolios.

### Tax page controls <!-- F-TAX-001 -->
**What it does:** A card with **Financial Year**, **Download reports for** (when you can report on others) and a download button that depends on the tab, plus 10 tabs: **Summary**, **Schedule 112A**, **Schedule 112**, **STCG**, **LTCG**, **Intraday**, **F&O (Sec. 43(5))**, **Dividend & Interest**, **Tax Harvest**, **Grandfathering (112A FMV)**.

**Why it exists:** Tax figures are per financial year and per person (assessee). The year list contains only years with activity so the page does not "default to today's FY and show ₹0 across the board if the user's last transactions were in a prior FY" (code comment).

**Where to find it:** **Planning → Tax Planning** (route `/tax`); also from the dashboard tax strip.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (F&O tab needs R-PRO); R-MANAGER (managed person's tax).

**Steps**
1. Open the page. **Financial Year** is set to the latest year with any capital gain or transaction (or the current FY if none).
2. Pick another year if needed; the open tab reloads.
3. Click a tab.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Financial Year** | Select | S-TAX-001 | — |
| **Download reports for** | Select | S-TAX-002; downloads only; no "Whole family" option | Hidden as **Report for** in F-REPORT-001 |
| **CA Tax Report (PDF)** | Button | F-TAX-003 | Summary tab only |
| **ITR-portal CSV** | Button | F-TAX-004 | Schedule 112A tab only |
| **Schedule 112A CSV (with FMV)** | Button | F-TAX-010 | Grandfathering tab only |
| Tabs (10) | Tabs | Switch view | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Financial Year | Select | Yes | Years with activity, newest first | Latest year with activity | "fy query param required (e.g. 2024-25)" (server, if missing) |

**Settings and toggles here:** S-TAX-001 **Financial Year**; S-TAX-002 **Download reports for** — Me or one family member; applies to the PDF/CSV downloads, not to the tables. Neither is saved.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A tab shows nothing | The request failed; the page shows no error | Reload; for the F&O tab see F-TAX-007 |
| "A tax report covers one person — a combined version would not be a valid filing for anyone. …" | A household subject was requested | Pick one member |

**Limitations:** The tab and year are not remembered. Tables are always your own figures (or the managed person's).

**How it works:** `GET /api/tax/available-fys` lists FYs (descending) from your capital-gain rows and transaction dates. Every `/api/tax` read resolves one subject (self by default; a combined household is refused) and runs as that person so row-level security returns their rows.

**Related features:** F-TAX-002 to F-TAX-010, D-TAX-002 (dashboard tax strip).

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:37`, `apps/web/src/pages/tax/TaxPage.tsx:146`, `apps/web/src/pages/tax/TaxPage.tsx:262`, `apps/web/src/pages/tax/TaxPage.tsx:286`, `apps/web/src/pages/tax/TaxPage.tsx:293`, `packages/api/src/controllers/tax.controller.ts:38`, `packages/api/src/controllers/tax.controller.ts:51`, `packages/api/src/services/tax/tax.service.ts:104`, `apps/web/src/App.tsx:260`

### Tax summary (estimated tax by section) <!-- F-TAX-002 -->
**What it does:** Three cards — **Total Realised Gain** (FY), **Estimated Tax Liability** ("Excludes surcharge & cess") and **Effective Rate** (Tax / Realised Gain) — and a **Capital Gains Breakdown** table with Section, Description, Gain, Taxable, Rate, Tax for: Sec. 111A (STCG on listed equity, STT paid); Sec. 112A (LTCG on listed equity, "exemption used ₹X of ₹Y"); Sec. 112 (LTCG on other assets, with / without indexation); Slab (STCG on non-equity — debt, bonds, gold, etc.); Sec. 43(5) intraday speculative income; Sec. 115BBH virtual digital assets (only when non-zero); Sec. 43(5) F&O non-speculative (with "· Sec. 44AB audit" when turnover exceeds ₹10 Cr). Below: losses to carry forward, and **Other Income (taxed at slab — outside this estimate)** with Dividends, Interest, Maturity Proceeds.

**Why it exists:** An estimate of the tax on investment gains, aligned to the ITR sections, to plan payments and share with a CA. Inferred from behavior and page title.

**Where to find it:** **Planning → Tax Planning → Summary**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Open the page; **Summary** is the first tab.
2. Read the breakdown; click **Download PDF** (or **CA Tax Report (PDF)**) for the CA report (F-TAX-003).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download PDF** | Button | F-TAX-003 | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-TAX-001. The slab rate used comes from the tax slab in your most recent risk-profile assessment (D-TAX-001); without it 30% is used and the page says "Slab-rate lines use 30% because your income-tax slab is not on file. Add it in your risk profile for an exact figure."

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Effective Rate "—" | Total gain is zero or negative | — |
| Slab lines at 30% | No tax slab on file | Record your slab in the Advisor risk profile |

**Limitations:** Excludes surcharge, cess, deductions (80C/80D) and brought-forward losses. The footnote also says the estimate excludes "any FMV adjustment for pre-31-Jan-2018 equity (grandfathering)", but the Sec. 112A figures do use grandfathered cost (see DOCUMENTATION_GAPS.md). F&O non-speculative profit is computed and shown here on every plan, though the F&O tab itself is Pro/Advisor only.

**How it works:** `GET /api/tax/summary?fy`. Rows are bucketed by each sale's transfer date using the rules table: rule set from 1-Apr-2018 — STCG listed equity 15%, LTCG listed equity 10%, LTCG with indexation 20%, without 20%, listed bonds without indexation 10%, VDA 30%; from 23-Jul-2024 — 20%, 12.5%, 20% (indexed, property bought before 23-Jul-2024), 12.5%, 12.5%, 30%. Sec. 112A exemption ₹1,00,000 (from FY 2018-19), ₹1,25,000 (from FY 2024-25), applied once per FY to the higher-rate part first. Set-off within the year: short-term losses against any capital gain, long-term losses only against long-term gains, highest-rate gains first (Sec. 112 before 112A); intraday losses stay within speculation; VDA losses offset nothing. F&O: net P&L of closed trades in the FY, taxed at the slab rate if positive; audit flag when turnover > ₹10,00,00,000. "Rate" column shows tax ÷ taxable, or the statutory rate when nothing is taxable.

**Related features:** F-TAX-003, F-TAX-007, F-ANLYT-007.

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:386`, `apps/web/src/pages/tax/TaxPage.tsx:480`, `apps/web/src/pages/tax/TaxPage.tsx:546`, `apps/web/src/pages/tax/TaxPage.tsx:572`, `apps/web/src/pages/tax/TaxPage.tsx:615`, `packages/api/src/services/tax/tax.service.ts:245`, `packages/api/src/services/tax/taxComputation.ts:85`, `packages/shared/src/finance/capitalGainsTaxRules.ts:45`, `packages/shared/src/finance/capitalGainsTaxRules.ts:91`, `packages/shared/src/finance/capitalGainsTaxRules.ts:117`, `packages/api/src/services/reports/schedule43.report.ts:68`

### CA Tax Report (PDF) <!-- F-TAX-003 -->
**What it does:** Downloads "CA-ready capital gains report" — "One PDF with tax summary, unrealised snapshot, harvesting opportunities, and full transaction detail — ready to share with your CA." Saved as `capital-gains-tax-report-<FY><member suffix>.pdf`; includes your name and PAN when on file.

**Why it exists:** To hand a CA everything for the year in one file (on-screen text).

**Where to find it:** **Planning → Tax Planning → Summary**: **Download PDF** in the card, or **CA Tax Report (PDF)** in the top card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (ungated); a family member you may report on via **Download reports for**; R-MANAGER.

**Steps**
1. Choose **Financial Year** (and **Download reports for** if needed).
2. Click **Download PDF**. The file is saved.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download PDF** / **CA Tax Report (PDF)** | Buttons | Same download | Summary tab only |

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-TAX-001, S-TAX-002, S-REPORT-011 (theme).

**Results:** A PDF is saved.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Alert with raw error text | Refused subject or invalid FY | Choose **Me** or another year |

**Limitations:** Covers all portfolios (the page sends no portfolio filter).

**How it works:** `GET /api/tax/capital-gains-report?fy&theme[&subject&familyId]`; the subject's PAN is decrypted for the report header; built as that person.

**Related features:** F-TAX-002.

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:244`, `apps/web/src/pages/tax/TaxPage.tsx:403`, `apps/web/src/pages/tax/TaxPage.tsx:411`, `packages/api/src/controllers/tax.controller.ts:126`, `packages/api/src/controllers/tax.controller.ts:139`

### Schedule 112A tab and ITR-portal CSV <!-- F-TAX-004 -->
**What it does:** Lists the FY's long-term sales of listed equity and equity-oriented funds ("Schedule 112A · LTCG on listed equity / equity MF") with Asset, ISIN, Buy, Sell, Qty, Cost, Proceeds, Gain/Loss, Taxable, Review; heading adds Exemption, Taxable, Rate and Est. Tax. When grandfathered lots exist, a line "FMV data: X of Y rows have FMV" with **Edit FMV values →**. **ITR-portal CSV** downloads the Schedule 112A file in the income-tax portal's column layout (ISIN, name, units, sale price, full value of consideration, cost without indexation, cost per unit, acquired before 01/02/2018, FMV per unit on 31/01/2018, …).

**Why it exists:** To fill ITR-2/ITR-3 Schedule 112A without retyping each sale. From the report descriptions.

**Where to find it:** **Planning → Tax Planning → Schedule 112A**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Open **Schedule 112A**, choose the year.
2. If "FMV data" shows rows without FMV, click **Edit FMV values →** (F-TAX-010).
3. Click **ITR-portal CSV**. The file `schedule-112a-<FY><member suffix>.csv` is saved.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **ITR-portal CSV** | Button | Download CSV | This tab only |
| **Edit FMV values →** | Link | Opens the Grandfathering tab | Shown when grandfathered rows exist |
| **Review** badge | Tooltip | Shows why a row needs checking | Only on rows needing review |

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-TAX-001, S-TAX-002, S-TAX-003 (FMV overrides feed the CSV).

**Results:** A CSV is saved.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Amber notice "N row(s) qualify for indexation but the CII table has no entry for that financial year — …" | Missing cost inflation index year | Treat those rows as provisional |
| "No records for selected FY." | No such sales | — |

**Limitations:** The CSV button always downloads your own data even when **Download reports for** names another member (the file name then carries the member's name) — see DOCUMENTATION_GAPS.md.

**How it works:** Table: `GET /api/tax/schedule-112a?fy`. Rate shown = estimated tax ÷ taxable (or the statutory rate when nothing is taxable). The CSV button calls `GET /api/tax/grandfathering.csv?fy` (same builder as the grandfathering CSV, FMV column filled where known).

**Related features:** F-TAX-010, F-REPORT-006.

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:212`, `apps/web/src/pages/tax/TaxPage.tsx:215`, `apps/web/src/pages/tax/TaxPage.tsx:304`, `apps/web/src/pages/tax/TaxPage.tsx:657`, `apps/web/src/pages/tax/TaxPage.tsx:665`, `apps/web/src/pages/tax/TaxPage.tsx:670`, `packages/api/src/services/tax/tax.service.ts:160`, `packages/api/src/services/tax/tax.service.ts:381`, `packages/api/src/controllers/fmv.controller.ts:117`

### Schedule 112 tab <!-- F-TAX-005 -->
**What it does:** "Schedule 112 · LTCG on other assets (with indexation)": long-term sales of non-equity assets with an **Indexed Cost** column.

**Why it exists:** ITR Schedule 112 detail for debt, gold, property and other assets. Inferred from the title.

**Where to find it:** **Planning → Tax Planning → Schedule 112**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Open the tab and choose the year.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Review** badge | Tooltip | Reason a row needs checking | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-TAX-001.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Indexation notice (as F-TAX-004) | CII year missing | Treat as provisional |

**Limitations:** No download on this tab.

**How it works:** `GET /api/tax/schedule-112?fy`. Indexed cost = cost × CII(sale year) ÷ CII(purchase year) where indexation is available (transfers before 23-Jul-2024, or property bought before that date).

**Related features:** F-TAX-002.

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:355`, `packages/api/src/services/tax/tax.service.ts:189`, `packages/api/src/services/tax/capitalGains.service.ts:23`, `packages/shared/src/finance/capitalGainsTaxRules.ts:105`

### STCG, LTCG and Intraday tabs <!-- F-TAX-006 -->
**What it does:** Three lists for the FY: "Short-Term Capital Gains", "Long-Term Capital Gains" (with Indexed Cost) and "Intraday (Sec. 43(5) Speculative)", across all portfolios, with the same columns as F-TAX-004.

**Why it exists:** Per-sale detail by tax bucket. Inferred from behavior.

**Where to find it:** **Planning → Tax Planning → STCG / LTCG / Intraday**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Open a tab and choose the year.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Review** badge | Tooltip | Reason for review | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-TAX-001.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No records for selected FY." | No such sales | — |

**Limitations:** No download here; use Reports (F-REPORT-006, F-REPORT-010).

**How it works:** `GET /api/tax/stcg|ltcg|intraday?fy` from the FIFO capital-gains engine over all your portfolios.

**Related features:** F-REPORT-006.

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:359`, `apps/web/src/pages/tax/TaxPage.tsx:748`, `packages/api/src/controllers/tax.controller.ts:74`

### F&O (Sec. 43(5)) tab <!-- F-TAX-007 -->
**What it does:** "F&O Schedule 43 / ITR-3 Schedule BP · FY …": Gross Profit, Gross Loss, Net P&L, Turnover (ICAI), Trades, an audit note, and a **Per-instrument breakdown** (Underlying, Type, Strike, Expiry, Side, P&L, Turnover, Trades).

**Why it exists:** F&O results are non-speculative business income reported in ITR-3; the turnover decides whether a tax audit applies. From the on-screen text.

**Where to find it:** **Planning → Tax Planning → F&O (Sec. 43(5))**.

**Who can use it:** R-PRO only (server gate). Other plans see the tab but it stays blank.

**Steps**
1. Open the tab and choose the year.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| None | — | — | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-TAX-001.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Tab is blank | Your plan is below Pro/Advisor; the server answers "This feature requires the PRO_ADVISOR plan or higher" and the page shows nothing | Upgrade on **Pricing** |
| "No F&O trades closed in this FY." | No closed trades | — |

**Limitations:** No lock card or message for lower plans (see DOCUMENTATION_GAPS.md). The audit check assumes the ₹10 Cr limit for ≥95% digital transactions.

**How it works:** `GET /api/tax/schedule-43?fy`, gated by `requireFeature('FNO_SCHEDULE_43')`. Turnover is summed per closed trade; audit note "Turnover exceeds ₹10 Cr — §44AB tax audit applicable. Consult a CA." or "Turnover within §44AB threshold (₹10 Cr for ≥95% digital transactions)."

**Related features:** F-TAX-002.

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:761`, `apps/web/src/pages/tax/TaxPage.tsx:806`, `apps/web/src/pages/tax/TaxPage.tsx:848`, `packages/api/src/routes/tax.routes.ts:39`, `packages/api/src/services/reports/schedule43.report.ts:68`

### Dividend & Interest tab <!-- F-TAX-008 -->
**What it does:** "Dividends ₹… · Interest ₹… · Maturity ₹… · Total ₹…" and a table Date, Type, Portfolio, Asset, Amount, Narration across all portfolios.

**Why it exists:** Income from other sources for the return. Inferred from behavior.

**Where to find it:** **Planning → Tax Planning → Dividend & Interest**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Open the tab and choose the year.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| None | — | — | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-TAX-001.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No income in this FY." | Nothing recorded | — |

**Limitations:** The "Total" in this heading is computed by the server; the Reports Income tab labels maturity proceeds as principal, not income.

**How it works:** `GET /api/tax/income?fy`.

**Related features:** F-REPORT-007.

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:861`, `apps/web/src/pages/tax/TaxPage.tsx:898`, `packages/api/src/services/tax/tax.service.ts:210`

### Tax Harvest tab <!-- F-TAX-009 -->
**What it does:** Cards **Total Unrealised Loss**, **STCG Loss Available** (with "Realised STCG this FY"), **LTCG Loss Available** (with "Realised LTCG this FY") and a table "Holdings sorted by unrealised loss (harvest candidates)": Asset, Class, Portfolio, Qty, Avg, CMP, Invested, Value, P&L, %, Classification (STCG LOSS, LTCG LOSS, STCG GAIN, LTCG GAIN), Days to LTCG.

**Why it exists:** Shows which holdings could be sold at a loss to offset this year's gains (tax-loss harvesting). From the page text.

**Where to find it:** **Planning → Tax Planning → Tax Harvest**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Open the tab. Biggest losses are listed first.
2. Read **Days to LTCG**: "LTCG ✓" means all units are already long-term; otherwise the days left (hover for the oldest buy date).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| None | — | — | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-TAX-001 (for the realised-gain lines).

**Results:** View only; nothing is sold.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No holdings to analyse." | No capital-asset holdings | — |

**Limitations:** The footnote says classification "uses the oldest BUY in the lot — actual FIFO matching at sell time may differ", but the server now classifies by remaining FIFO lots; **Days to LTCG** is computed in the browser with 365 days (equity, ETF, mutual funds), 730 (foreign equity) or 1095 (others), which can differ from the server's rules for non-equity funds bought after 23-Jul-2024 (24 months). Colouring: 7 days or fewer shows in the positive colour, 8–30 days amber.

**How it works:** `GET /api/tax/harvest?fy`. For each capital-asset holding the remaining FIFO lots are valued at today's price; lot P&L is split into short- and long-term; classification is by the larger of the two; holdings with no transaction history count as one short-term lot. Rows sorted by unrealised P&L ascending. Deposits, PF, insurance and similar classes are skipped.

**Related features:** F-ANLYT-008.

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:119`, `apps/web/src/pages/tax/TaxPage.tsx:910`, `apps/web/src/pages/tax/TaxPage.tsx:950`, `apps/web/src/pages/tax/TaxPage.tsx:1018`, `apps/web/src/pages/tax/TaxPage.tsx:1046`, `packages/api/src/services/tax/tax.service.ts:527`, `packages/api/src/services/tax/tax.service.ts:627`

### Grandfathering (112A FMV) tab <!-- F-TAX-010 -->
**What it does:** For the FY's sales of equity bought on or before 31-Jan-2018: cards **Rows requiring FMV**, **Gain without FMV**, **Gain with FMV** ("Using Sec. 55(2)(ac) basis"), **Tax benefit from FMV**; a table with Asset, ISIN, Buy Date, Sell Date, Qty, Cost, Proceeds, **FMV / unit** (editable), Adjusted basis, Corrected gain, Tax saving; and **Schedule 112A CSV (with FMV)**.

**Why it exists:** For such equity the cost can be raised to its fair market value on 31-Jan-2018, which lowers the taxable gain; the app needs that price for each ISIN. From the on-screen disclaimer.

**Where to find it:** **Planning → Tax Planning → Grandfathering (112A FMV)**, or **Edit FMV values →** on Schedule 112A.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER (edits the managed person's overrides).

**Steps**
1. Open the tab. Rows without a price show **Enter FMV** in amber, with the banner "N holding(s) bought before 31-Jan-2018 need the BSE/NSE closing price on that date. …".
2. Click **Enter FMV** (or the pencil on an existing value), type the price per unit, press **Enter** or click ✓. Press **Escape** or ✕ to cancel.
3. The tables recompute. Values you entered are tagged "edited"; built-in values "seed".
4. To go back to the seed value, click the revert icon ("Revert to seed value") on an edited value.
5. Click **Schedule 112A CSV (with FMV)** to download `schedule-112a-grandfathering-<FY><member suffix>.csv`.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Enter FMV** | Button | Opens the price field | Rows without FMV; "no ISIN" rows cannot be edited |
| Pencil ("Edit FMV") | Button | Edit an existing value | Visible on hover |
| ✓ / ✕ | Buttons | Save / cancel | ✓ disabled while saving |
| Revert ("Revert to seed value") | Button | Deletes your override | Only on "edited" values |
| **Schedule 112A CSV (with FMV)** | Button | Download | This tab only |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| FMV per unit | Number | Yes to save | ≥ 0, step 0.01; must be a finite number | Current value or empty | Empty or invalid input is silently ignored; server: "fmvPerUnit (string) is required" |

**Settings and toggles here:** S-TAX-003 **FMV / unit override** — saved per ISIN on your account; affects this tab, Schedule 112A, the tax summary and both CSVs.

**Results:** Your override is stored for that ISIN and a background capital-gains recompute starts; tables reload.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Value not saved, no message | Save request failed (no error is shown) | Retry; reload the page |
| "no ISIN" | The sale has no ISIN to key the price on | Add the ISIN to the transaction |

**Limitations:** Seed values are approximate ("verify against the official BSE bhavcopy for EQ310118"). The adjusted basis cannot exceed the sale proceeds. Per-row "Tax saving" uses 12.5% for sales on/after 23-Jul-2024 and 10% before. This tab and its CSV always use your own data, regardless of **Download reports for**.

**How it works:** `GET /api/tax/grandfathering?fy` (rows, totals; rows needing input counted in the browser); `PUT /api/tax/fmv-overrides/:isin` with `{fmvPerUnit, scripName}`; `DELETE /api/tax/fmv-overrides/:isin`. Adjusted basis = max(actual cost, min(FMV × qty, sale value)). Tax benefit total = Σ |gain difference| × LTCG rate at each sale date.

**Related features:** F-TAX-004, W-TAX-001.

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:229`, `apps/web/src/pages/tax/TaxPage.tsx:309`, `apps/web/src/pages/tax/TaxPage.tsx:1074`, `apps/web/src/pages/tax/TaxPage.tsx:1083`, `apps/web/src/pages/tax/TaxPage.tsx:1093`, `apps/web/src/pages/tax/TaxPage.tsx:1105`, `apps/web/src/pages/tax/TaxPage.tsx:1225`, `apps/web/src/pages/tax/TaxPage.tsx:1292`, `apps/web/src/pages/tax/TaxPage.tsx:1316`, `apps/web/src/pages/tax/TaxPage.tsx:1341`, `apps/web/src/api/tax.api.ts:292`, `packages/api/src/controllers/fmv.controller.ts:58`, `packages/api/src/controllers/fmv.controller.ts:89`, `packages/api/src/controllers/fmv.controller.ts:105`, `packages/api/src/services/tax/fmvOverride.service.ts:206`

**What this area doesn't do**
- It doesn't compute your full income-tax return: salary, TDS, deductions, surcharge and cess are not included.
- It doesn't let you pick a portfolio — every figure covers all your portfolios.
- It doesn't show a whole-family tax view; tax is per person.
- It doesn't record advance tax you have paid (the instalment view is on Analytics, F-ANLYT-007).
- It doesn't sell anything for you; harvesting is information only.
