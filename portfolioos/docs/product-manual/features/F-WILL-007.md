---
id: F-WILL-007
title: "Step 4: Assets & liabilities"
module: "Will Maker"
status: Live
roles: "R-PLUS+"
settings: [S-WILL-004, S-WILL-005]
related: [F-WILL-001, F-WILL-004, F-WILL-008]
---

[← Will Maker](../modules/will-maker.md) · [Index](../INDEX.md)

# Step 4: Assets & liabilities

`F-WILL-007` · Live · Roles: [R-PLUS](../roles.md#r-plus)+

**What it does:** Lists the assets and liabilities fetched from your EveryPaisa accounts with value, ownership (**Sole**, **Joint**, **Nominee only**, **HUF**) and your share, and a review status per item (**Confirmed**, **Needs review**, **Excluded**, **Not found on refresh**). You can refresh from your accounts and add items by hand.

**Why it exists:** Inferred from behavior: the will's estate schedule is built from the data already in EveryPaisa, with the owner confirming each item.

**Where to find it:** Wizard step **Assets & liabilities** (`/will/:id/estate`).

**Who can use it:** Same as [F-WILL-001](F-WILL-001.md).

**Steps**
1. On first open the list is fetched ("Fetching your assets...").
2. For each item set **Ownership** (Joint/HUF ask for your share %), then **Confirm**, **Exclude** or **Include**.
3. Click **Add an asset or liability**, enter **What is it**, **Type**, **Value**, click **Add**. Manual items can be **Edit value**d or **Remove**d.
4. Click **Refresh from my accounts** to re-read your accounts.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Refresh from my accounts** | Button | Re-reads your accounts | Disabled while refreshing |
| **Retry** | Button | Retries a failed first fetch | Only after a failed first fetch |
| Ownership select | Select | Sole / Joint (50% default) / Nominee only / HUF | — |
| Share % | Decimal field | Your share | Joint and HUF only |
| **Confirm** | Button | Marks reviewed | Needs review / Not found on refresh |
| **Exclude** / **Include** | Button | Leaves the item out / back in | — |
| **Edit value** / **Done** / **Remove** | Buttons | Edit or remove a manual item | Manual items only |
| **Add an asset or liability** → **Add** / **Cancel** | Buttons | Add a manual item | **Add** disabled until name and valid value |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Share % | Decimal | For Joint/HUF | > 0 and ≤ 100, up to 2 decimals | 50 (Joint), 100 | "Enter a percentage above 0, like 25 or 33.33" |
| Value (manual) | Decimal | Yes | > 0, up to 13 digits and 2 decimals; ₹ and commas ignored | Empty | "Enter an amount above 0, like 50000 or 50000.50" |
| **What is it** | Text | Yes | ≤ 160 | Empty | — |

**Settings and toggles here:** [S-WILL-004](../settings/will-maker.md#s-will-004) **Ownership**; [S-WILL-005](../settings/will-maker.md#s-will-005) **Include / Exclude**.

**Results:** Totals Assets / Liabilities / Net update; "Paid to nominees and not counted: ₹…" for nominee-only items.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "We could not read your <sources> just now. Try refreshing, or add them by hand." | A source failed | Refresh or add by hand |
| "Some items were left out because the list is very long." | More than 400 items | Add missing items by hand |
| "This item has gifts in step 5 - they will be flagged." | Excluded or nominee-only item has gifts | Remove the gifts |
| "Your asset list is more than 30 days old - refresh it." | Warning | Refresh |

**Limitations:** Values are estimates as of the fetch date. Nominee-only items pass to the nominee and cannot be gifted.

**How it works:** `POST /api/will/drafts/:id/estate/refresh` collects from each source adapter and reconciles with saved items (your edits are kept; items no longer found are marked **Not found on refresh** unless the list was truncated). Rules on step 4 are warnings: ITEMS_NEED_REVIEW, ESTATE_STALE (> 30 days), ESTATE_SOURCE_FAILED, JOINT_OWNERSHIP_ONLY_SHARE, HUF_COPARCENARY_SHARE, plus an info note on nominations.

**Related features:** [F-WILL-004](F-WILL-004.md), [F-WILL-008](F-WILL-008.md).

**Sources:** `apps/web/src/pages/will/steps/EstateStep.tsx:17`, `apps/web/src/pages/will/steps/EstateStep.tsx:59`, `apps/web/src/pages/will/steps/EstateStep.tsx:89`, `apps/web/src/pages/will/steps/EstateStep.tsx:176`, `apps/web/src/pages/will/steps/EstateStep.tsx:224`, `apps/web/src/pages/will/DecimalField.tsx:8`, `apps/web/src/pages/will/allocationMath.ts:3`, `packages/api/src/services/will/estate/registry.ts:36`, `packages/shared/src/will/validation/rules.ts:150`
