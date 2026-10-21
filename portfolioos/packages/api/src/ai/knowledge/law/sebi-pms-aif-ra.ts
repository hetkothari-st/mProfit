/**
 * Investor-facing rules for portfolio managers (Master Circular 16 July 2025),
 * alternative investment funds (Master Circular 3 June 2026) and research
 * analysts (Master Circular 6 February 2026), in our own words.
 */
import type { KnowledgeEntry } from '../library.js';

const mc = (instrument: string, ref: string, date: string): KnowledgeEntry['source'] => ({
  kind: 'LAW',
  instrument,
  ref,
  date,
});

export const SEBI_PMS_AIF_RA: KnowledgeEntry[] = [
  {
    id: 'sebi-pms-charges',
    title: 'What a portfolio manager may charge',
    principle:
      'A portfolio manager may not charge any upfront fee (Master Circular for Portfolio Managers para 6.1.3). Brokerage is charged at actual cost; other operating expenses on top of the management fee are capped at 0.50% a year of average daily assets; and services bought from the manager or its associates (broking, demat, custody) are limited to 20% of each service by value, at rates no higher than outsiders charge. Performance fees may be taken no more often than quarterly and only on gains above the portfolio’s previous peak (high-water mark), adjusted for additions and withdrawals. Exit loads are capped at 3% of the amount redeemed in the first year, 2% in the second, 1% in the third and nil after. Clients may join directly without a distributor, and must receive a fee calculator showing fees over several years. The minimum investment is 50 lakh.',
    inPractice:
      'Ask for the fee calculator output before signing; compare its multi-year cost with a mutual fund’s total expense ratio. New PMS Regulations 2026 take effect from 1 April 2027.',
    source: mc('SEBI Master Circular for Portfolio Managers', 'para 6.1.3–6.1.4', '2025-07-16'),
    asOf: '2025-07',
    topics: ['pms-aif', 'costs', 'regulation'],
    keywords: ['PMS fees', 'PMS exit load', 'PMS operating expenses 0.5%', 'PMS high water mark', 'PMS upfront fee', 'PMS direct onboarding', 'portfolio management charges'],
  },
  {
    id: 'sebi-aif-direct-plan',
    title: 'AIFs: direct plans, distribution fees and large-value funds',
    principle:
      'Every AIF scheme must offer a Direct Plan with no distribution or placement fee, and an investor who comes through an intermediary that charges them separately — such as a fee-only investment adviser or a portfolio manager — must be put into the Direct Plan (Master Circular for AIFs chapter 16). Distribution fees must be disclosed at onboarding. Category III AIFs may pay distributors only an even trail out of the management fee, never upfront; Category I and II AIFs may pay at most a third upfront and the rest as trail over the fund’s life. Funds open only to accredited investors get regulatory relaxations; a Large Value Fund is one where each accredited investor puts in at least 25 crore. The general AIF minimum investment remains 1 crore.',
    inPractice:
      'A client of a SEBI-registered adviser should never pay an AIF distribution fee; check the plan name on the drawdown notice.',
    source: mc('SEBI Master Circular for AIFs', 'chapter 16; chapter 2', '2026-06-03'),
    asOf: '2026-06',
    topics: ['pms-aif', 'costs', 'regulation'],
    keywords: ['AIF direct plan', 'AIF distribution fee', 'AIF trail commission', 'AIF placement fee', 'large value fund 25 crore', 'accredited investor AIF', 'category III AIF commission'],
  },
  {
    id: 'sebi-ra-fees',
    title: 'Research analysts: fee limits and client protections',
    principle:
      'A SEBI-registered research analyst — who publishes research or buy/sell recommendations, including model portfolios, rather than personal advice on a client’s whole finances — may charge individual and HUF clients at most 1,51,000 a year per family, excluding taxes, revised every three years by the supervisory body using the Cost Inflation Index (Master Circular for Research Analysts). Fees may be taken in advance for at most a year; on early termination the unexpired part is refunded in proportion, with no break fee. Non-individual clients, accredited investors and institutions negotiate freely. Model portfolios must follow SEBI’s separate guidelines.',
    inPractice:
      'A "stock tips" service charging a retail investor more than 1.51 lakh a year, or refusing a pro-rata refund, is outside the rules; check the SEBI registration number first.',
    source: mc('SEBI Master Circular for Research Analysts', 'fees; Annexure A', '2026-02-06'),
    asOf: '2026-02',
    topics: ['regulation', 'costs'],
    keywords: ['research analyst fees', 'stock tips subscription', 'SEBI RA fee limit', 'research analyst refund', 'model portfolio', 'RA vs IA', 'stock recommendation service'],
  },
];
