import { describe, it, expect } from 'vitest';
import { findDuplicates, type DedupeRow } from './dedupe.js';

const row = (id: string, source: DedupeRow['source'], date: string, amount = '500.00', accountKey: string | null = '1234', direction = 'DEBIT'): DedupeRow => ({
  id, source, accountKey, direction, amount, txnDate: new Date(`${date}T00:00:00Z`),
});

describe('findDuplicates', () => {
  it('keeps the statement line when an alert reports the same payment a day apart', () => {
    const d = findDuplicates([row('alert', 'canonical_event', '2026-10-05'), row('stmt', 'statement', '2026-10-06')]);
    expect([...d]).toEqual([['alert', 'stmt']]);
  });

  it('never merges two payments from the same kind of source', () => {
    expect(findDuplicates([row('a', 'canonical_event', '2026-10-05'), row('b', 'canonical_event', '2026-10-05')]).size).toBe(0);
  });

  it('needs the same account, direction, exact amount and at most a day apart', () => {
    expect(findDuplicates([row('a', 'canonical_event', '2026-10-05'), row('s', 'statement', '2026-10-07')]).size).toBe(0);
    expect(findDuplicates([row('a', 'canonical_event', '2026-10-05', '500.00'), row('s', 'statement', '2026-10-05', '500.01')]).size).toBe(0);
    expect(findDuplicates([row('a', 'canonical_event', '2026-10-05', '500.00', '1234'), row('s', 'statement', '2026-10-05', '500.00', '9999')]).size).toBe(0);
    expect(findDuplicates([row('a', 'canonical_event', '2026-10-05', '500.00', '1234', 'CREDIT'), row('s', 'statement', '2026-10-05')]).size).toBe(0);
  });

  it('does not merge rows without an account', () => {
    expect(findDuplicates([row('a', 'canonical_event', '2026-10-05', '500.00', null), row('s', 'statement', '2026-10-05', '500.00', null)]).size).toBe(0);
  });

  it('pairs one for one: two real payments, two alerts, one statement line → one alert stays', () => {
    const d = findDuplicates([
      row('a1', 'canonical_event', '2026-10-05'),
      row('a2', 'canonical_event', '2026-10-06'),
      row('s1', 'statement', '2026-10-06'),
    ]);
    expect(d.size).toBe(1);
    expect(d.get('a2')).toBe('s1'); // the nearer date
  });

  it('a Finvu record outranks both a statement and an alert', () => {
    const d = findDuplicates([row('a', 'canonical_event', '2026-10-05'), row('s', 'statement', '2026-10-05'), row('f', 'finvu', '2026-10-05')]);
    expect(d.get('s')).toBe('f');
    expect(d.get('a')).toBe('f');
  });
});
