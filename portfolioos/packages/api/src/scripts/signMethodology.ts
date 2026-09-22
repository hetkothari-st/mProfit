/**
 * Sign a ranking methodology version. Explicit, deliberate, human-triggered.
 *
 * This used to happen as a side effect of the nightly scoring job, which
 * coupled two unrelated things — computing numbers, and a named person taking
 * responsibility for the method behind them. The practical cost was that a
 * deployment could not compute a single snapshot without also signing, so
 * nobody could look at what the engine would recommend before deciding
 * whether to stand behind it.
 *
 * Signing is now this script and nothing else. There is a test asserting no
 * other code path calls `signMethodology`.
 *
 *   pnpm --filter @everypaisa/api methodology:sign
 *   pnpm --filter @everypaisa/api methodology:sign -- --version 2
 *   pnpm --filter @everypaisa/api methodology:sign -- --dry-run
 *
 * Requires `RIA_PRINCIPAL_OFFICER`. It throws without one rather than signing
 * anonymously: a regulator asking who approved this will not accept a blank.
 */

import 'dotenv/config';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { runAsSystem } from '../lib/requestContext.js';
import { latestMethodology, signMethodology } from '../services/advisor/fundRanking/methodology.service.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const versionArg = arg('version');
  const version = versionArg === undefined ? undefined : Number.parseInt(versionArg, 10);

  const latest = await runAsSystem(() => latestMethodology());
  process.stdout.write(
    `Latest version: ${latest?.version ?? 'none'} (signed: ${latest?.signed ?? false})\n`,
  );
  process.stdout.write(
    `Principal officer: ${env.RIA_PRINCIPAL_OFFICER ? 'set' : 'NOT SET — signing will refuse'}\n`,
  );

  if (dryRun) {
    process.stdout.write('Dry run: nothing signed.\n');
    return;
  }

  const result = await runAsSystem(() => signMethodology({ version }));
  process.stdout.write(
    result.signed
      ? `Signed version ${result.version} as "${result.signedOffBy}".\n`
      : 'Nothing to sign — no unsigned version matched.\n',
  );
}

main()
  .catch((err) => {
    process.exitCode = 1;
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  })
  .finally(() => prisma.$disconnect());
