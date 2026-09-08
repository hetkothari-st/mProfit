import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  allocateCredits,
  deriveReceiptStatus,
  type ChargeInput,
  type CreditInput,
} from './rentalLedgerMath.js';

const D = (v: string) => new Prisma.Decimal(v);
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function charge(key: string, month: string, due: string, amount: string): ChargeInput {
  return { key, kind: 'RECEIPT', forMonth: month, due: day(due), amount: D(amount) };
}
function credit(key: string, date: string, amount: string, forMonth: string | null = null): CreditInput {
  return { key, entryDate: day(date), createdAt: day(date), forMonth, amount: D(amount) };
}

describe('allocateCredits', () => {
  it('fills one charge exactly', () => {
    const r = allocateCredits(
      [charge('r1', '2026-04', '2026-04-01', '45000')],
      [credit('c1', '2026-04-03', '45000')],
    );
    expect(r.perCharge.get('r1')!.allocated.toString()).toBe('45000');
    expect(r.perCharge.get('r1')!.settledOn).toEqual(day('2026-04-03'));
    expect(r.advance.toString()).toBe('0');
  });

  it('sums two partial payments into one charge', () => {
    const r = allocateCredits(
      [charge('r1', '2026-04', '2026-04-01', '45000')],
      [credit('c1', '2026-04-03', '20000'), credit('c2', '2026-04-11', '25000')],
    );
    expect(r.perCharge.get('r1')!.allocated.toString()).toBe('45000');
    expect(r.perCharge.get('r1')!.settledOn).toEqual(day('2026-04-11'));
  });

  it('leaves a charge partly covered and records no settle date', () => {
    const r = allocateCredits(
      [charge('r1', '2026-04', '2026-04-01', '45000')],
      [credit('c1', '2026-04-03', '20000')],
    );
    expect(r.perCharge.get('r1')!.allocated.toString()).toBe('20000');
    expect(r.perCharge.get('r1')!.settledOn).toBeNull();
  });

  it('allocates FIFO across two arrears, oldest first', () => {
    const r = allocateCredits(
      [
        charge('r1', '2026-03', '2026-03-01', '45000'),
        charge('r2', '2026-04', '2026-04-01', '45000'),
      ],
      [credit('c1', '2026-04-20', '20000')],
    );
    expect(r.perCharge.get('r1')!.allocated.toString()).toBe('20000');
    expect(r.perCharge.get('r2')!.allocated.toString()).toBe('0');
  });

  it('spills one large credit across charges in due order', () => {
    const r = allocateCredits(
      [
        charge('r1', '2026-03', '2026-03-01', '45000'),
        charge('r2', '2026-04', '2026-04-01', '45000'),
      ],
      [credit('c1', '2026-04-20', '60000')],
    );
    expect(r.perCharge.get('r1')!.allocated.toString()).toBe('45000');
    expect(r.perCharge.get('r2')!.allocated.toString()).toBe('15000');
  });

  it('honours a forMonth pin ahead of older arrears, then spills FIFO', () => {
    const r = allocateCredits(
      [
        charge('r1', '2026-03', '2026-03-01', '45000'),
        charge('r2', '2026-04', '2026-04-01', '45000'),
      ],
      [credit('c1', '2026-04-05', '50000', '2026-04')],
    );
    expect(r.perCharge.get('r2')!.allocated.toString()).toBe('45000');
    expect(r.perCharge.get('r1')!.allocated.toString()).toBe('5000');
  });

  it('reports leftover credit as an advance', () => {
    const r = allocateCredits(
      [charge('r1', '2026-04', '2026-04-01', '45000')],
      [credit('c1', '2026-04-03', '50000')],
    );
    expect(r.advance.toString()).toBe('5000');
  });

  it('orders a fee charge among receipts by its date', () => {
    const fee: ChargeInput = {
      key: 'f1', kind: 'FEE', forMonth: null, due: day('2026-03-15'), amount: D('500'),
    };
    const r = allocateCredits(
      [charge('r1', '2026-03', '2026-03-01', '1000'), fee, charge('r2', '2026-04', '2026-04-01', '1000')],
      [credit('c1', '2026-04-02', '1600')],
    );
    expect(r.perCharge.get('r1')!.allocated.toString()).toBe('1000');
    expect(r.perCharge.get('f1')!.allocated.toString()).toBe('500');
    expect(r.perCharge.get('r2')!.allocated.toString()).toBe('100');
  });

  it('is order-independent — shuffled input yields the same allocation', () => {
    const charges = [
      charge('r1', '2026-03', '2026-03-01', '45000'),
      charge('r2', '2026-04', '2026-04-01', '45000'),
    ];
    const credits = [credit('c1', '2026-04-20', '20000'), credit('c2', '2026-03-10', '30000')];
    const a = allocateCredits(charges, credits);
    const b = allocateCredits([...charges].reverse(), [...credits].reverse());
    expect(b.perCharge.get('r1')!.allocated.toString()).toBe(a.perCharge.get('r1')!.allocated.toString());
    expect(b.perCharge.get('r2')!.allocated.toString()).toBe(a.perCharge.get('r2')!.allocated.toString());
  });
});

describe('deriveReceiptStatus', () => {
  const base = {
    expected: D('45000'),
    dueDate: day('2026-04-01'),
    today: day('2026-04-02'),
    graceDays: 7,
  };

  it('is SKIPPED whenever the skip flag is set, regardless of money', () => {
    expect(deriveReceiptStatus({ ...base, isSkipped: true, allocated: D('45000') })).toBe('SKIPPED');
  });

  it('is RECEIVED when fully allocated', () => {
    expect(deriveReceiptStatus({ ...base, isSkipped: false, allocated: D('45000') })).toBe('RECEIVED');
  });

  it('is RECEIVED when over-allocated', () => {
    expect(deriveReceiptStatus({ ...base, isSkipped: false, allocated: D('46000') })).toBe('RECEIVED');
  });

  it('is PARTIAL when partly allocated and not yet due', () => {
    expect(deriveReceiptStatus({ ...base, isSkipped: false, allocated: D('20000') })).toBe('PARTIAL');
  });

  it('stays PARTIAL rather than OVERDUE once past the grace window', () => {
    expect(deriveReceiptStatus({
      ...base, isSkipped: false, allocated: D('20000'), today: day('2026-05-01'),
    })).toBe('PARTIAL');
  });

  it('is EXPECTED when unpaid and inside the grace window', () => {
    expect(deriveReceiptStatus({ ...base, isSkipped: false, allocated: D('0') })).toBe('EXPECTED');
  });

  it('is OVERDUE when unpaid and past dueDate + graceDays', () => {
    expect(deriveReceiptStatus({
      ...base, isSkipped: false, allocated: D('0'), today: day('2026-04-09'),
    })).toBe('OVERDUE');
  });

  it('is OVERDUE exactly on the grace boundary (dueDate + 7d)', () => {
    expect(deriveReceiptStatus({
      ...base, isSkipped: false, allocated: D('0'), today: day('2026-04-08'),
    })).toBe('OVERDUE');
  });

  it('is still EXPECTED one day inside the grace window (dueDate + 6d)', () => {
    expect(deriveReceiptStatus({
      ...base, isSkipped: false, allocated: D('0'), today: day('2026-04-07'),
    })).toBe('EXPECTED');
  });
});
