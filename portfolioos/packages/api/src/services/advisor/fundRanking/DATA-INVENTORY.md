# Fund-ranking data inventory

What we actually hold about a mutual fund scheme today, checked against
`MutualFundMaster`, `MFNav` and `priceFeeds/amfi.service.ts` before any of the
ranking code was written. It is recorded here because a methodology that quietly
assumes an attribute it does not have produces confident nonsense, and because
the next person to extend this needs to know which gaps are real.

## Held today

| Attribute | Source | Notes |
|---|---|---|
| Scheme code | `MutualFundMaster.schemeCode` | AMFI's code; our stable identity |
| Scheme name | `MutualFundMaster.schemeName` | AMFI's full name, e.g. "… - Direct Plan - Growth Option" |
| AMC name | `MutualFundMaster.amcName` | From the AMFI AMC header line |
| Category | `MutualFundMaster.category` (`MFCategory`) | Coarse: EQUITY/DEBT/HYBRID/ETF/INDEX_FUND/ELSS/FMP/LIQUID/… |
| Sub-category | `MutualFundMaster.subCategory` | The raw AMFI header, e.g. "Open Ended Schemes(Equity Scheme - Flexi Cap Fund)" — carries the SEBI category **and** open/close-ended |
| ISIN | `MutualFundMaster.isin` | Growth ISIN; reinvest ISIN is parsed but not stored |
| Active | `MutualFundMaster.isActive` | Falls false when AMFI stops listing the scheme |
| NAV history | `MFNav(fundId, date, nav)` | Daily, `Decimal(18,4)`, unique per day |

## Derivable, deterministically, from what we hold

| Attribute | How | Used for |
|---|---|---|
| Plan (direct/regular) | Scheme-name token — AMFI names carry "Direct"/"Regular" | Eligibility (direct only) |
| Option (growth/IDCW) | Scheme-name token — "Growth", "IDCW", "Dividend", "Payout", "Reinvestment" | Eligibility (growth only) |
| Open vs close-ended | `subCategory` header prefix | Eligibility (open-ended only) |
| Segregated portfolio | Scheme-name token "Segregated Portfolio" | Eligibility (excluded) |
| Track-record length | Span of `MFNav` rows | Eligibility (3y active / 1y passive) |
| Index-tracked | Scheme-name + category (`INDEX_FUND`, `ETF`) | Picks the scoring model |

## NOT held, and no verified source in this repo

| Attribute | Consequence |
|---|---|
| TER (expense ratio) | Degraded: weight redistributed, `ter_unavailable` gap recorded |
| AUM | Degraded: the AUM floor cannot be applied, `aum_unavailable` gap recorded |
| Benchmark / benchmark TRI | Tracking metrics fall back to **peer-relative** (median of same-index peers) and are labelled as such |
| Inception date | Track record is measured from first NAV instead |
| Fund manager and tenure | Degraded: manager-tenure weight redistributed |
| Exit load | Switch recommendations assume **zero exit load**, which understates the cost of switching — flagged on the recommendation |
| Merger / wind-up status | Approximated by `isActive` plus NAV staleness |

**AMFI's daily NAV file is the only machine-readable fund feed this repo
ingests, and it carries none of the above.** TER and AUM are published as
per-AMC disclosures and monthly AAUM workbooks whose formats are not stable
enough to parse blind; adding a fetcher for them without first verifying the
live document against a real download would be inventing a feed, which is worse
than a recorded gap. See the final report for the judgement call.

## Rule for every gap

A missing metric is **never** zero, never a guess and never an average. It is
excluded from the score, its weight is redistributed across the metrics that
survived, and the exclusion is recorded in `FundScoreSnapshot.dataGaps` so any
recommendation built on that score can be explained years later.

A missing attribute that eligibility depends on — plan, option, category,
open-ended status, segregated-portfolio status — makes the fund **ineligible**
with a typed reason, because there is no honest way to rank a scheme we cannot
identify.
