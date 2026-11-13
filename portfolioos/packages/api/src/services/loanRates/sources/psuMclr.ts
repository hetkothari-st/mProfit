import type { PageReader, RateReading } from '../types.js';
import { loadPage, mclrReadings, pageTables } from './parseUtil.js';

/** PNB: "MCLR W.E.F. 01-10-2026 | MCLR TENOR | Existing w.e.f. 01.09.2026 | Revised w.e.f. 01.10.2026". The URL's "interst" typo is real. */
export const pnbMclrReader: PageReader = {
  id: 'pnb.mclr',
  version: '1',
  url: 'https://pnb.bank.in/interst-rate-on-advances-linked-to-mclr.html',
  read(html: string): RateReading[] {
    return mclrReadings('pnb.mclr', pageTables(loadPage(html)));
  },
};

/**
 * Bank of Baroda retail-loans page: table 0 is MCLR ("MCLR in (%) w.e.f 12.10.2026"). The product tables
 * on the same page show "0.00%" in their effective-rate column and two contradictory BRLLR figures, so
 * BoB loan types stay MANUAL.
 */
export const bobRetailReader: PageReader = {
  id: 'bob.retail',
  version: '1',
  url: 'https://bankofbaroda.bank.in/interest-rate-and-service-charges/retail-loans-interest-rates',
  read(html: string): RateReading[] {
    return mclrReadings('bob.mclr', pageTables(loadPage(html)));
  },
};

/** Union Bank: "MARGINAL COST OF FUNDS BASED LENDING RATE (MCLR) effective from 21.09.2026 | Tenor | MCLR". */
export const unionRatesReader: PageReader = {
  id: 'union.rates',
  version: '1',
  url: 'https://www.unionbankofindia.bank.in/en/common/interest-rates-loans-and-advances',
  read(html: string): RateReading[] {
    return mclrReadings('union.mclr', pageTables(loadPage(html)));
  },
};
