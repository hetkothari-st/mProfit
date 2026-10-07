/**
 * Registry behaviour and coverage.
 *
 * Two jobs:
 *  1. Pin the `AMC_NOT_SUPPORTED` contract — an unregistered AMC must produce a
 *     documented VALUE, never an exception. `01 §4` treats it as a normal
 *     outcome, and the UI has to be able to say "holdings not available for
 *     this AMC" rather than showing a page that merely looks complete.
 *  2. Enforce the repo's "≥5 fixtures per parser" rule (`CONTEXT.md §12`) at
 *     the registry level, so registering an AMC without fixtures fails the
 *     suite instead of shipping an untested parser.
 */

import { describe, it, expect } from 'vitest';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AMC_CODES,
  REGISTERED_ADAPTERS,
  REGISTERED_AMC_CODES,
  amcNotSupported,
  isAmcSupported,
  normaliseAmcCode,
  normaliseAmcName,
  resolveFactsheetAdapter,
} from '../../../src/adapters/mfFactsheet/registry.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const FIXTURE_ROOT = resolve(here, '../../fixtures/mf/factsheet');

/** Registry key → fixture folder. Kept explicit so a rename cannot pass silently. */
const FIXTURE_FOLDER: Readonly<Record<string, string>> = {
  [AMC_CODES.SBI]: 'sbi',
  [AMC_CODES.ICICI_PRU]: 'icici',
  [AMC_CODES.HDFC]: 'hdfc',
  [AMC_CODES.NIPPON]: 'nippon',
  [AMC_CODES.KOTAK]: 'kotak',
  [AMC_CODES.AXIS]: 'axis',
  [AMC_CODES.UTI]: 'uti',
  [AMC_CODES.ABSL]: 'absl',
  [AMC_CODES.MIRAE]: 'mirae',
  [AMC_CODES.DSP]: 'dsp',
};

describe('registry resolution', () => {
  it('resolves every registered AMC to its adapter', () => {
    for (const code of REGISTERED_AMC_CODES) {
      const r = resolveFactsheetAdapter(code);
      expect(r.supported, code).toBe(true);
      if (!r.supported) continue;
      expect(r.adapter.amcCode).toBe(code);
      expect(r.adapter.id).toMatch(/^mf\.factsheet\./);
      expect(r.adapter.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('ships all ten AMCs from 01 §4', () => {
    // The list is asserted EXACTLY, not by length or by `toContain`. `01 §4`
    // names these ten as the ~85%-of-retail-holdings set, and everything
    // outside it is contractually `AMC_NOT_SUPPORTED` — a partial fund page
    // that SAYS it is partial. A loose assertion here would let an AMC fall out
    // of the registry (a bad merge on the import list, say) and silently
    // downgrade every one of its funds to INSUFFICIENT_DATA.
    expect(REGISTERED_AMC_CODES).toEqual([
      'ABSL',
      'AXIS',
      'DSP',
      'HDFC',
      'ICICI_PRU',
      'KOTAK',
      'MIRAE',
      'NIPPON',
      'SBI',
      'UTI',
    ]);
  });

  it('gives every registered adapter a distinct id and amcCode', () => {
    // Two adapters sharing an `amcCode` means the registry Map silently keeps
    // only the last one, and one AMC's schemes get parsed with another AMC's
    // patterns — usually `MALFORMED_INPUT`, but on a similar layout a
    // plausible, wrong snapshot.
    const codes = REGISTERED_ADAPTERS.map((a) => a.amcCode);
    const ids = REGISTERED_ADAPTERS.map((a) => a.id);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('tolerates case and separator drift in a stored code', () => {
    expect(normaliseAmcCode(' icici-pru ')).toBe('ICICI_PRU');
    expect(isAmcSupported('sbi')).toBe(true);
    expect(resolveFactsheetAdapter('hdfc').supported).toBe(true);
  });

  it('returns the documented AMC_NOT_SUPPORTED result — it does NOT throw', () => {
    let threw = false;
    let resolution: ReturnType<typeof resolveFactsheetAdapter> | null = null;
    try {
      resolution = resolveFactsheetAdapter('QUANT');
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(resolution?.supported).toBe(false);
    if (resolution === null || resolution.supported) return;

    const f = resolution.failure;
    expect(f.ok).toBe(false);
    expect(f.reason).toBe('AMC_NOT_SUPPORTED');
    // The message has to say what the downstream consequence is, because the
    // consequence is the contract: metadata from AMFI, holdings absent, every
    // holdings-derived metric INSUFFICIENT_DATA.
    expect(f.detail).toContain('QUANT');
    expect(f.detail).toContain('AMFI');
    expect(f.detail).toContain('INSUFFICIENT_DATA');
    expect(f.detail).toContain('expected outcome');
    expect(f.rawPayload).toMatchObject({ amcCode: 'QUANT' });
  });

  it('amcNotSupported names the AMC that was asked for', () => {
    expect(amcNotSupported('MOTILAL_OSWAL').detail).toContain('MOTILAL_OSWAL');
  });

  it('isAmcSupported is false for an unregistered AMC', () => {
    // Nippon was the example here in Task 1.5; it is registered now, so the
    // example moved to an AMC genuinely outside `01 §4`'s ten.
    expect(isAmcSupported('QUANT')).toBe(false);
    expect(isAmcSupported('NIPPON')).toBe(true);
  });
});

describe('AMC name → code', () => {
  it('maps AMFI free text onto canonical codes', () => {
    expect(normaliseAmcName('SBI Mutual Fund')).toBe('SBI');
    expect(normaliseAmcName('ICICI Prudential Mutual Fund')).toBe('ICICI_PRU');
    expect(normaliseAmcName('HDFC Mutual Fund')).toBe('HDFC');
    expect(normaliseAmcName('Nippon India Mutual Fund')).toBe('NIPPON');
    // AMFI still carries the pre-rename form in historical rows.
    expect(normaliseAmcName('Reliance Nippon Life Asset Management Limited')).toBe('NIPPON');
    expect(normaliseAmcName('Kotak Mahindra Mutual Fund')).toBe('KOTAK');
    expect(normaliseAmcName('Axis Mutual Fund')).toBe('AXIS');
    expect(normaliseAmcName('UTI Mutual Fund')).toBe('UTI');
    expect(normaliseAmcName('Aditya Birla Sun Life Mutual Fund')).toBe('ABSL');
    expect(normaliseAmcName('Mirae Asset Mutual Fund')).toBe('MIRAE');
    expect(normaliseAmcName('DSP Mutual Fund')).toBe('DSP');
  });

  it('every mapped name resolves to a REGISTERED adapter', () => {
    // A name that maps to a code the registry has never heard of is worse than
    // no mapping at all: `MfSchemeMeta.amcCode` gets written with that code and
    // the scheme falls through to AMC_NOT_SUPPORTED forever, with nothing to
    // show that a typo — rather than a deliberate scope decision — caused it.
    for (const name of [
      'SBI Mutual Fund',
      'ICICI Prudential Mutual Fund',
      'HDFC Mutual Fund',
      'Nippon India Mutual Fund',
      'Kotak Mahindra Mutual Fund',
      'Axis Mutual Fund',
      'UTI Mutual Fund',
      'Aditya Birla Sun Life Mutual Fund',
      'Mirae Asset Mutual Fund',
      'DSP Mutual Fund',
    ]) {
      const code = normaliseAmcName(name);
      expect(code, name).not.toBeNull();
      expect(isAmcSupported(code as string), name).toBe(true);
    }
  });

  it('does not let the UTI pattern fire on the word "Mutual"', () => {
    // A `/uti/` without word boundaries matches inside "Mutual", i.e. inside
    // virtually every AMC name AMFI publishes, and would route the entire
    // unmatched tail of the industry at the UTI adapter.
    expect(normaliseAmcName('Quant Mutual Fund')).toBeNull();
    expect(normaliseAmcName('WhiteOak Capital Mutual Fund')).toBeNull();
  });

  it('does not let a looser rule steal ICICI Prudential', () => {
    expect(normaliseAmcName('ICICI Prudential Asset Management Company Limited')).toBe('ICICI_PRU');
  });

  it('returns null rather than guessing', () => {
    // A wrong code silently routes one AMC's schemes at another AMC's adapter,
    // which then parses a page for the wrong fund — and succeeds.
    expect(normaliseAmcName('Quant Money Managers Limited')).toBeNull();
  });
});

describe('fixture coverage (CONTEXT.md §12 — ≥5 per parser)', () => {
  it('every registered adapter has a fixture folder with at least five fixtures', async () => {
    for (const adapter of REGISTERED_ADAPTERS) {
      const folder = FIXTURE_FOLDER[adapter.amcCode];
      expect(folder, `no fixture folder mapped for ${adapter.amcCode}`).toBeDefined();
      const files = await readdir(resolve(FIXTURE_ROOT, folder as string));
      const fixtures = files.filter((f) => f.endsWith('.csv') || f.endsWith('.txt'));
      expect(fixtures.length, `${adapter.amcCode} has only ${fixtures.length} fixtures`).
        toBeGreaterThanOrEqual(5);
    }
  });

  it('every adapter has all five required fixture scenarios', async () => {
    // Named rather than counted: five copies of the happy path would satisfy a
    // count and prove nothing about the failure paths, which are the ones that
    // silently corrupt data when they are wrong.
    const required = [
      'portfolio-equity-normal.csv',
      'portfolio-debt-normal.csv',
      'portfolio-hybrid-normal.csv',
      'portfolio-weights-sum-fail.csv',
      'portfolio-truncated-malformed.csv',
    ];
    for (const adapter of REGISTERED_ADAPTERS) {
      const files = await readdir(resolve(FIXTURE_ROOT, FIXTURE_FOLDER[adapter.amcCode] as string));
      for (const r of required) {
        expect(files, `${adapter.amcCode} is missing ${r}`).toContain(r);
      }
    }
  });

  it('the fixture folder records its provenance', async () => {
    const files = await readdir(FIXTURE_ROOT);
    expect(files).toContain('README.md');
  });
});
