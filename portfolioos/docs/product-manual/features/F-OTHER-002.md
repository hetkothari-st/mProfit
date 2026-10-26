---
id: F-OTHER-002
title: "Add, edit and delete an other-asset entry"
module: "Other Assets"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO (owner)"
settings: []
related: [F-OTHER-001]
---

[← Other Assets](../modules/other-assets.md) · [Index](../INDEX.md)

# Add, edit and delete an other-asset entry

`F-OTHER-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (owner)

**What it does:** The "Add Other Asset" / "Edit Other Asset" dialog records an entry for one of 8 types, with per-type transaction choices and quantity/price labels.

**Why it exists:** Inferred from behavior.

**Where to find it:** **Others** → **Add** or a pencil (route `/others`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); portfolio owner only.

**Steps**
1. Click **Add**. Pick **Portfolio** and **Asset Type**.
2. Pick **Transaction** (per type, below), type **Asset Name** (e.g. "Helios Capital PMS") and optional **ISIN / Identifier**.
3. Enter **Date**, the quantity (label per type) and **Price (₹)**.
4. Click **Add entry** ("Entry added") or **Save changes** ("Entry updated"); edit: **Delete** → **Yes, delete** ("Entry deleted").

| Asset Type (option) | Transactions | Quantity label |
|---|---|---|
| PMS (Portfolio Management Service) | Invest / top-up, Withdraw / exit | Capital Invested (₹) |
| AIF (Alternative Investment Fund) | Invest, Redeem | Capital Invested (₹) |
| ULIP (Unit-linked Insurance Plan) | Premium paid, Surrender / withdrawal, Maturity | Premium Amount (₹) |
| REIT / InvIT | Buy units, Sell units, Distribution received | Units |
| Art & Collectibles | Buy, Sell | Quantity |
| Cash / Liquid Savings | Deposit / credit, Withdrawal / debit, Opening balance | Amount (₹) |
| Other | Buy / invest, Sell / exit, Deposit, Withdrawal | Quantity |

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Asset Type** | Select | The 8 types above | — |
| **Transaction** buttons | Radio | Per type | — |
| **Add entry** / **Save changes** / **Cancel** / **Delete** → **Yes, delete** | Buttons | Save / close / delete | Delete in edit mode only |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Portfolio | Select | Yes | — | first portfolio | "Select a portfolio" |
| Asset Name | Text | Yes | — | — | "Enter asset name" |
| ISIN / Identifier | Text | No | max 20 (server) | — | "Validation failed" |
| Date | Date | Yes | YYYY-MM-DD | today | "Invalid date" |
| Quantity (label per type) | Number | Yes | > 0, step 0.0001 | — | "Must be > 0" |
| Price (₹) | Number | Yes | ≥ 0 | — | — |
| Notes | Text area | No | max 500 (server) | — | "Validation failed" |

**Settings and toggles here:** None.

**Results:** Transaction saved; holding rebuilt.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to save" / duplicate message | Server refused | — |

**Limitations:** For PMS, AIF, ULIP and Cash the amount goes in the quantity field; a hint line under the fields explains the price per type (for example "NAV / unit value (₹) — use 1 if entering lump sum" for PMS, "Use 1 (enter amount in Quantity)" for Cash), while the price box itself is always labelled "Price (₹)". There is no Real Estate option in **Asset Type**, although the page lists Real Estate holdings; editing one shows the first option instead (DOCUMENTATION_GAPS.md).

**How it works:** `POST/PATCH /api/transactions` with the chosen class, quantity and price.

**Related features:** [F-OTHER-001](F-OTHER-001.md).

**Sources:** `apps/web/src/pages/assetClasses/OtherAssetFormDialog.tsx:26`, `apps/web/src/pages/assetClasses/OtherAssetFormDialog.tsx:37`, `apps/web/src/pages/assetClasses/OtherAssetFormDialog.tsx:49`, `apps/web/src/pages/assetClasses/OtherAssetFormDialog.tsx:73`, `apps/web/src/pages/assetClasses/OtherAssetFormDialog.tsx:142`, `apps/web/src/pages/assetClasses/OtherAssetFormDialog.tsx:257`
