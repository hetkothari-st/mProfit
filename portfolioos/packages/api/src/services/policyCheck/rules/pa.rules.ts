/**
 * Personal accident rules (all deterministic, no I/O).
 *
 * Same contract as the other rule sets: a finding cites evidence and says what
 * would change it, an unknown field produces NO finding (unknown is not
 * absent), and nothing is assumed from what other policies usually contain.
 *
 * Whether the sums are ENOUGH is not judged here: it needs the user's income,
 * loans and expenses (see the cover calculator).
 */

import { formatINR } from '@everypaisa/shared';
import type { PolicyEvidence, PolicyFindingDTO } from '@everypaisa/shared';
import { makePolicyFinding, type PaAnalysisFacts, type PaRule } from '../types.js';
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

const inr = (v: string | number): string => formatINR(String(v), { fractionDigits: 0 });
const amount = (f: F<string>): number | null => {
  if (!known(f)) return null;
  const n = Number(f.value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function mk(
  facts: PaAnalysisFacts,
  ruleId: string,
  version: string,
  p: Pick<PolicyFindingDTO, 'code' | 'category' | 'severity' | 'headline' | 'evidence' | 'whatWouldChangeThis'> & { confidence: string },
): PolicyFindingDTO {
  return makePolicyFinding(facts, { ruleId, ruleVersion: version, ...p });
}

export type PaBasis = 'INDIVIDUAL' | 'FAMILY_FLOATER';
export type PaTerritory = 'WORLDWIDE' | 'INDIA_ONLY';

export function paBasisOf(facts: PaAnalysisFacts): PaBasis | null {
  const f = facts.extraction.coverBasis as F<string>;
  if (!known(f)) return null;
  const v = String(f.value).toUpperCase().replace(/[_\s-]+/g, ' ');
  if (/FLOATER|FAMILY/.test(v)) return 'FAMILY_FLOATER';
  if (/INDIVIDUAL|SELF|SINGLE/.test(v)) return 'INDIVIDUAL';
  return null;
}

export function paTerritoryOf(facts: PaAnalysisFacts): PaTerritory | null {
  const f = facts.extraction.coverTerritory as F<string>;
  if (!known(f)) return null;
  const v = String(f.value).toUpperCase().replace(/[_\s-]+/g, ' ');
  if (/WORLD|GLOBAL|ANYWHERE/.test(v)) return 'WORLDWIDE';
  if (/INDIA/.test(v)) return 'INDIA_ONLY';
  return null;
}

// ---------------------------------------------------------------------------
// Is the policy in force?
// ---------------------------------------------------------------------------

const validityRule: PaRule = {
  id: 'pa.validity',
  version: '1.0.0',
  category: 'VALIDITY',
  evaluate(facts) {
    const end = facts.extraction.policyEndDate as F<string>;
    if (!known(end) || !/^\d{4}-\d{2}-\d{2}/.test(end.value)) return [];
    const endMs = Date.parse(`${end.value.slice(0, 10)}T23:59:59Z`);
    const days = Math.ceil((endMs - Date.parse(facts.asOf)) / 86_400_000);
    if (Number.isNaN(days)) return [];
    const e = ev(end, `Policy ends on ${end.value.slice(0, 10)}`, 'Policy period');
    const conf = String(end.confidence);
    if (days < 0) {
      return [mk(facts, this.id, this.version, {
        code: 'POLICY_EXPIRED', category: 'VALIDITY', severity: 'WARNING', confidence: conf,
        headline: `This policy expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`,
        evidence: [e],
        whatWouldChangeThis:
          'An accident now would not be paid. Renew promptly. If this is an old document, upload the current policy instead.',
      })];
    }
    if (days <= facts.constants.renewalWindowDays) {
      return [mk(facts, this.id, this.version, {
        code: 'RENEWAL_DUE', category: 'VALIDITY', severity: 'NOTICE', confidence: conf,
        headline: `Policy expires in ${days} day${days === 1 ? '' : 's'}`,
        evidence: [e],
        whatWouldChangeThis:
          'Renew before the end date, and use the chance to revisit the sums insured against your income and loans. Cover can end at a set age, so check the renewal terms.',
      })];
    }
    return [mk(facts, this.id, this.version, {
      code: 'POLICY_IN_FORCE', category: 'VALIDITY', severity: 'INFO', confidence: conf,
      headline: `Policy is in force for another ${days} days`,
      evidence: [e],
      whatWouldChangeThis: 'Nothing to change. Set a reminder about a month before the end date.',
    })];
  },
};

// ---------------------------------------------------------------------------
// Who is covered, and where
// ---------------------------------------------------------------------------

const basisRule: PaRule = {
  id: 'pa.cover-basis',
  version: '1.0.0',
  category: 'COVERAGE',
  evaluate(facts) {
    const f = facts.extraction.coverBasis as F<string>;
    const basis = paBasisOf(facts);
    if (!known(f) || !basis) return [];
    const e = ev(f, `Cover: ${String(f.value)}`, 'Cover');
    const conf = String(f.confidence);
    if (basis === 'FAMILY_FLOATER') {
      return [mk(facts, this.id, this.version, {
        code: 'FAMILY_FLOATER', category: 'COVERAGE', severity: 'NOTICE', confidence: conf,
        headline: 'One sum insured is shared by the family',
        evidence: [e],
        whatWouldChangeThis:
          'The sum shown may be shared, or paid at a lower share (for example half) for a spouse. Check how much each person is covered for. Whoever earns the most needs the most cover.',
      })];
    }
    return [mk(facts, this.id, this.version, {
      code: 'INDIVIDUAL_COVER', category: 'COVERAGE', severity: 'INFO', confidence: conf,
      headline: 'Individual cover: the whole sum insured is yours',
      evidence: [e],
      whatWouldChangeThis: 'Nothing to change. Check the sums against your income and loans, using the calculator below.',
    })];
  },
};

const territoryRule: PaRule = {
  id: 'pa.territory',
  version: '1.0.0',
  category: 'COVERAGE',
  evaluate(facts) {
    const f = facts.extraction.coverTerritory as F<string>;
    const t = paTerritoryOf(facts);
    if (!known(f) || !t) return [];
    const e = ev(f, `Territory: ${String(f.value)}`, 'Territorial limits');
    if (t === 'INDIA_ONLY') {
      return [mk(facts, this.id, this.version, {
        code: 'INDIA_ONLY', category: 'COVERAGE', severity: 'NOTICE', confidence: String(f.confidence),
        headline: 'Covers accidents in India only',
        evidence: [e],
        whatWouldChangeThis: 'An accident abroad would not be paid. If you travel, ask for worldwide cover or buy a travel policy with accident cover.',
      })];
    }
    return [mk(facts, this.id, this.version, {
      code: 'WORLDWIDE_COVER', category: 'COVERAGE', severity: 'INFO', confidence: String(f.confidence),
      headline: 'Covers accidents anywhere in the world',
      evidence: [e],
      whatWouldChangeThis: 'Nothing to change.',
    })];
  },
};

// ---------------------------------------------------------------------------
// Lump-sum benefits
// ---------------------------------------------------------------------------

const lumpSumRule: PaRule = {
  id: 'pa.lump-sums',
  version: '1.0.0',
  category: 'BENEFIT',
  evaluate(facts) {
    const x = facts.extraction;
    const death = x.accidentalDeathInr as F<string>;
    const ptd = x.permanentTotalDisabilityInr as F<string>;
    const ppd = x.permanentPartialDisabilityCovered as F<boolean>;
    const d = amount(death);
    const p = amount(ptd);
    const out: PolicyFindingDTO[] = [];

    if (d !== null && known(death)) {
      out.push(mk(facts, this.id, this.version, {
        code: 'DEATH_BENEFIT', category: 'BENEFIT', severity: 'INFO', confidence: String(death.confidence),
        headline: `Pays ${inr(d)} on accidental death`,
        evidence: [ev(death, `Accidental death: ${inr(d)}`, 'Benefits')],
        whatWouldChangeThis: 'Nothing to change. Compare it with what your family would need, using the calculator below.',
      }));
    }
    if (d !== null && p !== null && known(ptd) && p < d) {
      out.push(mk(facts, this.id, this.version, {
        code: 'DISABILITY_BELOW_DEATH', category: 'PAYOUT', severity: 'NOTICE', confidence: String(ptd.confidence),
        headline: `Permanent total disability pays ${inr(p)}, less than the ${inr(d)} for death`,
        evidence: [ev(ptd, `Permanent total disability: ${inr(p)}`, 'Benefits'), ev(death as NonNullable<F<unknown>>, `Accidental death: ${inr(d)}`, 'Benefits')],
        whatWouldChangeThis:
          'If you could no longer work you would still need years of income and care, and you would be alive to bear the costs. Ask for permanent total disability to be paid at 100% of the sum insured.',
      }));
    } else if (p !== null && known(ptd)) {
      out.push(mk(facts, this.id, this.version, {
        code: 'DISABILITY_BENEFIT', category: 'PAYOUT', severity: 'INFO', confidence: String(ptd.confidence),
        headline: `Pays ${inr(p)} on permanent total disability`,
        evidence: [ev(ptd, `Permanent total disability: ${inr(p)}`, 'Benefits')],
        whatWouldChangeThis: 'Nothing to change.',
      }));
    }
    if (known(ppd)) {
      out.push(ppd.value === false
        ? mk(facts, this.id, this.version, {
            code: 'PARTIAL_DISABILITY_ABSENT', category: 'BENEFIT', severity: 'NOTICE', confidence: String(ppd.confidence),
            headline: 'Permanent partial disability is not covered',
            evidence: [ev(ppd, 'Permanent partial disability: not covered', 'Benefits')],
            whatWouldChangeThis: 'Losing a limb, an eye or hearing is more common than total disability. Ask for partial disability to be paid as a share of the sum insured.',
          })
        : mk(facts, this.id, this.version, {
            code: 'PARTIAL_DISABILITY', category: 'BENEFIT', severity: 'INFO', confidence: String(ppd.confidence),
            headline: 'Permanent partial disability is paid as a share of the sum insured',
            evidence: [ev(ppd, 'Permanent partial disability: covered', 'Benefits')],
            whatWouldChangeThis: 'Nothing to change. The share for each loss is set in a schedule in the wording, so read it.',
          }));
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Recovery benefits
// ---------------------------------------------------------------------------

const recoveryRule: PaRule = {
  id: 'pa.recovery',
  version: '1.0.0',
  category: 'BENEFIT',
  evaluate(facts) {
    const x = facts.extraction;
    const out: PolicyFindingDTO[] = [];
    const ttd = x.temporaryDisabilityCovered as F<boolean>;
    const weekly = x.temporaryDisabilityWeeklyInr as F<string>;
    const weeks = x.temporaryDisabilityMaxWeeks as F<number>;
    const w = amount(weekly);

    if (known(ttd) && ttd.value === false) {
      out.push(mk(facts, this.id, this.version, {
        code: 'TEMPORARY_DISABILITY_ABSENT', category: 'BENEFIT', severity: 'NOTICE', confidence: String(ttd.confidence),
        headline: 'No pay while you recover from an accident',
        evidence: [ev(ttd, 'Temporary total disablement: not covered', 'Benefits')],
        whatWouldChangeThis: 'Most accident claims are temporary: months off work with no income. Ask for a weekly benefit for temporary total disablement.',
      }));
    } else if (known(ttd) && ttd.value === true && w !== null && known(weekly)) {
      const maxWeeks = known(weeks) ? weeks.value : null;
      const short = maxWeeks !== null && maxWeeks <= facts.constants.shortRecoveryWeeks;
      out.push(mk(facts, this.id, this.version, {
        code: short ? 'RECOVERY_BENEFIT_SHORT' : 'RECOVERY_BENEFIT', category: 'BENEFIT',
        severity: short ? 'NOTICE' : 'INFO', confidence: String(weekly.confidence),
        headline: maxWeeks !== null ? `Pays ${inr(w)} a week while you recover, for up to ${maxWeeks} weeks` : `Pays ${inr(w)} a week while you recover`,
        evidence: [ev(weekly, `Temporary disablement: ${inr(w)} a week`, 'Benefits')],
        whatWouldChangeThis: short
          ? `Cover stops after ${maxWeeks} weeks, and a serious fracture or surgery can take longer to recover from. Compare the weekly amount with your monthly expenses.`
          : 'Nothing to change. Compare the weekly amount with your monthly expenses, using the calculator below.',
      }));
    }

    const med = x.medicalExpensesCovered as F<boolean>;
    const limit = x.medicalExpensesLimitInr as F<string>;
    const l = amount(limit);
    if (known(med) && med.value === false) {
      out.push(mk(facts, this.id, this.version, {
        code: 'ACCIDENT_MEDICAL_ABSENT', category: 'BENEFIT', severity: 'NOTICE', confidence: String(med.confidence),
        headline: 'Hospital bills after an accident are not reimbursed',
        evidence: [ev(med, 'Accident medical expenses: not covered', 'Benefits')],
        whatWouldChangeThis: 'Make sure a health policy covers accident treatment, or ask for a medical-expenses add-on here.',
      }));
    } else if (l !== null && known(limit)) {
      out.push(mk(facts, this.id, this.version, {
        code: 'ACCIDENT_MEDICAL', category: 'BENEFIT', severity: 'INFO', confidence: String(limit.confidence),
        headline: `Reimburses accident medical expenses up to ${inr(l)}`,
        evidence: [ev(limit, `Accident medical expenses: up to ${inr(l)}`, 'Benefits')],
        whatWouldChangeThis: 'Nothing to change. Compare this limit with the room and surgery costs in your city.',
      }));
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Extras
// ---------------------------------------------------------------------------

const extrasRule: PaRule = {
  id: 'pa.extras',
  version: '1.0.0',
  category: 'BENEFIT',
  evaluate(facts) {
    const x = facts.extraction;
    const items: Array<[string, NonNullable<F<unknown>>]> = [];
    const bool = (label: string, f: F<boolean>) => {
      if (known(f) && f.value === true) items.push([label, f]);
    };
    bool('child education benefit', x.childEducationBenefit as F<boolean>);
    bool('loan EMI cover', x.loanEmiCover as F<boolean>);
    bool('ambulance charges', x.ambulanceCover as F<boolean>);
    const cash = x.hospitalCashDailyInr as F<string>;
    const c = amount(cash);
    if (c !== null && known(cash)) items.push([`hospital cash ${inr(c)} a day`, cash]);
    if (items.length === 0) return [];
    return [mk(facts, this.id, this.version, {
      code: 'PA_EXTRAS_INCLUDED', category: 'BENEFIT', severity: 'INFO',
      confidence: String(Math.min(...items.map(([, f]) => f.confidence))),
      headline: `${items.length} extra${items.length === 1 ? '' : 's'} included: ${items.map(([n]) => n).join(', ')}`,
      evidence: [ev(items[0]![1], items.map(([n]) => n).join('; '), 'Additional benefits')],
      whatWouldChangeThis: 'Nothing to change. Extras usually have their own limits and conditions, so read the wording.',
    })];
  },
};

// ---------------------------------------------------------------------------
// Exclusions
// ---------------------------------------------------------------------------

const HAZARD = /(adventure|hazardous|aviation|racing|mountaineer|scuba|bungee|paraglid|sport)/i;
const INTOX = /(alcohol|drunk|intoxicat|drug|narcotic|under the influence)/i;

const exclusionsRule: PaRule = {
  id: 'pa.exclusions',
  version: '1.0.0',
  category: 'EXCLUSION',
  evaluate(facts) {
    const f = facts.extraction.exclusions as F<string[]>;
    if (!known(f) || f.value.length === 0) return [];
    const list = f.value;
    const out: PolicyFindingDTO[] = [
      mk(facts, this.id, this.version, {
        code: 'PA_EXCLUSIONS_LISTED', category: 'EXCLUSION', severity: 'INFO', confidence: String(f.confidence),
        headline: `${list.length} exclusion${list.length === 1 ? '' : 's'} listed`,
        evidence: [ev(f, list.slice(0, 8).join('; '), 'Exclusions')],
        whatWouldChangeThis: 'Nothing to change. Read the list against what you actually do.',
      }),
    ];
    const hazard = list.filter((e) => HAZARD.test(e));
    if (hazard.length > 0) {
      out.push(mk(facts, this.id, this.version, {
        code: 'EXCLUSION_HAZARDOUS_ACTIVITY', category: 'EXCLUSION', severity: 'NOTICE', confidence: String(f.confidence),
        headline: 'Claims may be refused for adventure or hazardous sports',
        evidence: [ev(f, hazard.slice(0, 4).join('; '), 'Exclusions')],
        whatWouldChangeThis: 'If you trek, ride, dive, fly or play contact sports, an injury there may not be paid. Ask whether those can be covered.',
      }));
    }
    const intox = list.filter((e) => INTOX.test(e));
    if (intox.length > 0) {
      out.push(mk(facts, this.id, this.version, {
        code: 'EXCLUSION_INTOXICATION', category: 'EXCLUSION', severity: 'NOTICE', confidence: String(f.confidence),
        headline: 'Claims may be refused if alcohol or drugs were involved',
        evidence: [ev(f, intox.slice(0, 4).join('; '), 'Exclusions')],
        whatWouldChangeThis: 'An accident while under the influence is usually not paid, even by a small margin. Nothing to change in the policy, but know the limit.',
      }));
    }
    return out;
  },
};

export const PA_RULES: PaRule[] = [
  validityRule,
  basisRule,
  territoryRule,
  lumpSumRule,
  recoveryRule,
  extrasRule,
  exclusionsRule,
  documentsConflictsRule as unknown as PaRule,
];
