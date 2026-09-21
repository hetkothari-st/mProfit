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
import { fundDataCoverage, type FundDataCoverage } from './coverage.js';
import { currentMethodology } from './methodology.service.js';
import type { MethodologyConfig } from './types.js';

const DEFAULT_MIN_COVERAGE_PCT = 95;
/** A bucket with fewer eligible schemes than this is not being ranked. */
const DEFAULT_MIN_CANDIDATES_PER_BUCKET = 5;

export interface ReleaseGateResult {
  ok: boolean;
  /** Empty when ok. Each entry is a sentence a human can act on. */
  problems: string[];
  coverage: FundDataCoverage;
  methodology: { inUse: number | null; latest: number | null; signed: boolean };
}

export async function evaluateNamedFundReleaseGate(): Promise<ReleaseGateResult> {
  const signed = await currentMethodology();
  const latestRow = await prisma.rankingMethodologyVersion.findFirst({
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  const config = signed?.config as MethodologyConfig | undefined;
  const minTer = config?.coverage?.minTerCoveragePct ?? DEFAULT_MIN_COVERAGE_PCT;
  const minAum = config?.coverage?.minAumCoveragePct ?? DEFAULT_MIN_COVERAGE_PCT;
  const minPerBucket =
    config?.coverage?.minCandidatesPerBucket ?? DEFAULT_MIN_CANDIDATES_PER_BUCKET;

  // Coverage is measured through the real eligibility rules, which need a
  // methodology to read them from. With none signed there is nothing to
  // measure against, and the missing signature is already the first problem.
  const coverage = config
    ? await fundDataCoverage(config)
    : {
        eligibleSchemes: 0,
        terCoveragePct: 0,
        aumEligibleSchemes: 0,
        aumCoveragePct: 0,
        missingAum: [],
        buckets: [],
      };

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
  if (signed && coverage.terCoveragePct < minTer) {
    problems.push(
      `TER coverage is ${coverage.terCoveragePct}% of ${coverage.eligibleSchemes} eligible schemes, below the ${minTer}% required. ` +
        'Run the AMFI cost-and-size refresh before naming funds on a cost-weighted ranking.',
    );
  }
  if (signed && coverage.aumCoveragePct < minAum) {
    problems.push(
      `AUM coverage is ${coverage.aumCoveragePct}% of ${coverage.aumEligibleSchemes} eligible schemes, below the ${minAum}% required. ` +
        'Without it most of the universe is ineligible and the ranking is drawn from whatever happens to have data.',
    );
  }

  // Depth, not just coverage. A bucket can have 100% TER coverage across
  // three schemes and still be a bucket where "the ranking" names the only
  // fund that qualifies. Checked for buckets an active ModelPortfolio
  // actually allocates to — a bucket nothing invests in needs no candidates.
  for (const b of coverage.buckets) {
    if (!b.used) continue;
    if (b.eligible >= minPerBucket) continue;
    problems.push(
      `Bucket ${b.bucket} has ${b.eligible} eligible ${b.eligible === 1 ? 'scheme' : 'schemes'}, ` +
        `below the ${minPerBucket} required, and a model portfolio allocates to it. ` +
        'Naming a fund from a bucket that thin is picking the only option, not ranking.',
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
      // Two denominators, not one: each excludes only the rule that depends
      // on the field it measures, so they are not the same population.
      terEligibleSchemes: result.coverage.eligibleSchemes,
      terCoveragePct: result.coverage.terCoveragePct,
      aumEligibleSchemes: result.coverage.aumEligibleSchemes,
      aumCoveragePct: result.coverage.aumCoveragePct,
      missingAumCount: result.coverage.missingAum.length,
      methodologyInUse: result.methodology.inUse,
      methodologyLatest: result.methodology.latest,
    },
    '[fundRanking] named-fund data coverage',
  );

  // Depth per bucket, logged beside coverage because a healthy percentage
  // over a thin bucket is the failure this pair is meant to make visible.
  logger.info(
    {
      buckets: result.coverage.buckets.map((b) => ({
        bucket: b.bucket,
        eligible: b.eligible,
        usedByModelPortfolio: b.used,
      })),
    },
    '[fundRanking] eligible candidates per bucket',
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
