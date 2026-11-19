/**
 * Home rules (house or flat; all deterministic, no I/O).
 *
 * Same contract as the other rule sets: a finding cites evidence and says what
 * would change it, an unknown field produces NO finding (unknown is not
 * absent), and nothing is assumed from what other policies usually contain.
 *
 * Whether the building sum insured matches the cost to rebuild is NOT judged
 * here: it needs numbers only the user has (see the cover calculator).
 */

import { formatINR } from '@everypaisa/shared';
import type { PolicyEvidence, PolicyFindingDTO } from '@everypaisa/shared';
import { makePolicyFinding, type HomeAnalysisFacts, type HomeRule } from '../types.js';
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

function mk(
  facts: HomeAnalysisFacts,
  ruleId: string,
  version: string,
  p: Pick<PolicyFindingDTO, 'code' | 'category' | 'severity' | 'headline' | 'evidence' | 'whatWouldChangeThis'> & { confidence: string },
): PolicyFindingDTO {
  return makePolicyFinding(facts, { ruleId, ruleVersion: version, ...p });
}

export type HomeScope = 'STRUCTURE_AND_CONTENTS' | 'STRUCTURE_ONLY' | 'CONTENTS_ONLY';
export type HomeBasis = 'REINSTATEMENT' | 'MARKET_VALUE' | 'DEPRECIATED';

/** Parse the free-text scope the model returns. Null when it is not clear. */
export function homeScopeOf(facts: HomeAnalysisFacts): HomeScope | null {
  const f = facts.extraction.coverScope as F<string>;
  if (!known(f)) return null;
  const v = String(f.value).toUpperCase().replace(/[_\s-]+/g, ' ');
  const structure = /STRUCTURE|BUILDING/.test(v);
  const contents = /CONTENT|BELONGING|HOUSEHOLD/.test(v);
  if (structure && contents) return 'STRUCTURE_AND_CONTENTS';
  if (structure) return 'STRUCTURE_ONLY';
  if (contents) return 'CONTENTS_ONLY';
  return null;
}

/** Parse how a claim is valued. Depreciation wording wins: "market value less depreciation" is depreciated. */
export function homeBasisOf(facts: HomeAnalysisFacts): HomeBasis | null {
  const f = facts.extraction.valuationBasis as F<string>;
  if (!known(f)) return null;
  const v = String(f.value).toUpperCase().replace(/[_\s-]+/g, ' ');
  if (/DEPRECIAT|WEAR|ACTUAL CASH|INDEMNITY/.test(v)) return 'DEPRECIATED';
  if (/REINSTATEMENT|REPLACEMENT|NEW FOR OLD|REBUILD/.test(v)) return 'REINSTATEMENT';
  if (/MARKET/.test(v)) return 'MARKET_VALUE';
  return null;
}

// ---------------------------------------------------------------------------
// Is the policy in force?
// ---------------------------------------------------------------------------

const validityRule: HomeRule = {
  id: 'home.validity',
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
          'Your home is uninsured until you renew, and a loss now would not be paid. Renew promptly. If this is an old document, upload the current policy instead.',
      })];
    }
    if (days <= facts.constants.renewalWindowDays) {
      return [mk(facts, this.id, this.version, {
        code: 'RENEWAL_DUE', category: 'VALIDITY', severity: 'NOTICE', confidence: conf,
        headline: `Policy expires in ${days} day${days === 1 ? '' : 's'}`,
        evidence: [e],
        whatWouldChangeThis:
          'Renew before the end date and use the chance to update the sums insured: rebuild costs and the value of your belongings both rise over time.',
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
// What is covered
// ---------------------------------------------------------------------------

const scopeRule: HomeRule = {
  id: 'home.cover-scope',
  version: '1.0.0',
  category: 'COVERAGE',
  evaluate(facts) {
    const f = facts.extraction.coverScope as F<string>;
    const scope = homeScopeOf(facts);
    if (!known(f) || !scope) return [];
    const e = ev(f, `Cover: ${String(f.value)}`, 'Cover');
    const conf = String(f.confidence);
    if (scope === 'STRUCTURE_ONLY') {
      return [mk(facts, this.id, this.version, {
        code: 'STRUCTURE_ONLY', category: 'COVERAGE', severity: 'NOTICE', confidence: conf,
        headline: 'Building only: furniture, appliances and belongings are not covered',
        evidence: [e],
        whatWouldChangeThis:
          'If you own what is inside the home, a fire or flood would leave it unpaid. Add contents cover, or check whether another policy already covers it.',
      })];
    }
    if (scope === 'CONTENTS_ONLY') {
      return [mk(facts, this.id, this.version, {
        code: 'CONTENTS_ONLY', category: 'COVERAGE', severity: 'NOTICE', confidence: conf,
        headline: 'Contents only: the building itself is not covered',
        evidence: [e],
        whatWouldChangeThis:
          'That is normal for a tenant. If you own the home, the walls, roof and fittings are uninsured: check whether your housing society or another policy covers the structure.',
      })];
    }
    return [mk(facts, this.id, this.version, {
      code: 'STRUCTURE_AND_CONTENTS', category: 'COVERAGE', severity: 'INFO', confidence: conf,
      headline: 'Covers both the building and its contents',
      evidence: [e],
      whatWouldChangeThis: 'Nothing to change. Check that each sum insured matches its real cost, using the calculator below.',
    })];
  },
};

// ---------------------------------------------------------------------------
// How a claim is valued
// ---------------------------------------------------------------------------

const valuationRule: HomeRule = {
  id: 'home.valuation',
  version: '1.0.0',
  category: 'CLAIM_TERMS',
  evaluate(facts) {
    const f = facts.extraction.valuationBasis as F<string>;
    const basis = homeBasisOf(facts);
    if (!known(f) || !basis) return [];
    const e = ev(f, `Claim valuation: ${String(f.value)}`, 'Claim settlement');
    const conf = String(f.confidence);
    if (basis === 'REINSTATEMENT') {
      return [mk(facts, this.id, this.version, {
        code: 'VALUATION_REINSTATEMENT', category: 'CLAIM_TERMS', severity: 'INFO', confidence: conf,
        headline: 'Claims are paid at the cost to rebuild or replace new',
        evidence: [e],
        whatWouldChangeThis: 'Nothing to change. This is the most generous basis, but the sum insured still caps the claim.',
      })];
    }
    const label = basis === 'DEPRECIATED' ? 'after deducting depreciation' : 'at market value, not the cost to rebuild';
    return [mk(facts, this.id, this.version, {
      code: basis === 'DEPRECIATED' ? 'VALUATION_DEPRECIATED' : 'VALUATION_MARKET_VALUE', category: 'CLAIM_TERMS',
      severity: 'NOTICE', confidence: conf,
      headline: `Claims are paid ${label}`,
      evidence: [e],
      whatWouldChangeThis:
        'You would receive less than it costs to rebuild or replace. Ask the insurer for a reinstatement (new-for-old) basis, and compare the extra premium.',
    })];
  },
};

// ---------------------------------------------------------------------------
// Under-insurance (average) clause
// ---------------------------------------------------------------------------

const averageRule: HomeRule = {
  id: 'home.average-clause',
  version: '1.0.0',
  category: 'COVERAGE',
  evaluate(facts) {
    const f = facts.extraction.averageClause as F<boolean>;
    if (!known(f) || f.value !== true) return [];
    return [mk(facts, this.id, this.version, {
      code: 'AVERAGE_CLAUSE', category: 'COVERAGE', severity: 'NOTICE', confidence: String(f.confidence),
      headline: 'Under-insurance clause: a claim is cut if the sum insured is too low',
      evidence: [ev(f, 'Average / under-insurance clause applies', 'Conditions')],
      whatWouldChangeThis:
        'If the sum insured is below the true value, even a small claim is reduced in the same proportion. Use the calculator below to see whether you are under-insured.',
    })];
  },
};

// ---------------------------------------------------------------------------
// Perils
// ---------------------------------------------------------------------------

const perilsRule: HomeRule = {
  id: 'home.perils',
  version: '1.0.0',
  category: 'COVERAGE',
  evaluate(facts) {
    const x = facts.extraction;
    const scope = homeScopeOf(facts);
    const out: PolicyFindingDTO[] = [];

    const flood = x.floodCovered as F<boolean>;
    const quake = x.earthquakeCovered as F<boolean>;
    const burglary = x.burglaryCovered as F<boolean>;
    const water = x.waterDamageCovered as F<boolean>;

    const missingNatural: Array<[string, NonNullable<F<boolean>>]> = [];
    if (known(flood) && flood.value === false) missingNatural.push(['flood and storm', flood]);
    if (known(quake) && quake.value === false) missingNatural.push(['earthquake', quake]);
    if (missingNatural.length > 0) {
      out.push(mk(facts, this.id, this.version, {
        code: 'NATURAL_PERIL_GAP', category: 'COVERAGE', severity: 'NOTICE',
        confidence: String(Math.min(...missingNatural.map(([, f]) => f.confidence))),
        headline: `Not covered: ${missingNatural.map(([n]) => n).join(' and ')}`,
        evidence: missingNatural.map(([n, f]) => ev(f, `${n}: not covered`, 'Perils covered')),
        whatWouldChangeThis:
          'These are among the biggest home losses in India. Check whether your area is exposed, and ask the insurer to add them or quote a policy that includes them.',
      }));
    }
    if (known(burglary) && burglary.value === false && scope !== 'STRUCTURE_ONLY') {
      out.push(mk(facts, this.id, this.version, {
        code: 'BURGLARY_NOT_COVERED', category: 'COVERAGE', severity: 'NOTICE', confidence: String(burglary.confidence),
        headline: 'Theft and burglary are not covered',
        evidence: [ev(burglary, 'Burglary / theft: not covered', 'Perils covered')],
        whatWouldChangeThis: 'If you keep valuable belongings at home, ask the insurer to add burglary cover and check its limits for jewellery and cash.',
      }));
    }
    if (known(water) && water.value === false) {
      out.push(mk(facts, this.id, this.version, {
        code: 'WATER_DAMAGE_NOT_COVERED', category: 'COVERAGE', severity: 'NOTICE', confidence: String(water.confidence),
        headline: 'Damage from bursting or leaking pipes is not covered',
        evidence: [ev(water, 'Bursting / overflowing pipes and tanks: not covered', 'Perils covered')],
        whatWouldChangeThis: 'Pipe and tank leaks are a common cause of claims in flats. Ask whether this can be added.',
      }));
    }

    const present = ([
      ['flood and storm', flood],
      ['earthquake', quake],
      ['burglary', burglary],
      ['water damage', water],
    ] as Array<[string, F<boolean>]>).filter(([, f]) => known(f) && f.value === true) as Array<[string, NonNullable<F<boolean>>]>;
    if (present.length > 0) {
      out.push(mk(facts, this.id, this.version, {
        code: 'PERILS_COVERED', category: 'COVERAGE', severity: 'INFO',
        confidence: String(Math.min(...present.map(([, f]) => f.confidence))),
        headline: `Covers ${present.map(([n]) => n).join(', ')}`,
        evidence: [ev(present[0]![1], `Covered: ${present.map(([n]) => n).join(', ')}`, 'Perils covered')],
        whatWouldChangeThis: 'Nothing to change. Cover for each peril usually has its own conditions, so read the wording.',
      }));
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Jewellery and valuables
// ---------------------------------------------------------------------------

const valuablesRule: HomeRule = {
  id: 'home.valuables',
  version: '1.0.0',
  category: 'BENEFIT',
  evaluate(facts) {
    const cov = facts.extraction.valuablesCovered as F<boolean>;
    const lim = facts.extraction.valuablesLimitInr as F<string>;
    if (known(cov) && cov.value === false) {
      return [mk(facts, this.id, this.version, {
        code: 'VALUABLES_NOT_COVERED', category: 'BENEFIT', severity: 'NOTICE', confidence: String(cov.confidence),
        headline: 'Jewellery and valuables are not covered',
        evidence: [ev(cov, 'Jewellery and valuables: not covered', 'Contents')],
        whatWouldChangeThis: 'Jewellery is often the most valuable thing in a home. Ask for it to be added, or insure it separately.',
      })];
    }
    if (known(lim)) {
      const n = Number(lim.value);
      if (Number.isFinite(n) && n > 0) {
        return [mk(facts, this.id, this.version, {
          code: 'VALUABLES_LIMIT', category: 'BENEFIT', severity: 'INFO', confidence: String(lim.confidence),
          headline: `Jewellery and valuables are covered up to ${inr(n)}`,
          evidence: [ev(lim, `Valuables limit: ${inr(n)}`, 'Contents')],
          whatWouldChangeThis: 'Compare this limit with what you actually keep at home. Anything above it is not paid.',
        })];
      }
    }
    return [];
  },
};

// ---------------------------------------------------------------------------
// Extras
// ---------------------------------------------------------------------------

const benefitsRule: HomeRule = {
  id: 'home.benefits',
  version: '1.0.0',
  category: 'BENEFIT',
  evaluate(facts) {
    const x = facts.extraction;
    const items: Array<[string, NonNullable<F<unknown>>]> = [];
    const amount = (label: string, f: F<string>) => {
      if (known(f) && Number.isFinite(Number(f.value)) && Number(f.value) > 0) items.push([`${label} ${inr(Number(f.value))}`, f]);
    };
    amount('alternate accommodation', x.alternateAccommodationInr as F<string>);
    amount('public liability', x.publicLiabilityInr as F<string>);
    amount('personal accident', x.personalAccidentInr as F<string>);
    const el = x.electronicsCovered as F<boolean>;
    if (known(el) && el.value === true) items.push(['appliance breakdown', el]);
    if (items.length === 0) return [];
    return [mk(facts, this.id, this.version, {
      code: 'EXTRAS_INCLUDED', category: 'BENEFIT', severity: 'INFO',
      confidence: String(Math.min(...items.map(([, f]) => f.confidence))),
      headline: `${items.length} extra${items.length === 1 ? '' : 's'} included: ${items.map(([n]) => n).join(', ')}`,
      evidence: [ev(items[0]![1], items.map(([n]) => n).join('; '), 'Additional covers')],
      whatWouldChangeThis: 'Nothing to change. Extras usually have their own limits and conditions, so read the wording.',
    })];
  },
};

// ---------------------------------------------------------------------------
// Deductible
// ---------------------------------------------------------------------------

const deductibleRule: HomeRule = {
  id: 'home.deductible',
  version: '1.0.0',
  category: 'DEDUCTIBLE',
  evaluate(facts) {
    const f = facts.extraction.deductibleInr as F<string>;
    if (!known(f)) return [];
    const n = Number(f.value);
    if (!Number.isFinite(n) || n <= 0) return [];
    const high = n > facts.constants.deductibleNoticeInr;
    return [mk(facts, this.id, this.version, {
      code: high ? 'DEDUCTIBLE_HIGH' : 'DEDUCTIBLE', category: 'DEDUCTIBLE',
      severity: high ? 'NOTICE' : 'INFO', confidence: String(f.confidence),
      headline: `You pay the first ${inr(n)} of every claim`,
      evidence: [ev(f, `Deductible: ${inr(n)}`, 'Deductibles')],
      whatWouldChangeThis: high
        ? 'A higher deductible lowers the premium but you pay that amount on every claim, so small losses may not be worth claiming. Make sure the premium saved is worth it.'
        : 'Nothing to change. It lowers the premium in exchange for you paying a small part of each claim.',
    })];
  },
};

// ---------------------------------------------------------------------------
// Exclusions
// ---------------------------------------------------------------------------

const VACANT = /(unoccupied|vacant|unattended|left empty|not occupied)/i;
const BUSINESS = /(commercial|business|paying guest|let out|rented|rental|office)/i;

const exclusionsRule: HomeRule = {
  id: 'home.exclusions',
  version: '1.0.0',
  category: 'EXCLUSION',
  evaluate(facts) {
    const f = facts.extraction.exclusions as F<string[]>;
    if (!known(f) || f.value.length === 0) return [];
    const list = f.value;
    const out: PolicyFindingDTO[] = [
      mk(facts, this.id, this.version, {
        code: 'HOME_EXCLUSIONS_LISTED', category: 'EXCLUSION', severity: 'INFO', confidence: String(f.confidence),
        headline: `${list.length} exclusion${list.length === 1 ? '' : 's'} listed`,
        evidence: [ev(f, list.slice(0, 8).join('; '), 'Exclusions')],
        whatWouldChangeThis: 'Nothing to change. Read the list against how you actually use the home.',
      }),
    ];
    const vacant = list.filter((e) => VACANT.test(e));
    if (vacant.length > 0) {
      out.push(mk(facts, this.id, this.version, {
        code: 'EXCLUSION_UNOCCUPIED', category: 'EXCLUSION', severity: 'NOTICE', confidence: String(f.confidence),
        headline: 'Claims may be refused if the home is left empty for long',
        evidence: [ev(f, vacant.slice(0, 4).join('; '), 'Exclusions')],
        whatWouldChangeThis: 'If you travel for weeks or the home is often empty, check the number of days allowed and tell the insurer in advance.',
      }));
    }
    const business = list.filter((e) => BUSINESS.test(e));
    if (business.length > 0) {
      out.push(mk(facts, this.id, this.version, {
        code: 'EXCLUSION_BUSINESS_USE', category: 'EXCLUSION', severity: 'NOTICE', confidence: String(f.confidence),
        headline: 'Claims may be refused if the home is used for business or let out',
        evidence: [ev(f, business.slice(0, 4).join('; '), 'Exclusions')],
        whatWouldChangeThis: 'If part of the home is rented, run as an office or a paying-guest home, tell the insurer and get the right cover.',
      }));
    }
    return out;
  },
};

export const HOME_RULES: HomeRule[] = [
  validityRule,
  scopeRule,
  valuationRule,
  averageRule,
  perilsRule,
  valuablesRule,
  benefitsRule,
  deductibleRule,
  exclusionsRule,
  documentsConflictsRule as unknown as HomeRule,
];
