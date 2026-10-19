import { describe, it, expect } from 'vitest';
import { AUTO_SOURCES, LOAN_RATE_SOURCES, REPO_SOURCE_ID } from '../../src/services/loans/loanRates/sourceList.js';
import { PAGE_READERS, readerById } from '../../src/services/loans/loanRates/sources/index.js';
import { READER_FIXTURES, fixture } from './readerFixtures.js';

describe('source list', () => {
  it('has 92 unique sources, 30 of them AUTO', () => {
    expect(LOAN_RATE_SOURCES).toHaveLength(92);
    expect(new Set(LOAN_RATE_SOURCES.map((s) => s.id)).size).toBe(92);
    expect(LOAN_RATE_SOURCES.filter((s) => s.mode === 'AUTO')).toHaveLength(30);
  });

  it('every AUTO source points at its reader page; every MANUAL source has an https page and no adapter', () => {
    for (const s of LOAN_RATE_SOURCES) {
      expect(new URL(s.url).protocol).toBe('https:');
      if (s.mode === 'AUTO') {
        const reader = readerById(AUTO_SOURCES[s.id]!)!;
        expect(s).toMatchObject({ url: reader.url, adapter: reader.id, adapterVer: reader.version });
      } else {
        expect(s).toMatchObject({ adapter: null, adapterVer: null });
      }
    }
  });

  it('each reader produces exactly the AUTO sources that name it, on its real captures', () => {
    for (const reader of PAGE_READERS) {
      const produced = new Set<string>();
      for (const name of READER_FIXTURES[reader.id]!) for (const r of reader.read(fixture(name))) produced.add(r.sourceId);
      const expected = LOAN_RATE_SOURCES.filter((s) => s.adapter === reader.id).map((s) => s.id).sort();
      expect([...produced].sort(), reader.id).toEqual(expected);
    }
  });

  it('records the discovery rulings', () => {
    const byId = new Map(LOAN_RATE_SOURCES.map((s) => [s.id, s]));
    expect(byId.get(REPO_SOURCE_ID)).toMatchObject({ lender: 'RBI', loanType: 'REPO', mode: 'AUTO' });
    expect(byId.get('icici.car')?.mode).toBe('MANUAL');
    expect(byId.get('sbi.lap')).toMatchObject({ mode: 'MANUAL', url: 'https://sbi.bank.in/web/interest-rates/interest-rates/loan-schemes-interest-rates/loans-against-property' });
    expect(byId.get('kotak.mclr')?.mode).toBe('MANUAL');
    expect(byId.get('canara.mclr')?.mode).toBe('MANUAL');
    expect(byId.get('bob.home')?.mode).toBe('MANUAL');
    expect(LOAN_RATE_SOURCES.filter((s) => s.lender === 'LIC Housing Finance').map((s) => s.id)).toEqual(['lic.home']);
  });
});
