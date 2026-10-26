---
id: F-BOND-002
title: "Add, edit and delete a bond entry"
module: "Bonds"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO (owner)"
settings: []
related: [F-BOND-001]
---

[← Bonds](../modules/bonds.md) · [Index](../INDEX.md)

# Add, edit and delete a bond entry

`F-BOND-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (owner)

**What it does:** The "Add Bond" / "Edit Bond Entry" dialog records a bond buy, sell, coupon, maturity or redemption.

**Why it exists:** Bonds are tracked only through entries. Inferred from behavior.

**Where to find it:** **Asset Classes → Bonds** → **Add**, or the pencil on a transaction (route `/bonds`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); portfolio owner only.

**Steps**
1. Click **Add**. "Add Bond" opens with Bond Type "Government Bond", Transaction "Buy", today's date, Coupon Frequency "Semi-annual".
2. Pick the **Portfolio**, **Bond Type** and **Transaction**; type the **Bond Name / Issuer**, optional **ISIN**, **Date**, **Units** and **Price / Unit (₹)** (label becomes **Coupon Received (₹)** for coupons).
3. For a Buy, optionally fill **Bond Details**: **Coupon Rate (% p.a.)**, **Coupon Frequency**, **Maturity Date**.
4. Click **Add bond** ("Bond added") or **Save changes** ("Bond entry updated").
5. In edit mode, **Delete** → "Sure?" → **Yes, delete** ("Bond entry deleted"); **Cancel** backs out.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add bond** / **Save changes** | Button | Saves | While saving |
| **Cancel** | Button | Closes | — |
| **Delete** → **Yes, delete** / **Cancel** | Buttons | Deletes this entry | Edit mode only |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Portfolio | Select | Yes | your portfolios | first portfolio | "Select a portfolio" |
| Bond Type | Select | Yes | Government Bond, Corporate Bond, Other Bond | Government Bond | — |
| Transaction | Select | Yes | Buy, Sell, Coupon received, Maturity, Redemption | Buy | — |
| Bond Name / Issuer | Text | Yes | placeholder "e.g. 7.26% GOI 2033" | — | "Enter bond name / issuer" |
| ISIN | Text | No | max 20 characters (server) | — | "Validation failed" |
| Date | Date | Yes | YYYY-MM-DD | today | "Invalid date" |
| Units | Number | Yes | > 0 | — | "Must be > 0" |
| Price / Unit (₹) / Coupon Received (₹) | Number | Yes | ≥ 0 | — | — |
| Coupon Rate (% p.a.) | Number | No | 0–100 | — | — |
| Coupon Frequency | Select | No | Monthly, Quarterly, Semi-annual, Annual | Semi-annual | — |
| Maturity Date | Date | No | — | — | — |
| Notes | Text area | No | max 500 characters (server) | — | "Validation failed" |

**Settings and toggles here:** None.

**Results:** A transaction is saved; the bond holding is rebuilt (Buy adds units; Sell, Maturity, Redemption remove units; Coupon received does not change the holding).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to save" or the duplicate message ("…is already recorded…") | Server refused | Change a field or check the existing entry |
| "Forbidden" | Portfolio not yours | Choose your own portfolio |

**Limitations:** Coupon rate, frequency and maturity are stored but not used to value the bond.

**How it works:** `POST /api/transactions` (or `PATCH /api/transactions/:id`) with assetClass, type, name, ISIN, date, quantity = Units, price, maturityDate, interestRate, interestFrequency, narration. The server computes gross = qty × price and rebuilds the holding.

**Related features:** [F-BOND-001](F-BOND-001.md).

**Sources:** `apps/web/src/pages/assetClasses/BondFormDialog.tsx:27`, `apps/web/src/pages/assetClasses/BondFormDialog.tsx:44`, `apps/web/src/pages/assetClasses/BondFormDialog.tsx:116`, `apps/web/src/pages/assetClasses/BondFormDialog.tsx:136`, `apps/web/src/pages/assetClasses/BondFormDialog.tsx:233`, `packages/api/src/controllers/transaction.controller.ts:39`, `packages/api/src/controllers/transaction.controller.ts:61`
