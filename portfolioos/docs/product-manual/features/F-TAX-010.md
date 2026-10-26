---
id: F-TAX-010
title: "Grandfathering (112A FMV) tab"
module: "Tax Planning"
status: Live
roles: "R-FREE and up; R-MANAGER"
settings: [S-TAX-003]
related: [F-ANLYT-007, F-TAX-004]
---

[← Tax Planning](../modules/tax-planning.md) · [Index](../INDEX.md)

# Grandfathering (112A FMV) tab

`F-TAX-010` · Live · Roles: [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager)

**What it does:** For the FY's sales of equity bought on or before 31-Jan-2018: cards **Rows requiring FMV**, **Gain without FMV**, **Gain with FMV** ("Using Sec. 55(2)(ac) basis"), **Tax benefit from FMV**; a table with Asset, ISIN, Buy Date, Sell Date, Qty, Cost, Proceeds, **FMV / unit** (editable), Adjusted basis, Corrected gain, Tax saving; and **Schedule 112A CSV (with FMV)**.

**Why it exists:** For such equity the cost can be raised to its fair market value on 31-Jan-2018, which lowers the taxable gain; the app needs that price for each ISIN. From the on-screen disclaimer.

**Where to find it:** **Planning → Tax Planning → Grandfathering (112A FMV)**, or **Edit FMV values →** on Schedule 112A.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) (edits the managed person's overrides).

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

**Settings and toggles here:** [S-TAX-003](../settings/tax-planning.md#s-tax-003) **FMV / unit override** — saved per ISIN on your account; affects this tab, Schedule 112A, the tax summary and both CSVs.

**Results:** Your override is stored for that ISIN and a background capital-gains recompute starts; tables reload.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Value not saved, no message | Save request failed (no error is shown) | Retry; reload the page |
| "no ISIN" | The sale has no ISIN to key the price on | Add the ISIN to the transaction |

**Limitations:** Seed values are approximate ("verify against the official BSE bhavcopy for EQ310118"). The adjusted basis cannot exceed the sale proceeds. Per-row "Tax saving" uses 12.5% for sales on/after 23-Jul-2024 and 10% before. This tab and its CSV always use your own data, regardless of **Download reports for**.

**How it works:** `GET /api/tax/grandfathering?fy` (rows, totals; rows needing input counted in the browser); `PUT /api/tax/fmv-overrides/:isin` with `{fmvPerUnit, scripName}`; `DELETE /api/tax/fmv-overrides/:isin`. Adjusted basis = max(actual cost, min(FMV × qty, sale value)). Tax benefit total = Σ |gain difference| × LTCG rate at each sale date.

**Related features:** [F-TAX-004](F-TAX-004.md), [W-TAX-001](../workflows/W-TAX-001.md).

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:229`, `apps/web/src/pages/tax/TaxPage.tsx:309`, `apps/web/src/pages/tax/TaxPage.tsx:1074`, `apps/web/src/pages/tax/TaxPage.tsx:1083`, `apps/web/src/pages/tax/TaxPage.tsx:1093`, `apps/web/src/pages/tax/TaxPage.tsx:1105`, `apps/web/src/pages/tax/TaxPage.tsx:1225`, `apps/web/src/pages/tax/TaxPage.tsx:1292`, `apps/web/src/pages/tax/TaxPage.tsx:1316`, `apps/web/src/pages/tax/TaxPage.tsx:1341`, `apps/web/src/api/tax.api.ts:292`, `packages/api/src/controllers/fmv.controller.ts:58`, `packages/api/src/controllers/fmv.controller.ts:89`, `packages/api/src/controllers/fmv.controller.ts:105`, `packages/api/src/services/tax/fmvOverride.service.ts:206`

**What this area doesn't do**
- It doesn't compute your full income-tax return: salary, TDS, deductions, surcharge and cess are not included.
- It doesn't let you pick a portfolio — every figure covers all your portfolios.
- It doesn't show a whole-family tax view; tax is per person.
- It doesn't record advance tax you have paid (the instalment view is on Analytics, [F-ANLYT-007](F-ANLYT-007.md)).
- It doesn't sell anything for you; harvesting is information only.
