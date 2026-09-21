# The AMFI NAV outage: what broke, what is fixed, what is still owed

## What broke

AMFI added two columns to `NAVAll.txt`. It went from

```
Scheme Code;ISIN Growth;ISIN Reinvest;Scheme Name;Net Asset Value;Date
```

to

```
Scheme Code;ISIN Growth;ISIN Reinvest;Scheme Name;Plan;Option;Net Asset Value;Date
```

`parseAmfiNavText` read field 4 as the NAV. In the new file field 4 is
`"Direct Plan"`. `isNaN(Number("Direct Plan"))` is true, so the loop skipped
every row. `loadAmfiNavToDb` then wrote nothing, returned normally, and the
cron logged `[cron] AMFI NAV sync done`.

The NAV sync imported **zero rows** while reporting success, every night, for
as long as the new format had been live. Mutual-fund holdings kept whatever
NAV they last had, so portfolio values, allocation and every nightly net-worth
snapshot in that window were computed from stale prices.

## What is fixed

**1. The parser.** `amfi.service.ts` detects the layout per line
(`parts.length >= 8`) and reads NAV and date from the right offsets in either.
A rollback on AMFI's side is not an outage here. First run after the fix
created 14,375 masters and 14,375 NAV rows.

**2. The thing that should have caught it.** `feedCanary.ts` judges every feed
run against two questions:

- what share of the rows we fetched did we fail to parse? (`FEED_MAX_PARSE_FAILURE_PCT`, default 2)
- how does the imported count compare with the last run that worked? (`FEED_MAX_ROW_DROP_PCT`, default 20)

plus the case that has no baseline: parsed rows, imported none. A trip writes
a `FeedRunLog` row with the reason, logs at `error`, and **throws** — the run
fails rather than carrying on with a thin dataset.

Applied to every feed in `src/priceFeeds/`: `amfi_nav`, `yahoo_stock_eod`,
`yahoo_stock_intraday`, `nse_equity_universe`, `nse_etf_universe`,
`bse_equity_universe`, `nse_corporate_actions`, `commodity_prices`,
`crypto_prices`, `fx_rates`, `nse_fo_master`, `nse_fo_bhavcopy`,
`fuel_prices`.

**3. A backfill.** `src/scripts/backfillAmfiNavGap.ts` detects the window,
pulls AMFI's historical NAV report for it, and upserts `MFNav`. Idempotent:
`(fundId, date)` is unique and a re-run writes the same values.

**4. Snapshots flagged, never rewritten.** `NetWorthSnapshot` gained
`dataQuality` / `dataQualityReason` / `dataQualityAt`. Rows in the window are
marked `ESTIMATED`. The trend chart draws them hollow, names them in the
tooltip, and carries an `EstimatedDataNotice` above it.

## Judgement calls

**`FeedRunLog`, not `IngestionFailure`.** The spec asked for an
`IngestionFailure` row. That table cannot take one: it requires a `userId` and
its RLS policy is `userId = app_current_user_id()`. A market feed belongs to
no user, so a feed-wide failure has no row it could legally write there —
writing one would mean either inventing a user or disabling the policy.
`FeedRunLog` keeps the same contract (recorded, never swallowed, queryable)
for data that belongs to no one, and it doubles as the baseline the canary
needs. It is market-level: no RLS policy, no `USER_SCOPED_MODELS` entry, like
`StockMaster` and `MFNav`.

**A `SKIPPED` verdict for "the source published nothing".** NSE does not
publish an F&O bhavcopy on a trading holiday. Without a way to say so, the
canary would fail that job every holiday and teach everyone to ignore it. A
feed that can genuinely tell "nothing was published" from "we read nothing"
sets `sourceEmpty`; the run is recorded as `SKIPPED`, cannot trip, and does
not become the baseline. **AMFI never sets it** — "NAVAll had no rows" is the
bug, not a holiday.

**Measured at the feed, not at the insert.** Corporate actions are deduped by
design, so a healthy re-run inserts almost nothing; comparing insert counts
would fire every night. Its canary compares rows read from the CSV. Same
reasoning for the universe loads, which compare `created + updated` and ignore
`skipped` (deliberate filtering: wrong series, inactive scrip). A new `failed`
counter separates "a row we meant to write and could not" from that.

**Two feed keys for Yahoo.** The intraday run covers held symbols only, so its
row count moves with the user base. Compared against the EOD run it would trip
constantly, so `yahoo_stock_intraday` has its own baseline.

**A retention window.** Crypto ticks every two minutes; without pruning this
table grows by ~260k rows a year to answer a question that looks back one run.
`FEED_RUN_LOG_RETENTION_DAYS` (default 90) is applied once a day from the AMFI
job. `FAILED` rows are kept twice as long — the evidence outlives the noise.

**Snapshots are flagged, not recomputed — because recomputation is not
possible.** `getDashboardNetWorth()` reads live `HoldingProjection` and takes
no `asOf`. There is no code path that values a portfolio as of a past date,
and `src/scripts/backfillNetWorthHistory.ts` already says so in its own header
("no reliable source for real historical net worth"). "Recomputing" August
would stamp today's prices onto August and destroy the only record of what the
user was actually shown. The spec's fallback applies: keep the number, flag
it, show it as an estimate.

**The fixture was repaired, and that is worth saying.** `navall-excerpt.txt`
contained a paste artifact — the first three rows duplicated into the middle
of a line — that no real NAVAll file would contain, and that would itself have
registered as a parse failure. It was cut, and the missing AMC/bucket headers
for the Aditya Birla rows restored, so the excerpt matches the shape of the
real file.

**A separate parser for the historical report.** AMFI's history endpoint
returns eight semicolon-separated fields too, and puts NAV and date last, so
the NAVAll parser reads it *without complaining* — and gets every fund's
identity wrong, because fields 1–5 are in a different order. It would have
written thousands of NAVs against funds named "GROWTH". `amfiNavHistory.ts`
has its own parser, its own real fixture, and a test asserting the two are not
interchangeable.

## The gap window

**Not yet determined.** It cannot be read off this machine.

- `FeedRunLog` postdates the outage, so it has no record of it. The script
  says so rather than implying otherwise.
- The local dev database is seeded, not synced: it has exactly one day
  (2026-09-18, 7,996 funds) carrying a full NAV set. With only one healthy day
  a gap has no left-hand bound, and the detector refuses to guess:

  ```
  MFNav evidence: only 1 day on record carries a full NAV set (~7996 funds),
  so a gap cannot be bounded — pass --from/--to
  ```

  (An earlier version of the detector walked backwards until it ran out of
  table and confidently reported the gap began on **2 October 2008**. The
  bounded version, and a test for it, replaced it.)

The production database has the daily history. Run, against prod:

```
pnpm --filter @everypaisa/api backfill:amfi-nav-gap -- --detect-only
```

That prints the gap start and end from `MFNav` day counts. Then `--dry-run` to
see the row and snapshot counts, then without flags to write. **I have not run
this against production** — touching Railway needs your say-so.

## Then report, from that run

- **Gap start date** — printed by `--detect-only`.
- **Rows backfilled** — printed as `Backfilled N NAV rows across M dates`.
- **Snapshots affected** — printed as `N NetWorthSnapshot rows across M users`.

## Files

| File | What |
|---|---|
| `src/priceFeeds/amfi.service.ts` | Both layouts; parse-failure counting |
| `src/priceFeeds/feedCanary.ts` | `judgeFeedRun`, `runFeedWithCanary`, `pruneFeedRunLogs` |
| `src/priceFeeds/amfiNavHistory.ts` | Historical report parser + fetch |
| `src/priceFeeds/amfiNavGap.ts` | `findNavGap`, `monthWindows` (pure) |
| `src/scripts/backfillAmfiNavGap.ts` | Detect → backfill → flag |
| `src/jobs/priceJobs.ts` | Every feed wrapped |
| `src/config/env.ts` | Three thresholds |
| `prisma/migrations/20260922140000_feed_run_log` | `FeedRunLog` |
| `prisma/migrations/20260922150000_snapshot_data_quality` | Snapshot flag + CHECK |
| `apps/web/.../RestrictedNotice.tsx` | `EstimatedDataNotice`, `EstimatedChip` |
| `apps/web/.../NetWorthTrendChart.tsx` | Hollow points, notice, tooltip |
| `test/priceFeeds/*.test.ts` | 40 tests |
