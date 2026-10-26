---
id: F-ANLYT-008
title: "Cut your tax bill (harvesting)"
module: "Analytics"
status: Live
roles: "R-FREE and up; R-MANAGER"
settings: [S-ANLYT-001, S-ANLYT-004]
related: [F-TAX-009]
---

[← Analytics](../modules/analytics.md) · [Index](../INDEX.md)

# Cut your tax bill (harvesting)

`F-ANLYT-008` · Live · Roles: [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager)

**What it does:** For the current FY only: a sentence with the estimated saving ("Selling the holdings below at a loss before 31 March could reduce this year's tax by about ₹…"), four tiles (**Unrealised loss pool**, **STCG offset available**, **LTCG offset available**, **Taxable gains (FY)**), the tax-before/after working with rates and exemption, and up to 20 loss-making holdings (Asset, Portfolio, Class, Bucket, Unrealised loss). For a past FY the card is replaced by "Harvesting losses only helps for the year you are still in. Switch to FY … to see what you could still do."

**Why it exists:** "Leads with one sentence and a rupee figure, because that is the only part most readers need: what selling your losers before 31 March would save." (code comment).

**Where to find it:** **Analytics → Overview**, under **What you'll owe**.

**Who can use it:** [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager).

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "i" buttons | Popovers | Definitions | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-ANLYT-001](../settings/analytics.md#s-anlyt-001), [S-ANLYT-004](../settings/analytics.md#s-anlyt-004) (must be the current FY).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Nothing to harvest — none of your holdings is currently worth less than you paid." | No losses | — |
| "… you have no gains this year for them to cancel out." | No booked gains | — |
| "… the gains you have booked so far are already untaxed." | Gains within exemption | — |

**Limitations:** With one portfolio selected, only the candidate list is limited to that portfolio; the totals and the saving are computed across all your portfolios (see DOCUMENTATION_GAPS.md). "An estimate under current set-off rules — not advice."

**How it works:** Snapshot `taxHarvest` from the same harvest report as [F-TAX-009](F-TAX-009.md) for the current FY; saving = tax on realised gains before minus after offsetting available losses, at today's equity rates and the FY exemption.

**Related features:** [F-TAX-009](F-TAX-009.md), [W-TAX-002](../workflows/W-TAX-002.md).

**Sources:** `apps/web/src/pages/analytics/AnalyticsPage.tsx:199`, `apps/web/src/pages/analytics/AnalyticsPage.tsx:204`, `apps/web/src/pages/analytics/widgets/TaxWidgets.tsx:106`, `apps/web/src/pages/analytics/widgets/TaxWidgets.tsx:122`, `apps/web/src/pages/analytics/widgets/TaxWidgets.tsx:169`, `packages/api/src/services/analytics/analytics.service.ts:847`, `packages/api/src/services/tax/tax.service.ts:633`
