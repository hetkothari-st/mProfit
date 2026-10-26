---
id: F-NPS-002
title: "Add, edit and delete an NPS entry"
module: "NPS"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO (owner)"
settings: []
related: [F-NPS-001]
---

[← NPS](../modules/nps.md) · [Index](../INDEX.md)

# Add, edit and delete an NPS entry

`F-NPS-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (owner)

**What it does:** The "Add NPS Entry" / "Edit NPS Entry" dialog records a **Contribution**, **Growth / returns**, **Exit / partial withdrawal** or **Opening balance**.

**Why it exists:** NPS is tracked through entries. Inferred from behavior.

**Where to find it:** **NPS** → **Add** or a pencil (route `/nps`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); portfolio owner only.

**Steps**
1. Click **Add**. Pick **Portfolio**.
2. Type **Fund Manager / Scheme** (e.g. "SBI Pension Funds – Tier I") and optional **PRAN Number**.
3. Pick **Entry Type**, enter **Date** and the amount (**Contribution Amount (₹)**, **Returns Credited (₹)**, **Amount Withdrawn (₹)**, **Current Corpus (₹)**).
4. For Growth / returns, optionally **Interest / Return Rate (% p.a.)**.
5. Click **Add NPS entry** ("NPS entry added") or **Save changes** ("NPS entry updated"). Edit: **Delete** → **Yes, delete** ("NPS entry deleted").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Entry Type** buttons | Radio | Contribution, Growth / returns, Exit / partial withdrawal, Opening balance | — |
| **Add NPS entry** / **Save changes** / **Cancel** / **Delete** | Buttons | Save / close / delete | Delete in edit mode only |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Portfolio | Select | Yes | — | first portfolio | "Select a portfolio" |
| Fund Manager / Scheme | Text | Yes | — | — | "Enter account name" |
| PRAN Number | Text | No | placeholder "12-digit PRAN"; max 20 (server); also separates holdings | — | "Validation failed" |
| Date | Date | Yes | YYYY-MM-DD | today | "Invalid date" |
| Amount | Number | Yes | ≥ 0 | — | — |
| Interest / Return Rate (% p.a.) | Number | No | 0–30; Growth / returns only | — | — |
| Notes | Text area | No | max 500 (server) | — | "Validation failed" |

**Settings and toggles here:** None.

**Results:** Quantity-1 transaction saved; holding rebuilt.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to save" / duplicate message | Server refused | — |

**Limitations:** An "Exit / partial withdrawal" removes the oldest whole contribution regardless of amount. Entries with and without a PRAN become separate holdings.

**How it works:** `POST/PATCH /api/transactions`, assetClass NPS, quantity 1, price = amount, isin = PRAN.

**Related features:** [F-NPS-001](F-NPS-001.md), [D-ASSET-004](../dependencies.md#d-asset-004).

**Sources:** `apps/web/src/pages/assetClasses/PPFNpsFormDialog.tsx:36`, `apps/web/src/pages/assetClasses/PPFNpsFormDialog.tsx:214`, `apps/web/src/pages/assetClasses/PPFNpsFormDialog.tsx:294`, `apps/web/src/pages/assetClasses/PPFNpsFormDialog.tsx:434`
