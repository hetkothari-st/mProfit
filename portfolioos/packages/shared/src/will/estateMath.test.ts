import { describe, it, expect } from 'vitest';
import {
  ageOn, isMinorOn, removeWillItem, removeWillPerson, sumPercents, toAmount2,
  willBeneficiaryIds, willEstateTotals, willMinorChildren,
} from './estateMath.js';
import { item, person, TODAY, validWillPayload } from './__tests__/fixtures.js';

describe('willEstateTotals', () => {
  it('applies ownership shares, skips excluded, and keeps nominee-only apart', () => {
    const t = willEstateTotals([
      item({ sourceKey: 'a', label: 'A', value: '1000.00' }),
      item({ sourceKey: 'b', label: 'B', value: '200000.00', ownership: { type: 'JOINT', sharePct: '50' } }),
      item({ sourceKey: 'c', label: 'C', value: '999.00', review: 'EXCLUDED' }),
      item({ sourceKey: 'd', label: 'D', value: '5000000.00', kind: 'INSURANCE', ownership: { type: 'NOMINEE_ONLY', sharePct: '100' } }),
      item({ sourceKey: 'e', label: 'E', side: 'LIABILITY', kind: 'LOAN', value: '30000.10' }),
    ]);
    expect(t.assets.toFixed(2)).toBe('101000.00');
    expect(t.liabilities.toFixed(2)).toBe('30000.10');
    expect(t.net.toFixed(2)).toBe('70999.90');
    expect(t.nomineeOnly.toFixed(2)).toBe('5000000.00');
  });

  it('counts STALE and NEEDS_REVIEW items (they are still in the estate)', () => {
    const t = willEstateTotals([
      item({ sourceKey: 'a', label: 'A', value: '10', review: 'STALE' }),
      item({ sourceKey: 'b', label: 'B', value: '5', review: 'NEEDS_REVIEW' }),
    ]);
    expect(t.assets.toFixed(2)).toBe('15.00');
  });
});

describe('small maths', () => {
  it('toAmount2 rounds half to even at two decimals', () => {
    expect(toAmount2('1500.505')).toBe('1500.50');
    expect(toAmount2('1500.515')).toBe('1500.52');
    expect(toAmount2(0)).toBe('0.00');
  });

  it('sumPercents is exact', () => {
    expect(sumPercents(['33.33', '33.33', '33.34']).equals(100)).toBe(true);
    expect(sumPercents(['33.33', '33.33', '33.33']).toFixed(2)).toBe('99.99');
    expect(sumPercents([]).toFixed(2)).toBe('0.00');
  });

  it('ageOn counts the birthday itself as the new age', () => {
    expect(ageOn('2008-10-12', '2026-10-12')).toBe(18);
    expect(ageOn('2008-10-13', '2026-10-12')).toBe(17);
    expect(ageOn('2008-02-29', '2026-02-28')).toBe(17);
    expect(ageOn('2008-02-29', '2026-03-01')).toBe(18);
  });

  it('isMinorOn is null without a date of birth', () => {
    expect(isMinorOn(null, TODAY)).toBeNull();
    expect(isMinorOn('2010-01-01', TODAY)).toBe(true);
    expect(isMinorOn('2000-01-01', TODAY)).toBe(false);
  });
});

describe('people helpers', () => {
  it('finds minor children only among sons and daughters', () => {
    const p = validWillPayload();
    p.people.push(
      person({ id: 'kid', name: 'Kid', relationship: 'DAUGHTER', dob: '2015-01-01' }),
      person({ id: 'nephew', name: 'Nephew', relationship: 'NEPHEW', dob: '2016-01-01' }),
    );
    expect(willMinorChildren(p, TODAY).map((x) => x.id)).toEqual(['kid']);
  });

  it('lists beneficiaries once each', () => {
    expect(willBeneficiaryIds(validWillPayload()).sort()).toEqual(['p-son', 'p-spouse', 'p-trust']);
  });

  it('removing a person clears every reference to them', () => {
    const next = removeWillPerson(validWillPayload(), 'p-spouse');
    expect(next.people.map((x) => x.id)).toEqual(['p-son', 'p-trust']);
    expect(next.people.find((x) => x.id === 'p-son')!.contingentId).toBeNull();
    expect(next.roles.executorId).toBeNull();
    expect(next.roles.altExecutorId).toBe('p-son');
    expect(next.allocation.residuary).toEqual([{ personId: 'p-son', sharePct: '40' }]);
  });

  it('removing an item drops the specific gifts that name it', () => {
    const next = removeWillItem(validWillPayload(), 'holdings:pf1:EQUITY');
    expect(next.estate.items.map((x) => x.sourceKey)).toEqual(['bank:b1', 'loan:l1']);
    expect(next.allocation.specificGifts).toEqual([]);
  });
});
