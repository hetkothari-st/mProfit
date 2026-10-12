import { load } from 'cheerio';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  cellRate, datesIn, findMclr, latestDate, loadPage, minMax, normPct, pageTables, percentRange, percents, tenorOf,
  type PageTable,
} from '../../src/services/loanRates/sources/parseUtil.js';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/loanRates/${name}`, import.meta.url), 'utf8');

describe('numbers', () => {
  it('normalises to at least two decimals without losing a third', () => {
    expect([normPct('8'), normPct('7.9'), normPct('8.125')]).toEqual(['8.00', '7.90', '8.125']);
  });
  it('finds every percent figure', () => {
    expect(percents('7.25%* p.a. onwards, 6.90 % and 2.50% p.a.')).toEqual(['7.25', '6.90', '2.50']);
  });
  it.each([
    [' 8% to 13.45%', '8.00', '13.45'],
    ['For Salaried individuals | 7.70% - 12.00% | -', '7.70', '12.00'],
    ['8.75% \u2013 9.65%', '8.75', '9.65'],
    ['7.40 % to 10.25 %', '7.40', '10.25'],
    ['Between 9.99% and 16.50% per annum', '9.99', '16.50'],
  ])('reads the range in %j', (text, min, max) => {
    expect(percentRange(text)).toEqual({ min, max });
  });
  it('a single figure is not a range', () => expect(percentRange('Repo Rate 5.25%')).toBeNull());
  it('min and max of decimal strings', () => {
    expect(minMax(['8.75', '10.05', '8.85'])).toEqual({ min: '8.75', max: '10.05' });
    expect(minMax([])).toBeNull();
  });
  it('plain rate cells', () => {
    expect(['8.70', '8.45%', '8.00 %', 'n/a', '7.85*'].map(cellRate)).toEqual(['8.70', '8.45', '8.00', null, null]);
  });
});

describe('dates', () => {
  it('reads every form the lender pages use, day first', () => {
    expect(
      datesIn(
        'With Effect From 15th Sept 2026; 18th September 2026; September 22, 2026; Effective Date: October 07, 2026; ' +
          '01.10.2026 01-10-2026 01/07/2026 31.02.2026 w.e.f 12.10.2026',
      ),
    ).toEqual(['2026-09-15', '2026-09-18', '2026-09-22', '2026-10-07', '2026-10-01', '2026-10-01', '2026-07-01', '2026-10-12']);
  });
  it('latest date wins; none is null', () => {
    expect(latestDate('w.e.f 15.06.2025 then w.e.f. 01.04.2026 and 15.12.2025')).toBe('2026-04-01');
    expect(latestDate('no dates')).toBeNull();
  });
});

describe('MCLR tables', () => {
  it('maps tenor labels', () => {
    expect(
      ['Over night', 'Overnight MCLR', 'One Month', '1 Month MCLR', 'Three Months', '3 Months MCLR', 'Six Month', '6 Month', 'One Year', '1 Year MCLR', 'Two Years', 'MCLR TENOR'].map(tenorOf),
    ).toEqual(['ON', 'ON', '1M', '1M', '3M', '3M', '6M', '6M', '1Y', '1Y', null, null]);
  });

  it('skips a deposit table with the same tenor rows and takes the MCLR one', () => {
    const tables: PageTable[] = [
      { before: 'Diplomat/Embassy Deposits Rates', rows: [['Period', 'Rate'], ['1 month', '0.50%'], ['3 months', '2.00%'], ['6 months', '2.50%'], ['1 year', '3.35%']] },
      { before: 'Effective Date: October 07, 2026', rows: [['Tenure', 'MCLR'], ['Overnight', '7.80%'], ['1 Month', '7.75%'], ['3 Month', '7.95%'], ['6 Month', '8.15%'], ['1 Year', '8.30%']] },
    ];
    expect(findMclr(tables)?.rows.map((r) => r.ratePct)).toEqual(['7.80', '7.75', '7.95', '8.15', '8.30']);
  });

  it('dates MCLR from the header row, then the heading, over a later date elsewhere', () => {
    const body = [['Overnight', '7.80%'], ['1 Month', '7.75%'], ['3 Month', '7.95%'], ['6 Month', '8.15%'], ['1 Year', '8.30%']];
    const header: PageTable = {
      before: 'Rates valid till 31.12.2026. MCLR w.e.f. 01.09.2026',
      rows: [['Tenor', 'Existing w.e.f. 01.08.2026', 'Revised w.e.f. 01.10.2026'], ...body, ['Note: reviewed on 15.11.2026', '']],
    };
    expect(findMclr([header])?.effectiveDate).toBe('2026-10-01');
    const heading: PageTable = {
      before: 'Deposits revised 20.11.2026. MCLR effective from 21.09.2026',
      rows: [['Tenor', 'MCLR'], ...body, ['Base rate w.e.f. 01.12.2026', '']],
    };
    expect(findMclr([heading])?.effectiveDate).toBe('2026-09-21');
    const bodyOnly: PageTable = { before: 'MCLR', rows: [['Tenor', 'MCLR'], ...body, ['w.e.f. 05.10.2026', '']] };
    expect(findMclr([bodyOnly])?.effectiveDate).toBe('2026-10-05');
  });

  it('on the real HDFC rates page, ignores the FD tables and dates the MCLR from its own heading', () => {
    expect(findMclr(pageTables(loadPage(fixture('hdfc-rates.html'))))).toEqual({
      rows: [
        { tenor: 'ON', ratePct: '7.80' },
        { tenor: '1M', ratePct: '7.75' },
        { tenor: '3M', ratePct: '7.95' },
        { tenor: '6M', ratePct: '8.15' },
        { tenor: '1Y', ratePct: '8.30' },
      ],
      effectiveDate: '2026-10-07',
    });
  });
});

describe('digit boundaries', () => {
  it('never reads the tail of a longer number', () => {
    expect(percents('LTV up to 100% at 8.50%')).toEqual(['8.50']);
    expect(percents('fee 1250.5% x')).toEqual([]);
    expect(percentRange('LTV 100% to 8.50%')).toBeNull();
  });
});

describe('sanitizePage', () => {
  it('drops scripts and comments, keeps Next.js flight data, blanks ASP.NET state', async () => {
    // @ts-expect-error plain .mjs script, no type declarations
    const { sanitizePage } = (await import('../../scripts/sanitize-loan-rate-fixtures.mjs')) as { sanitizePage: (s: string) => string };
    const out = sanitizePage(
      '<p>a</p><script>var k="secret";</script><!-- note --><script>self.__next_f.push([1,"x"])</script>' +
        '<input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="AbC+/123" />',
    );
    expect(out).not.toContain('var k');
    expect(out).not.toContain('note');
    expect(out).toContain('self.__next_f.push([1,"x"])');
    expect(out).toContain('name="__VIEWSTATE" id="__VIEWSTATE" value=""');
    expect(out).not.toContain('AbC');
  });

  it('survives malformed closers, nested tag fragments and blanks authId params', async () => {
    // @ts-expect-error plain .mjs script, no type declarations
    const { sanitizePage } = (await import('../../scripts/sanitize-loan-rate-fixtures.mjs')) as { sanitizePage: (s: string) => string };
    const out = sanitizePage(
      '<p>keep</p><script>var a="s1";</script ><scr<script>ipt>var b="s2";</scr</script>ipt><!-- c1 --><!-- <!-- c2 -->' +
        '<a href="https://x.example/p?AuthID=ABC123&amp;z=1">l</a><a href="https://y.example/?appType=main&authId=XYZ">m</a>',
    );
    expect(out).toContain('keep');
    // The parser reads `<scr<script>ipt>` as one inert, oddly-named element, never a script; re-parsing the
    // output must still find no script element, and the real script body and the comments must be gone.
    expect(load(out)('script').length).toBe(0);
    expect(out).not.toMatch(/s1|c1|c2/);
    expect(out).not.toMatch(/ABC123|XYZ/);
    expect(out).toContain('z=1');
  });
});
