/**
 * Non-residents under the Income-tax Act 2025 as amended by the Finance Act
 * 2026, in our own words. Residence tests: see ita25-basics.ts.
 */
import type { KnowledgeEntry } from '../library.js';

const law = (ref: string): KnowledgeEntry['source'] => ({
  kind: 'LAW',
  instrument: 'Income-tax Act 2025',
  ref,
  date: '2026-04-01',
});

export const ITA25_NRI: KnowledgeEntry[] = [
  {
    id: 'ita25-nri',
    title: 'How non-residents are taxed in India',
    principle:
      'A non-resident is taxed only on income received in India or arising here: Indian salary, rent, interest, dividends and capital gains on Indian assets. Capital gains rates are the same as for residents (20% short-term and 12.5% long-term above 1.25 lakh on listed equity; 12.5% long-term on other assets), but three resident-only reliefs do not apply: using the unused basic exemption against special-rate gains, the rebate that makes income up to 12 lakh tax-free, and the option of 20% with indexation on land or buildings bought before 23 July 2024. Dividends are taxed at 20%. Buyers and payers deduct TDS on sale proceeds, interest and dividends at higher rates than for residents, which the NRI can claim back through a return. Where a tax treaty gives a lower rate, it applies on furnishing a tax residency certificate (s.159, formerly s.90).',
    inPractice:
      'An NRI with only small Indian income often has too much TDS deducted; filing a return is how to recover it. NRE deposit interest is exempt; NRO interest is taxable.',
    source: law('s.5, s.9, s.156, s.159, ss.196-198, s.207'),
    asOf: '2026-04',
    topics: ['tax'],
    keywords: ['NRI tax', 'NRI capital gains tax', 'non resident tax India', 'NRI TDS refund', 'DTAA', 'tax residency certificate', 'NRO interest tax', 'NRI dividend tax'],
  },
  {
    id: 'ita25-nri-special',
    title: 'The optional regime for NRIs investing foreign exchange',
    principle:
      'A non-resident Indian (a citizen or person of Indian origin) who bought specified Indian assets — shares of Indian companies, debentures, deposits and government securities — with convertible foreign exchange may choose a special regime (formerly ss.115C–115I): investment income from them is taxed at 20% and long-term gains at 12.5%, with no deductions (s.214). Long-term gains on such assets are exempt if the net sale proceeds are reinvested within six months in another specified asset — in full, or in proportion to the part reinvested — and become taxable if that asset is sold within three years (s.215). If this is the only income and TDS was deducted, no return is needed; after becoming resident, the person may elect to keep the regime for investment income from foreign-exchange assets other than shares (s.217), and can opt out of it for any year.',
    inPractice:
      'Rarely better than normal rules now that 12.5% applies to most long-term gains anyway; the return-filing relief is its main use.',
    source: law('ss.212-218'),
    asOf: '2026-04',
    topics: ['tax'],
    keywords: ['NRI special regime', 'foreign exchange asset', 'Chapter XII-A', 'NRI investment income 20%', 'NRI specified asset', '115E'],
  },
];
