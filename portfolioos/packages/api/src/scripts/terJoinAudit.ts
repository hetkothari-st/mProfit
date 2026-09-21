/**
 * A sample of the TER join, for someone to check against AMC factsheets.
 *
 * The join is made on (AMC, scheme name) because AMFI's TER file carries no
 * scheme code and no ISIN. The rules in `terJoin.ts` make a wrong match
 * structurally hard, but "structurally hard" is an argument, not evidence.
 * The only evidence is a human opening 50 factsheets and confirming that the
 * TER we recorded is the TER the AMC publishes.
 *
 * So this writes 50 randomly chosen matched schemes to CSV:
 *
 *   scheme code, AMFI name, TER-file name, matched TER
 *
 * Random, not the first 50: the first 50 alphabetically are all one or two
 * AMCs, and a sample that cannot contain a mismatch cannot find one. Pass
 * `--seed` to reproduce a particular sample when re-checking a finding.
 *
 * Usage
 *   pnpm --filter @everypaisa/api tsx src/scripts/terJoinAudit.ts
 *   ... --count 100 --seed 42 --out ter-audit.csv
 *
 * Reads only. It re-runs the join in memory against the live TER workbook and
 * the current master, so the CSV shows what the join WOULD do today rather
 * than what some past run happened to leave in the column.
 */

import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { latestTerByScheme, parseTerWorkbook } from '../priceFeeds/amfiTer.parse.js';
import { joinTerToSchemes, type JoinScheme } from '../priceFeeds/terJoin.js';
import { terMonthParam } from '../priceFeeds/amfiCostAndSize.service.js';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '' } },
});

const AMFI_BASE = 'https://www.amfiindia.com';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

/**
 * Deterministic PRNG (mulberry32). `Math.random()` would make a finding
 * impossible to reproduce, and "row 34 looks wrong" is only actionable if
 * someone else can get row 34 back.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sample<T>(items: T[], n: number, seed: number): T[] {
  const copy = [...items];
  const rand = rng(seed);
  // Fisher-Yates, partial: only the first n positions need to be settled.
  for (let i = 0; i < Math.min(n, copy.length); i++) {
    const j = i + Math.floor(rand() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, n);
}

/** RFC 4180: quote everything, double any internal quote. Scheme names carry
 *  commas and the occasional quotation mark. */
function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function main() {
  const count = Number.parseInt(arg('count') ?? '50', 10);
  const seed = Number.parseInt(arg('seed') ?? '20260922', 10);
  const out = arg('out') ?? 'ter-join-audit.csv';
  const month = arg('month') ?? terMonthParam(new Date());

  const url = `${AMFI_BASE}/api/populate-te-rdata-revised?MF_ID=All&Month=${month}&strCat=All&strType=All&excel=true`;
  process.stdout.write(`Fetching TER workbook for ${month}…\n`);
  const res = await fetch(url, {
    headers: {
      'user-agent': 'EveryPaisa/1.0 (+portfolio analytics)',
      referer: `${AMFI_BASE}/ter-of-mf-schemes`,
    },
  });
  if (!res.ok) throw new Error(`TER fetch failed: HTTP ${res.status}`);
  const parsed = parseTerWorkbook(Buffer.from(await res.arrayBuffer()));
  if (parsed.rows.length === 0) {
    throw new Error(`TER workbook parsed zero rows: ${JSON.stringify(parsed.skipped.slice(0, 2))}`);
  }
  process.stdout.write(`${parsed.rows.length} TER rows, ${parsed.skipped.length} skipped\n`);

  const funds = await prisma.mutualFundMaster.findMany({
    select: { schemeCode: true, schemeName: true, amcName: true, planType: true, optionType: true },
  });
  const directGrowth: JoinScheme[] = funds
    .filter(
      (f) =>
        f.planType != null &&
        /direct/i.test(f.planType) &&
        f.optionType != null &&
        /growth/i.test(f.optionType),
    )
    .map((f) => ({ schemeCode: f.schemeCode, schemeName: f.schemeName, amcName: f.amcName }));

  const join = joinTerToSchemes(directGrowth, [...latestTerByScheme(parsed.rows).values()]);
  process.stdout.write(
    `direct-growth schemes: ${directGrowth.length}\n` +
      `matched: ${join.matches.length}  unmatched: ${join.unmatched.length}  ` +
      `ambiguous keys: ${join.ambiguous.length}  TER rows with unknown AMC: ${join.unknownAmc.length}\n`,
  );

  const picked = sample(join.matches, count, seed);
  const lines = [
    ['scheme_code', 'amfi_name', 'amc_name', 'ter_file_name', 'matched_ter_pct', 'ter_as_of'].join(','),
    ...picked.map((m) =>
      [
        csvCell(m.schemeCode),
        csvCell(m.amfiName),
        csvCell(m.amcName),
        csvCell(m.terName),
        csvCell(m.terPct.toFixed(4)),
        csvCell(m.asOf.toISOString().slice(0, 10)),
      ].join(','),
    ),
  ];
  writeFileSync(out, `${lines.join('\n')}\n`, 'utf8');
  process.stdout.write(`\nWrote ${picked.length} rows to ${out} (seed ${seed}).\n`);
  process.stdout.write(
    'Check each against the AMC factsheet or the scheme page for the same TER date.\n',
  );
}

main()
  .catch((err) => {
    process.exitCode = 1;
    process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  })
  .finally(() => prisma.$disconnect());
