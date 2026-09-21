/**
 * The release gate for named-fund advice.
 *
 * A methodology that scores funds on cost and size is only as good as its
 * coverage of those two figures. At 60% coverage the ranking is not deciding
 * which fund is best — it is mostly deciding which funds happen to have data,
 * and the funds with data are not a random sample. That is a worse failure
 * than having no TER at all, because it looks like a judgement.
 *
 * So when `RIA_VERDICTS_ENABLED=true`, boot fails unless:
 *   1. TER coverage and AUM coverage each clear the methodology's threshold
 *      (default 95% of otherwise-eligible schemes), and
 *   2. the signed methodology in use is the newest version that exists — a
 *      deployment quietly advising under v1 while v2 is the approved method
 *      is exactly the drift this whole versioning scheme exists to prevent.
 *
 * The coverage figures are logged either way, so a deployment that is nowhere
 * near the threshold says so on every boot rather than silently serving
 * category-level advice forever.
 */

import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { env } from '../../../config/env.js';
import { fundDataCoverage } from '../../../priceFeeds/amfiCostAndSize.service.js';
import { currentMethodology } from './methodology.service.js';
import type { MethodologyConfig } from './types.js';

const DEFAULT_MIN_COVERAGE_PCT = 95;

export interface ReleaseGateResult {
  ok: boolean;
  /** Empty when ok. Each entry is a sentence a human can act on. */
  problems: string[];
  coverage: { eligibleSchemes: number; terCoveragePct: number; aumCoveragePct: number };
  methodology: { inUse: number | null; latest: number | null; signed: boolean };
}

export async function evaluateNamedFundReleaseGate(): Promise<ReleaseGateResult> {
  const coverage = await fundDataCoverage();
  const signed = await currentMethodology();
  const latestRow = await prisma.rankingMethodologyVersion.findFirst({
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  const config = signed?.config as MethodologyConfig | undefined;
  const minTer = config?.coverage?.minTerCoveragePct ?? DEFAULT_MIN_COVERAGE_PCT;
  const minAum = config?.coverage?.minAumCoveragePct ?? DEFAULT_MIN_COVERAGE_PCT;

  const problems: string[] = [];
  if (!signed) {
    problems.push(
      'No signed-off ranking methodology. Set RIA_PRINCIPAL_OFFICER and let the scoring job sign one, or turn RIA_VERDICTS_ENABLED off.',
    );
  }
  if (signed && latestRow && signed.version !== latestRow.version) {
    problems.push(
      `Methodology v${signed.version} is in use but v${latestRow.version} exists and is unsigned. ` +
        'Advice must run on the newest approved method, not a superseded one.',
    );
  }
  if (coverage.terCoveragePct < minTer) {
    problems.push(
      `TER coverage is ${coverage.terCoveragePct}% of ${coverage.eligibleSchemes} eligible schemes, below the ${minTer}% required. ` +
        'Run the AMFI cost-and-size refresh before naming funds on a cost-weighted ranking.',
    );
  }
  if (coverage.aumCoveragePct < minAum) {
    problems.push(
      `AUM coverage is ${coverage.aumCoveragePct}% of ${coverage.eligibleSchemes} eligible schemes, below the ${minAum}% required. ` +
        'Without it most of the universe is ineligible and the ranking is drawn from whatever happens to have data.',
    );
  }

  return {
    ok: problems.length === 0,
    problems,
    coverage,
    methodology: {
      inUse: signed?.version ?? null,
      latest: latestRow?.version ?? null,
      signed: Boolean(signed),
    },
  };
}

/**
 * Called at boot. Throws when the gate fails and named-fund advice is on.
 *
 * Failing to boot is deliberate and matches how `collectProductionSecretProblems`
 * treats a missing registration number: a deployment configured to name funds
 * but unable to do so honestly should not start and quietly serve something
 * else, because nobody would notice.
 */
export async function assertNamedFundReleaseGate(): Promise<ReleaseGateResult> {
  const result = await evaluateNamedFundReleaseGate();

  // Logged on every boot, enabled or not: a deployment drifting towards the
  // threshold should be visible before it crosses it.
  logger.info(
    {
      enabled: env.RIA_VERDICTS_ENABLED === 'true',
      eligibleSchemes: result.coverage.eligibleSchemes,
      terCoveragePct: result.coverage.terCoveragePct,
      aumCoveragePct: result.coverage.aumCoveragePct,
      methodologyInUse: result.methodology.inUse,
      methodologyLatest: result.methodology.latest,
    },
    '[fundRanking] named-fund data coverage',
  );

  if (env.RIA_VERDICTS_ENABLED !== 'true') return result;
  if (result.ok) return result;

  for (const problem of result.problems) {
    logger.error({ problem }, '[fundRanking] release gate failed');
  }
  throw new Error(
    `Named-fund advice is enabled but its release gate failed:\n  - ${result.problems.join('\n  - ')}`,
  );
}
