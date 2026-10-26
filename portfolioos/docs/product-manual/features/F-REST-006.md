---
id: F-REST-006
title: "Update current value"
module: "Real Estate"
status: Live
roles: "as F-REST-001"
settings: []
related: [F-REST-001, F-REST-005]
---

[← Real Estate](../modules/real-estate.md) · [Index](../INDEX.md)

# Update current value

`F-REST-006` · Live · Roles: as [F-REST-001](F-REST-001.md)

**What it does:** Records the latest market value of the property.

**Why it exists:** Form help text: "Update manually when market changes — automated price feeds for Indian property are unreliable."

**Where to find it:** Property page → **Refresh value** (dialog "Update current value").

**Who can use it:** All plans; not offered for sold properties.

**Steps**
1. Click **Refresh value**. The field is pre-filled with the current value.
2. Enter the new value in **Current value (₹) *** and click **Update**. "Current value updated" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Cancel** | Button | Close | While saving |
| **Update** | Button | Save | Field empty or saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Current value (₹) * | Text | Yes | Non-negative decimal, no commas | Existing value | "Validation failed" / "Refresh failed" |

**Settings and toggles here:** None.

**Results:** Current value, its source ("manual") and its date ("Updated 0 day(s) ago") change; list totals and net-worth figures that read the current value change.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Validation failed" | Commas or letters | Use digits only |

**Limitations:** No automatic valuation; no value history is kept (only the latest value and date).

**How it works:** `POST /api/real-estate/properties/:id/refresh-value` with the value and source "manual"; sets `currentValueAsOf` to now.

**Related features:** [F-REST-001](F-REST-001.md), [F-REST-005](F-REST-005.md).

**Sources:** `apps/web/src/pages/realEstate/RealEstateDetailPage.tsx:511`, `packages/api/src/schemas/realEstate.schema.ts:92`, `packages/api/src/services/realEstate/realEstate.service.ts:329`
