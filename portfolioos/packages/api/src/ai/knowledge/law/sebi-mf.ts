/**
 * Mutual fund rules investors meet: the SEBI (Mutual Funds) Regulations 2026
 * (in force 1 April 2026, amended to 7 July 2026) and the Master Circular for
 * Mutual Funds of 20 March 2026, in our own words.
 */
import type { KnowledgeEntry } from '../library.js';

const regs = (ref: string): KnowledgeEntry['source'] => ({
  kind: 'LAW',
  instrument: 'SEBI (Mutual Funds) Regulations 2026',
  ref,
  date: '2026-04-01',
});
const mc = (ref: string): KnowledgeEntry['source'] => ({
  kind: 'LAW',
  instrument: 'SEBI Master Circular for Mutual Funds',
  ref,
  date: '2026-03-20',
});

export const SEBI_MF: KnowledgeEntry[] = [
  {
    id: 'sebi-mf-expense-ratio',
    title: 'Mutual fund expense limits under the 2026 regulations',
    principle:
      'From 1 April 2026 a scheme’s running costs are capped as a "base expense ratio" — fees, commissions, registrar, custody, audit — which no longer includes GST or exchange and regulatory transaction costs (Reg. 66–67, SEBI (Mutual Funds) Regulations 2026). For open-ended actively managed schemes the cap falls with size: equity schemes 2.10% on the first 500 crore, 1.90% on the next 250, 1.60% on the next 1,250, 1.50% on the next 3,000, 1.40% on the next 5,000, then 0.05% less for each further 5,000 crore up to 50,000 crore, and 0.95% beyond; other schemes 1.85% falling to 0.70%. Index funds and ETFs 0.90%; fund-of-funds 0.90% to 2.10% including the underlying funds. Brokerage may be charged on top only up to 0.06% of trade value (0.02% for derivatives). The total expense ratio is base plus brokerage, transaction costs and taxes; nothing else may be charged except exit load.',
    inPractice:
      'Compare funds on the published total expense ratio of the direct plan; the gap between direct and regular plans is the distribution commission inside the base ratio.',
    source: regs('Reg. 66, 67'),
    asOf: '2026-07',
    topics: ['mutual-funds', 'costs', 'regulation'],
    keywords: ['expense ratio', 'TER limit', 'total expense ratio', 'base expense ratio', 'mutual fund charges', 'maximum TER', 'index fund expense ratio', 'mutual fund regulations 2026'],
  },
  {
    id: 'sebi-mf-exit-load',
    title: 'Exit loads are capped at 3%',
    principle:
      'An open-ended scheme may charge an exit load of at most 3% of NAV when units are redeemed (Reg. 44(4), SEBI (Mutual Funds) Regulations 2026), and every rupee of exit load goes back into the scheme rather than to the fund house. There is no entry load. Within that cap each scheme sets its own load and holding period in its offer document; changes apply only to units bought after the change.',
    inPractice:
      'Check the load schedule before switching or redeeming early; a 1% load on a fund held a few months can wipe out a small gain.',
    source: regs('Reg. 44'),
    asOf: '2026-07',
    topics: ['mutual-funds', 'costs'],
    keywords: ['exit load', 'maximum exit load', 'exit load 3%', 'redemption charge', 'entry load', 'early redemption penalty'],
  },
  {
    id: 'sebi-mf-categories',
    title: 'Mutual fund categories and the 2026 rationalisation',
    principle:
      'Each fund house may run only one scheme per category (index funds and ETFs on different indices, fund-of-funds and sectoral or thematic funds excepted), and the scheme’s name must be its category, without words that stress returns (Master Circular para 3.7–3.8, revised 26 February 2026). Equity categories include multi cap (at least 25% each in large, mid and small caps), large cap (80% large), large & mid cap (35% each), mid cap and small cap (65%), flexi cap (65% equity, any size), dividend yield, value, contra, focused (up to 30 stocks), sectoral, thematic and ELSS (80%). Since 2026 a fund house may offer both a value and a contra fund if their portfolios overlap no more than 50%, and sectoral or thematic funds may overlap no more than 50% with its other equity schemes (except large cap), checked quarterly; existing funds have three years to comply or be merged.',
    inPractice:
      'Owning several funds from one house in "different" categories may still mean the same stocks; the overlap rules reduce this for value/contra and thematic funds. Equity funds may now hold their residual portion in gold, silver or InvITs.',
    source: mc('paras 3.7–3.8'),
    asOf: '2026-03',
    topics: ['mutual-funds', 'equity', 'regulation'],
    keywords: ['mutual fund categories', 'scheme categorisation', 'flexi cap', 'multi cap', 'value and contra fund', 'portfolio overlap', 'thematic fund overlap', 'large cap definition', 'SEBI categorisation 2026'],
  },
  {
    id: 'sebi-mf-life-cycle',
    title: 'Life cycle funds: a target-date category',
    principle:
      'A life cycle fund is an open-ended scheme with a stated maturity year in its name (for example Life Cycle Fund 2045) that moves along a pre-set glide path across equity, debt, InvITs, exchange-traded commodity derivatives and gold or silver ETFs, typically cutting risk as the date nears (Master Circular para 3.8.4, Annexure 1B). To discourage early exits it charges an exit load of 3% within the first year, 2% within two years and 1% within three. It is benchmarked like a multi-asset allocation fund.',
    inPractice:
      'Useful for a single dated goal such as retirement or a child’s education when the client will not rebalance on their own; match the target year to the goal and check the glide path.',
    source: mc('para 3.8.4, Annexure 1B'),
    asOf: '2026-03',
    topics: ['mutual-funds', 'goals', 'asset-allocation'],
    keywords: ['life cycle fund', 'target date fund', 'glide path fund', 'retirement fund 2045', 'goal based mutual fund'],
  },
  {
    id: 'sebi-mf-sif',
    title: 'Specialized Investment Funds (SIF)',
    principle:
      'A Specialized Investment Fund is a mutual-fund-house product for larger investors, sitting between mutual funds and PMS (Master Circular chapter 21). It runs strategies a normal fund cannot — equity, debt or hybrid long-short, ex-top-100 and sector-rotation strategies, and multi-asset allocators — with unhedged short positions through derivatives of up to 25% of assets, and some strategies redeem only weekly or at set intervals. An investor must put in at least 10 lakh across a fund house’s SIF strategies, tracked by PAN; accredited investors are exempt from the minimum.',
    inPractice:
      'Suitable only for clients with large portfolios who understand shorting and reduced liquidity; check redemption frequency and the strategy’s risk band before recommending.',
    source: mc('chapter 21'),
    asOf: '2026-03',
    topics: ['mutual-funds', 'products', 'pms-aif'],
    keywords: ['specialized investment fund', 'SIF', 'SIF minimum 10 lakh', 'long short fund', 'new asset class mutual fund', 'SIF strategies'],
  },
  {
    id: 'sebi-mf-nav-redemption',
    title: 'Which NAV you get, and when redemption money arrives',
    principle:
      'For purchases, the NAV applied is that of the day the money reaches the scheme’s bank account, if it arrives by 3 p.m. (by 1.30 p.m. for liquid and overnight funds, which get the previous day’s NAV) (Master Circular para 9). For redemptions, requests by 3 p.m. on a business day get that day’s NAV, including for liquid and overnight funds; requests after 3 p.m. get the next business day’s NAV (overnight-fund online redemptions count as on time until 7 p.m.). Apart from liquid and overnight purchases, only forward NAVs are used. Redemption money must reach the investor within three working days (longer for schemes investing mainly abroad), or the fund house pays 15% a year interest for the delay.',
    inPractice:
      'A SIP or lump sum paid late in the day can get the next day’s NAV; for urgent cash, liquid and overnight funds pay out fastest.',
    source: mc('paras 9, 15.3'),
    asOf: '2026-03',
    topics: ['mutual-funds', 'operations'],
    keywords: ['NAV cut off time', 'applicable NAV', '3 pm cut off', 'redemption time', 'redemption proceeds 3 working days', 'liquid fund cut off', 'when will I get my redemption money'],
  },
];
