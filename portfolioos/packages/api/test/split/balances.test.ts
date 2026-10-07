import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { memberNets, pairwiseDebts, simplify, type LedgerExpense } from '../../src/services/split/balances.js';

const D = (v: string | number) => new Decimal(v);
const exp = (payer: string, amount: string, shares: Record<string, string>): LedgerExpense => ({
  payers: [{ memberId: payer, baseAmount: D(amount) }],
  shares: Object.entries(shares).map(([memberId, v]) => ({ memberId, baseAmount: D(v) })),
});
const flat = (t: { fromMemberId: string; toMemberId: string; amount: Decimal }[]) =>
  t.map((x) => `${x.fromMemberId}->${x.toMemberId}:${x.amount.toFixed(2)}`);

describe('memberNets', () => {
  it('payer is owed the others shares', () => {
    const n = memberNets([exp('a', '90', { a: '30', b: '30', c: '30' })], [], ['a', 'b', 'c']);
    expect(n.get('a')!.toFixed(2)).toBe('60.00');
    expect(n.get('b')!.toFixed(2)).toBe('-30.00');
    expect(n.get('c')!.toFixed(2)).toBe('-30.00');
  });

  it('settlement moves net toward zero', () => {
    const n = memberNets(
      [exp('a', '90', { a: '30', b: '30', c: '30' })],
      [{ fromMemberId: 'b', toMemberId: 'a', baseAmount: D('30') }],
      ['a', 'b', 'c'],
    );
    expect(n.get('a')!.toFixed(2)).toBe('30.00');
    expect(n.get('b')!.toFixed(2)).toBe('0.00');
  });

  it('includes members with no activity at zero', () => {
    const n = memberNets([], [], ['x']);
    expect(n.get('x')!.toFixed(2)).toBe('0.00');
  });
});

describe('pairwiseDebts', () => {
  it('nets opposite debts between a pair', () => {
    const t = pairwiseDebts(
      [exp('a', '100', { a: '50', b: '50' }), exp('b', '40', { a: '20', b: '20' })],
      [],
    );
    expect(flat(t)).toEqual(['b->a:30.00']);
  });

  it('multi-payer expense owes each payer proportionally', () => {
    const e: LedgerExpense = {
      payers: [{ memberId: 'a', baseAmount: D('60') }, { memberId: 'b', baseAmount: D('30') }],
      shares: [{ memberId: 'a', baseAmount: D('30') }, { memberId: 'b', baseAmount: D('30') }, { memberId: 'c', baseAmount: D('30') }],
    };
    expect(flat(pairwiseDebts([e], [])).sort()).toEqual(['b->a:10.00', 'c->a:20.00', 'c->b:10.00'].sort());
  });
});

describe('simplify', () => {
  it('collapses a chain a->b->c into a->c', () => {
    const nets = new Map([['a', D('-10')], ['b', D('0')], ['c', D('10')]]);
    expect(flat(simplify(nets))).toEqual(['a->c:10.00']);
  });

  it('property: random ledgers settle to zero with at most n-1 transfers, deterministically', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let run = 0; run < 200; run++) {
      const n = 2 + Math.floor(rnd() * 6);
      const ids = Array.from({ length: n }, (_, i) => `m${i}`);
      const raw = ids.map(() => D(Math.floor(rnd() * 100000)).div(100));
      const mean = raw.reduce((a, b) => a.plus(b), D(0)).div(n).toDecimalPlaces(2, Decimal.ROUND_DOWN);
      const vals = raw.map((r) => r.minus(mean));
      const drift = vals.reduce((a, b) => a.plus(b), D(0));
      vals[0] = vals[0]!.minus(drift); // force Σ = 0 exactly
      const nets = new Map(ids.map((id, i) => [id, vals[i]!]));
      const t = simplify(nets);
      expect(t.length).toBeLessThanOrEqual(n - 1);
      const after = new Map(nets);
      for (const x of t) {
        expect(x.amount.gt(0)).toBe(true);
        after.set(x.fromMemberId, after.get(x.fromMemberId)!.plus(x.amount));
        after.set(x.toMemberId, after.get(x.toMemberId)!.minus(x.amount));
      }
      for (const v of after.values()) expect(v.toFixed(2)).toBe('0.00');
      expect(flat(simplify(new Map([...nets].reverse())))).toEqual(flat(t));
    }
  });

  it('throws if nets do not sum to zero', () => {
    expect(() => simplify(new Map([['a', D('1')]]))).toThrow(/SPLIT_NETS_UNBALANCED/);
  });
});
