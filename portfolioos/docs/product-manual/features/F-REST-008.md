---
id: F-REST-008
title: "Capital gain on sale"
module: "Real Estate"
status: Live
roles: "as F-REST-001"
settings: []
related: [F-REST-003, F-REST-007]
---

[← Real Estate](../modules/real-estate.md) · [Index](../INDEX.md)

# Capital gain on sale

`F-REST-008` · Live · Roles: as [F-REST-001](F-REST-001.md)

**What it does:** For a sold property, shows sale price, net proceeds ("after brokerage"), total cost basis, holding period in months (long-term over 24 months, otherwise short-term), owner's share, and the gain and estimated tax under the applicable regime.

**Why it exists:** Code comment: property is "land or building" under section 112, with different rates depending on sale and purchase dates (Finance (No. 2) Act 2024).

**Where to find it:** Property page → **Capital gain (section 112)** (sold properties only).

**Who can use it:** All plans.

**Steps:** Not applicable — view only. "Computing…" shows while loading; "Capital gain unavailable — sale or purchase data missing." if purchase date, sale date or sale price is missing.

**Controls:** None.

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None — view only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Capital gain unavailable — sale or purchase data missing." | No purchase date | Edit the property and add **Purchase date** |
| "The indexed figure can't be computed: no Cost Inflation Index for FY …" | Purchase before FY 2001-02, or the sale year's index is not in the app yet | Use the non-indexed figure or compute manually |

**Limitations:** Estimates only — surcharge, cess, exemptions (e.g. sections 54/54F) and your slab are not applied; the short-term figure is a 30% top-bracket estimate. Purchases before FY 2001-02 need the 1-Apr-2001 fair market value, which the app does not take. The Cost Inflation Index table ends at FY 2025-26 (376), so sales in FY 2026-27 show the unavailable notice.

**How it works:** `GET /api/real-estate/properties/:id/capital-gain`. Cost = purchase price + stamp duty + registration fee + brokerage + other costs. Net proceeds = sale price − sale brokerage. Long-term when the sale date is after purchase date + 24 months. Share = My share ÷ 100. Non-indexed gain = (net proceeds − cost) × share; tax = max(gain, 0) × 12.5% (long-term) or × 30% (short-term), rounded half-even to paise. Indexed cost = cost × CII(sale FY) ÷ CII(purchase FY) (base FY 2001-02 = 100); indexed gain = (net proceeds − indexed cost) × share; tax = max(gain, 0) × 20%. Regime: short-term; sold before 23-Jul-2024 → indexed 20% only ("Sold before 23-Jul-2024 — …"); bought before and sold on/after 23-Jul-2024 → choice, shown as "Option A — Indexed @ 20%" and "Option B — Non-indexed @ 12.5%" ("Pick whichever produces the lower tax…"); bought on/after 23-Jul-2024 → 12.5% only.

**Related features:** [F-REST-007](F-REST-007.md), [F-REST-003](F-REST-003.md).

**Sources:** `apps/web/src/pages/realEstate/CapitalGainPanel.tsx:10`, `packages/api/src/services/realEstate/propertyCapitalGain.ts:27`, `packages/api/src/services/realEstate/propertyCapitalGain.ts:71`, `packages/api/src/services/realEstate/propertyCapitalGain.ts:140`, `packages/shared/src/finance/cii.ts:17`, `packages/shared/src/finance/cii.ts:69`
