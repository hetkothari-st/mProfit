---
id: F-REST-007
title: "Mark property sold"
module: "Real Estate"
status: Live
roles: "as F-REST-001"
settings: [S-REST-002]
related: [F-REST-005, F-REST-008]
---

[← Real Estate](../modules/real-estate.md) · [Index](../INDEX.md)

# Mark property sold

`F-REST-007` · Live · Roles: as [F-REST-001](F-REST-001.md)

**What it does:** Records the sale date, sale price and optional sale brokerage, flips the status to Sold and makes the property inactive.

**Why it exists:** Dialog text: "Capital gain (LTCG with CII indexation under section 112) will be computed automatically. Status will flip to SOLD; the row stays for tax records."

**Where to find it:** Property page → **Mark sold** (dialog "Mark "<name>" as sold").

**Who can use it:** All plans; not offered once sold.

**Steps**
1. Click **Mark sold**.
2. Enter **Sale date ***, **Sale price (₹) *** and optionally **Sale brokerage (₹)**.
3. Click **Mark sold**. "Marked as sold" appears; the page shows the Sale and Capital gain sections.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Cancel** | Button | Close | While saving |
| **Mark sold** | Button | Save | While saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Sale date * | Date | Yes | YYYY-MM-DD | Empty | "Sale date and price required" |
| Sale price (₹) * | Text | Yes | Non-negative decimal | Empty | "Sale date and price required" / "Validation failed" |
| Sale brokerage (₹) | Text | No | Non-negative decimal | Empty | "Validation failed" |

**Settings and toggles here:** [S-REST-002](../settings/real-estate.md#s-rest-002) Status becomes Sold.

**Results:** Status Sold, inactive; excluded from value totals and alerts; **Make rental**, **Refresh value** and **Mark sold** disappear.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to mark sold" | Server error | Retry |

**Limitations:** There is no "undo sale" button; editing Status back in the form changes the label but leaves the property inactive and keeps the sale fields.

**How it works:** `POST /api/real-estate/properties/:id/mark-sold` sets sale date/price/brokerage, status SOLD and isActive false.

**Related features:** [F-REST-008](F-REST-008.md), [F-REST-005](F-REST-005.md).

**Sources:** `apps/web/src/pages/realEstate/MarkSoldDialog.tsx:24`, `apps/web/src/pages/realEstate/MarkSoldDialog.tsx:48`, `packages/api/src/schemas/realEstate.schema.ts:86`, `packages/api/src/services/realEstate/realEstate.service.ts:308`
