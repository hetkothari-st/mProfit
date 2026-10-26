---
id: F-ADV-010
title: "Override list (approved products)"
module: "Investment Advisor"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-ADV-009]
related: [F-ADV-005, F-ADV-011]
---

[← Investment Advisor](../modules/investment-advisor.md) · [Index](../INDEX.md)

# Override list (approved products)

`F-ADV-010` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** The **Override list** card (marked "Optional") lets you name the exact funds or stocks the engine must use for a bucket. Pick a **Bucket**, search an **Instrument**, then **Add to <bucket>**. Saved items appear grouped by bucket in a table (**#**, **Instrument**, **Type** — "Mutual fund" or "Stock") with a remove button. Leave a bucket empty and the house methodology picks the fund.

**Why it exists:** Card text: "Add instruments here only to override that for a bucket: your choices then take precedence, in the order you set." Code comment: "A human's explicit judgement always beats an algorithm."

**Where to find it:** **Overview → Advisor**, last card.

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager); needs a completed risk assessment.

**Steps**
1. Choose a **Bucket** ([S-ADV-009](../settings/investment-advisor.md#s-adv-009)).
2. Type in **Search a fund, stock, or ISIN…** and pick a result. "Selected: <name>" appears.
3. Click **Add to <bucket>**. The toast "Added to the approved list" appears and the item joins the table.
4. To remove, click the bin icon on its row ("Removed from the approved list").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Bucket** | Select | The bucket the product is approved for | — |
| Instrument search ("Search a fund, stock, or ISIN…") | Search | Finds a fund or stock | — |
| **Add to <bucket>** | Button | Adds the selected instrument | No selection; result not from the app's instrument list; no model portfolio; while saving |
| Remove (bin, "Remove <name>") | Icon button | Retires the product | While a removal is running |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Bucket | Choice of 7 | Yes | Fixed list | Equity — Domestic | — |
| Instrument | Search result | Yes | Must be a fund or stock in the app's master list; name cut to 200 characters | — | "That result came from a live price lookup rather than our instrument master, so it can't be shortlisted yet. Pick a fund or stock we already track." |

**Settings and toggles here:** [S-ADV-009](../settings/investment-advisor.md#s-adv-009) **Bucket**.

**Results:** The product is attached to the model portfolio for your current category and ranked last in its bucket. Removal hides it (kept for audit) and renumbers the rest. Recommendations refresh on the next **Refresh recommendations**.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "That product is already approved for this bucket" | Duplicate | None needed |
| "Complete the risk assessment first — an approved product is attached to a model portfolio, and you don't have one yet." | No profile | Take the assessment |
| "Couldn't load your approved products." | Request failed | Reload |

**Limitations:** The list is per model portfolio, so retaking the assessment into a different category shows that category's (possibly empty) list. The order can't be changed in the page (API only, [F-ADV-011](F-ADV-011.md)). Notes on a product can be stored by the API but not entered here.

**How it works:** `GET /api/advisor/approved-products?modelPortfolioId=…`, `POST /api/advisor/approved-products` (`modelPortfolioId`, `bucket`, exactly one of `fundId`/`stockId` — else "Provide exactly one of fundId or stockId" — and `label` 1–200 characters), `DELETE /api/advisor/approved-products/:id` (sets inactive and moves the rank to the negative range so live ranks stay 1…n).

**Related features:** [F-ADV-005](F-ADV-005.md), [F-ADV-011](F-ADV-011.md).

**Sources:** `apps/web/src/pages/advisor/ApprovedProductsPanel.tsx:52`, `apps/web/src/pages/advisor/ApprovedProductsPanel.tsx:100`, `apps/web/src/pages/advisor/ApprovedProductsPanel.tsx:190`, `apps/web/src/pages/advisor/ApprovedProductsPanel.tsx:201`, `packages/api/src/controllers/advisor.controller.ts:134`, `packages/api/src/services/advisor/approvedProducts.service.ts:190`, `packages/api/src/services/advisor/approvedProducts.service.ts:214`
