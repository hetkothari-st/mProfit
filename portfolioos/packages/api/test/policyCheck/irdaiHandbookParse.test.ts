import { describe, it, expect } from 'vitest';
import {
  buildMetricRecords,
  cleanInsurerName,
  insurerKey,
  parseTable53,
  parseTable62,
  type Row,
} from '../../src/services/policyCheck/irdaiHandbookParse.js';

/** Table 53 row: S.No, name, then one 12-col block per year (only counts matter). */
function t53Row(sno: number, name: string, fy2324: number[], fy2425: number[]): Row {
  const pad = (c: number[]) => [...c, 0, 0, 0, 0, 0, 0];
  return [sno, name, ...pad(fy2324), ...pad(fy2425)];
}
const t53Header: Row = ['S.No.', 'Insurer', '2023-24', ...new Array(11).fill(null), '2024-25'];
const t53: Row[] = [
  ['TABLE 53'],
  t53Header,
  [null, 'Private Sector Insurers'],
  t53Row(6, 'Bajaj Allianz General Insurance Co. Ltd.', [1, 2, 3, 4, 0, 5], [100, 1000, 900, 50, 0, 150]),
  [null, 'Specialized Insurers'],
  t53Row(27, 'Agriculture Insurance Co. of India Ltd.', [1, 2, 3, 4, 0, 5], [1, 2, 3, 4, 0, 5]),
  ['Stand-alone Health Insurers'],
  // Real FY2024-25 Niva Bupa figures from the IRDAI Handbook 2024-25, Table 53.
  t53Row(34, 'Niva Bupa Health Insurance Co. Ltd.', [10354, 696333, 636375, 55185, 0, 15127], [15127, 1024782, 942543, 75892, 0, 21474]),
  t53Row(35, 'Galaxy Health Insurance Co. Ltd.', [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]),
];

describe('parseTable53', () => {
  it('reads the requested year block, tags scope, skips specialized insurers and idle ones', () => {
    const rows = parseTable53(t53, '2024-25');
    expect(rows.map((r) => r.name)).toEqual([
      'Bajaj Allianz General Insurance Co. Ltd.',
      'Niva Bupa Health Insurance Co. Ltd.',
    ]);
    expect(rows[0]!.scope).toBe('ALL_LINES');
    expect(rows[1]).toMatchObject({ scope: 'HEALTH_ONLY', paid: 942543, repudiated: 75892, intimated: 1024782 });
  });
  it('throws on an unknown year rather than guessing columns', () => {
    expect(() => parseTable53(t53, '2031-32')).toThrow(/not found/);
  });
});

describe('buildMetricRecords', () => {
  const t62Header: Row = ['S.No.', 'Insurers', ...new Array(8).fill(null), '2024-25'];
  // 2024-25 block starts at col 10; Total NEP/claims at +12/+13.
  const t62Row = (sno: number | null, name: string, nep: number, claims: number): Row => {
    const r: unknown[] = new Array(10 + 15).fill(0);
    r[0] = sno;
    r[1] = name;
    r[22] = nep;
    r[23] = claims;
    return r;
  };
  const t62 = parseTable62(
    [
      t62Header,
      t62Row(null, 'Private Sector Total', 999, 999),
      // Real FY2024-25 Niva Bupa health totals (Rs lakh).
      t62Row(30, 'Niva Bupa Health Insurance Co. Ltd.', 479541.78, 295564.61),
    ],
    '2024-25',
  );

  it('computes CSR by count and ICR / amounts in INR from the two tables', () => {
    const rec = buildMetricRecords(parseTable53(t53, '2024-25'), t62, '2024-25').find((r) => r.insurerName.startsWith('Niva'))!;
    expect(rec.claimSettlementRatio).toBe('92.55'); // 942543 / (942543 + 75892)
    expect(rec.incurredClaimRatio).toBe('61.63'); // 295564.61 / 479541.78
    expect(rec.claimsTotal).toBe(15127 + 1024782);
    expect(rec.claimsSettled).toBe(942543);
    expect(rec.claimsRepudiated).toBe(75892);
    expect(rec.claimsIncurredInr).toBe('29556461000.00'); // lakh → INR
    expect(rec.claimsScope).toBe('HEALTH_ONLY');
  });
  it('excludes aggregate rows', () => {
    expect(t62.map((r) => r.name)).toEqual(['Niva Bupa Health Insurance Co. Ltd.']);
  });
});

describe('insurerKey', () => {
  it('folds name variants of one insurer but keeps different insurers apart', () => {
    expect(insurerKey('Zurich Kotak General Insurance Co.(India) Ltd.')).toBe(insurerKey('Kotak Mahindra General Insurance Co. Ltd.'));
    expect(insurerKey('Magma General Insurance Ltd.')).toBe(insurerKey('Magma HDI General Insurance Co. Ltd.'));
    expect(insurerKey('HDFC ERGO Health Insurance Co. Ltd.*')).toBe(insurerKey('HDFC ERGO General Insurance Co. Ltd.$'));
    expect(insurerKey('KshemaGeneral Insurance Co. Ltd.')).toBe(insurerKey('Kshema General Insurance Limited'));
    expect(insurerKey('Star Health & Allied Insurance Co. Ltd.')).toBe(insurerKey('Star Health and Allied Insurance Company Limited'));
    expect(insurerKey('Reliance General Insurance Co. Ltd.')).not.toBe(insurerKey('Reliance Health Insurance Ltd.'));
  });
  it('strips footnote marks from names', () => {
    expect(cleanInsurerName('HDFC ERGO General Insurance Co. Ltd.^^ ')).toBe('HDFC ERGO General Insurance Co. Ltd.');
  });
});
