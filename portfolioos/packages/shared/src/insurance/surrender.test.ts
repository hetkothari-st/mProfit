import { describe, it, expect } from 'vitest';
import { SURRENDER_RULES, compareSurrender, hasSurrenderValue, surrenderRulesFor, surrenderTiming } from './surrender.js';

describe('which policies have a surrender value', () => {
  it('is savings policies, not pure protection', () => {
    expect(['WHOLE_LIFE', 'ENDOWMENT', 'ULIP'].every(hasSurrenderValue)).toBe(true);
    expect(['TERM', 'HEALTH', 'MOTOR'].some(hasSurrenderValue)).toBe(false);
  });
});

describe('premiums against the surrender value', () => {
  it('shows what surrendering would lose', () => {
    expect(compareSurrender('200000', '150000')).toEqual({
      paid: '200000.00',
      value: '150000.00',
      difference: '-50000.00',
      outcome: 'LOSS',
      percent: '25.0',
    });
  });

  it('shows what it would keep above the premiums', () => {
    expect(compareSurrender('100000', '112500')).toMatchObject({ difference: '12500.00', outcome: 'GAIN', percent: '12.5' });
  });

  it('has no percentage when nothing is recorded as paid', () => {
    expect(compareSurrender('0', '5000')).toMatchObject({ outcome: 'GAIN', percent: null });
    expect(compareSurrender('5000', '5000')).toMatchObject({ outcome: 'EVEN', percent: '0.0' });
  });
});

describe('when surrender pays out', () => {
  it('holds a ULIP in its five-year lock-in', () => {
    expect(surrenderTiming({ type: 'ULIP', startDate: '2023-01-15', premiumFrequency: 'ANNUAL' }, '2026-09-11')).toEqual({
      state: 'ULIP_LOCK_IN',
      lockInEndsOn: '2028-01-15',
    });
    expect(surrenderTiming({ type: 'ULIP', startDate: '2020-01-15', premiumFrequency: 'ANNUAL' }, '2026-09-11')).toEqual({
      state: 'AVAILABLE',
    });
  });

  it('waits out the first policy year on a regular-premium policy', () => {
    expect(surrenderTiming({ type: 'ENDOWMENT', startDate: '2026-03-01', premiumFrequency: 'ANNUAL' }, '2026-09-11')).toEqual({
      state: 'FIRST_YEAR',
      payableFrom: '2027-03-01',
    });
    expect(surrenderTiming({ type: 'ENDOWMENT', startDate: '2026-03-01', premiumFrequency: 'SINGLE' }, '2026-09-11')).toEqual({
      state: 'AVAILABLE',
    });
  });
});

describe('the rules we quote', () => {
  it('are all IRDAI, with the page', () => {
    const all = [...SURRENDER_RULES.general, ...SURRENDER_RULES.nonLinked, ...SURRENDER_RULES.ulip];
    for (const r of all) {
      expect(r.source.url).toMatch(/^https:\/\/irdai\.gov\.in\//);
      expect(r.source.where).toMatch(/page/);
    }
    expect(all.some((r) => /7 days/.test(r.text))).toBe(true);
  });

  it('gives a ULIP the ULIP rules and a savings plan the non-linked ones', () => {
    expect(surrenderRulesFor('ULIP')).toEqual([...SURRENDER_RULES.general, ...SURRENDER_RULES.ulip]);
    expect(surrenderRulesFor('ENDOWMENT')).toEqual([...SURRENDER_RULES.general, ...SURRENDER_RULES.nonLinked]);
  });
});
