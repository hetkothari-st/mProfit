import { describe, expect, it } from 'vitest';
import { parseCorpActionsCsv } from '../../src/priceFeeds/corporateActions.service.js';

/**
 * Launch review B3: a stock that had a split and a bonus showed its pre-split
 * cost against a post-split price (-84% "loss"). The NSE purpose text for a
 * split reads "Face Value Split (Sub-Division) - From Rs 2/- Per Share To Re
 * 1/- Per Share"; the parser's "<n> to <n>" pattern never matched the "/- Per
 * Share" between the numbers, so the split was stored with no ratio and never
 * applied. A combined "Bonus ... And Face Value Split ..." purpose was stored
 * as the bonus alone.
 *
 * Provenance: the purpose wording follows NSE's published corporate-action
 * format. It could NOT be re-checked live on 2026-11-27 — the archive CSV
 * returns 404 and the JSON API refuses non-browser clients (403) — so these
 * strings are synthetic and this test proves the parser's reading of that
 * wording, not the live feed.
 */

const HEADER = 'SYMBOL,COMPANY,SERIES,PURPOSE,FACE VALUE,EX-DATE,RECORD DATE';
const csv = (...rows: string[]) => [HEADER, ...rows].join('\n');
const row = (symbol: string, purpose: string, exDate = '16-Jun-2025') =>
  `${symbol},Test Co Ltd,EQ,"${purpose}",1,${exDate},${exDate}`;

describe('NSE corporate action purposes', () => {
  it('reads a face-value split written with "/- Per Share" between the numbers', () => {
    const [r] = parseCorpActionsCsv(
      csv(row('TESTA', 'Face Value Split (Sub-Division) - From Rs 10/- Per Share To Rs 2/- Per Share')),
    );
    expect(r).toMatchObject({ type: 'SPLIT' });
    expect(r!.ratio?.toString()).toBe('5');
  });

  it('reads "Re 1" as one rupee', () => {
    const [r] = parseCorpActionsCsv(
      csv(row('TESTB', 'Face Value Split (Sub-Division) - From Rs 2/- Per Share To Re 1/- Per Share')),
    );
    expect(r!.type).toBe('SPLIT');
    expect(r!.ratio?.toString()).toBe('2');
  });

  it('keeps both halves of a combined bonus and split', () => {
    const rows = parseCorpActionsCsv(
      csv(row('TESTC', 'Bonus 4:1 And Face Value Split (Sub-Division) - From Rs 2/- Per Share To Re 1/- Per Share')),
    );
    const byType = Object.fromEntries(rows.map((r) => [r.type, r.ratio?.toString()]));
    expect(byType).toEqual({ BONUS: '4', SPLIT: '2' });
  });

  it('still reads the plain forms', () => {
    const rows = parseCorpActionsCsv(
      csv(
        row('TESTD', 'Bonus 1:1'),
        row('TESTE', 'Stock Split From Rs.10/- to Rs.5/-'),
        row('TESTF', 'Interim Dividend - Rs 6 Per Share'),
      ),
    );
    expect(rows.map((r) => [r.symbol, r.type, (r.ratio ?? r.amount)?.toString()])).toEqual([
      ['TESTD', 'BONUS', '1'],
      ['TESTE', 'SPLIT', '2'],
      ['TESTF', 'DIVIDEND', '6'],
    ]);
  });
});
