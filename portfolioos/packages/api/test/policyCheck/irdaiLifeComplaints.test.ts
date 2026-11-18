import { describe, it, expect } from 'vitest';
import { buildLifeRecords, parseTable15, parseTable37 } from '../../src/services/policyCheck/irdaiLifeParse.js';
import type { Row } from '../../src/services/policyCheck/irdaiHandbookParse.js';

/** Rows copied from the IRDAI Handbook 2024-25, Part I, sheet 37 (layout and real figures). */
const T37_HEADER: Row[] = [
  ['TABLE 37: STATUS OF GRIEVANCES WITH LIFE INSURERS'],
  ['S.No.', 'Insurer', '2023-24', null, null, null, null, '2024-25', null, null, null],
  [null, null, 'O/S start', 'Reported', 'Duplicate', 'Actual', 'Resolved', 'O/S start', 'Reported', 'Resolved', 'Closing'],
  [null, 'Public Sector'],
];
const T37: Row[] = [
  ...T37_HEADER,
  [1, 'Life Insurance Corporation of India', 0, 81149, 128, 81021, 81021, 0, 74104, 74104, 0],
  [null, 'Private Sector'],
  [6, 'Axis MaxLife  Insurance Company Ltd.', 0, 4804, 522, 4282, 4282, 0, 5165, 5165, 0],
  [11, 'Credit Access', null, null, null, null, null, null, 0, null, 0],
  [null, 'Private Sector Total', 112, 45884, 3178, 42706, 42418, 289, 41927, 39558, 447],
  [null, 'Grand Total', 112, 127378, 3484, 123894, 123606, 289, 123076, 120579, 447],
];

/** Table 15 uses short names; one 20-col block per FY starting at the FY header column. */
function t15Row(sno: number | null, name: string, total: number, paid: number): Row {
  const r: Row = new Array(24).fill(null);
  r[0] = sno;
  r[1] = name;
  r[2 + 4] = total;
  r[2 + 5] = total * 10;
  r[2 + 6] = paid;
  r[2 + 7] = paid * 10;
  return r;
}
const T15: Row[] = [
  ['S.No.', 'Insurer', '2024-25', ...new Array(21).fill(null)],
  t15Row(1, 'LIC', 1000, 980),
  t15Row(2, 'Axis Max Life', 500, 490),
  t15Row(null, 'Private Sector Total', 1500, 1470),
  t15Row(null, 'Grand Total', 1500, 1470),
];

describe('parseTable37', () => {
  it('reads the 2024-25 four-column block and skips headings and totals', () => {
    const rows = parseTable37(T37, '2024-25');
    expect(rows.map((r) => r.name)).toEqual(['Life Insurance Corporation of India', 'Axis MaxLife Insurance Company Ltd.', 'Credit Access']);
    expect(rows[0]).toMatchObject({ reported: 74104, resolved: 74104, closing: 0, duplicatesExcluded: null });
  });

  it('reads the 2023-24 five-column block and uses the duplicate-free figure', () => {
    const rows = parseTable37(T37, '2023-24');
    // Credit Access has no 2023-24 figures: dropped, not counted as zero.
    expect(rows.map((r) => r.name)).toEqual(['Life Insurance Corporation of India', 'Axis MaxLife Insurance Company Ltd.']);
    expect(rows[1]).toMatchObject({ reported: 4282, resolved: 4282, closing: null, duplicatesExcluded: 522 });
  });

  it('refuses years whose layout is unknown instead of guessing', () => {
    expect(() => parseTable37(T37, '2021-22')).toThrow(/not supported/);
  });
});

describe('life complaints join', () => {
  it('attaches grievances to the matching insurer despite different spellings', () => {
    const life = buildLifeRecords(parseTable15(T15, '2024-25'), '2024-25', parseTable37(T37, '2024-25'));
    expect(life.map((r) => r.insurerName)).toEqual(['LIC', 'Axis Max Life']); // totals no longer leak in
    expect(life[0]!.complaints).toMatchObject({ reported: 74104, attended: 74104, outstandingAtYearEnd: 0, perTenThousandClaims: null });
    expect(life[1]!.complaints).toMatchObject({ reported: 5165 });
  });

  it('leaves complaints null when Table 37 is not supplied', () => {
    const life = buildLifeRecords(parseTable15(T15, '2024-25'), '2024-25');
    expect(life.every((r) => r.complaints === null)).toBe(true);
  });

  it('says plainly that no per-policy rate exists', () => {
    const life = buildLifeRecords(parseTable15(T15, '2024-25'), '2024-25', parseTable37(T37, '2024-25'));
    expect((life[0]!.complaints as { basis: string }).basis).toMatch(/no policy count/i);
  });
});
