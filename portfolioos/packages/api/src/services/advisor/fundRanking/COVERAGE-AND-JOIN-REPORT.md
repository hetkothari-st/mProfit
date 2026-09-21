# Release-gate coverage, and making the TER join safe

Two changes to PR #133, both about the same thing: the release gate was
measuring the wrong population, and the TER join was matching on a key that is
not an identifier.

---

## B. Coverage against the population the ranking actually sees

### What was wrong

`fundDataCoverage()` counted `isActive AND planType~direct AND optionType~growth`.
That is three of the eight eligibility rules. The denominator therefore
included:

- NFOs and schemes with no NAV history at all (`nfo_or_no_history`)
- schemes under the minimum track record (`track_record_too_short`)
- schemes whose NAV stopped updating (`nav_stale`)
- segregated side-pockets (`segregated_portfolio`)
- close-ended and interval schemes nobody can buy today (`close_ended`)
- schemes in categories that map to no bucket (`category_unknown`)

None of those can be recommended whatever their TER is. Counting them as
"missing cost data" understates coverage against a universe the ranking never
looks at.

### What it does now

`services/advisor/fundRanking/coverage.ts` runs the real `assessEligibility`
and applies **every** rule except the one that depends on the field being
measured:

| Figure | Denominator |
|---|---|
| TER coverage | passes every rule, **including the AUM rule** |
| AUM coverage | passes every rule **except** size |

Two denominators, not one, because they are not the same population — both are
logged, and the gate quotes the right one in each message.

`category_not_in_bucket` is forgiven in both: eligibility is asked per bucket,
coverage is a question about the whole universe, and a large-cap fund is not
ineligible for being a large-cap fund. `category_unknown` is **not** forgiven,
because a scheme that maps to no bucket genuinely never gets ranked.

NAV history is loaded as a per-scheme `MIN(date), MAX(date)` rather than every
observation. `readTraits` derives `trackRecordYears` from the first and last
dates and `navAgeDays` from the last, and no other eligibility rule touches
the series — so two points carry the same verdict as ten million rows would.

### Per-bucket depth

New check: every bucket an **active ModelPortfolio actually allocates to**
must have at least N eligible candidates. `minCandidatesPerBucket` in the
methodology config, default **5**.

Target weights are versioned and immutable, so "uses this bucket" reads the
newest version of each active portfolio, and a zero weight is not use. A
bucket nothing allocates to is not checked — failing a deployment over an
empty bucket nobody invests in would be noise that teaches people to ignore
the gate.

The reason this is separate from coverage: a bucket can have 100% TER coverage
across three schemes. The percentage says the data is perfect. It is still a
bucket where "the ranking" names the only fund that qualifies, and where the
AMC cap and the hysteresis rules have nothing to work with.

Both are logged at boot, enabled or not:

```
[fundRanking] named-fund data coverage
  terEligibleSchemes, terCoveragePct, aumEligibleSchemes, aumCoveragePct,
  missingAumCount, methodologyInUse, methodologyLatest
[fundRanking] eligible candidates per bucket
  buckets: [{ bucket, eligible, usedByModelPortfolio }]
```

### The figures

Measured 22 Sep 2026 against the live AMFI TER file for August 2026 and the
local master (14,375 schemes, 1,829 of them direct-growth).

**With the methodology's real track-record rule applied, both denominators are
zero on this machine.** The local database holds two days of NAV history — the
AMFI sync had been importing nothing until the parser fix (PR #135) — so every
scheme fails `track_record_too_short`. That is the correct answer to the
question asked; it is not a usable coverage figure.

Probing with that one rule relaxed, so the rest of the gate can be read:

| | Coverage | Denominator |
|---|---|---|
| TER | **99.8%** | 498 |
| AUM | **96.9%** | 1,415 |

Both clear the 95% threshold. For comparison, the old denominator gave TER
96.4% and AUM 94.6% over 1,829 — the AUM figure was **failing** the gate purely
because the denominator contained schemes that were ineligible anyway.

Bucket depth on the same probe:

| Bucket | Eligible | Used by a model portfolio |
|---|---|---|
| EQUITY_DOMESTIC | 293 | no |
| CASH_EQUIVALENT | 104 | no |
| DEBT | 86 | no |
| EQUITY_INTERNATIONAL | 11 | no |
| GOLD | 3 | no |
| REAL_ASSETS | 1 | no |
| OTHER_ALT | 0 | no |

No model portfolios exist in this database, so nothing is checked. **On
production, GOLD (3), REAL_ASSETS (1) and OTHER_ALT (0) would fail the gate if
any model portfolio allocates to them**, and on the evidence here they should:
three eligible gold funds is not a ranking. That is the check working.

### The AAUM-missing schemes

44 otherwise-eligible schemes have no AAUM figure.

By category: DEBT 18, EQUITY 12, INDEX_FUND 10, LIQUID 2, ETF 1, OTHER 1.

The pattern is clear and it is mostly **recency**. A large majority first
appear in our NAV history on 2026-09-18 — the first night the fixed AMFI
parser ran — and AMFI's scheme-wise AAUM is published quarterly, so a scheme
launched inside the current quarter has no published figure yet. Examples:

| Scheme code | First NAV | Category | Scheme |
|---|---|---|---|
| 154518 | 2026-09-18 | EQUITY | AlphaGrep Flexi Cap Fund |
| 154600 | 2026-09-18 | EQUITY | Bandhan Contra Fund |
| 154556 | 2026-09-18 | EQUITY | WhiteOak Capital Dividend Yield Fund |
| 154433 | 2026-09-18 | EQUITY | TRUSTMF Large & Midcap Fund |
| 154481 | 2026-09-18 | EQUITY | The Wealth Company Mid Cap Fund |
| 154594 | 2026-09-18 | INDEX_FUND | Axis Nifty Energy Index Fund |
| 154548 | 2026-09-18 | INDEX_FUND | Edelweiss Nifty REITs & Realty Index Fund |
| 154427 | 2026-09-18 | INDEX_FUND | HDFC Nifty Auto Index Fund |
| 154654 | 2026-09-18 | DEBT | DSP Financial Services Sectoral Debt Fund |
| 154413 | 2026-09-20 | DEBT | Choice Overnight Fund |
| 154706 | 2026-09-20 | DEBT | Monarch Overnight Fund |
| 154589 | 2026-09-20 | LIQUID | ASK Liquid Fund |
| 154355 | 2026-09-18 | OTHER | HDFC Gold Silver Passive FOF |

A second, smaller group is genuinely old and genuinely unsized:

| Scheme code | First NAV | Category | Scheme |
|---|---|---|---|
| 124679 | 2016-10-17 | DEBT | Reliance Interval Fund – II – Series 1 |
| 124749 | 2016-10-27 | DEBT | Reliance Interval Fund – II – Series 2 |
| 124753 | 2016-11-01 | DEBT | Reliance Interval Fund – II – Series 3 |
| 134363 | 2017-03-17 | DEBT | Sundaram Banking and PSU Debt Fund (formerly Sundaram Banking and PSU Fund) |
| 119876 | 2022-09-23 | DEBT | Tata Income Fund |
| 119097 | 2022-09-23 | DEBT | Tata Dynamic Bond Fund |
| 147675 | 2022-03-10 | DEBT | Nippon India Ultra Short Term Fund |
| 147864 | 2025-04-01 | EQUITY | Tata Quant Fund |

The Reliance Interval Fund series are interval schemes that AMFI still lists;
they are excluded on `close_ended` in a full run anyway.

**Caveat on the launch dates.** "First NAV" is the first NAV *we hold*, which
on this database is mostly the night the fixed parser ran, not the scheme's
launch. Real launch dates need either production's NAV history or the part-A
backfill (`backfill:amfi-nav-gap`). The categories are real; the dates for the
2026-09-18 cohort are not.

---

## C. TER join safety

### What was wrong

AMFI's TER workbook carries an NSDL scheme code, a base scheme name, a type
and a category — **no AMFI scheme code and no ISIN**. The join was on the
normalised base name alone, with a guard that dropped a name resolving to more
than twelve of our rows.

That guard protects against nothing that matters. Product names are not unique
across AMCs — "Large Cap Fund", "Nifty 50 Index Fund", "Liquid Fund" — and a
name-only join hands one AMC's cost to another AMC's fund. A wrong TER is
worse than a missing one: a missing TER is a recorded gap the methodology
already redistributes around, a wrong one is a silent input to a
cost-weighted ranking that nobody would ever question.

### The rule now

`priceFeeds/terJoin.ts`. A match is accepted only when **both** hold:

1. **The AMC matches.**
2. **The match is one-to-one in the direct-growth population** — the only
   population the ranking can recommend from, and the only one in which a
   scheme name should be unique.

A key claimed by two of our schemes, or by two TER rows that disagree on the
figure, is `AMBIGUOUS` and nothing is written. Two rows that *agree* are one
answer written twice and are accepted, taking the latest date so two runs over
the same file record the same `asOf`.

Anything unmatched is recorded: `MutualFundMaster.terJoinStatus` is rewritten
for the whole direct-growth population every run, and scoring turns that into
a `ter_unmatched` (or `ter_unmatched_ambiguous_name`) entry in `dataGaps`
rather than the generic `ter_unavailable`, which read identically whether AMFI
omitted the scheme or the name turned out not to identify one.

`terPct` is **not** cleared when a scheme stops matching. Last month's figure
is better evidence than none, and `terAsOf` already says how old it is.

### Judgement call: the AMC brand is derived from the data

The TER file has no AMC column. The only AMC signal is the brand AMFI writes
at the front of the scheme name in both files.

Matching that against the registered AMC name does not work, and the failure
is not marginal:

- "Kotak Mahindra Mutual Fund" names its schemes "Kotak …"
- "Franklin Templeton Mutual Fund" names them "Franklin India …"
- "Trust Mutual Fund" names them "TRUSTMF …"

A registered-name-only rule lost every fund from those houses — **259
unmatched, 83.7% matched**. That is a correctness rule turning into a
data-loss rule.

So each AMC contributes two brands: its registered name, and the longest
common leading word sequence of its own scheme names (capped at three words),
read from the data rather than from a hand-maintained alias table that would
go stale the first time an AMC rebranded. A brand two different AMCs both
claim is dropped — that is the exact case the AMC check exists for, and
resolving it by picking one would be the guess this refuses to make.

### Judgement call: apostrophes are deleted, not spaced

`normaliseSchemeName` turned `'` into a space, so NAVAll's "Axis Children's
Fund" normalised to `axis children s fund` while a TER file writing "Axis
Childrens Fund" gave `axis childrens fund`. A fund should not lose its TER
over a typographical convention. Apostrophes are now removed before the
punctuation pass. The existing assertion in `amfiCostAndSize.test.ts` was
updated, with the reason in a comment — it was asserting the old behaviour,
not a requirement.

### The measured effect

Live AMFI TER file for August 2026 (63,682 rows, 12 skipped — all disclaimer
text), against 1,829 direct-growth schemes:

| | Name-only (before) | AMC + one-to-one (now) |
|---|---|---|
| Matched | ~96.7% of names | **1,669 (91.3%)** |
| Unmatched | — | 106 |
| Ambiguous keys | 1 (the blank row) | 20 |
| TER rows with no known AMC | — | 56 |

Coverage against the *eligible* population is **99.8%** (see B), because most
of the 106 unmatched schemes fail another eligibility rule anyway.

The 20 ambiguous keys are real and worth reading — they are cases where our
master holds several direct-growth rows under one name:

```
invesco::invesco india liquid fund          5 schemes
quant::quant liquid fund                    4 schemes
jm financial::jm liquid fund                3 schemes
nippon india::nippon india equity savings fund (… segregated portfolios 2)   3
axis::axis childrens fund                   2 schemes
canara robeco::canara robeco liquid fund    2 schemes
```

Those are liquid funds with several direct-growth variants that share a base
name. The join declines all of them. That is the intended outcome: a wrong
TER on a liquid fund would feed straight into a cost-weighted ranking of
liquid funds, where TER is nearly the whole decision.

The 56 TER rows with no known AMC are dominated by ETFs whose names carry no
AMC brand at all — `BHARAT 22 ETF`, `Bharat Bond ETF – April 2030/2032/2033`,
`Bharat Bond ETF FOF – April 2032`. There is no honest way to attribute those
from the name, and they are ETFs rather than direct-growth open-ended schemes.

### The audit sample

`src/scripts/terJoinAudit.ts`, wired as `pnpm --filter @everypaisa/api ter:audit`.

Re-runs the join in memory against the live workbook and the current master —
so the CSV shows what the join *would* do today, not what some past run left
in the column — and writes a random sample:

```
scheme_code, amfi_name, amc_name, ter_file_name, matched_ter_pct, ter_as_of
```

Random rather than the first 50: the first 50 alphabetically are one or two
AMCs, and a sample that cannot contain a mismatch cannot find one. The PRNG is
seeded (`--seed`, default `20260922`) so "row 34 looks wrong" is reproducible.

A 50-row sample from the August 2026 file is committed at
`ter-join-audit-2026-08.csv`. **It has not been checked against AMC
factsheets** — that is the manual step this file exists to enable, and it is
the only thing that can turn "structurally hard to get wrong" into evidence.

---

## Files

| File | What |
|---|---|
| `fundRanking/coverage.ts` | New. Eligibility-aware coverage, bucket depth, AAUM-missing list |
| `fundRanking/releaseGate.ts` | Two denominators, per-bucket check, both logged at boot |
| `fundRanking/types.ts` | `minCandidatesPerBucket`, `FundCandidate.terJoinStatus` |
| `fundRanking/scoring.ts` | `ter_unmatched` gap reason |
| `fundRanking/scoringRun.service.ts` | Threads `terJoinStatus` |
| `priceFeeds/terJoin.ts` | New. The join rule and its reasoning |
| `priceFeeds/amfiCostAndSize.service.ts` | Uses it; writes `terJoinStatus` |
| `priceFeeds/amfiTer.parse.ts` | Apostrophe handling |
| `src/scripts/terJoinAudit.ts` | New. The audit CSV |
| `prisma/…/20260922100000_fund_cost_and_size` | `terJoinStatus`, `(amcName, schemeName)` index, `minCandidatesPerBucket: 5` |
| `test/priceFeeds/terJoin.test.ts` | New. 15 tests, including colliding names across AMCs |
| `test/services/advisor/fundRanking/exitLoadAndGate.test.ts` | 5 new gate tests |

`test/services/advisor test/priceFeeds test/adapters`: **870 passed, 33 files**.
