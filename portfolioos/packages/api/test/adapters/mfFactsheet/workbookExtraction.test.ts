/**
 * Unit tests for the workbook→grid extraction rule in `v1Support.ts`.
 *
 * This is the single highest-value test in the mfFactsheet suite, because the
 * rule it pins is the one that decides whether six of the ten registered AMCs
 * can be read at all.
 *
 * Verified 2026-09-07 against one real monthly disclosure per AMC:
 *
 *   stored 9.21   + format "#,##0.00"  → SBI, HDFC, Kotak, UTI
 *   stored 0.0921 + format "0.00%"     → ICICI Pru, Nippon, Axis, ABSL, Mirae, DSP
 *
 * Both mean 9.21% of NAV. Reading the RAW cell value — which is what
 * `XLSX.utils.sheet_to_json` returns, and the obvious thing to write — makes
 * the second group's weights sum to ~1 instead of ~100, so the 97-103% gate
 * rejects every file those six AMCs publish.
 *
 * The workbooks here are built in memory rather than captured, because the
 * point is the CELL METADATA (`z`, the number format), which a CSV fixture
 * cannot carry. The real-file behaviour is covered by `parsers.real.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { sheetToGrid, findSheet, readWorkbook } from '../../../src/adapters/mfFactsheet/v1Support.js';

/** Build a one-sheet workbook from explicit cell objects. */
function sheetOf(cells: Record<string, XLSX.CellObject>, ref: string): XLSX.WorkSheet {
  return { ...cells, '!ref': ref } as XLSX.WorkSheet;
}

describe('sheetToGrid — fraction-vs-percent', () => {
  it('scales a percent-formatted fraction to a percent string', () => {
    // How ICICI Pru, Nippon, Axis, ABSL, Mirae and DSP store "9.21%".
    const ws = sheetOf(
      {
        A1: { t: 's', v: '% to NAV' },
        A2: { t: 'n', v: 0.0921, z: '0.00%', w: '9.21%' },
      },
      'A1:A2',
    );
    expect(sheetToGrid(ws)[1]).toEqual(['9.21%']);
  });

  it('leaves an already-percent number alone', () => {
    // How SBI, HDFC, Kotak and UTI store the same 9.21%.
    const ws = sheetOf(
      {
        A1: { t: 's', v: '% to NAV' },
        A2: { t: 'n', v: 9.21, z: '#,##0.00', w: '9.21' },
      },
      'A1:A2',
    );
    expect(sheetToGrid(ws)[1]).toEqual(['9.21']);
  });

  it('keeps full precision rather than the 2dp display text', () => {
    // Mirae stores 14 decimal places and DISPLAYS two. ~100 holdings each
    // rounded to 2dp can drift the sum against a 3-point-wide band, so the
    // scaled raw value is used and only the "%" comes from the format.
    const ws = sheetOf(
      { A1: { t: 'n', v: 0.03041774528007, z: '0.00%', w: '3.04%' } },
      'A1:A1',
    );
    // Exact: Decimal scaling of the number's own string form, so all 12
    // significant decimals survive and no float noise is introduced.
    expect(sheetToGrid(ws)[0]?.[0]).toBe('3.041774528007%');
  });

  it('does not treat a quoted or escaped % in a format as a percent scale', () => {
    // A format that PRINTS a percent sign as a literal is not a percent format;
    // scaling by 100 there would invent a 100x error out of nothing.
    const ws = sheetOf(
      {
        A1: { t: 'n', v: 12.5, z: '0.00"%"', w: '12.50%' },
        A2: { t: 'n', v: 12.5, z: '0.00\\%', w: '12.50%' },
      },
      'A1:A2',
    );
    expect(sheetToGrid(ws)[0]?.[0]).toBe('12.50%');
    expect(sheetToGrid(ws)[1]?.[0]).toBe('12.50%');
  });

  it('prefers the publisher display text over a reconstructed Date', () => {
    // REGRESSION. These are the real cell contents of SBI's as-of cell:
    // Excel date serial 46234, format "mmmm dd, yyyy", displaying as
    // "July 31, 2026".
    //
    // SheetJS's `cellDates` turns that serial into a JS Date at LOCAL
    // midnight. In Asia/Kolkata that instant is 2026-07-30T18:30:00Z, so
    // `toISOString().slice(0,10)` gives "2026-07-30" and every SBI snapshot is
    // filed one day early — on a month-end disclosure, where the day is the
    // entire meaning of the document.
    //
    // The first version of `cellToText` had exactly this bug. The CSV fixtures
    // could not catch it because they were generated down the `w` path, which
    // is the same "fixture agrees with the code, not the AMC" failure this
    // whole adapter family was rewritten to escape.
    const ws = sheetOf(
      {
        A1: {
          t: 'd',
          v: new Date(2026, 6, 31),
          w: 'July 31, 2026',
          z: 'mmmm dd, yyyy',
        },
      },
      'A1:A1',
    );
    expect(sheetToGrid(ws)[0]?.[0]).toBe('July 31, 2026');
  });

  it('falls back to ISO for a date cell the publisher left unformatted', () => {
    const ws = sheetOf({ A1: { t: 'd', v: new Date(Date.UTC(2026, 6, 31)) } }, 'A1:A1');
    expect(sheetToGrid(ws)[0]?.[0]).toBe('2026-07-31');
  });

  it('preserves blank rows, because as-of is located by offset above the header', () => {
    const ws = sheetOf(
      { A1: { t: 's', v: 'Portfolio as on 31-Jul-2026' }, A3: { t: 's', v: 'Name' } },
      'A1:A3',
    );
    const grid = sheetToGrid(ws);
    expect(grid).toHaveLength(3);
    expect(grid[1]).toEqual([]);
  });

  it('round-trips through a real serialised workbook', () => {
    // Guards the `cellNF: true` read option: without it SheetJS drops `z` and
    // every percent column silently reverts to raw fractions.
    const ws = XLSX.utils.aoa_to_sheet([['% to NAV'], [0.0921]]);
    const cell = ws['A2'] as XLSX.CellObject;
    cell.z = '0.00%';
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BAF');
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);

    const reread = readWorkbook(bytes);
    const name = findSheet(reread, 'baf');
    expect(name).toBe('BAF');
    expect(sheetToGrid(reread.Sheets[name as string] as XLSX.WorkSheet)[1]).toEqual(['9.21%']);
  });
});

describe('findSheet', () => {
  it('matches case- and whitespace-insensitively', () => {
    // UTI's single sheet was "Sebi Exposure" in June 2026 and "exposure" in
    // July 2026 — same file, same publisher, one month apart.
    const wb = { SheetNames: ['  Sebi Exposure '], Sheets: {} } as unknown as XLSX.WorkBook;
    expect(findSheet(wb, 'sebi exposure')).toBe('  Sebi Exposure ');
  });

  it('returns null rather than guessing when nothing matches', () => {
    const wb = { SheetNames: ['Index', 'BAF'], Sheets: {} } as unknown as XLSX.WorkBook;
    expect(findSheet(wb, 'HDFCEQ')).toBeNull();
  });
});
