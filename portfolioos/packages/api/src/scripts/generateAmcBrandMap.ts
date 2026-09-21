/**
 * Regenerate `src/priceFeeds/amcBrandMap.ts`.
 *
 * The map is generated, committed and reviewed — it is deliberately not
 * computed at runtime, because a runtime derivation changes its answer when a
 * fund house launches a badly-named scheme, and silently drops funds that
 * matched yesterday. See the header of the generated file.
 *
 * Run this when `terJoin.amcBrandMapCoverage` fails in CI, which is what
 * happens the first night a new AMC appears in `MutualFundMaster`. Then READ
 * THE DIFF: a shortened brand on an existing AMC is a warning, not a
 * formality. If a new scheme drags "kotak mahindra" down to "kotak", that is
 * the derivation telling you the new scheme is named unlike its siblings.
 *
 *   pnpm --filter @everypaisa/api amc-brands:generate
 *   ... --dry-run     # print the file, write nothing
 */

import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { amcKey, deriveAmcBrands, type JoinScheme } from '../priceFeeds/terJoin.js';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '' } },
});

const TARGET = join(process.cwd(), 'src', 'priceFeeds', 'amcBrandMap.ts');

const HEADER = (generatedOn: string, amcCount: number) => `/**
 * AMC registered name → the brand tokens AMFI writes on that AMC's schemes.
 *
 * GENERATED, THEN COMMITTED, THEN REVIEWED. Do not hand-edit a value without
 * saying why in the comment above it.
 *
 * ── Why this is a file and not a computation ─────────────────────
 * The TER workbook carries no AMC column, so the AMC half of the join has to
 * be read off the front of the scheme name. The first version derived those
 * brands at runtime from whatever happened to be in \`MutualFundMaster\` that
 * night. That works until it doesn't, and when it doesn't it fails silently:
 * the derivation is a longest-common-prefix over the AMC's own schemes, so
 * one badly-named new scheme shortens its AMC's brand, and funds that matched
 * yesterday stop matching today with nothing in the diff to explain it. The
 * input to a cost-weighted ranking should not change because a fund house
 * launched something.
 *
 * So the derivation runs once, its output is committed here, and it is
 * reviewed like any other code. \`scripts/generateAmcBrandMap.ts\` regenerates
 * it; the accompanying test fails when an AMC in the master is missing from
 * this map, so a new fund house shows up in CI rather than as a silent drop
 * in TER coverage.
 *
 * ── The rule ─────────────────────────────────────────────────────
 * An AMC absent from this map is a MISS, recorded as \`ter_unmapped_amc\`.
 * Never a runtime guess: guessing is what this file exists to stop.
 *
 * Keys are \`amcKey(MutualFundMaster.amcName)\` — lower-cased, punctuation
 * stripped, trailing "mutual fund" removed. Values are every prefix AMFI has
 * been seen to use, longest match wins.
 *
 * Generated ${generatedOn} from ${amcCount} AMCs in MutualFundMaster. The scheme counts in the comments are direct-growth schemes, which is the only population the join reads.
 */

/** Brand tokens by \`amcKey\`. See \`amcKey()\` in terJoin.ts. */
export const AMC_BRANDS: Readonly<Record<string, readonly string[]>> = {
`;

const FOOTER = `};

/**
 * Brand → amcKey, the direction the join actually reads.
 *
 * A brand two AMCs both claim is dropped rather than resolved: that is the
 * exact collision the AMC check exists for, and picking one would be the
 * guess this map replaced.
 */
export const BRAND_TO_AMC: ReadonlyMap<string, string> = (() => {
  const claims = new Map<string, Set<string>>();
  for (const [amc, brands] of Object.entries(AMC_BRANDS)) {
    for (const brand of brands) {
      const set = claims.get(brand);
      if (set) set.add(amc);
      else claims.set(brand, new Set([amc]));
    }
  }
  const out = new Map<string, string>();
  for (const [brand, amcs] of claims) {
    if (amcs.size === 1) out.set(brand, [...amcs][0]!);
  }
  return out;
})();

/** True when we hold brand tokens for this AMC. */
export function isMappedAmc(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(AMC_BRANDS, key);
}
`;

async function main() {
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

  // Brands are derived from EVERY scheme an AMC has, not only its
  // direct-growth ones. A brand is a naming fact about the fund house, not a
  // fact about a share class, and an AMC that has no direct-growth scheme
  // today (IL&FS Mutual Fund (IDF), for one) still has to be in the map
  // before it launches its first — otherwise the brand-map test fails the
  // night that happens, for a fund we could not have joined anyway.
  const allSchemes: JoinScheme[] = funds.map((f) => ({
    schemeCode: f.schemeCode,
    schemeName: f.schemeName,
    amcName: f.amcName,
  }));
  const brands = deriveAmcBrands(allSchemes);

  const registeredByKey = new Map<string, Set<string>>();
  const schemeCountByKey = new Map<string, number>();
  for (const f of funds) {
    const key = amcKey(f.amcName);
    const set = registeredByKey.get(key);
    if (set) set.add(f.amcName);
    else registeredByKey.set(key, new Set([f.amcName]));
  }
  for (const s of directGrowth) {
    const key = amcKey(s.amcName);
    schemeCountByKey.set(key, (schemeCountByKey.get(key) ?? 0) + 1);
  }

  const byAmc = new Map<string, Set<string>>();
  for (const [brand, amc] of brands) {
    const set = byAmc.get(amc);
    if (set) set.add(brand);
    else byAmc.set(amc, new Set([brand]));
  }

  const entries = [...byAmc.entries()].sort(([a], [b]) => a.localeCompare(b));
  const body = entries
    .map(([key, brandSet]) => {
      const registered = [...(registeredByKey.get(key) ?? [])].sort().join(', ');
      const count = schemeCountByKey.get(key) ?? 0;
      const list = [...brandSet].sort().map((b) => `'${b}'`).join(', ');
      return (
        `  // ${registered} — ${count} direct-growth scheme${count === 1 ? '' : 's'}\n` +
        `  '${key}': [${list}],`
      );
    })
    .join('\n');

  const generatedOn = new Date().toISOString().slice(0, 10);
  const file = `${HEADER(generatedOn, entries.length)}${body}\n${FOOTER}`;

  // An AMC whose only brand was contested by another AMC ends up with none,
  // and would silently vanish from the map. Say so rather than shipping it.
  const covered = new Set(byAmc.keys());
  const dropped = [...new Set(allSchemes.map((s) => amcKey(s.amcName)))].filter(
    (a) => !covered.has(a),
  );
  if (dropped.length > 0) {
    process.stdout.write(
      `WARNING: ${dropped.length} AMC(s) have no uncontested brand and are NOT in the map:\n` +
        `  ${dropped.join('\n  ')}\n` +
        'Their schemes will be recorded as ter_unmapped_amc until a brand is added by hand.\n\n',
    );
  }

  if (process.argv.includes('--dry-run')) {
    process.stdout.write(file);
    return;
  }
  writeFileSync(TARGET, file, 'utf8');
  process.stdout.write(
    `Wrote ${entries.length} AMCs to ${TARGET}.\nRead the diff before committing: a shortened brand means a scheme is named unlike its siblings.\n`,
  );
}

main()
  .catch((err) => {
    process.exitCode = 1;
    process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  })
  .finally(() => prisma.$disconnect());
