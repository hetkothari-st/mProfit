/**
 * Will Maker checks. Pure: the web runs them live on every edit, the API
 * re-runs them before preview and generate. Messages are fixed sentences with
 * counts only - never a name - because the API may return them.
 */
import { Decimal } from '../../decimal.js';
import { isRealIsoDate } from '../dates.js';
import type { WillPayload, WillPerson } from '../schema.js';
import type { WillFinding, WillSeverity } from '../wire.js';
import {
  ageOn, ADULT_AGE, CHILD_RELATIONSHIPS, isMinorOn, sumPercents, willBeneficiaryIds,
  willEstateTotals, willMinorChildren,
} from '../estateMath.js';

export const WILL_RULESET_VERSION = 1;

export const MUSLIM_LAW_MESSAGE =
  'Under Muslim personal law a will can generally give away only up to one-third of the estate, and gifts to legal heirs need the consent of the other heirs. Will Maker cannot prepare a will under Muslim personal law - please get legal advice.';
export const FOREIGN_LAW_MESSAGE =
  'Will Maker prepares wills under Indian law only. For a will in another country, please consult a lawyer there.';

export interface WillRuleContext {
  today: string;
}
export interface WillRuleHit {
  message: string;
  refs?: string[];
}
export interface WillRule {
  id: string;
  severity: WillSeverity;
  step: number;
  title: string;
  check(m: WillPayload, ctx: WillRuleContext): WillRuleHit[];
}

const none = (): WillRuleHit[] => [];
const hit = (message: string, refs: string[] = []): WillRuleHit[] => [{ message, refs }];
const people = (m: WillPayload) => new Map<string, WillPerson>(m.people.map((p) => [p.id, p]));
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const unique = (xs: string[]) => [...new Set(xs)];

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

function roleIds(m: WillPayload): string[] {
  const r = m.roles;
  return [r.executorId, r.altExecutorId, r.guardianId, r.altGuardianId].filter((x): x is string => !!x);
}

export const WILL_RULES: readonly WillRule[] = [
  {
    id: 'JURISDICTION_INDIA_ONLY', severity: 'BLOCKER', step: 2, title: 'Will made under Indian law',
    check: (m) => (m.details.jurisdiction === 'IN' ? none() : hit(FOREIGN_LAW_MESSAGE)),
  },
  {
    id: 'MUSLIM_LAW_UNSUPPORTED', severity: 'BLOCKER', step: 2, title: 'Personal law supported',
    check: (m) => (m.details.personalLaw === 'MUSLIM' ? hit(MUSLIM_LAW_MESSAGE) : none()),
  },
  {
    id: 'REQUIRED_FIELDS', severity: 'BLOCKER', step: 2, title: 'Your details are complete',
    check: (m) => {
      const d = m.details;
      const missing: string[] = [];
      if (!d.legalName) missing.push('full legal name');
      if (!d.dob) missing.push('date of birth');
      if (!d.personalLaw) missing.push('religion or personal law');
      if (!d.address) missing.push('address');
      if (!d.maritalStatus) missing.push('marital status');
      if (d.hasChildren === null) missing.push('whether you have children');
      return missing.length ? hit(`Fill in your ${missing.join(', ')}.`) : none();
    },
  },
  {
    id: 'TESTATOR_ADULT', severity: 'BLOCKER', step: 2, title: 'You are 18 or older',
    check: (m, c) =>
      isRealIsoDate(m.details.dob) && isRealIsoDate(c.today) && ageOn(m.details.dob, c.today) < ADULT_AGE ? hit('You must be 18 or older to make a will.') : none(),
  },
  {
    id: 'INVALID_DATE', severity: 'BLOCKER', step: 2, title: 'Your date of birth is a real date',
    check: (m, c) => {
      const d = m.details.dob;
      if (!d) return none();
      return isRealIsoDate(d) && d <= c.today ? none() : hit('Your date of birth is not a real date, or is in the future.');
    },
  },
  {
    id: 'EXECUTOR_APPOINTED', severity: 'BLOCKER', step: 3, title: 'Executor appointed',
    check: (m) => {
      const ex = m.roles.executorId;
      if (!ex || !people(m).has(ex)) return hit('Choose an executor - the person who will carry out your will.');
      if (m.roles.altExecutorId === ex) return hit('The back-up executor must be a different person.', [ex]);
      return none();
    },
  },
  {
    id: 'GUARDIAN_IF_MINOR_CHILDREN', severity: 'BLOCKER', step: 3, title: 'Guardian for children under 18',
    check: (m, c) => {
      const minors = willMinorChildren(m, c.today);
      if (minors.length === 0) return none();
      const g = m.roles.guardianId;
      if (!g || !people(m).has(g)) return hit('You have a child under 18 - choose a guardian.', minors.map((x) => x.id));
      if (m.roles.altGuardianId === g) return hit('The back-up guardian must be a different person.', [g]);
      return none();
    },
  },
  {
    id: 'EXECUTOR_GUARDIAN_INDIVIDUAL', severity: 'BLOCKER', step: 3, title: 'Executor and guardian are adults',
    check: (m, c) => {
      const map = people(m);
      const bad = roleIds(m).filter((id) => {
        const p = map.get(id);
        return !!p && (p.partyType !== 'INDIVIDUAL' || isMinorOn(p.dob, c.today) === true);
      });
      return bad.length
        ? hit('An executor or guardian must be an adult individual, not an organisation or a child.', unique(bad))
        : none();
    },
  },
  {
    id: 'CONTINGENT_IS_SELF', severity: 'BLOCKER', step: 3, title: 'Back-up beneficiaries are valid',
    check: (m) => {
      const bad = m.people.filter((p) => p.contingentId === p.id).map((p) => p.id);
      return bad.length ? hit('A person cannot be their own back-up beneficiary.', bad) : none();
    },
  },
  {
    id: 'DOB_MISSING_FOR_PERSON', severity: 'WARNING', step: 3, title: 'Dates of birth',
    check: (m) => {
      const beneficiaries = new Set(willBeneficiaryIds(m));
      const missing = m.people
        .filter((p) => p.partyType === 'INDIVIDUAL' && !p.dob && (CHILD_RELATIONSHIPS.includes(p.relationship) || beneficiaries.has(p.id)))
        .map((p) => p.id);
      return missing.length
        ? hit(`Add a date of birth for ${missing.length} ${plural(missing.length, 'person', 'people')} so we can tell whether anyone is under 18.`, missing)
        : none();
    },
  },
  {
    id: 'INVALID_PERSON_DATE', severity: 'WARNING', step: 3, title: 'Dates of birth are real dates',
    check: (m, c) => {
      const bad = m.people.filter((p) => !!p.dob && !(isRealIsoDate(p.dob) && p.dob <= c.today)).map((p) => p.id);
      return bad.length
        ? hit(`${bad.length} ${plural(bad.length, 'date of birth is', 'dates of birth are')} not a real date, or in the future.`, bad)
        : none();
    },
  },
  {
    id: 'ITEMS_NEED_REVIEW', severity: 'WARNING', step: 4, title: 'Assets reviewed',
    check: (m) => {
      const keys = m.estate.items.filter((i) => i.review === 'NEEDS_REVIEW' || i.review === 'STALE').map((i) => i.sourceKey);
      return keys.length
        ? hit(`${keys.length} ${plural(keys.length, 'item still needs', 'items still need')} your review.`, keys)
        : none();
    },
  },
  {
    id: 'ESTATE_STALE', severity: 'WARNING', step: 4, title: 'Asset list is recent',
    check: (m, c) => {
      const a = m.estate.asOf;
      if (!a) return hit('Your assets have not been fetched yet.');
      if (!isRealIsoDate(a) || !isRealIsoDate(c.today) || a > c.today) return hit('The date your assets were fetched is not valid - refresh the list.');
      return daysBetween(a, c.today) > 30 ? hit('Your asset list is more than 30 days old - refresh it.') : none();
    },
  },
  {
    id: 'ESTATE_SOURCE_FAILED', severity: 'WARNING', step: 4, title: 'All accounts were read',
    check: (m) =>
      m.estate.failedSources.length
        ? hit(`${m.estate.failedSources.length} ${plural(m.estate.failedSources.length, 'source', 'sources')} could not be read. Try refreshing, or add those assets by hand.`)
        : none(),
  },
  {
    id: 'JOINT_OWNERSHIP_ONLY_SHARE', severity: 'WARNING', step: 4, title: 'Jointly held assets',
    check: (m) => {
      const keys = m.estate.items.filter((i) => i.review !== 'EXCLUDED' && i.ownership.type === 'JOINT').map((i) => i.sourceKey);
      return keys.length ? hit('Only your share of a jointly held asset passes under your will.', keys) : none();
    },
  },
  {
    id: 'HUF_COPARCENARY_SHARE', severity: 'WARNING', step: 4, title: 'HUF property',
    check: (m) => {
      const keys = m.estate.items.filter((i) => i.review !== 'EXCLUDED' && i.ownership.type === 'HUF').map((i) => i.sourceKey);
      return keys.length ? hit('For HUF property you can give away only your own share, as the law allows.', keys) : none();
    },
  },
  {
    id: 'NOMINEE_IS_TRUSTEE_NOTE', severity: 'INFO', step: 4, title: 'Nominations',
    check: (m) => {
      const keys = m.estate.items.filter((i) => i.review !== 'EXCLUDED' && i.ownership.type === 'NOMINEE_ONLY').map((i) => i.sourceKey);
      return keys.length
        ? hit('Insurance and nominated accounts are paid to the nominee, who generally holds the money for the heirs named in your will.', keys)
        : none();
    },
  },
  {
    id: 'RESIDUARY_SUMS_100', severity: 'BLOCKER', step: 5, title: 'Shares add up to 100%',
    check: (m) => {
      const r = m.allocation.residuary;
      if (r.length === 0) return hit('Share the rest of your estate - the percentages must add up to 100%.');
      const ids = r.map((x) => x.personId);
      if (new Set(ids).size !== ids.length) return hit('Each person can appear only once in the percentage split.');
      const zero = r.filter((x) => new Decimal(x.sharePct).isZero()).map((x) => x.personId);
      if (zero.length) return hit('Remove people with a 0% share.', zero);
      const total = sumPercents(r.map((x) => x.sharePct));
      return total.equals(100) ? none() : hit(`The percentage split adds up to ${total.toFixed(2)}% - it must be exactly 100%.`);
    },
  },
  {
    id: 'SPECIFIC_ITEM_OVERALLOCATED', severity: 'BLOCKER', step: 5, title: 'No asset given away twice',
    check: (m) => {
      const byItem = new Map<string, Decimal>();
      for (const g of m.allocation.specificGifts) {
        byItem.set(g.itemId, (byItem.get(g.itemId) ?? new Decimal(0)).plus(g.sharePct));
      }
      const over = [...byItem.entries()].filter(([, v]) => v.greaterThan(100)).map(([k]) => k);
      return over.length ? hit('An asset is given away more than 100%.', over) : none();
    },
  },
  {
    id: 'GIFT_ON_EXCLUDED_OR_LIABILITY', severity: 'BLOCKER', step: 5, title: 'Gifts name real assets',
    check: (m) => {
      const items = new Map(m.estate.items.map((i) => [i.sourceKey, i]));
      const bad = m.allocation.specificGifts
        .filter((g) => {
          const i = items.get(g.itemId);
          return !i || i.review === 'EXCLUDED' || i.side === 'LIABILITY';
        })
        .map((g) => g.itemId);
      return bad.length
        ? hit('A gift names an asset that is excluded, is a liability, or is no longer in your list.', unique(bad))
        : none();
    },
  },
  {
    id: 'DANGLING_REFERENCE', severity: 'BLOCKER', step: 5, title: 'Everyone named is in your list',
    check: (m) => {
      const map = people(m);
      const named = [
        ...roleIds(m),
        ...m.people.map((p) => p.contingentId).filter((x): x is string => !!x),
        ...willBeneficiaryIds(m),
      ];
      const missing = unique(named.filter((id) => !map.has(id)));
      const seen = new Set<string>();
      const dupes = unique(m.people.map((p) => p.id).filter((id) => (seen.has(id) ? true : (seen.add(id), false))));
      return [
        ...(missing.length ? hit('Something refers to a person who is no longer in your list.', missing) : none()),
        ...(dupes.length ? hit('Two people in your list share the same internal id - remove and re-add one of them.', dupes) : none()),
      ];
    },
  },
  {
    id: 'MINOR_BENEFICIARY', severity: 'WARNING', step: 5, title: 'Beneficiaries under 18',
    check: (m, c) => {
      const map = people(m);
      const minors = willBeneficiaryIds(m).filter((id) => {
        const p = map.get(id);
        return !!p && p.partyType === 'INDIVIDUAL' && isMinorOn(p.dob, c.today) === true;
      });
      return minors.length
        ? hit('A beneficiary is under 18 - their share will be managed by their guardian until they turn 18.', minors)
        : none();
    },
  },
  {
    id: 'FIXED_GIFTS_EXCEED_NET_ESTATE', severity: 'WARNING', step: 5, title: 'Money gifts fit your estate',
    check: (m) => {
      const fixed = m.allocation.fixedGifts.reduce((s, g) => s.plus(g.amount), new Decimal(0));
      if (fixed.isZero()) return none();
      const { net } = willEstateTotals(m.estate.items);
      return fixed.greaterThan(net) ? hit('Your money gifts add up to more than your estimated net estate.') : none();
    },
  },
  {
    id: 'UNALLOCATED_ASSETS', severity: 'WARNING', step: 5, title: 'Every asset has a recipient',
    check: (m) => {
      if (m.allocation.residuary.length > 0) return none();
      const gifted = new Set(m.allocation.specificGifts.map((g) => g.itemId));
      const loose = m.estate.items
        .filter((i) => i.side === 'ASSET' && i.review !== 'EXCLUDED' && i.ownership.type !== 'NOMINEE_ONLY' && !gifted.has(i.sourceKey))
        .map((i) => i.sourceKey);
      return loose.length
        ? hit(`${loose.length} ${plural(loose.length, 'asset is', 'assets are')} not given to anyone yet.`, loose)
        : none();
    },
  },
  {
    id: 'LEGAL_REVIEW_RECOMMENDED', severity: 'INFO', step: 7, title: 'Legal review',
    check: () => hit('Have a qualified advocate review your will before you sign it.'),
  },
];

const SEVERITY_RANK: Record<WillSeverity, number> = { BLOCKER: 0, WARNING: 1, INFO: 2 };

export function runWillRules(m: WillPayload, ctx: WillRuleContext): WillFinding[] {
  const out: Array<WillFinding & { order: number }> = [];
  WILL_RULES.forEach((rule, order) => {
    let hits: WillRuleHit[];
    try {
      hits = rule.check(m, ctx);
    } catch {
      // A rule must never take the page down on a malformed draft: report it as a blocker. The error is
      // deliberately not logged or echoed - it can embed payload values.
      out.push({ ruleId: 'RULE_ERROR', severity: 'BLOCKER', step: rule.step, message: `The check "${rule.id}" could not run because some of your entries are not valid. Review this step.`, refs: [], order });
      return;
    }
    for (const h of hits) {
      out.push({ ruleId: rule.id, severity: rule.severity, step: rule.step, message: h.message, refs: h.refs ?? [], order });
    }
  });
  out.sort((a, b) => a.step - b.step || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.order - b.order);
  return out.map(({ order: _order, ...f }) => f);
}

export function hasWillBlockers(findings: readonly WillFinding[]): boolean {
  return findings.some((f) => f.severity === 'BLOCKER');
}
