/**
 * Golden-fixture tests for the MoSPI CPI parsers. Every fixture is a real
 * captured response — see test/fixtures/cpi/README.md for the exact requests.
 * Pure: no DB, no network.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseCpi2024Page,
  parseCpi2012Page,
  legacyRowsToDivisions,
  type CpiRow,
} from '../../src/priceFeeds/mospiCpi.parse.js';

const dir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../fixtures/cpi');
const fixture = (name: string) => readFileSync(resolve(dir, name), 'utf8');

function find(rows: CpiRow[], sector: string, division: string): CpiRow | undefined {
  return rows.find((r) => r.sector === sector && r.divisionCode === division);
}

describe('parseCpi2024Page', () => {
  it('extracts the 39 division-level rows for All India, Sep 2026', () => {
    const out = parseCpi2024Page(fixture('mospi-cpi2024-allindia-2026-09-p1.json'), 1);
    expect(out.kind).toBe('ok');
    if (out.kind !== 'ok') return;
    expect(out.rows).toHaveLength(39);
    expect(out.failures).toEqual([]);
    const general = find(out.rows, 'COMBINED', '00')!;
    expect(general).toMatchObject({ baseYear: 2024, stateCode: 1, year: 2026, month: 9 });
    expect(general.inflationPct.toString()).toBe('5.54');
    expect(general.indexValue?.toString()).toBe('109.49');
    expect(find(out.rows, 'COMBINED', '10')!.inflationPct.toString()).toBe('3.94');
    expect(find(out.rows, 'COMBINED', '13')!.inflationPct.toString()).toBe('13.75');
    expect(find(out.rows, 'RURAL', '01')!.inflationPct.toString()).toBe('7.71');
    // No group/class/item rows leak through.
    expect(new Set(out.rows.map((r) => r.divisionCode)).size).toBe(13);
  });

  it('assigns the requested state code (Maharashtra = 20)', () => {
    const out = parseCpi2024Page(fixture('mospi-cpi2024-maharashtra-2026-09-p1.json'), 20);
    expect(out.kind).toBe('ok');
    if (out.kind !== 'ok') return;
    expect(out.rows).toHaveLength(39);
    expect(out.rows.every((r) => r.stateCode === 20)).toBe(true);
    expect(find(out.rows, 'COMBINED', '00')!.inflationPct.toString()).toBe('5.18');
    expect(find(out.rows, 'URBAN', '10')!.inflationPct.toString()).toBe('4.1');
  });

  it('treats "No Data Found" as an unreleased month, not a failure', () => {
    expect(parseCpi2024Page(fixture('mospi-cpi2024-allindia-2026-10-empty.json'), 1).kind).toBe('empty');
  });

  it('surfaces an API error body as fatal', () => {
    const out = parseCpi2024Page(fixture('mospi-cpi2024-limit-error.json'), 1);
    expect(out.kind).toBe('fatal');
    if (out.kind === 'fatal') expect(out.detail).toMatch(/Limit parameter too large/);
  });

  it('is fatal on non-JSON and on a page with data but no division rows', () => {
    expect(parseCpi2024Page('<!doctype html>', 1).kind).toBe('fatal');
    const onlyGroups = JSON.stringify({
      data: [{ year: '2026', month: 'September', sector: 'Rural', division: 'Health', group: 'Medical products', code: '06.1', index: '100', inflation: '1' }],
    });
    expect(parseCpi2024Page(onlyGroups, 1).kind).toBe('fatal');
  });

  it('rejects a null inflation as a row failure — never zero', () => {
    const body = JSON.stringify({
      data: [
        { year: '2026', month: 'September', sector: 'Rural', division: 'Health', group: null, code: '06', index: '100', inflation: null },
        { year: '2026', month: 'September', sector: 'Rural', division: 'Education services', group: null, code: '10', index: '101', inflation: '2.5' },
      ],
    });
    const out = parseCpi2024Page(body, 1);
    expect(out.kind).toBe('ok');
    if (out.kind !== 'ok') return;
    expect(out.rows.map((r) => r.divisionCode)).toEqual(['10']);
    expect(out.failures).toHaveLength(1);
    expect(out.failures[0]!.reason).toBe('missing_inflation');
  });
});

describe('parseCpi2012Page + legacyRowsToDivisions', () => {
  it('maps old subgroups onto new divisions for All India, Sep 2025', () => {
    const page = parseCpi2012Page(fixture('mospi-cpi2012-allindia-2025-09.json'));
    expect(page.kind).toBe('ok');
    if (page.kind !== 'ok') return;
    expect(page.totalPages).toBe(1);
    const rows = legacyRowsToDivisions(page.rows, 1);
    expect(rows.every((r) => r.baseYear === 2012 && r.stateCode === 1 && r.year === 2025 && r.month === 9)).toBe(true);
    expect(find(rows, 'COMBINED', '00')!.inflationPct.toString()).toBe('1.44');
    expect(find(rows, 'COMBINED', '10')!.inflationPct.toString()).toBe('3.44');
    // Housing 2.98 and Fuel 1.98 averaged.
    expect(find(rows, 'COMBINED', '04')!.inflationPct.toString()).toBe('2.48');
    // Rural Housing is null in the old series → Fuel & Light alone.
    expect(find(rows, 'RURAL', '04')!.inflationPct.toString()).toBe('1.71');
    // Transport and Communication feeds both 07 and 08.
    expect(find(rows, 'COMBINED', '07')!.inflationPct.toString()).toBe('1.82');
    expect(find(rows, 'COMBINED', '08')!.inflationPct.toString()).toBe('1.82');
    // 13 divisions × 3 sectors.
    expect(rows).toHaveLength(39);
  });

  it('assigns the new-series state code, not the old one (Maharashtra 27 → 20)', () => {
    const page = parseCpi2012Page(fixture('mospi-cpi2012-maharashtra-2025-09.json'));
    if (page.kind !== 'ok') throw new Error('expected ok');
    const rows = legacyRowsToDivisions(page.rows, 20);
    expect(rows.every((r) => r.stateCode === 20)).toBe(true);
    expect(find(rows, 'COMBINED', '10')!.inflationPct.toString()).toBe('2.34');
    // Combined Housing is null for Maharashtra → Fuel & Light alone.
    expect(find(rows, 'COMBINED', '04')!.inflationPct.toString()).toBe('2.69');
  });

  it('is empty / fatal for the same shapes as the new series', () => {
    expect(parseCpi2012Page(JSON.stringify({ data: [], msg: 'No Data Found', statusCode: true })).kind).toBe('empty');
    expect(parseCpi2012Page(JSON.stringify({ success: false, message: 'Limit cannot be greater than 200' })).kind).toBe('fatal');
  });
});
