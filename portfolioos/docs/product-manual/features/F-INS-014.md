---
id: F-INS-014
title: "Tax on your premiums"
module: "Insurance"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-INS-008, S-INS-009, S-INS-010]
related: [F-INS-006, F-INS-016]
---

[← Insurance](../modules/insurance.md) · [Index](../INDEX.md)

# Tax on your premiums

`F-INS-014` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** A foldable card that works out what the premiums recorded in a financial year are worth under the Income-tax Act, 2025, old regime only: **Life insurance · section 123** (counts towards the ₹1,50,000 limit shared with PF, PPF, ELSS and the rest of Schedule XV, with a per-policy cap of 10% of the sum assured — 20% for policies issued before 1 April 2012), **Health insurance · section 126** (₹25,000 for you, spouse and children and a further ₹25,000 for parents; ₹50,000 each when senior citizen), and **Tax-free payout · Schedule II** verdicts for whole life, ULIP and endowment policies. Folded, the header says "You can claim ₹X in FY <year> — old regime only".

**Why it exists:** "What the premiums recorded in a financial year are worth at tax time" (code comment); each rule links to the Act.

**Where to find it:** **Asset Classes → Insurance**, **Tax on your premiums** card.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Click the card title to open or fold it (remembered on this device).
2. Pick the financial year in the **Financial year** select (current and two earlier years).
3. For each health policy, choose who it covers (**You, spouse and children** / **Your parents**) and tick **Senior citizen (60+)** where it applies; changes save at once.
4. Open **The rules we used** to read each rule with its source.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Card title button | Toggle | Opens/folds the card | — |
| **Financial year** | Select | Chooses FY | — |
| "Who <policy> covers" | Select: Not set, You, spouse and children, Your parents | Sets the tax bucket | Disabled while saving |
| **Senior citizen (60+)** | Checkbox | Raises the limit | Disabled while saving |
| **The rules we used** | Disclosure | Lists rules and sources | — |

**Fields and rules:** The server only accepts a tax bucket or senior-citizen flag on a health policy ("Only a health policy counts towards the health-insurance deduction").

**Settings and toggles here:** [S-INS-008](../settings/insurance.md#s-ins-008) **Who the policy covers**; [S-INS-009](../settings/insurance.md#s-ins-009) **Senior citizen (60+)**; [S-INS-010](../settings/insurance.md#s-ins-010) card open state (this device only).

**Results:** The bucket and senior flag are saved on the policy; the summary recalculates.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Premiums paid before 1 April 2026 fall under the Income-tax Act, 1961, which this summary doesn't work out." | A financial year before 2026-27 is selected | Pick 2026-27 or later |
| "Say who each policy covers to count it." | A health policy has no bucket | Set it |
| "Couldn't load the tax summary." | Request failed | Reload |

**Limitations:** Only premiums recorded in EveryPaisa count. Health premiums paid for several years at once are split equally over the years covered. Earlier financial years than 2026-27 are not computed.

**How it works:** `GET /api/insurance/tax-summary?fy=` runs the shared `buildTaxSummary` over your policies and payments. Rules checked on 11 Sep 2026. Aggregate limits for tax-free payouts: ULIPs issued from 1 Feb 2021 ₹2,50,000 a year; other policies issued from 1 Apr 2023 ₹5,00,000 a year.

**Related features:** [F-INS-006](F-INS-006.md), [F-INS-016](F-INS-016.md).

**Sources:** `apps/web/src/components/insurance/TaxSummaryCard.tsx:43`, `apps/web/src/components/insurance/TaxSummaryCard.tsx:29`, `apps/web/src/components/insurance/TaxSummaryCard.tsx:271`, `packages/shared/src/insurance/tax.ts:51`, `packages/shared/src/insurance/tax.ts:52`, `packages/shared/src/insurance/tax.ts:355`, `packages/api/src/services/insurance/insurance.service.ts:319`
