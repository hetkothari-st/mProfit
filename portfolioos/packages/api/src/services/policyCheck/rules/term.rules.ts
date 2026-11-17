/**
 * Term life rules (all deterministic, no I/O).
 *
 * Same contract as the health rules: a finding must cite evidence and say what
 * would change it, an unknown field produces NO finding (unknown ≠ absent), and
 * nothing is assumed from what other policies usually contain.
 *
 * Regulatory references (stated as general summaries, not legal advice):
 *  - Section 45, Insurance Act 1938 (as amended 2015): a life policy cannot be
 *    called in question on grounds of misstatement or suppression after 3 years
 *    from issue/revival, except for proven fraud.
 *  - IRDAI policyholder-protection rules: grace period of 30 days (15 for
 *    monthly premiums); suicide exclusions are typically limited to the first
 *    12 months.
 */

import type { PolicyEvidence, PolicyFindingDTO } from '@everypaisa/shared';
import { makePolicyFinding, type TermAnalysisFacts, type TermRule } from '../types.js';
import { parseIsoDay, wholeMonthsBetween } from './waiting.continuity.js';
import { documentsConflictsRule } from './documents.conflicts.js';

type F<T> =
  | { value: T | null; confidence: number; sourceDocId: string | null; sourcePage: number | null; clauseHeading: string | null; status: string }
  | undefined;

function known<T>(f: F<T>): f is NonNullable<F<T>> & { value: T } {
  return !!f && f.status !== 'NOT_FOUND' && f.value !== null && f.value !== undefined;
}

function ev(f: NonNullable<F<unknown>>, text: string, heading: string): PolicyEvidence {
  return { docId: f.sourceDocId ?? '', page: f.sourcePage ?? 1, clauseHeading: f.clauseHeading ?? heading, extractedText: text };
}

const conf = (...fs: Array<NonNullable<F<unknown>>>) => String(Math.min(...fs.map((f) => f.confidence)));

function mk(
  facts: TermAnalysisFacts,
  ruleId: string,
  version: string,
  p: Pick<PolicyFindingDTO, 'code' | 'category' | 'severity' | 'headline' | 'evidence' | 'whatWouldChangeThis'> & { confidence: string },
): PolicyFindingDTO {
  return makePolicyFinding(facts, { ruleId, ruleVersion: version, ...p });
}

// ---------------------------------------------------------------------------
// Cover horizon
// ---------------------------------------------------------------------------

export function coverEndAge(x: TermAnalysisFacts['extraction']): { age: number; basis: 'stated' | 'computed'; sources: Array<NonNullable<F<unknown>>> } | null {
  if (known(x.coverEndsAtAge as F<number>)) {
    const f = x.coverEndsAtAge as NonNullable<F<number>> & { value: number };
    return { age: f.value, basis: 'stated', sources: [f] };
  }
  const entry = x.ageAtEntry as F<number>;
  const term = x.policyTermYears as F<number>;
  if (known(entry) && known(term)) return { age: entry.value + term.value, basis: 'computed', sources: [entry, term] };
  return null;
}

const horizonRule: TermRule = {
  id: 'term.horizon',
  version: '1.0.0',
  category: 'COVERAGE',
  evaluate(facts) {
    const c = coverEndAge(facts.extraction);
    if (!c) return [];
    const k = facts.constants;
    const severity = c.age < k.horizonWarnAge ? 'WARNING' : c.age < k.horizonNoticeAge ? 'NOTICE' : 'INFO';
    const code = severity === 'WARNING' ? 'COVER_ENDS_EARLY' : severity === 'NOTICE' ? 'COVER_ENDS_BEFORE_70' : 'COVER_TO_AGE_OK';
    const how = c.basis === 'stated' ? 'as stated' : 'from age at entry plus term';
    return [
      mk(facts, this.id, this.version, {
        code, category: 'COVERAGE', severity,
        confidence: conf(...c.sources),
        headline: `Cover ends at age ${c.age} (${how})`,
        evidence: c.sources.map((s) => ev(s, `Cover ends at age ${c.age}`, 'Policy term')),
        whatWouldChangeThis:
          severity === 'INFO'
            ? 'Nothing to change. Revisit if your dependants, loans or retirement age change.'
            : `Cover stops at ${c.age}. If your family or loans will still depend on your income after that, ` +
              'compare a longer term or check whether this policy allows extending the term.',
      }),
    ];
  },
};

// ---------------------------------------------------------------------------
// Claim-protection terms: suicide clause, grace period, contestability
// ---------------------------------------------------------------------------

const claimTermsRule: TermRule = {
  id: 'term.claim-terms',
  version: '1.0.0',
  category: 'CLAIM_TERMS',
  evaluate(facts) {
    const x = facts.extraction;
    const k = facts.constants;
    const out: PolicyFindingDTO[] = [];

    const sui = x.suicideExclusionMonths as F<number>;
    if (known(sui)) {
      const m = sui.value;
      const long = m > k.standardSuicideMonths;
      out.push(
        mk(facts, this.id, this.version, {
          code: long ? 'SUICIDE_EXCLUSION_LONG' : m === 0 ? 'NO_SUICIDE_EXCLUSION' : 'SUICIDE_EXCLUSION_STANDARD',
          category: 'CLAIM_TERMS', severity: long ? 'WARNING' : 'INFO', confidence: String(sui.confidence),
          headline: long
            ? `Suicide exclusion runs ${m} months — longer than the usual ${k.standardSuicideMonths}`
            : m === 0 ? 'No suicide exclusion period stated' : `Suicide exclusion of ${m} months (standard)`,
          evidence: [ev(sui, `Suicide exclusion: ${m} months`, 'Suicide clause')],
          whatWouldChangeThis: long
            ? 'A suicide exclusion longer than the usual 12 months leaves your family unprotected for longer. Compare policies with the standard period.'
            : 'Nothing to change. The exclusion usually restarts if the policy is revived after lapsing.',
        }),
      );
    }

    const grace = x.gracePeriodDays as F<number>;
    if (known(grace)) {
      const freq = x.premiumFrequency as F<string>;
      const monthly = known(freq) && /month/i.test(freq.value);
      const min = monthly || !known(freq) ? k.minGraceMonthlyDays : k.minGraceDays;
      const short = grace.value < min;
      out.push(
        mk(facts, this.id, this.version, {
          code: short ? 'GRACE_PERIOD_SHORT' : 'GRACE_PERIOD_OK',
          category: 'CLAIM_TERMS', severity: short ? 'WARNING' : 'INFO', confidence: String(grace.confidence),
          headline: short ? `Grace period of ${grace.value} days is shorter than the ${min}-day minimum` : `Grace period of ${grace.value} days`,
          evidence: [ev(grace, `Grace period: ${grace.value} days`, 'Grace period')],
          whatWouldChangeThis: short
            ? `IRDAI rules set a minimum grace period (30 days, 15 for monthly premiums). Check the figure was extracted correctly; if it is right, raise it with the insurer.`
            : 'Nothing to change. Set an auto-debit so a missed premium never lapses the policy.',
        }),
      );
    }

    // Contestability window (Section 45): needs the commencement date.
    const start = x.policyStartDate as F<string>;
    const startMs = known(start) ? parseIsoDay(start.value) : null;
    const asOfMs = parseIsoDay(facts.asOf);
    if (known(start) && startMs !== null && asOfMs !== null && startMs <= asOfMs) {
      const months = wholeMonthsBetween(startMs, asOfMs);
      const inside = months < k.contestabilityMonths;
      const smoker = x.smokerStatusDeclared as F<string>;
      out.push(
        mk(facts, this.id, this.version, {
          code: inside ? 'WITHIN_CONTESTABILITY_WINDOW' : 'PAST_CONTESTABILITY_WINDOW',
          category: 'CLAIM_TERMS', severity: inside ? 'NOTICE' : 'INFO', confidence: String(start.confidence),
          headline: inside
            ? `Policy is ${months} months old — still inside the 3-year window when a claim can be contested`
            : `Policy is ${months} months old — past the 3-year window when a claim can be contested`,
          evidence: [ev(start, `Policy start: ${start.value}${known(smoker) ? `; declared ${smoker.value}` : ''}`, 'Commencement')],
          whatWouldChangeThis: inside
            ? 'Under Section 45 of the Insurance Act, within 3 years of issue an insurer can repudiate a claim for wrong or missing disclosure ' +
              '(health, smoking, income, other cover). Make sure everything on your proposal is accurate; this is a general summary, not legal advice.'
            : 'Under Section 45 of the Insurance Act, after 3 years the insurer cannot call the policy in question except for proven fraud. ' +
              'This is a general summary, not legal advice.',
        }),
      );
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Payout structure
// ---------------------------------------------------------------------------

const payoutRule: TermRule = {
  id: 'term.payout',
  version: '1.0.0',
  category: 'PAYOUT',
  evaluate(facts) {
    const x = facts.extraction;
    const out: PolicyFindingDTO[] = [];
    const opt = x.deathBenefitOption as F<string>;
    if (known(opt)) {
      const v = opt.value.toUpperCase();
      const table: Record<string, [string, 'INFO' | 'NOTICE', string, string]> = {
        LUMP_SUM: ['PAYOUT_LUMP_SUM', 'INFO', 'Death benefit is paid as a lump sum', 'Nothing to change.'],
        LUMP_SUM_PLUS_INCOME: ['PAYOUT_LUMP_SUM_PLUS_INCOME', 'INFO', 'Death benefit is a lump sum plus regular income', 'Nothing to change.'],
        INCREASING: ['PAYOUT_INCREASING', 'INFO', 'Death benefit increases over time', 'Nothing to change; check how much the premium rises to pay for it.'],
        MONTHLY_INCOME: ['PAYOUT_INCOME_ONLY', 'NOTICE', 'Death benefit is paid only as monthly income, not a lump sum',
          'Your family would receive instalments instead of a lump sum, so it cannot clear a loan at once. If you want a lump sum, compare plans that pay one.'],
        DECREASING: ['PAYOUT_DECREASING', 'NOTICE', 'Cover decreases over the term',
          'The payout shrinks each year, which suits a loan that shrinks too, but may fall short of your family’s needs later. Confirm that matches your intent.'],
      };
      const row = table[v];
      if (row) {
        out.push(mk(facts, this.id, this.version, {
          code: row[0], category: 'PAYOUT', severity: row[1], confidence: String(opt.confidence),
          headline: row[2], evidence: [ev(opt, `Death benefit option: ${opt.value}`, 'Death benefit')], whatWouldChangeThis: row[3],
        }));
      }
    }
    const inc = x.coverIncreasesWithTime as F<boolean>;
    if (known(inc) && inc.value === true && !(known(opt) && /INCREASING/i.test(opt.value))) {
      out.push(mk(facts, this.id, this.version, {
        code: 'COVER_STEPS_UP', category: 'PAYOUT', severity: 'INFO', confidence: String(inc.confidence),
        headline: 'Sum assured steps up over time', evidence: [ev(inc, 'Cover increases with time', 'Increasing cover')],
        whatWouldChangeThis: 'Nothing to change. Check the step-up percentage and whether it stops after a certain age.',
      }));
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Riders and in-built benefits
// ---------------------------------------------------------------------------

const ridersRule: TermRule = {
  id: 'term.riders',
  version: '1.0.0',
  category: 'BENEFIT',
  evaluate(facts) {
    const x = facts.extraction;
    const out: PolicyFindingDTO[] = [];
    const spec: Array<{ key: keyof typeof x; label: string; code: string; absent: string; present: string }> = [
      { key: 'criticalIllnessCover', label: 'Critical illness cover', code: 'CRITICAL_ILLNESS',
        absent: 'Life cover alone pays only on death. A critical illness rider pays on diagnosis; compare adding one, or a separate health policy.',
        present: 'Nothing to change. Check which illnesses are covered and the survival period.' },
      { key: 'accidentalDeathBenefit', label: 'Accidental death benefit', code: 'ACCIDENTAL_DEATH',
        absent: 'An accidental death rider adds a further sum if death is accidental. Consider whether it is worth the extra premium for you.',
        present: 'Nothing to change. Check what counts as an accident.' },
      { key: 'waiverOfPremium', label: 'Waiver of premium', code: 'WAIVER_OF_PREMIUM',
        absent: 'Without it, you must keep paying premiums if you become disabled or critically ill, or the cover lapses.',
        present: 'Nothing to change. Check the conditions that trigger the waiver.' },
      { key: 'terminalIllnessBenefit', label: 'Terminal illness benefit', code: 'TERMINAL_ILLNESS',
        absent: 'Without it, the death benefit is not paid early on a terminal diagnosis.',
        present: 'Nothing to change.' },
    ];
    for (const s of spec) {
      const f = x[s.key] as F<boolean>;
      if (!known(f)) continue;
      const has = f.value === true;
      out.push(mk(facts, this.id, this.version, {
        code: `${s.code}_${has ? 'INCLUDED' : 'ABSENT'}`, category: 'BENEFIT', severity: has ? 'INFO' : 'NOTICE',
        confidence: String(f.confidence),
        headline: has ? `${s.label} included` : `No ${s.label.toLowerCase()}`,
        evidence: [ev(f, `${s.label}: ${has ? 'included' : 'not included'}`, s.label)],
        whatWouldChangeThis: has ? s.present : s.absent,
      }));
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Premium structure
// ---------------------------------------------------------------------------

const premiumRule: TermRule = {
  id: 'term.premium',
  version: '1.0.0',
  category: 'PREMIUM',
  evaluate(facts) {
    const x = facts.extraction;
    const out: PolicyFindingDTO[] = [];
    const rop = x.returnOfPremium as F<boolean>;
    if (known(rop) && rop.value === true) {
      out.push(mk(facts, this.id, this.version, {
        code: 'RETURN_OF_PREMIUM', category: 'PREMIUM', severity: 'NOTICE', confidence: String(rop.confidence),
        headline: 'Premiums are returned at maturity — usually a much higher premium',
        evidence: [ev(rop, 'Return of premium: yes', 'Return of premium')],
        whatWouldChangeThis:
          'A return-of-premium plan costs far more than a plain term plan for the same cover. Compare the extra cost with investing the difference ' +
          'yourself; the choice depends on how much cover you can afford.',
      }));
    }
    const ptype = x.premiumType as F<string>;
    const pt = x.premiumPayingTermYears as F<number>;
    const term = x.policyTermYears as F<number>;
    if (known(pt) && known(term) && pt.value < term.value) {
      out.push(mk(facts, this.id, this.version, {
        code: 'PREMIUM_ENDS_BEFORE_COVER', category: 'PREMIUM', severity: 'INFO',
        confidence: conf(pt, term),
        headline: `Premiums stop after ${pt.value} years; cover continues to year ${term.value}`,
        evidence: [ev(pt, `Premium paying term: ${pt.value} years${known(ptype) ? ` (${ptype.value})` : ''}`, 'Premium payment term'), ev(term, `Policy term: ${term.value} years`, 'Policy term')],
        whatWouldChangeThis: 'Nothing to change. Limited-pay plans cost more per year but end the commitment earlier.',
      }));
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Nomination
// ---------------------------------------------------------------------------

const nominationRule: TermRule = {
  id: 'term.nomination',
  version: '1.0.0',
  category: 'CLAIM_TERMS',
  evaluate(facts) {
    const f = facts.extraction.nomineePresent as F<boolean>;
    if (!known(f)) return [];
    const has = f.value === true;
    return [
      mk(facts, this.id, this.version, {
        code: has ? 'NOMINEE_RECORDED' : 'NO_NOMINEE', category: 'CLAIM_TERMS',
        severity: has ? 'INFO' : 'WARNING', confidence: String(f.confidence),
        headline: has ? 'A nominee is recorded' : 'No nominee is recorded in the documents',
        evidence: [ev(f, `Nominee recorded: ${has ? 'yes' : 'no'}`, 'Nomination')],
        whatWouldChangeThis: has
          ? 'Nothing to change. Keep nominee details current after marriage, birth or other life changes.'
          : 'Without a nominee, a claim can be delayed while your legal heirs prove their right. Add a nominee through the insurer.',
      }),
    ];
  },
};

// ---------------------------------------------------------------------------
// Exclusions
// ---------------------------------------------------------------------------

const HAZARDOUS = /(aviation|aircraft|pilot|adventure|hazardous|mountaineer|scuba|diving|racing|sport|paragliding|trekking)/i;
const INTOXICATION = /(alcohol|intoxicat|drug|narcotic|substance)/i;

const exclusionsRule: TermRule = {
  id: 'term.exclusions',
  version: '1.0.0',
  category: 'EXCLUSION',
  evaluate(facts) {
    const f = facts.extraction.exclusions as F<string[]>;
    if (!known(f) || f.value.length === 0) return [];
    const list = f.value;
    const out: PolicyFindingDTO[] = [
      mk(facts, this.id, this.version, {
        code: 'TERM_EXCLUSIONS_LISTED', category: 'EXCLUSION', severity: 'INFO', confidence: String(f.confidence),
        headline: `${list.length} exclusion${list.length === 1 ? '' : 's'} listed`,
        evidence: [ev(f, list.slice(0, 8).join('; '), 'Exclusions')],
        whatWouldChangeThis: 'Nothing to change. Read the list against your job, hobbies and travel.',
      }),
    ];
    const hz = list.filter((e) => HAZARDOUS.test(e));
    if (hz.length > 0) {
      out.push(mk(facts, this.id, this.version, {
        code: 'EXCLUSION_HAZARDOUS_ACTIVITIES', category: 'EXCLUSION', severity: 'NOTICE', confidence: String(f.confidence),
        headline: 'Deaths from hazardous activities or aviation may be excluded',
        evidence: [ev(f, hz.slice(0, 4).join('; '), 'Exclusions')],
        whatWouldChangeThis: 'If you fly, dive, race or do adventure sports, check the exact wording and whether a loading or rider covers it.',
      }));
    }
    const ix = list.filter((e) => INTOXICATION.test(e));
    if (ix.length > 0) {
      out.push(mk(facts, this.id, this.version, {
        code: 'EXCLUSION_INTOXICATION', category: 'EXCLUSION', severity: 'NOTICE', confidence: String(f.confidence),
        headline: 'Deaths linked to alcohol or drug use may be excluded',
        evidence: [ev(f, ix.slice(0, 4).join('; '), 'Exclusions')],
        whatWouldChangeThis: 'Read the exact wording: some policies exclude only intoxicated driving, others any death attributed to substances.',
      }));
    }
    return out;
  },
};

export const TERM_RULES: TermRule[] = [
  horizonRule,
  claimTermsRule,
  payoutRule,
  ridersRule,
  premiumRule,
  nominationRule,
  exclusionsRule,
  documentsConflictsRule as unknown as TermRule,
];
