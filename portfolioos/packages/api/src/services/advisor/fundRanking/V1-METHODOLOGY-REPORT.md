# Fund ranking v1 — build report

Companion to `DATA-INVENTORY.md`. This records what was decided, why, and
which decisions were taken without asking.

---

## 1. Data-attribute inventory

Full detail in `DATA-INVENTORY.md`. The short version:

**Held:** scheme code, scheme name, AMC name, `MFCategory`, the raw AMFI
sub-category header, ISIN, active flag, and daily NAV history.

**Derived deterministically** from the above, all newly parsed for this work:
plan (direct/regular) and option (growth/IDCW) from the scheme name;
open/close-ended from the AMFI header; segregated portfolios from the name;
track-record length from the NAV span; passive/active from category and name.

**Filled:** nothing new was fetched. **Degraded:** TER, AUM, benchmark TRI,
inception date, manager tenure, exit load.

### Why no new fetcher was added

Step 1 allowed adding a price-feed-style fetcher where a reliable public source
exists. I did not, and that is the single most consequential judgement call
here.

AMFI's daily NAV file is the only machine-readable fund feed this repo ingests,
and it carries none of the missing attributes. TER and AUM exist publicly, but
as per-AMC disclosure pages and monthly AAUM workbooks whose formats are not
uniform across ~40 AMCs. Writing a parser for them without downloading the real
documents first would have produced a fetcher that passes its own fixtures and
fabricates in production — the exact failure the repo's own testing note warns
about. A recorded gap is honest; a fabricated feed is not.

**Consequences, each visible in the output rather than hidden:**

| Gap | Effect |
|---|---|
| TER | Index funds lose their largest weight (40) and are scored on tracking fidelity alone, with the weight redistributed. Active funds lose 15. |
| AUM | The `minAumInr` floor cannot bite, so a very small fund is not excluded for size. |
| Benchmark TRI | Tracking difference and error are measured against the **median of same-index peers** and labelled peer-relative. |
| Manager tenure | Active funds lose 10 weight, redistributed. |
| Exit load | `switchIsWorthIt` assumes zero and returns `exitLoadAssumedZero: true`, so the switch cost is understated and says so. |
| Inception date | Track record is measured from the first NAV we hold. |

---

## 2. Judgement calls made without asking

1. **A missing AUM does not make a fund ineligible.** The brief lists plan,
   category and closure status as eligibility-critical; AUM is not among them.
   Since no fund has an AUM, excluding on it would empty the universe and
   guarantee nobody is ever named a fund — failing the client rather than
   protecting them. Recorded as a data gap instead.

2. **The migration seeds v1 unsigned.** SQL cannot read `RIA_PRINCIPAL_OFFICER`,
   and writing a signatory the deployment never named would make the audit
   trail a fiction. `ensureSignedMethodology()` stamps it at job start when the
   flag is on. An unsigned version is never used, so a deployment without a
   named officer degrades to category-level advice.

3. **The migration is hand-written.** `prisma migrate diff` also picked up
   unrelated FK drift across the schema; a migration that drops and recreates
   foreign keys database-wide in order to add two tables is not one anyone
   should run. Verified by applying all 91 migrations to a fresh database.

4. **`namedFundGate` is a new column on `AdvisorRun`,** not a field folded into
   `ruleVersionsSnapshot`. Other code and a test already depend on that blob's
   shape, and breaking the rule inventory to record a gate would trade one
   audit answer for another.

5. **Hybrid and solution-oriented funds map to no bucket.** A
   balanced-advantage fund is part equity and part debt; putting it in one
   bucket would misstate the allocation it was bought to correct. They are held
   and reported, never recommended — the same call `constants.ts` already makes
   by targeting `REAL_ASSETS` and `OTHER_ALT` at zero.

6. **Overlap is unknown, not zero, for funds the client does not hold.**
   Constituent holdings for the wider universe are not ingested, so
   `overlap.ts` returns `null` for everything except a scheme already held.
   Selection treats null as unknown and applies no penalty; treating it as zero
   would let a near-clone through unpenalised.

7. **A held scheme is exempt from the overlap penalty.** It overlaps itself
   completely, and penalising that would fight the top-up preference two rules
   later.

8. **Statistics use `number`, money stays `Decimal`.** Percentiles, Sortino and
   tracking error need square roots and fractional powers. The float arithmetic
   is confined to `metrics.ts` and `scoring.ts`, which never touch a money
   value; `selection.ts` keeps every rupee figure in `Decimal`. This follows the
   precedent `fallbackRankingMath.ts` set for the same reason.

9. **`AdvisorApprovedProduct` stays per-user.** Re-scoping it to a firm entity
   is not a small, safe change — there is no firm model — and as an override an
   empty table now means "no override" rather than "no advice". Recorded in
   CONTEXT.md §15 as a known gap.

10. **`RANKED_UNIVERSE` was added to the `AdvisorProvenance` enum.** Mapping a
    methodology pick onto the existing `FALLBACK_RANKING` would have made the
    audit unable to distinguish a scored, versioned choice from a bare NAV
    ranking.

11. **Tax-harvest re-entry and concentration-trim destinations now name a
    fund.** The brief asked for both. Selling without saying where the proceeds
    go leaves the client in cash, which is its own mis-allocation.

---

## 3. The v1 config, line by line

| Setting | Value | Why |
|---|---|---|
| `minTrackRecordYearsActive` | 3 | Shorter than a full cycle says nothing about a manager's process. |
| `minTrackRecordYearsPassive` | 1 | A tracker has no skill to demonstrate; one year of evidence that it tracks is enough. |
| `minAumInr` | ₹500 crore | Below this, a single redemption moves the portfolio. Currently inert — no AUM data. |
| `maxNavStalenessDays` | 10 | A scheme that stopped pricing has usually merged away before our universe refresh noticed. |
| `rollingReturnYears` / `rollingStepMonths` | 3 / 1 | Three years spans a cycle; monthly steps give ~25 overlapping windows instead of one lucky start date. |
| `riskFreeRatePct` | 6.5 | The Indian 10-year government bond, matching the Sharpe figure already used in analytics. |
| **Active** consistency / downside / Sortino / TER / tenure | 30 / 25 / 20 / 15 / 10 | Frequency of winning is process; size of winning is luck. Downside capture predicts whether the investor stays invested. Cost is certain where returns are not. |
| **Passive** TER / tracking difference / tracking error / AUM | 40 / 30 / 20 / 10 | Cost is the one part of a tracker's return that is knowable in advance. |
| `incumbentRankBand` | 5 | A held fund in the top five is good enough; switching costs tax today for a speculative gain. |
| `hysteresisMarginPct` | 5 | Below five percentile points is inside the noise of a nightly re-score. |
| `hysteresisSnapshots` | 3 | Three consecutive nights distinguishes a trend from a wobble. |
| `maxAmcSharePct` | 40 | Past this, one AMC's operational and key-person risk is the portfolio's risk. |
| `overlapPenaltyPerPct` / `maxOverlapPct` | 0.5 / 40 | Enough to lose to a genuinely different fund, not enough to lose to a much worse one. |
| `snapshotMaxAgeDays` | 3 | Covers a weekend. Older than that and the scores predate news the client has already seen. |

---

## 4. CONTEXT.md changes

- **§8** — `RankingMethodologyVersion` and `FundScoreSnapshot` added to the
  advisor-engine model list.
- **§9.8** — the buy-side universe rewritten as a three-tier precedence
  (override → methodology → NAV fallback), with the three gates and the rule
  that the LLM never selects.
- **§15** — three new known gaps: the missing fund attributes and what each
  one costs; overlap being unknown outside held funds; and
  `AdvisorApprovedProduct` still being per-user.
