/**
 * Better-scoring funds in the same category.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT `findReplacement`
 * ---------------------------------------------------------------------------
 *
 * `mfVerdict.findReplacement` already picks a replacement fund, and it is the
 * right function for the job it does: it filters an advisor-APPROVED universe,
 * and its answer is fed to a verdict that also weighs the reader's holding
 * size, exit load and capital-gains position through `computeSwitchCost`. That
 * is advice, and advice needs all of it.
 *
 * A research page has none of it. The reader may not hold the fund at all. So
 * this answers a strictly smaller question — "which funds in this category
 * score better?" — from the same `MfSchemeScore` rows the rating itself came
 * from. No approved universe, no switch cost, no recommendation.
 *
 * The distinction is not pedantry. "Fund X scores higher" is a fact about two
 * funds. "Switch to fund X" is a claim about the reader, and getting it wrong
 * costs them an exit load and a tax event to move between two funds that were
 * a percentage point apart.
 *
 * ---------------------------------------------------------------------------
 * WHY LIKE FOR LIKE, STRICTLY
 * ---------------------------------------------------------------------------
 *
 * Candidates share the subject's `universeKey`, which is (sub-category, plan).
 * Both halves matter. Comparing across sub-categories would offer a small-cap
 * fund to a large-cap holder on the strength of a number that means something
 * different in each. Comparing across plans would offer a DIRECT plan's score
 * to a REGULAR holder, where the whole gap is the commission — real, but a
 * different conversation from "this fund is managed better".
 */

import { prisma } from '../../lib/prisma.js';
import type { MfAlternativesDto, MfAlternativeDto, Pct, Ratio } from '@portfolioos/shared';

/**
 * How many to return.
 *
 * Short on purpose. A reader comparing three funds is choosing; a reader
 * comparing twenty is being asked to do the analysis themselves, which is the
 * thing this page exists to have already done.
 */
export const MAX_ALTERNATIVES = 3;

function asRatio(v: unknown): Ratio | null {
  return v === null || v === undefined ? null : (String(v) as Ratio);
}

/** Latest disclosed TER per scheme, as of a date. */
async function latestTerFor(schemeCodes: readonly string[]): Promise<Map<string, Pct>> {
  const out = new Map<string, Pct>();
  if (schemeCodes.length === 0) return out;

  // One row per scheme: the most recent `effectiveFrom` at or before now. TER
  // is a history, and quoting a superseded one next to a current one would make
  // the cheaper fund look dearer for no reason the reader could see.
  const rows = await prisma.mfSchemeTer.findMany({
    where: { schemeCode: { in: [...schemeCodes] } },
    orderBy: [{ schemeCode: 'asc' }, { effectiveFrom: 'desc' }],
    select: { schemeCode: true, terPct: true, effectiveFrom: true },
  });
  for (const row of rows) {
    if (!out.has(row.schemeCode)) out.set(row.schemeCode, row.terPct.toString() as Pct);
  }
  return out;
}

export async function loadAlternatives(schemeCode: string): Promise<MfAlternativesDto> {
  // The subject's own latest score fixes both the comparison point and the
  // as-of. Reading candidates at a different as-of would compare this month's
  // score against last month's for funds the job had not reached yet.
  const subject = await prisma.mfSchemeScore.findFirst({
    where: { schemeCode },
    orderBy: { asOf: 'desc' },
    select: {
      asOf: true,
      composite: true,
      rating: true,
      universeKey: true,
      universeSize: true,
    },
  });

  const terForSubject = await latestTerFor([schemeCode]);

  if (subject === null) {
    return {
      schemeCode,
      universeKey: '',
      universeSize: 0,
      asOf: new Date().toISOString().slice(0, 10),
      subjectComposite: null,
      subjectRating: null,
      subjectTerPct: terForSubject.get(schemeCode) ?? null,
      alternatives: [],
    };
  }

  const subjectComposite = subject.composite;

  const candidates =
    subjectComposite === null
      ? []
      : await prisma.mfSchemeScore.findMany({
          where: {
            universeKey: subject.universeKey,
            asOf: subject.asOf,
            schemeCode: { not: schemeCode },
            rating: { not: null },
            composite: { gt: subjectComposite },
          },
          orderBy: [{ composite: 'desc' }],
          take: MAX_ALTERNATIVES,
          select: { schemeCode: true, composite: true, rating: true },
        });

  const metas = await prisma.mfSchemeMeta.findMany({
    where: { schemeCode: { in: candidates.map((c) => c.schemeCode) } },
    select: { schemeCode: true, schemeName: true, amcName: true },
  });
  const metaBy = new Map(metas.map((m) => [m.schemeCode, m]));
  const terBy = await latestTerFor(candidates.map((c) => c.schemeCode));

  const alternatives: MfAlternativeDto[] = candidates.flatMap((c) => {
    const meta = metaBy.get(c.schemeCode);
    // A score with no metadata row is a broken join, not an anonymous fund.
    // Rendering "—" as a name would invite the reader to compare against
    // something that cannot be looked up.
    if (meta === undefined) return [];
    return [
      {
        schemeCode: c.schemeCode,
        schemeName: meta.schemeName,
        amcName: meta.amcName,
        rating: c.rating as MfAlternativeDto['rating'],
        composite: asRatio(c.composite),
        terPct: terBy.get(c.schemeCode) ?? null,
        compositeDelta:
          c.composite === null || subjectComposite === null
            ? null
            : (c.composite.minus(subjectComposite).toString() as Ratio),
      },
    ];
  });

  return {
    schemeCode,
    universeKey: subject.universeKey,
    universeSize: subject.universeSize,
    asOf: subject.asOf.toISOString().slice(0, 10),
    subjectComposite: asRatio(subjectComposite),
    subjectRating: subject.rating as MfAlternativesDto['subjectRating'],
    subjectTerPct: terForSubject.get(schemeCode) ?? null,
    alternatives,
  };
}
