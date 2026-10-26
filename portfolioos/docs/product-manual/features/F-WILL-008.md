---
id: F-WILL-008
title: "Step 5: Allocate"
module: "Will Maker"
status: Live
roles: "R-PLUS+"
settings: [S-WILL-003]
related: [F-WILL-001, F-WILL-006, F-WILL-007, F-WILL-010]
---

[← Will Maker](../modules/will-maker.md) · [Index](../INDEX.md)

# Step 5: Allocate

`F-WILL-008` · Live · Roles: [R-PLUS](../roles.md#r-plus)+

**What it does:** Decides who gets what: **By percentage** (the residuary estate shared in percentages that must total 100%, shown in a donut chart), **Specific gifts** (a share of a particular asset to a person), **Fixed amounts** (a rupee amount to a person), and how long someone must outlive you to inherit.

**Why it exists:** Tab text: "Everything not given away as a specific gift or a fixed amount is shared in these percentages."

**Where to find it:** Wizard step **Allocate** (`/will/:id/allocation`).

**Who can use it:** Same as [F-WILL-001](F-WILL-001.md).

**Steps**
1. **By percentage**: use **Add someone to the split** (new rows take the remaining %), adjust each share, or click **Split equally**. The total line reads "Total 100.00%" in green when correct.
2. **Specific gifts**: choose **Asset** ("… - N% left") and **To**, click **Add gift**, then adjust the share.
3. **Fixed amounts**: choose **Person**, enter **Amount**, click **Add amount**.
4. Choose **How long must someone outlive you to inherit?**

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **By percentage** / **Specific gifts** / **Fixed amounts** | Tabs | Switch section | — |
| **Add someone to the split** | Select | Adds a person with the remaining % | Disabled at 100% ("Lower someone's share first."); hidden when everyone is in |
| **Split equally** | Button | Equal shares to 2 decimals, remainder to the first | Shown with ≥ 2 people |
| Share fields | Decimal fields | Edit percentages | — |
| **Add gift** | Button | Adds a specific gift | Disabled until asset and person chosen, for a duplicate pair, or when the asset has 0% left |
| **Add amount** | Button | Adds a fixed gift | Disabled until person and valid amount |
| **Remove** | Buttons | Remove a row | — |
| **How long must someone outlive you to inherit?** | Select | No waiting period, 7, 15, 30, 60 or 90 days | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Percentage | Decimal | Yes | > 0, ≤ 100, 2 decimals | Remaining % | "Enter a percentage above 0, like 25 or 33.33" |
| Residuary total | — | Blocker | Exactly 100% | — | "The percentage split adds up to X% - it must be exactly 100%." / "Share the rest of your estate - the percentages must add up to 100%." |
| Specific gift | — | Blocker | ≤ 100% per asset; real, included asset | — | "An asset is given away more than 100%." / "A gift names an asset that is excluded, is a liability, or is no longer in your list." |
| Amount | Decimal | Yes | > 0 | Empty | "Enter an amount above 0, like 50000 or 50000.50" |

**Settings and toggles here:** [S-WILL-003](../settings/will-maker.md#s-will-003) **How long must someone outlive you to inherit?** — default 30 days; "If they die within this period, their gifts go to their back-up, or else into the rest of your estate. 30 days is common."

**Results:** Saved as the `allocation` section.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "<name> already has a share of this asset. Change that share above instead." | Same asset/person pair | Edit the existing share |
| "Your money gifts add up to more than your estimated net estate." | Warning | Lower amounts |
| "A beneficiary is under 18 - their share will be managed by their guardian until they turn 18." | Warning | — |

**Limitations:** Nominee-only and excluded assets can't be gifted.

**How it works:** Shares use decimal arithmetic. Step-5 blockers: RESIDUARY_SUMS_100, SPECIFIC_ITEM_OVERALLOCATED, GIFT_ON_EXCLUDED_OR_LIABILITY, DANGLING_REFERENCE; warnings: MINOR_BENEFICIARY, FIXED_GIFTS_EXCEED_NET_ESTATE, UNALLOCATED_ASSETS.

**Related features:** [F-WILL-006](F-WILL-006.md), [F-WILL-007](F-WILL-007.md), [F-WILL-010](F-WILL-010.md).

**Sources:** `apps/web/src/pages/will/steps/AllocationStep.tsx:27`, `apps/web/src/pages/will/steps/AllocationStep.tsx:91`, `apps/web/src/pages/will/steps/AllocationStep.tsx:180`, `apps/web/src/pages/will/steps/AllocationStep.tsx:242`, `apps/web/src/pages/will/allocationMath.ts:20`, `packages/shared/src/will/schema.ts:42`, `packages/shared/src/will/validation/rules.ts:211`
