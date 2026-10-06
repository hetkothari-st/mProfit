# Fund ranking v2 — cost and size

Follow-up to the v1 report. v1 scored funds with no TER and no AUM because this
repo held neither. v2 has both, from AMFI's own published data.

---

## 1. Coverage achieved, per field

Measured on 21 Sept 2026 by running the real fetchers against live AMFI and
counting the population the ranking actually sees — **active, direct plan,
growth option** (1,829 schemes). The market has roughly eight rows per scheme
once plans and options are counted, and only one of them can ever be
recommended, so counting all 14,375 would flatter the number.

| Field | Coverage | Matched | Source | Join |
|---|---|---|---|---|
| **TER** (direct plan) | **96.4%** | 1,763 / 1,829 | `/api/populate-te-rdata-revised?…&excel=true` — the published TER workbook, 63,682 rows for Aug 2026 | Normalised base scheme name |
| **AUM** (average, quarterly) | **94.6%** | 1,730 / 1,829 | `/api/average-aum-schemewise` — scheme-wise AAUM, 10,567 rows across 71 AMCs | **AMFI scheme code, exact** |
| Both | 93.3% | 1,706 / 1,829 | | |

**The AUM figure is 0.4pp below the 95% release gate, so named-fund advice will
refuse to boot today.** That is the gate working, not a bug to route around: the
missing 5.4% are schemes with no AAUM published for the April–June 2026 quarter,
mostly launched after it closed. Either the next quarterly publication closes
the gap, or the threshold is a deliberate decision to lower — it was not lowered
here to make the number pass.

### A live bug found on the way in

AMFI's NAVAll file gained two columns — Plan and Option are now their own
fields, taking it from six to eight:

```
code;isin;isinReinvest;name;NAV;date                 (what the parser expected)
code;isin;isinReinvest;name;Plan;Option;NAV;date     (what AMFI now publishes)
```

Read with the old offsets, `"Direct Plan"` lands where the NAV belongs, every
row fails the numeric check, and **the NAV sync silently imported nothing**.
The parser now handles both layouts. On the first run after the fix it created
14,375 scheme masters and 14,375 NAV rows — on a database where the sync had
been "succeeding" and writing zero.

Two consequences beyond fixing the sync:

- `planType` and `optionType` are stored, so eligibility reads AMFI's own
  columns instead of guessing "direct" and "growth" out of a scheme name. That
  was the weakest link in the gate keeping commission-bearing regular plans out
  of advice.
- `schemeName` is now AMFI's **base** name, which is exactly what the TER file
  keys on — the reason a name join is viable at all.

---

## 2. v2 config, diff from v1

| Setting | v1 | v2 | Why |
|---|---|---|---|
| `scoringPassive.ter` | 40, **redistributed** (no data) | 40, **scored** | Cost is the one part of a tracker's return knowable in advance. v1 had to rank index funds on tracking fidelity alone. |
| `scoringActive.ter` | 15, **redistributed** | 15, **scored** | Same weight, now with a figure behind it. |
| `eligibility.requireAum` | absent (effectively false) | **true** | With no AUM source, excluding on it would have emptied the universe. With one, a scheme we cannot size is one we cannot honestly rank — size decides whether a single redemption moves the portfolio. Recorded as `aum_unknown`. |
| `selection.minHoldingDaysForSwitch` | — | **365** | See §3. |
| `coverage.minTerCoveragePct` / `minAumCoveragePct` | — | **95 / 95** | See §4. |
| Everything else | unchanged | unchanged | Rolling windows, weights, hysteresis, AMC cap and the rest carry over; this version is about data, not calibration. |

`minAumInr` stays at ₹500 crore and is now live rather than inert.

---

## 3. Exit load: suppression, not estimation

We still hold **no exit-load schedules**, and most equity funds charge about 1%
on units redeemed inside a year. A switch recommendation priced without it
understates the cost by its largest component and the client pays the
difference.

So until a verified source exists, `switchIsWorthIt` **suppresses the switch
entirely** for any lot held under 365 days, with the reason recorded verbatim:
`exit load unknown, lot within 12 months`. An unknown holding period is treated
as recent, because the alternative is optimism about a cost we cannot see. Lots
past the window proceed as before, still flagged with `exitLoadAssumedZero`.

---

## 4. Release gate

With `RIA_VERDICTS_ENABLED=true`, boot fails unless:

1. TER coverage **and** AUM coverage each clear the configured threshold
   (default 95% of otherwise-eligible schemes), and
2. the signed methodology in use is the newest version that exists.

The second is the subtler one: a deployment quietly advising under v1 while v2
sits unsigned is precisely the drift the versioning scheme exists to prevent.

Coverage is logged on **every** boot, enabled or not, so a deployment drifting
towards the threshold is visible before it crosses it rather than after.

Failing to boot is deliberate, and matches how a missing SEBI registration
number is already treated: a deployment configured to name funds but unable to
do so honestly should not start and quietly serve something else, because
nobody would notice.

---

## 5. Judgement calls made without asking

1. **TER is joined on scheme name, not on a code.** AMFI's TER file carries an
   NSDL code and a base scheme name — no AMFI code, no ISIN — so no exact key
   exists at the source. I measured before building: 96.7% of direct-growth
   schemes matched, and exactly one TER base name mapped to more than one NSDL
   code (the blank row), so the key is effectively unique. The brief said to
   stop rather than approximate; a deterministic exact match after
   normalisation is not an approximation, but it is weaker than a code join and
   is called out wherever it appears. A name matching an implausible number of
   our schemes is counted as `ambiguous` and left unmatched.

2. **AUM is quarterly, and that is the freshest published.** AMFI publishes
   scheme-wise AAUM per quarter (currently April–June 2026). A fund's size does
   not move fast enough for this to matter to an eligibility floor, but the
   figure is not "today's".

3. **The 95% thresholds were left at the brief's default even though AUM lands
   at 94.6%.** Lowering a gate to make the current data pass would make the gate
   decorative.

4. **AMC ids are walked, not listed.** The scheme-wise AUM endpoint needs
   AMFI's internal `MF_ID` and publishes no list of them, so the pass walks
   1–120 and keeps whatever answers — 71 AMCs on the live run. Ids that error
   are recorded and skipped, never fatal.

5. **The coverage denominator is direct-plan growth schemes only.** Counting
   every plan and option would have reported 47% where the ranking's own
   population is at 96%.

6. **Cost and size refresh inside the nightly scoring job, before scoring.**
   Scoring yesterday's cost against today's NAVs would rank funds on a mixture
   of two days. A refresh failure is recorded and scoring continues on the
   previous figures — yesterday's TER beats no ranking, and the release gate is
   what stops coverage quietly rotting.

---

## 6. Remaining gaps

| Gap | Status |
|---|---|
| **Exit load** | No source. Switches suppressed inside 12 months; flagged beyond it. |
| **Manager tenure** | No source. Still a `dataGaps` entry, 10 weight redistributed for active funds. |
| **Benchmark TRI** | No source. Tracking difference and error remain **peer-relative** and say so. |
| **Inception date** | Track record still measured from the first NAV we hold. |
| **AUM freshness** | Quarterly by publication; 5.4% of the eligible universe has none for the current quarter. |
| **TER join key** | Name-based. An AMFI code or ISIN in that file would make it exact. |
