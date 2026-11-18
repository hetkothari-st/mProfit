/**
 * Motor rules (private car and two-wheeler; all deterministic, no I/O).
 *
 * Same contract as the other rule sets: a finding cites evidence and says what
 * would change it, an unknown field produces NO finding (unknown is not
 * absent), and nothing is assumed from what other policies usually contain.
 *
 * Reference points (general summaries, not legal advice):
 *  - Motor Vehicles Act 1988: driving without valid third-party insurance is an
 *    offence, so an expired policy is flagged first.
 *  - The usual compulsory owner-driver personal accident cover is Rs 15 lakh.
 */

import { formatINR } from '@everypaisa/shared';
import type { PolicyEvidence, PolicyFindingDTO } from '@everypaisa/shared';
import { makePolicyFinding, type MotorAnalysisFacts, type MotorRule } from '../types.js';
import { documentsConflictsRule } from './documents.conflicts.js';
import { vehicleAgeYears } from '../motorIdv.js';

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

function mk(
  facts: MotorAnalysisFacts,
  ruleId: string,
  version: string,
  p: Pick<PolicyFindingDTO, 'code' | 'category' | 'severity' | 'headline' | 'evidence' | 'whatWouldChangeThis'> & { confidence: string },
): PolicyFindingDTO {
  return makePolicyFinding(facts, { ruleId, ruleVersion: version, ...p });
}

function kindOf(facts: MotorAnalysisFacts): 'COMPREHENSIVE' | 'THIRD_PARTY_ONLY' | 'OWN_DAMAGE_ONLY' | null {
  const f = facts.extraction.policyKind as F<string>;
  if (!known(f)) return null;
  const v = String(f.value).toUpperCase().replace(/[\s-]+/g, '_');
  if (/THIRD/.test(v)) return 'THIRD_PARTY_ONLY';
  if (/OWN_?DAMAGE|STANDALONE|OD_ONLY/.test(v)) return 'OWN_DAMAGE_ONLY';
  if (/COMPREHENSIVE|PACKAGE/.test(v)) return 'COMPREHENSIVE';
  return null;
}

// ---------------------------------------------------------------------------
// Is the policy in force?
// ---------------------------------------------------------------------------

const validityRule: MotorRule = {
  id: 'motor.validity',
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
          'Driving without valid insurance is an offence, and any accident is uninsured. Renew now. If this is an old document, upload the current policy instead.',
      })];
    }
    if (days <= facts.constants.renewalWindowDays) {
      return [mk(facts, this.id, this.version, {
        code: 'RENEWAL_DUE', category: 'VALIDITY', severity: 'NOTICE', confidence: conf,
        headline: `Policy expires in ${days} day${days === 1 ? '' : 's'}`,
        evidence: [e],
        whatWouldChangeThis:
          'Renew before the end date. A break in cover can cost you the no-claim bonus and means a fresh inspection. Compare quotes, and keep your no-claim bonus when you switch.',
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
// What kind of cover
// ---------------------------------------------------------------------------

const coverKindRule: MotorRule = {
  id: 'motor.cover-kind',
  version: '1.0.0',
  category: 'COVERAGE',
  evaluate(facts) {
    const f = facts.extraction.policyKind as F<string>;
    const kind = kindOf(facts);
    if (!known(f) || !kind) return [];
    const e = ev(f, `Policy type: ${String(f.value)}`, 'Policy type');
    const conf = String(f.confidence);
    if (kind === 'THIRD_PARTY_ONLY') {
      return [mk(facts, this.id, this.version, {
        code: 'THIRD_PARTY_ONLY', category: 'COVERAGE', severity: 'WARNING', confidence: conf,
        headline: 'Third-party only: damage to your own vehicle is not covered',
        evidence: [e],
        whatWouldChangeThis:
          'This is the legal minimum. Repairs to your own vehicle, theft and total loss are not paid. If the vehicle is worth more than you could afford to lose, switch to a comprehensive policy.',
      })];
    }
    if (kind === 'OWN_DAMAGE_ONLY') {
      return [mk(facts, this.id, this.version, {
        code: 'OWN_DAMAGE_ONLY', category: 'COVERAGE', severity: 'NOTICE', confidence: conf,
        headline: 'Own-damage only: you need a separate third-party policy',
        evidence: [e],
        whatWouldChangeThis: 'Confirm you hold a valid long-term or annual third-party policy for this vehicle. Without one you are driving uninsured.',
      })];
    }
    return [mk(facts, this.id, this.version, {
      code: 'COMPREHENSIVE', category: 'COVERAGE', severity: 'INFO', confidence: conf,
      headline: 'Comprehensive cover: own damage and third party',
      evidence: [e],
      whatWouldChangeThis: 'Nothing to change. Check the IDV against what the vehicle would sell for, using the calculator below.',
    })];
  },
};

// ---------------------------------------------------------------------------
// Owner-driver personal accident
// ---------------------------------------------------------------------------

const ownerPaRule: MotorRule = {
  id: 'motor.owner-pa',
  version: '1.0.0',
  category: 'BENEFIT',
  evaluate(facts) {
    const f = facts.extraction.ownerDriverPaInr as F<string>;
    if (!known(f)) return [];
    const n = Number(f.value);
    if (!Number.isFinite(n)) return [];
    const usual = facts.constants.usualOwnerDriverPaInr;
    const low = n < usual;
    return [mk(facts, this.id, this.version, {
      code: low ? 'OWNER_PA_BELOW_USUAL' : 'OWNER_PA_OK', category: 'BENEFIT',
      severity: low ? 'NOTICE' : 'INFO', confidence: String(f.confidence),
      headline: low ? `Owner-driver accident cover is ${inr(n)}, under the usual ${inr(usual)}` : `Owner-driver accident cover of ${inr(n)}`,
      evidence: [ev(f, `Owner-driver personal accident cover: ${inr(n)}`, 'Personal accident')],
      whatWouldChangeThis: low
        ? 'The usual compulsory owner-driver cover is Rs 15 lakh. Check the schedule, and ask the insurer to confirm the amount.'
        : 'Nothing to change.',
    })];
  },
};

// ---------------------------------------------------------------------------
// Add-ons
// ---------------------------------------------------------------------------

const addOnsRule: MotorRule = {
  id: 'motor.add-ons',
  version: '1.0.0',
  category: 'BENEFIT',
  evaluate(facts) {
    if (kindOf(facts) === 'THIRD_PARTY_ONLY') return [];
    const x = facts.extraction;
    const out: PolicyFindingDTO[] = [];
    const age = vehicleAgeYears(x, facts.asOf);
    const relevant = age === null || age <= facts.constants.addOnRelevantAgeYears;

    const zd = x.zeroDepreciation as F<boolean>;
    if (known(zd) && zd.value === false && relevant) {
      out.push(mk(facts, this.id, this.version, {
        code: 'ZERO_DEP_ABSENT', category: 'BENEFIT', severity: 'NOTICE', confidence: String(zd.confidence),
        headline: 'No zero-depreciation cover: parts are paid after depreciation',
        evidence: [ev(zd, 'Zero depreciation: not included', 'Add-ons')],
        whatWouldChangeThis:
          'Without it, the insurer deducts depreciation on replaced parts, so you pay part of every repair. It matters most for newer vehicles; consider adding it at renewal.',
      }));
    }
    const eng = x.engineProtect as F<boolean>;
    if (known(eng) && eng.value === false && relevant) {
      out.push(mk(facts, this.id, this.version, {
        code: 'ENGINE_PROTECT_ABSENT', category: 'BENEFIT', severity: 'NOTICE', confidence: String(eng.confidence),
        headline: 'No engine protect: water or oil damage to the engine may be excluded',
        evidence: [ev(eng, 'Engine protect: not included', 'Add-ons')],
        whatWouldChangeThis:
          'Standard cover usually excludes engine damage from water ingress or oil leakage. If you drive through waterlogged roads, consider engine protect.',
      }));
    }

    const present = [
      ['zero depreciation', x.zeroDepreciation],
      ['engine protect', x.engineProtect],
      ['return to invoice', x.returnToInvoice],
      ['consumables', x.consumablesCover],
      ['roadside assistance', x.roadsideAssistance],
      ['tyre protect', x.tyreProtect],
      ['key replacement', x.keyReplacement],
    ].filter(([, f]) => known(f as F<boolean>) && (f as NonNullable<F<boolean>>).value === true) as Array<[string, NonNullable<F<boolean>>]>;
    if (present.length > 0) {
      out.push(mk(facts, this.id, this.version, {
        code: 'ADD_ONS_INCLUDED', category: 'BENEFIT', severity: 'INFO',
        confidence: String(Math.min(...present.map(([, f]) => f.confidence))),
        headline: `${present.length} add-on${present.length === 1 ? '' : 's'} included: ${present.map(([n]) => n).join(', ')}`,
        evidence: [ev(present[0]![1], `Add-ons: ${present.map(([n]) => n).join(', ')}`, 'Add-ons')],
        whatWouldChangeThis: 'Nothing to change. Add-ons usually have their own limits and a cap on the number of claims, so read the wording.',
      }));
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// No-claim bonus
// ---------------------------------------------------------------------------

const ncbRule: MotorRule = {
  id: 'motor.ncb',
  version: '1.0.0',
  category: 'NCB',
  evaluate(facts) {
    const x = facts.extraction;
    const ncb = x.ncbPercent as F<number>;
    if (!known(ncb) || ncb.value <= 0) return [];
    const out: PolicyFindingDTO[] = [
      mk(facts, this.id, this.version, {
        code: 'NCB_EARNED', category: 'NCB', severity: 'INFO', confidence: String(ncb.confidence),
        headline: `No-claim bonus of ${ncb.value}% applied`,
        evidence: [ev(ncb, `No-claim bonus: ${ncb.value}%`, 'No-claim bonus')],
        whatWouldChangeThis: 'Nothing to change. The bonus belongs to you, not the insurer, and moves with you if you switch.',
      }),
    ];
    const prot = x.ncbProtect as F<boolean>;
    if (known(prot) && prot.value === false && ncb.value >= facts.constants.ncbProtectFromPercent) {
      out.push(mk(facts, this.id, this.version, {
        code: 'NCB_UNPROTECTED', category: 'NCB', severity: 'NOTICE', confidence: String(prot.confidence),
        headline: `A ${ncb.value}% no-claim bonus is not protected`,
        evidence: [ev(prot, 'NCB protect: not included', 'Add-ons'), ev(ncb, `No-claim bonus: ${ncb.value}%`, 'No-claim bonus')],
        whatWouldChangeThis:
          'A single claim resets an unprotected bonus to zero, which raises next year’s premium. NCB protect usually allows a claim or two without losing it. Weigh its cost against the bonus.',
      }));
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Deductibles
// ---------------------------------------------------------------------------

const deductibleRule: MotorRule = {
  id: 'motor.deductible',
  version: '1.0.0',
  category: 'DEDUCTIBLE',
  evaluate(facts) {
    const f = facts.extraction.voluntaryDeductibleInr as F<string>;
    if (!known(f)) return [];
    const n = Number(f.value);
    if (!Number.isFinite(n) || n <= 0) return [];
    const high = n > facts.constants.voluntaryDeductibleNoticeInr;
    return [mk(facts, this.id, this.version, {
      code: high ? 'VOLUNTARY_DEDUCTIBLE_HIGH' : 'VOLUNTARY_DEDUCTIBLE', category: 'DEDUCTIBLE',
      severity: high ? 'NOTICE' : 'INFO', confidence: String(f.confidence),
      headline: `You pay the first ${inr(n)} of every own-damage claim`,
      evidence: [ev(f, `Voluntary deductible: ${inr(n)}`, 'Deductibles')],
      whatWouldChangeThis: high
        ? 'A voluntary deductible lowers the premium but you pay that amount on every claim, on top of the compulsory one. Make sure the premium saved is worth it.'
        : 'Nothing to change. It lowers the premium in exchange for you paying a small part of each claim.',
    })];
  },
};

// ---------------------------------------------------------------------------
// Exclusions
// ---------------------------------------------------------------------------

const COMMERCIAL = /(commercial|hire|reward|taxi|cab|ride.?shar|delivery|rental)/i;

const exclusionsRule: MotorRule = {
  id: 'motor.exclusions',
  version: '1.0.0',
  category: 'EXCLUSION',
  evaluate(facts) {
    const f = facts.extraction.exclusions as F<string[]>;
    if (!known(f) || f.value.length === 0) return [];
    const list = f.value;
    const out: PolicyFindingDTO[] = [
      mk(facts, this.id, this.version, {
        code: 'MOTOR_EXCLUSIONS_LISTED', category: 'EXCLUSION', severity: 'INFO', confidence: String(f.confidence),
        headline: `${list.length} exclusion${list.length === 1 ? '' : 's'} listed`,
        evidence: [ev(f, list.slice(0, 8).join('; '), 'Exclusions')],
        whatWouldChangeThis: 'Nothing to change. Read the list against how you actually use the vehicle.',
      }),
    ];
    const hits = list.filter((e) => COMMERCIAL.test(e));
    if (hits.length > 0) {
      out.push(mk(facts, this.id, this.version, {
        code: 'EXCLUSION_COMMERCIAL_USE', category: 'EXCLUSION', severity: 'NOTICE', confidence: String(f.confidence),
        headline: 'Claims may be refused if the vehicle is used for hire or delivery',
        evidence: [ev(f, hits.slice(0, 4).join('; '), 'Exclusions')],
        whatWouldChangeThis: 'If you use this vehicle for ride-hailing, delivery or any paid use, a private policy may not pay. Tell the insurer and get the right cover.',
      }));
    }
    return out;
  },
};

export const MOTOR_RULES: MotorRule[] = [
  validityRule,
  coverKindRule,
  ownerPaRule,
  addOnsRule,
  ncbRule,
  deductibleRule,
  exclusionsRule,
  documentsConflictsRule as unknown as MotorRule,
];
