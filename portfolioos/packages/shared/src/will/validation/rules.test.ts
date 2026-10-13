import { describe, it, expect } from 'vitest';
import { hasWillBlockers, runWillRules, WILL_RULES, WILL_RULESET_VERSION } from './rules.js';
import type { WillPayload } from '../schema.js';
import { item, person, TODAY, validWillPayload } from '../__tests__/fixtures.js';

const ctx = { today: TODAY };
const ids = (m: WillPayload) => runWillRules(m, ctx).map((f) => f.ruleId);
function mutate(fn: (m: WillPayload) => void): WillPayload {
  const m = validWillPayload();
  fn(m);
  return m;
}

describe('the valid fixture', () => {
  it('raises only the legal-review note', () => {
    const f = runWillRules(validWillPayload(), ctx);
    expect(f.map((x) => x.ruleId)).toEqual(['LEGAL_REVIEW_RECOMMENDED']);
    expect(hasWillBlockers(f)).toBe(false);
  });
});

describe('rule ids are unique and every rule has a step and title', () => {
  it('has 25 well-formed rules', () => {
    expect(WILL_RULES).toHaveLength(25);
    expect(new Set(WILL_RULES.map((r) => r.id)).size).toBe(25);
    for (const r of WILL_RULES) {
      expect(r.step).toBeGreaterThanOrEqual(2);
      expect(r.step).toBeLessThanOrEqual(7);
      expect(r.title.length).toBeGreaterThan(3);
    }
  });
});

it('pins the ruleset version', () => {
  expect(WILL_RULESET_VERSION).toBe(2);
});

// One golden case per rule: [rule id, expected severity, mutation that must trigger it].
const EXPECT: Record<string, [number, string[]]> = {"JURISDICTION_INDIA_ONLY":[2,[]],"MUSLIM_LAW_UNSUPPORTED":[2,[]],"REQUIRED_FIELDS":[2,[]],"TESTATOR_ADULT":[2,[]],"EXECUTOR_APPOINTED":[3,[]],"GUARDIAN_IF_MINOR_CHILDREN":[3,["kid"]],"EXECUTOR_GUARDIAN_INDIVIDUAL":[3,["p-trust"]],"CONTINGENT_IS_SELF":[3,["p-son"]],"DOB_MISSING_FOR_PERSON":[3,["p-son"]],"ITEMS_NEED_REVIEW":[4,["bank:b1"]],"ESTATE_STALE":[4,[]],"ESTATE_SOURCE_FAILED":[4,[]],"JOINT_OWNERSHIP_ONLY_SHARE":[4,["bank:b1"]],"HUF_COPARCENARY_SHARE":[4,["bank:b1"]],"NOMINEE_IS_TRUSTEE_NOTE":[4,["ins:1"]],"RESIDUARY_SUMS_100":[5,[]],"SPECIFIC_ITEM_OVERALLOCATED":[5,["holdings:pf1:EQUITY"]],"GIFT_ON_EXCLUDED_OR_LIABILITY":[5,["loan:l1"]],"DANGLING_REFERENCE":[5,["gone"]],"MINOR_BENEFICIARY":[5,["kid"]],"FIXED_GIFTS_EXCEED_NET_ESTATE":[5,[]],"UNALLOCATED_ASSETS":[5,["bank:b1"]],"LEGAL_REVIEW_RECOMMENDED":[7,[]]};
const CASES: Array<[string, 'BLOCKER' | 'WARNING' | 'INFO', (m: WillPayload) => void]> = [
  ['INVALID_DATE', 'BLOCKER', (m) => { m.details.dob = '2026-02-31'; }],
  ['INVALID_PERSON_DATE', 'WARNING', (m) => { m.people[1]!.dob = '2026-13-01'; }],
  ['JURISDICTION_INDIA_ONLY', 'BLOCKER', (m) => { m.details.jurisdiction = 'OTHER'; }],
  ['MUSLIM_LAW_UNSUPPORTED', 'BLOCKER', (m) => { m.details.personalLaw = 'MUSLIM'; }],
  ['REQUIRED_FIELDS', 'BLOCKER', (m) => { m.details.address = ''; }],
  ['TESTATOR_ADULT', 'BLOCKER', (m) => { m.details.dob = '2010-01-01'; }],
  ['EXECUTOR_APPOINTED', 'BLOCKER', (m) => { m.roles.executorId = null; }],
  ['GUARDIAN_IF_MINOR_CHILDREN', 'BLOCKER', (m) => { m.people.push(person({ id: 'kid', name: 'Kid', relationship: 'DAUGHTER', dob: '2016-03-03' })); }],
  ['EXECUTOR_GUARDIAN_INDIVIDUAL', 'BLOCKER', (m) => { m.roles.executorId = 'p-trust'; }],
  ['CONTINGENT_IS_SELF', 'BLOCKER', (m) => { m.people[1]!.contingentId = m.people[1]!.id; }],
  ['DOB_MISSING_FOR_PERSON', 'WARNING', (m) => { m.people[1]!.dob = null; }],
  ['ITEMS_NEED_REVIEW', 'WARNING', (m) => { m.estate.items[0]!.review = 'NEEDS_REVIEW'; }],
  ['ESTATE_STALE', 'WARNING', (m) => { m.estate.asOf = '2026-08-01'; }],
  ['ESTATE_SOURCE_FAILED', 'WARNING', (m) => { m.estate.failedSources = ['vehicles']; }],
  ['JOINT_OWNERSHIP_ONLY_SHARE', 'WARNING', (m) => { m.estate.items[0]!.ownership = { type: 'JOINT', sharePct: '50' }; }],
  ['HUF_COPARCENARY_SHARE', 'WARNING', (m) => { m.estate.items[0]!.ownership = { type: 'HUF', sharePct: '25' }; }],
  ['NOMINEE_IS_TRUSTEE_NOTE', 'INFO', (m) => { m.estate.items.push(item({ sourceKey: 'ins:1', kind: 'INSURANCE', label: 'LIC term policy', ownership: { type: 'NOMINEE_ONLY', sharePct: '100' } })); }],
  ['RESIDUARY_SUMS_100', 'BLOCKER', (m) => { m.allocation.residuary[0]!.sharePct = '50'; }],
  ['SPECIFIC_ITEM_OVERALLOCATED', 'BLOCKER', (m) => { m.allocation.specificGifts.push({ itemId: 'holdings:pf1:EQUITY', personId: 'p-spouse', sharePct: '10' }); }],
  ['GIFT_ON_EXCLUDED_OR_LIABILITY', 'BLOCKER', (m) => { m.allocation.specificGifts.push({ itemId: 'loan:l1', personId: 'p-spouse', sharePct: '100' }); }],
  ['DANGLING_REFERENCE', 'BLOCKER', (m) => { m.allocation.fixedGifts.push({ personId: 'gone', amount: '10' }); }],
  ['MINOR_BENEFICIARY', 'WARNING', (m) => {
    m.people.push(person({ id: 'kid', name: 'Kid', relationship: 'NIECE', dob: '2016-03-03' }));
    m.allocation.fixedGifts.push({ personId: 'kid', amount: '1000' });
  }],
  ['FIXED_GIFTS_EXCEED_NET_ESTATE', 'WARNING', (m) => { m.allocation.fixedGifts[0]!.amount = '99999999'; }],
  ['UNALLOCATED_ASSETS', 'WARNING', (m) => { m.allocation.residuary = []; }],
  ['LEGAL_REVIEW_RECOMMENDED', 'INFO', () => undefined],
];

describe.each(CASES)('%s', (id, severity, fn) => {
  it(`fires as ${severity}`, () => {
    const found = runWillRules(mutate(fn), ctx).find((f) => f.ruleId === id);
    expect(found?.severity).toBe(severity);
    expect(found?.message.length).toBeGreaterThan(10);
    const exp = EXPECT[id] ?? (id === 'INVALID_DATE' ? [2, []] : [3, ['p-son']]);
    expect(found?.step).toBe(exp[0]);
    expect([...(found?.refs ?? [])].sort()).toEqual([...exp[1]].sort());
  });
});

describe('rule details', () => {
  it('RESIDUARY_SUMS_100 is exact: 33.34 + 33.33 + 33.33 passes, 3 x 33.33 does not', () => {
    const three = (shares: string[]) =>
      mutate((m) => {
        m.people.push(person({ id: 'p-d', name: 'D', relationship: 'DAUGHTER', dob: '1995-01-01' }));
        m.allocation.residuary = [
          { personId: 'p-spouse', sharePct: shares[0]! },
          { personId: 'p-son', sharePct: shares[1]! },
          { personId: 'p-d', sharePct: shares[2]! },
        ];
      });
    expect(ids(three(['33.34', '33.33', '33.33']))).not.toContain('RESIDUARY_SUMS_100');
    const bad = runWillRules(three(['33.33', '33.33', '33.33']), ctx).find((f) => f.ruleId === 'RESIDUARY_SUMS_100');
    expect(bad?.message).toContain('99.99%');
  });

  it('RESIDUARY_SUMS_100 refuses a person listed twice and a 0% share', () => {
    expect(ids(mutate((m) => { m.allocation.residuary = [{ personId: 'p-son', sharePct: '50' }, { personId: 'p-son', sharePct: '50' }]; })))
      .toContain('RESIDUARY_SUMS_100');
    expect(ids(mutate((m) => { m.allocation.residuary.push({ personId: 'p-trust', sharePct: '0' }); })))
      .toContain('RESIDUARY_SUMS_100');
  });

  it('a guardian appointed for a minor child clears the blocker', () => {
    const m = mutate((x) => {
      x.people.push(person({ id: 'kid', name: 'Kid', relationship: 'DAUGHTER', dob: '2016-03-03' }));
      x.roles.guardianId = 'p-spouse';
    });
    expect(ids(m)).not.toContain('GUARDIAN_IF_MINOR_CHILDREN');
  });

  it('a minor cannot be executor', () => {
    const m = mutate((x) => {
      x.people.push(person({ id: 'kid', name: 'Kid', relationship: 'NEPHEW', dob: '2016-03-03' }));
      x.roles.executorId = 'kid';
    });
    expect(ids(m)).toContain('EXECUTOR_GUARDIAN_INDIVIDUAL');
  });

  it('ESTATE_STALE fires when the estate was never fetched', () => {
    expect(ids(mutate((m) => { m.estate.asOf = null; }))).toContain('ESTATE_STALE');
    expect(ids(mutate((m) => { m.estate.asOf = '2026-09-12'; }))).not.toContain('ESTATE_STALE');
  });

  it('an excluded item given away is a blocker', () => {
    expect(ids(mutate((m) => { m.estate.items[1]!.review = 'EXCLUDED'; }))).toContain('GIFT_ON_EXCLUDED_OR_LIABILITY');
  });

  it('a nominee-only item given away is a blocker that names the policy nominee', () => {
    const m = mutate((x) => { x.estate.items[1]!.ownership = { type: 'NOMINEE_ONLY', sharePct: '100' }; });
    const f = runWillRules(m, ctx).find((x) => x.ruleId === 'GIFT_ON_EXCLUDED_OR_LIABILITY');
    expect(f?.severity).toBe('BLOCKER');
    expect(f?.refs).toEqual([m.estate.items[1]!.sourceKey]);
    expect(f?.message).toContain('goes to the policy nominee');
  });

  it('findings carry no names and point at ids', () => {
    const f = runWillRules(mutate((m) => { m.people[1]!.dob = null; }), ctx).find((x) => x.ruleId === 'DOB_MISSING_FOR_PERSON')!;
    expect(f.refs).toEqual(['p-son']);
    expect(f.message).not.toContain('Arjun');
  });

  it('sorts by step, then severity', () => {
    const f = runWillRules(mutate((m) => { m.details.address = ''; m.estate.items[0]!.review = 'NEEDS_REVIEW'; m.roles.executorId = null; }), ctx);
    expect(f.map((x) => x.ruleId)).toEqual(['REQUIRED_FIELDS', 'EXECUTOR_APPOINTED', 'ITEMS_NEED_REVIEW', 'LEGAL_REVIEW_RECOMMENDED']);
  });
});

describe('hardening', () => {
  it('muslim message names the one-third limit and legal advice', () => {
    const f = runWillRules(mutate((m) => { m.details.personalLaw = 'MUSLIM'; }), ctx).find((x) => x.ruleId === 'MUSLIM_LAW_UNSUPPORTED')!;
    expect(f.message).toContain('one-third');
    expect(f.message).toContain('legal advice');
  });

  it('impossible and future dates of birth are flagged for the testator and a child', () => {
    for (const bad of ['2026-02-31', '2026-13-01', '2030-01-01']) {
      expect(ids(mutate((m) => { m.details.dob = bad; }))).toContain('INVALID_DATE');
      expect(ids(mutate((m) => { m.people[1]!.dob = bad; }))).toContain('INVALID_PERSON_DATE');
    }
  });

  it('an invalid or future asOf counts as stale', () => {
    expect(ids(mutate((m) => { m.estate.asOf = '2026-02-31'; }))).toContain('ESTATE_STALE');
    expect(ids(mutate((m) => { m.estate.asOf = '2027-01-01'; }))).toContain('ESTATE_STALE');
  });

  it('never throws on malformed values', () => {
    const cases: Array<(m: WillPayload) => void> = [
      (m) => { m.allocation.residuary[0]!.sharePct = ''; },
      (m) => { m.allocation.residuary[0]!.sharePct = '5%'; },
      (m) => { m.details.dob = '05/01/1990'; },
      (m) => { m.people[1]!.dob = '05/01/1990'; },
    ];
    for (const fn of cases) {
      const m = mutate(fn);
      let f: ReturnType<typeof runWillRules> = [];
      expect(() => { f = runWillRules(m, ctx); }).not.toThrow();
      expect(f.length).toBeGreaterThan(0);
    }
    const f = runWillRules(mutate((m) => { m.allocation.residuary[0]!.sharePct = ''; }), ctx);
    const err = f.find((x) => x.ruleId === 'RULE_ERROR');
    expect(err?.severity).toBe('BLOCKER');
    expect(err?.message).toContain('RESIDUARY_SUMS_100');
  });

  it('duplicate person ids are flagged', () => {
    const f = runWillRules(mutate((m) => { m.people.push(person({ id: 'p-son', name: 'Twin' })); }), ctx).find((x) => x.ruleId === 'DANGLING_REFERENCE');
    expect(f?.refs).toEqual(['p-son']);
  });
});
