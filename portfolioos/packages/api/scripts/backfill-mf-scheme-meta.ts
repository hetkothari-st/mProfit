/**
 * One-shot (re-runnable) populate of `MfSchemeMeta` from a current AMFI file —
 * `07-IMPLEMENTATION-PLAN.md` Task 1.2, `01-DATA-FOUNDATION.md §3`.
 *
 * Run:
 *   pnpm --filter @portfolioos/api exec tsx scripts/backfill-mf-scheme-meta.ts
 *
 * Options (env):
 *   AMFI_MASTER_FILE      path to a saved NAVAll.txt; omit to fetch live
 *   BACKFILL_OPS_USER_ID  owner of any IngestionFailure row (default: oldest ADMIN)
 *   BACKFILL_DRY_RUN=1    parse and report only; touches no table
 *   BACKFILL_MAX_PASSES   passes before giving up on a budget-limited run (default 10)
 *   BACKFILL_SCHEME_PREFIX  restrict the run to scheme codes with this prefix
 *
 * A word on BACKFILL_SCHEME_PREFIX. Unset, this script reconciles the WHOLE
 * `MfSchemeMeta` table against the file, which is what production wants and is
 * also how you suspend every scheme in a shared development database if the
 * file you pointed at is a small fixture. Set it whenever the file is not a
 * complete AMFI snapshot.
 *
 * The work itself is `runMfMetadataJob` — the same entry point the monthly
 * cron calls — so the backfill cannot drift from the job. This script only
 * sources the text, loops while the job reports its run budget exhausted, and
 * prints a summary.
 *
 * Re-runnable by construction rather than by a guard: the job skips any scheme
 * whose `sourceHash` and derived columns already match, so a second run over
 * an unchanged file writes nothing at all. That is also why looping on
 * `budgetExhausted` is safe — each pass resumes where the last stopped,
 * because everything already written is now a skip.
 */

import { prisma } from '../src/lib/prisma.js';
import { runAsSystem } from '../src/lib/requestContext.js';
import { readFile } from 'node:fs/promises';
import {
  runMfMetadataJob,
  type MfMetadataJobResult,
} from '../src/jobs/mfMetadataJob.js';
import {
  parseAmfiSchemeMasterText,
  mapSchemeMaster,
} from '../src/priceFeeds/amfiSchemeMaster.v1.js';
import { fetchAmfiNavText } from '../src/priceFeeds/amfi.service.js';

const MAX_PASSES = Number.parseInt(process.env.BACKFILL_MAX_PASSES ?? '10', 10);

async function sourceText(): Promise<string> {
  const path = process.env.AMFI_MASTER_FILE;
  if (path) {
    console.log(`[source] reading ${path}`);
    return readFile(path, 'utf8');
  }
  console.log('[source] fetching AMFI NAVAll.txt');
  return fetchAmfiNavText();
}

function printFailures(byReason: Record<string, number>): void {
  const entries = Object.entries(byReason).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    console.log('  failed-by-reason: none');
    return;
  }
  console.log('  failed-by-reason:');
  for (const [reason, count] of entries) console.log(`    ${reason.padEnd(26)} ${count}`);
}

async function dryRun(): Promise<void> {
  const { schemes, duplicateSchemeCodes, failures } = mapSchemeMaster(
    parseAmfiSchemeMasterText(await sourceText()),
  );

  const existing = await runAsSystem(() =>
    prisma.mfSchemeMeta.findMany({ select: { schemeCode: true, sourceHash: true } }),
  );
  const bySource = new Map(existing.map((e) => [e.schemeCode, e.sourceHash]));

  let wouldInsert = 0;
  let hashUnchanged = 0;
  for (const s of schemes) {
    const prior = bySource.get(s.schemeCode);
    if (prior === undefined) wouldInsert += 1;
    else if (prior === s.sourceHash) hashUnchanged += 1;
  }

  const byReason: Record<string, number> = {};
  for (const f of failures) byReason[f.reason] = (byReason[f.reason] ?? 0) + 1;
  if (duplicateSchemeCodes.length > 0) {
    byReason['duplicate_scheme_code'] = duplicateSchemeCodes.length;
  }

  console.log('[dry-run] BACKFILL_DRY_RUN=1 — no writes performed.');
  console.log(`  seen                       ${schemes.length}`);
  console.log(`  already in MfSchemeMeta    ${schemes.length - wouldInsert}`);
  console.log(`  would insert               ${wouldInsert}`);
  // "hash unchanged" is a lower bound on the eventual `unchanged` count: the
  // job also compares the derived columns (benchmark, growth sibling, amcCode)
  // that the hash deliberately excludes, so some of these can still be writes.
  console.log(`  hash unchanged (>= no-op)  ${hashUnchanged}`);
  printFailures(byReason);
}

async function main(): Promise<void> {
  if (process.env.BACKFILL_DRY_RUN === '1') {
    await dryRun();
    return;
  }

  // Fetched once and reused across passes. Re-fetching per pass would let AMFI
  // change the file underneath a multi-pass run, and the vanished-scheme sweep
  // would then be comparing against a different snapshot each time.
  const jobText = await sourceText();
  const prefix = process.env.BACKFILL_SCHEME_PREFIX;
  const scope = prefix ? { schemeCode: { startsWith: prefix } } : undefined;
  if (prefix) console.log(`[scope] restricted to scheme codes starting ${prefix}`);

  const totals: MfMetadataJobResult = {
    seen: 0, inserted: 0, updated: 0, unchanged: 0, suspended: 0, reactivated: 0,
    failed: 0, failuresByReason: {}, dlqWritten: 0, budgetExhausted: false, durationMs: 0,
  };

  for (let pass = 1; pass <= MAX_PASSES; pass += 1) {
    const result = await runMfMetadataJob({
      text: jobText,
      ...(scope ? { scope } : {}),
      ...(process.env.BACKFILL_OPS_USER_ID
        ? { opsUserId: process.env.BACKFILL_OPS_USER_ID }
        : {}),
    });

    totals.seen = result.seen;
    totals.inserted += result.inserted;
    totals.updated += result.updated;
    totals.unchanged = result.unchanged;
    totals.suspended += result.suspended;
    totals.reactivated += result.reactivated;
    totals.failed += result.failed;
    totals.dlqWritten += result.dlqWritten;
    totals.durationMs += result.durationMs;
    for (const [reason, count] of Object.entries(result.failuresByReason)) {
      totals.failuresByReason[reason] = (totals.failuresByReason[reason] ?? 0) + count;
    }

    console.log(
      `[pass ${pass}] seen=${result.seen} inserted=${result.inserted} updated=${result.updated} ` +
        `unchanged=${result.unchanged} suspended=${result.suspended} failed=${result.failed} ` +
        `${result.durationMs}ms${result.budgetExhausted ? ' (budget exhausted, continuing)' : ''}`,
    );

    if (!result.budgetExhausted) break;
    if (pass === MAX_PASSES) {
      console.error(
        `[backfill] still budget-limited after ${MAX_PASSES} passes — the database is far ` +
          `slower than this job assumes; investigate before re-running.`,
      );
      process.exitCode = 1;
    }
  }

  console.log('--- summary ---');
  console.log(`  seen         ${totals.seen}`);
  console.log(`  inserted     ${totals.inserted}`);
  console.log(`  updated      ${totals.updated}`);
  console.log(`  unchanged    ${totals.unchanged}`);
  console.log(`  suspended    ${totals.suspended}`);
  console.log(`  reactivated  ${totals.reactivated}`);
  console.log(`  dlq rows     ${totals.dlqWritten}`);
  printFailures(totals.failuresByReason);
}

main()
  .catch((err: unknown) => {
    // Nothing partial is lost: every pass commits per row, and a re-run resumes.
    console.error('[backfill] failed', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
