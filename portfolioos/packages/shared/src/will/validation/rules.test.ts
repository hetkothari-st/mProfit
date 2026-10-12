import { describe, it, expect } from 'vitest';
import { hasWillBlockers, runWillRules, WILL_RULES } from './rules.js';
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
  it('has 23 well-formed rules', () => {
    expect(WILL_RULES).toHaveLength(23);
    expect(new Set(WILL_RULES.map((r) => r.id)).size).toBe(23);
    for (const r of WILL_RULES) {
      expect(r.step).toBeGreaterThanOrEqual(2);
      expect(r.step).toBeLessThanOrEqual(7);
      expect(r.title.length).toBeGreaterThan(3);
    }
  });
});

// One golden case per rule: [rule id, expected severity, mutation that must trigger it].
const CASES: Array<[string, 'BLOCKER' | 'WARNING' | 'INFO', (m: WillPayload) => void]> = [
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
