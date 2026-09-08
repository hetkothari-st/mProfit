# Load test — `mfMetricsJob` and `mfPeerRankJob`

Task 6.4 of `07-IMPLEMENTATION-PLAN.md`. Measures the per-scheme cost of the nightly
metrics job on a real NAV series and checks the two jobs' chunk constants against the
budgets they were sized for.

Run date: 2026-09-07. Harness: `packages/api/src/scripts/mfMetricsLoadTest.ts`.

## Verdict

| Constant | Where | Budget it must fit | Measured | Verdict |
|---|---|---|---|---|
| `CHUNK_SIZE = 100` | `jobs/mfMetricsJob.ts` | `CHUNK_BUDGET_MS` = 240 s | 225–267 s per chunk | **DOES NOT HOLD** |
| `CHUNK_SIZE = 100` | `jobs/mfMetricsJob.ts` | Bull `LOCK_DURATION_MS` = 300 s | 225–267 s per chunk | HOLDS, on 11% margin |
| `UNIVERSE_CHUNK_SIZE = 8` | `jobs/mfPeerRankJob.ts` | `SLICE_BUDGET_MS` = 150 s | 69 s at 30 members / **160 s at 70** | **DOES NOT HOLD** at the top of its own stated 20–70 band |
| `UNIVERSE_CHUNK_SIZE = 8` | `jobs/mfPeerRankJob.ts` | Bull `LOCK_DURATION_MS` = 300 s | 69 s / 160 s | HOLDS, ×1.9 at worst |

The number that decides the first row: **240,000 ms ÷ 2,251 ms (median per scheme) =
106.6 schemes.** A chunk of 100 fits the four-minute budget only if every scheme in it is
at or below the median cost. It is not — the p95 was 2,242–2,665 ms across three runs, and
100 × 2,665 ms = 266.5 s, which is 111% of the budget.

The number that decides the third row: **150,000 ms ÷ 8 = 18,750 ms** is the largest
per-universe cost a slice of eight can absorb. A 70-member universe measured **19,965 ms
and 20,106 ms** on two warm runs.

The per-scheme cost assumed in `CHUNK_SIZE`'s own doc comment — "on the order of 0.2–0.5 s
wall clock against a warm local Postgres" — is wrong by **4.5× to 11×**. This was measured
against a warm local Postgres, which is the exact condition that comment names.

Nothing was changed. `CHUNK_SIZE` and `UNIVERSE_CHUNK_SIZE` are as they were; this document
is the finding, not the fix.

## Method

### Hardware and database

| | |
|---|---|
| Machine | Gigabyte H610M K DDR4, Intel Core i7-14700F (20 cores / 28 threads, 2.1 GHz base), 32 GB RAM |
| OS / runtime | Windows 11 Pro, Node v24.15.0, `tsx` |
| Database | PostgreSQL 15.19 in docker container `portfolioos-mfdev`, `localhost:55433`, **unpooled**, loopback only |
| Connection role | `portfolioos_app` (the NOBYPASSRLS runtime role), same as production |
| Contention | None. No API server, no other job, no other client. |

The repo `.env` points at production Neon. `DATABASE_URL` / `DIRECT_URL` were overridden in
the shell (`dotenv` does not override an already-set variable), and the harness additionally
refuses to start against any host that is not `localhost`.

### What was seeded

All rows namespaced under the prefix `LT9` — scheme codes `LT9100000…`, benchmark index
`LT9_BENCH_1`, `LT9:…` source hashes on the risk-free series. The MF reference tables were
empty before the run apart from 14 pre-existing `BenchmarkIndex` rows, which were not
touched.

| Table | Per scheme | 30-scheme run | 70-scheme run |
|---|---|---|---|
| `MfSchemeMeta` + `MutualFundMaster` | 1 + 1 | 30 + 30 | 70 + 70 |
| `MFNav` (`adjustedNav` populated, none quarantined) | 3,914 | 117,420 | 273,980 |
| `BenchmarkIndexPrice` (one shared index) | — | 3,914 | 3,914 |
| `RiskFreeRate` (`TBILL_91D`) | — | 3,914 | 3,914 |
| `MfPortfolioSnapshot` | 12 | 360 | 840 |
| `MfPortfolioHolding` | 660 | 19,800 | 46,200 |
| `MfSchemeAum` | 180 | 5,400 | 12,600 |
| `MfSchemeTer` / `MfSchemeManager` | 4 / 3 | 120 / 90 | 280 / 210 |

Choices that matter:

- **Series length: 3,914 business days, 2011-09-01 → 2026-09-01.** That is
  `MAX_LOOKBACK_YEARS` = `max(MF_HORIZONS)` (10) + `max(ROLLING_WINDOWS)` (5) = 15 years,
  which is exactly the window `loadSchemeInputs` reads. AMFI publishes one NAV per business
  day, so business days — not calendar days — is the real row count. It lands on ~3,900
  points, which is the "~3,800 daily points" `CHUNK_SIZE`'s comment assumes.
- **Every scheme has the full 15 years.** All five horizons and all three rolling windows
  therefore compute. This is the cost of a *fully computable* scheme; see threats to
  validity.
- **NAV is a random walk with drift**, per-scheme drift 0.00030–0.00054/day and σ
  0.0085–0.0107/day, from a seeded mulberry32 PRNG so two runs seed identical series. A
  constant series would make volatility zero and short-circuit every risk-adjusted metric on
  a degenerate denominator — measuring the cheap path and reporting it as the job's cost.
- **55 holdings per snapshot** (50 equity / 3 debt / 1 cash / 1 derivative), reshuffled per
  snapshot so `turnoverPct` is non-trivial rather than a constant zero.
- **Newest snapshot is 1 day old**, so the horizon-0 profile comes out `OK`, not `STALE`.
- `asOf` fixed at **2026-09-01**.
- Universe: one `Large Cap Fund | DIRECT` peer universe, above `MIN_UNIVERSE_SIZE` (10) so
  the ranks are actually computed rather than short-circuited as "category too small".

### How timing was taken

- **Cold pass discarded.** The first `runMfMetricsJob` over the seeded set pays for
  Postgres's first read of every NAV page and Prisma's first-query setup. Discarded.
- **Warm pass measured per scheme.** `Date.now()` around the same
  `computeMetricsForScheme` + `persistSchemeMetrics` pair that `mfMetricsJob.runForScheme`
  calls, one sample per scheme, so the distribution is real rather than a total divided by
  a count. Compute and persist timed separately.
- **Whole-job cross-check.** A third warm `runMfMetricsJob` pass, to catch any job-level
  overhead the per-scheme loop misses.
- Three independent warm runs, `n = 30` each. `p95` is nearest-rank, so at n=30 it is the
  29th sample — read it as "second-worst observed", not as a smooth quantile.

## Measured cost — `mfMetricsJob`

Per scheme, warm, milliseconds. Each row is one independent run of 30 schemes.

| Run | min | median | p95 | max | total (30 schemes) |
|---|---|---|---|---|---|
| A | 2,061 | 2,175 | 2,242 | 2,642 | 65.5 s |
| B | 2,158 | 2,251 | 2,665 | 2,676 | 69.4 s |
| C | 2,214 | 2,294 | 2,369 | 2,409 | 69.0 s |

Median is stable to ±3% across runs; p95 is not (2,242 → 2,665), which is what n=30
nearest-rank buys. The arithmetic below is worked at both.

Whole-job cross-check (`runMfMetricsJob` warm, same 30 schemes): 65.2 s and 67.9 s, i.e.
2,175 and 2,265 ms per scheme. That matches the sum of the per-scheme samples, so the job's
own overhead — the scheme-list query, the chunk loop, the coverage check — is **negligible**
and the chunk cost is `CHUNK_SIZE × per-scheme cost` with nothing else in it.

Cold pass: 71.6 s and 67.1 s for the same 30 schemes — only ~5% above warm. The job is not
page-cache-bound, which is the first hint at the next section.

Rows written: **6 per scheme** (the five horizons plus `horizonYears = 0`), 180 for 30
schemes, exactly as `persistSchemeMetrics` promises.

### Where the time goes

Run B / run C, per scheme, milliseconds:

| Phase | min | median | p95 | max |
|---|---|---|---|---|
| `computeMetricsForScheme` (9 reads + all the math) | 2,140 / 2,196 | 2,235 / 2,278 | 2,647 / 2,351 | 2,654 / 2,389 |
| `persistSchemeMetrics` (6 upserts) | 15 / 16 | 18 / 20 | 30 / 22 | 54 / 22 |
| *(reference)* the 15-year `MFNav` read on its own | 18 / 18 | 19 / 19 | 22 / 22 | 22 / 26 |

**~99% of the cost is CPU, not I/O.** The NAV read — the largest of the nine queries
`loadSchemeInputs` issues, 3,914 rows of `Decimal` — is 19 ms. All six upserts together are
18 ms. Everything else is `decimal.js` arithmetic in `mfMetricsMath.ts`: building the
monthly table five times, the rolling 1/3/5-year windows, and the risk-adjusted set on each.

Two consequences, and they point in opposite directions:

1. A slower database does **not** explain the overrun and a faster one does not fix it.
   Even a 10× slower remote pooled Postgres moves 2,250 ms to roughly 2,600 ms.
2. A slower **CPU** hits this job one-for-one. That is the exposure, and it is the opposite
   of what `CHUNK_SIZE`'s comment worried about ("worse against a pooled remote one").

Incidental correction: the comment says "roughly six indexed reads". `loadSchemeInputs`
issues nine (`MfSchemeMeta`, `MutualFundMaster`, `MFNav`, `BenchmarkIndexPrice`,
`RiskFreeRate`, `MfPortfolioSnapshot`, `MfSchemeTer`, `MfSchemeAum`, `MfSchemeManager`).
It does not change the conclusion — they total ~30 ms — but the count is wrong.

## Chunk arithmetic — `mfMetricsJob`

`CHUNK_SIZE = 100`. `CHUNK_BUDGET_MS = 4 × 60 × 1000 = 240,000 ms`.
`lib/queue.ts`: `JOB_TIMEOUT_MS = LOCK_DURATION_MS = 5 × 60 × 1000 = 300,000 ms`,
`lockRenewTime = 150,000 ms`.

| Per-scheme cost | × 100 = chunk | vs 240 s budget | vs 300 s lock |
|---|---|---|---|
| median, best run (2,175 ms) | 217.5 s | 91% — fits, ×1.10 | 73% — ×1.38 |
| median, worst run (2,294 ms) | 229.4 s | 96% — fits, ×1.05 | 76% — ×1.31 |
| p95, best run (2,242 ms) | 224.2 s | 93% — fits, ×1.07 | 75% — ×1.34 |
| **p95, worst run (2,665 ms)** | **266.5 s** | **111% — OVER, ×0.90** | 89% — ×1.13 |
| max observed (2,676 ms) | 267.6 s | 112% — OVER, ×0.90 | 89% — ×1.12 |

**Verdict: `CHUNK_SIZE = 100` DOES NOT HOLD against `CHUNK_BUDGET_MS`.**

It fits the budget at the median and misses it at the p95. A budget that is met only on the
good half of the distribution is not a budget. Under the four-minute figure the job would
log `'chunk exceeded its runtime budget — reduce CHUNK_SIZE'` on a meaningful fraction of
chunks, which is the warning working correctly and the constant being wrong.

Against the five-minute Bull lock it does still fit — by 33.5 s, an 11% margin. That margin
is the whole safety story, and `CHUNK_BUDGET_MS` exists precisely so the job never has to
rely on it.

Largest chunk sizes the measurement supports, at the worst observed p95 of 2,665 ms:

| Requirement | Max `CHUNK_SIZE` |
|---|---|
| fit inside `CHUNK_BUDGET_MS` (240 s) | 90 |
| fit inside `CHUNK_BUDGET_MS` with 2× margin | 45 |
| fit inside `LOCK_DURATION_MS` (300 s) | 112 |

100 sits between "fits the lock" and "fits the budget it was given". A value of 40 would
give 2× margin under the budget and 2.8× under the lock, and would cost nothing: the job is
sequential across chunks either way, so a smaller chunk changes the total run time by
nothing at all — only the granularity at which a Bull lock could be lost.

### Implied full-universe run

~1,500 ACTIVE schemes, 6 rows each = **9,000 `MfSchemeMetrics` rows per night**.

| Per-scheme cost | Total run | Chunks of 100 | Per chunk |
|---|---|---|---|
| median 2,251 ms | **56.3 min** | 15 | 225 s |
| p95 2,665 ms | **66.6 min** | 15 | 267 s |

Extrapolated from 30 measured schemes to 1,500 by multiplication. That extrapolation is
sound for the *per-scheme* cost — the job is a sequential loop with no shared state and
measured job overhead of ~0 — but see threats to validity for what 1,500 real schemes look
like versus 30 synthetic ones.

## Measured cost — `mfPeerRankJob`

Measured, not extrapolated. The same seeded universe was ranked with
`runMfPeerRankForUniverses([ref], asOf)` after a full metrics pass had populated
`MfSchemeMetrics`, cold pass discarded.

| Universe size | Warm runs | Per member | Rows written | Profiles patched |
|---|---|---|---|---|
| 30 members | 8,287 / 8,605 / 8,742 ms | 276–291 ms | 150 (5/scheme) | 30 |
| 70 members | 19,965 / 20,106 ms | 285–287 ms | 350 (5/scheme) | 70 |

Cost is **linear in universe size** at ~286 ms per member — measured at both ends of the
20–70 band the job's own comment names, so intermediate sizes can be interpolated with
confidence. Above 70 members is extrapolation.

286 ms per member is not far off the metrics job's 2,250 ms per scheme divided by the
horizons, and for the same reason: `loadNavSeries` re-reads a 13-year adjusted-NAV series
for every member and `computeUniversePeerRanks` builds a rolling category series from it.
The peer-rank job repeats, an hour later, a large part of the NAV work the metrics job
already did.

## Chunk arithmetic — `mfPeerRankJob`

`UNIVERSE_CHUNK_SIZE = 8`. `SLICE_BUDGET_MS = 150,000 ms` (half the lock, deliberately).
Lock: 300,000 ms.

| Universe size | × 8 = slice | vs 150 s budget | vs 300 s lock |
|---|---|---|---|
| 30 members (8.6 s) | 68.8 s | 46% — fits, ×2.18 | 23% — ×4.36 |
| 50 members (14.3 s, interpolated) | 114.4 s | 76% — fits, ×1.31 | 38% — ×2.62 |
| **70 members (20.1 s)** | **160.8 s** | **107% — OVER, ×0.93** | 54% — ×1.87 |

**Verdict: `UNIVERSE_CHUNK_SIZE = 8` DOES NOT HOLD against `SLICE_BUDGET_MS` at the top of
the band its own doc comment assumes.** It holds at 30 members and at 50; it fails at 70.

The comment reads: "A universe is 20-70 schemes; loading ~13 years of daily NAV for each …
and computing its rolling series runs in the low single-digit seconds." Measured: **20
seconds** for a 70-member universe, not low single digits — off by roughly 5×. The
conclusion drawn from it ("eight universes per slice therefore sits comfortably inside a
5-minute window even at the high end") happens to survive — 160.8 s is comfortably inside
300 s, ×1.87 — but it survives the lock, not the budget, and the reasoning that produced it
was wrong by 5×.

The largest per-universe cost a slice of eight can absorb is 150,000 ÷ 8 = **18,750 ms**;
70 members cost 20,000 ms. `UNIVERSE_CHUNK_SIZE = 7` would fit (140 s). A slice made
entirely of 70-member universes is a worst case rather than the norm — `listUniverses`
sorts by `universeKey`, so slice composition is alphabetical and therefore arbitrary with
respect to size — but it is the case the constant has to be sized for, and it is the case
the comment explicitly claims to cover.

Neither budget aborts anything. Both `CHUNK_BUDGET_MS` and `SLICE_BUDGET_MS` only emit a
`logger.warn`, and both jobs are `node-cron`-driven today, so nothing kills an overrunning
chunk. The exposure is entirely future: the day either job moves onto Bull, the lock becomes
real and a slice that outlives it is re-enqueued as stalled and double-writes.

## Three knock-on findings

**1. The schedule gap between the two jobs is tighter than documented.**
`mfMetricsJob` is at 23:15 IST, `mfPeerRankJob` at 00:30 IST — a 75-minute gap.
`mfPeerRankJob`'s comment justifies it as: "That job is ~15 chunks at roughly 40-100s each,
so it can run 10-25 minutes; 75 minutes leaves real headroom."

Measured: chunks are **225–267 s each**, not 40–100 s, and the run is **56–67 minutes**, not
10–25. The 75-minute gap leaves **8 to 19 minutes** of margin. It still holds, but on a
quarter of the headroom the comment claims, and it degrades directly with the scheme count:
at ~1,700 ACTIVE schemes the metrics run reaches 75 minutes at p95 and peer rank starts
against a partially-written universe — which, as that comment itself notes, does not error.
It silently ranks against a partial universe.

**2. The cost model in `CHUNK_SIZE`'s comment is inverted.** It attributes the cost to
database reads and warns that a pooled remote database would be worse. Measured, the
database is ~2% of the cost and the CPU is the rest. The risk is a slower core, not a slower
connection.

**3. Both jobs' startup log lines name the wrong time.** `startMfMetricsJob` schedules
`'15 23 * * *'` and logs `'scheduled: mf metrics @22:30 IST'`; `startMfPeerRankJob`
schedules `'30 0 * * *'` and logs `'scheduled: mf peer rank @23:00 IST'`. Both cron
expressions are the corrected ones the surrounding comments argue for; only the log strings
were left behind. Cosmetic, but it is the line an operator reads when debugging a run that
started at the wrong hour.

## Threats to validity

Stated plainly, with what each does to the verdict.

1. **Local unpooled Postgres on loopback, no contention.** Normally this is the big one:
   production is slower. Here it is nearly irrelevant, because the measurement shows the DB
   is ~2% of per-scheme cost. It makes the "DOES NOT HOLD" verdict *stronger*, not weaker —
   there is no database improvement that rescues `CHUNK_SIZE = 100`.
2. **The CPU is fast.** An i7-14700F is a good desktop core, likely faster single-thread
   than the box this deploys on. Since the job is CPU-bound, a production core at 70% of
   this throughput puts per-scheme at ~3.2 s and a 100-chunk at 321 s — **past the
   five-minute lock**, not merely past the budget. There is no headroom multiple that
   covers this, and the tolerances are small enough to state exactly: a chunk of 100 is
   allowed 2,400 ms per scheme by the budget and 3,000 ms by the lock. Against the measured
   median of 2,251 ms that is a **6.6% slowdown before the median chunk misses the budget**;
   against the worst measured p95 of 2,665 ms it is a **12.6% slowdown before a chunk
   outlives the lock**. Those two numbers are the whole safety margin.
3. **Synthetic NAV, complete history.** Every seeded scheme has the full 15-year lookback,
   so all five horizons and all rolling windows compute. Real universes contain young funds
   whose horizons short-circuit on `INSUFFICIENT_DATA` and cost less. So 2,250 ms is the
   cost of a fully-computable scheme, and the mean over 1,500 real schemes will be lower.
   This does not rescue the chunk: `CHUNK_SIZE` has to be sized for the worst chunk, not the
   average one, and a chunk of 100 mature funds is the normal case for a large AMC, not a
   hypothetical. It does mean the *total* run-time figures (56–67 min) are an upper bound.
4. **Fixed portfolio shape.** 55 holdings per snapshot, 12 snapshots. A debt fund
   disclosing 200 holdings costs more in the horizon-0 profile (concentration, duration,
   credit-quality, turnover across 12 snapshots). Not measured. Direction: up.
5. **`n = 30`, p95 by nearest rank** is the 29th of 30 samples and moved 2,242 → 2,665 across
   three runs. The median is stable to ±3%. Where the conclusion could turn on it, both are
   worked above. Precisely: the budget allows 2,400 ms per scheme at `CHUNK_SIZE = 100`;
   that is missed at the p95 of one run in three (2,665 ms), at the max of two runs in three
   (2,642 / 2,676 ms), and at no run's median. That is exactly why the verdict is "does not
   hold" rather than "fails outright".
6. **No live API contention.** The job runs at 23:15 IST against the same pool and box as
   the API. It is sequential, so it holds one connection — but it saturates one core for an
   hour. Interaction with request latency was not measured.
7. **One benchmark index, one risk-free series, one sub-category.** The per-scheme cost does
   not depend on which benchmark is joined, but a category with no benchmark at all
   (`BENCHMARK_UNAVAILABLE` on every horizon) would be cheaper, and none was measured.
8. **Peer rank at exactly 30 and 70 members.** Both measured; per-member cost was 276–291
   ms at both, so linearity is established across the band. Sizes above 70 are extrapolated.

## Reproduction

Container must be up (`docker start portfolioos-mfdev`). The environment prefix is
load-bearing: the repo `.env` points at production Neon, and `dotenv` does not override an
already-set variable. The harness also refuses any host that is not `localhost`.

```bash
cd portfolioos

export DATABASE_URL="postgresql://portfolioos_app:portfolioos_app_dev@localhost:55433/portfolioos"
export DIRECT_URL="postgresql://postgres:postgres@localhost:55433/portfolioos"

# seed → cold pass → warm per-scheme pass → whole-job pass → peer rank → cleanup
pnpm --filter @portfolioos/api run loadtest:mf-metrics

# or one phase at a time
pnpm --filter @portfolioos/api run loadtest:mf-metrics seed
pnpm --filter @portfolioos/api run loadtest:mf-metrics measure
pnpm --filter @portfolioos/api run loadtest:mf-metrics cleanup

# peer rank at the top of its band (seed first at the same size)
LOADTEST_SCHEMES=70 pnpm --filter @portfolioos/api run loadtest:mf-metrics seed
LOADTEST_SCHEMES=70 pnpm --filter @portfolioos/api run loadtest:mf-metrics peer
pnpm --filter @portfolioos/api run loadtest:mf-metrics cleanup
```

Cleanup is prefix-scoped — there is no unscoped `deleteMany` in the harness, so it is safe
against a developer database that has real reference data in it. `MfPeerRank` is deleted
explicitly because it holds `schemeCode` as a bare string with no FK and does not cascade
off `MfSchemeMeta`; everything else does.

Cleanup after the runs recorded here:

```
cleanup: MfPeerRank=350 MfSchemeMeta=70 MutualFundMaster=70 BenchmarkIndex=1 RiskFreeRate=3914
residual rows under the LT9 prefix: {"MfSchemeMeta":0,"MutualFundMaster":0,"MfSchemeMetrics":0,
  "MfPeerRank":0,"BenchmarkIndexPrice":0,"RiskFreeRate":0}
```

Verified independently with psql — every MF reference table back to its pre-test state, the
14 pre-existing `BenchmarkIndex` rows intact:

```
 meta | master | nav_total | metrics_total | peer_total | bench_total | bench_px | rf | snaps | holds | ter | aum | mgr
    0 |      0 |         0 |             0 |          0 |          14 |        0 |  0 |     0 |     0 |   0 |   0 |   0
```

## What this does not decide

The remedy. `CHUNK_SIZE` was deliberately left at 100 and `UNIVERSE_CHUNK_SIZE` at 8 — this
task was to measure and report, and changing a constant in the same pass would have made the
measurement unreproducible against the code it describes. The options, for whoever takes it:

- Drop `CHUNK_SIZE` to 40. Costs nothing (chunks are sequential; the total is unchanged) and
  buys 2× margin under the budget and 2.8× under the lock.
- Drop `UNIVERSE_CHUNK_SIZE` to 7, or size the slice by expected member count rather than
  universe count — the cost is linear in members, so eight universes is the wrong unit.
- Or attack the 2,250 ms itself. 99% of it is `decimal.js` over ~3,900 points, recomputed
  per horizon; the monthly table is already built once per horizon, but the five horizons
  are nested subsets of one series and could share more than they do.
