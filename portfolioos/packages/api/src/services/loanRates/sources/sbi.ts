import type { RateLoanType, PageReader, RateBasis, RateReading } from '../types.js';
import { clean, latestDate, loadPage, mclrReadings, pageTables, percents } from './parseUtil.js';

/** The "Interest Rates" widget on every sbi.bank.in page: a <select id="rate-picker"> whose option N shows div#menu-N. */
const WIDGET: Record<string, { loanType: RateLoanType; basis: RateBasis }> = {
  'home loan': { loanType: 'HOME', basis: 'REPO_LINKED' },
  'personal loan': { loanType: 'PERSONAL', basis: 'OTHER' },
  'gold loan': { loanType: 'GOLD', basis: 'OTHER' },
  'education loan': { loanType: 'EDUCATION', basis: 'OTHER' },
  'auto loan': { loanType: 'CAR', basis: 'OTHER' },
  'loan against mf': { loanType: 'LAS', basis: 'OTHER' },
};

/**
 * SBI MCLR page. One fetch gives two things: the MCLR table (with its "With Effect From" date) and the
 * site-wide headline widget ("7.25%* p.a. onwards w.e.f. 01.04.2026"). Headline figures are "starts from"
 * rates, so maxRatePct is null.
 */
export const sbiRatesReader: PageReader = {
  id: 'sbi.rates',
  version: '1',
  url: 'https://sbi.bank.in/web/interest-rates/interest-rates/mclr',
  read(html: string): RateReading[] {
    const $ = loadPage(html);
    const out: RateReading[] = mclrReadings('sbi.mclr', pageTables($));
    const seen = new Set<string>();
    for (const option of $('#rate-picker option').toArray()) {
      const map = WIDGET[clean($(option).text()).toLowerCase()];
      const value = $(option).attr('value');
      // Some pages render the widget twice (desktop + mobile); the first copy wins.
      if (!map || value === undefined || seen.has(map.loanType)) continue;
      const text = clean($(`#menu-${value}`).first().text());
      const rate = percents(text)[0];
      if (!rate) continue;
      seen.add(map.loanType);
      out.push({
        sourceId: `sbi.${map.loanType.toLowerCase()}`,
        basis: map.basis,
        tenor: null,
        minRatePct: rate,
        maxRatePct: null,
        effectiveDate: latestDate(text),
      });
    }
    return out;
  },
};
