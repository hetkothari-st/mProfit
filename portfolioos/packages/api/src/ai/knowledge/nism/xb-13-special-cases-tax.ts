import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-B',
  edition: '2025-12',
  chapter: 13,
  chapterTitle: 'Tax Provisions for Special Cases',
};

export const XB_13: readonly KnowledgeEntry[] = [
  {
    id: 'xb-13-bonus-shares',
    title: 'Tax on bonus shares',
    principle:
      'No tax arises when bonus shares are allotted. When sold, their holding period runs from the bonus allotment date and their cost is nil (for bonuses before April 2001, the April 2001 value may be used; for long-term sales under section 112A of bonuses held on 31 January 2018, the lower of that day’s value and the sale price). The original shares keep their own cost and date. Example: 10,000 shares bought at 105 in April 2020 plus 5,000 bonus shares allotted September 2023, all sold at 120 in August 2024: originals give a 1.5 lakh long-term gain (12.5% above 1.25 lakh); the bonus shares give a 6 lakh short-term gain at 20%, because they were held only 11 months. Held as stock-in-trade, bonus shares carry nil cost in business income.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'equity'],
    keywords: ['bonus shares tax', 'bonus shares cost nil', 'bonus holding period', 'sell bonus shares tax', 'bonus issue capital gains'],
  },
  {
    id: 'xb-13-split-consolidation-merger',
    title: 'Splits, consolidations, mergers and conversions',
    principle:
      'A stock split or consolidation is not a transfer; the original cost is spread across the new number of shares (1,000 shares bought at 150 split 2-for-1 become 2,000 at 75; 2,000 at 100 consolidated 2-into-1 become 1,000 at 200) and the holding period runs from the original purchase. In an amalgamation meeting the tax definition (75% of shareholders by value joining the new company), receiving new shares for old is not a transfer; cost and holding period carry over (10,000 shares bought at 58 swapped for 8,000 new shares sold at 100 after 17 months: 2.2 lakh long-term gain), and the purchase-STT condition for 112A is waived. Converting preference shares into equity of the same company is not a transfer either: equity inherits the preference cost and date (20,000 preference shares at 10 converted 2:1 and the equity sold at 35 years later: 1.5 lakh long-term gain).',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'equity'],
    keywords: ['stock split tax', 'share consolidation tax', 'merger shares tax', 'amalgamation tax', 'preference to equity conversion tax', 'cost after split'],
  },
  {
    id: 'xb-13-buyback-rights',
    title: 'Buybacks and rights issues',
    principle:
      'Buybacks from 1 October 2024: the whole amount received is a dividend taxed at slab rates with no deduction, and the cost of the shares bought back becomes a capital loss (short or long-term by holding period) to set off against gains. Example: 500 shares bought at 100 in 2019 and bought back at 125 in February 2025: 62,500 taxed as dividend and a 50,000 long-term capital loss. (Before October 2024 the company paid tax and shareholders were exempt.) Rights entitlements are capital assets with nil cost: renouncing them for money gives a short-term gain at slab rates (not 111A, as they are not shares). Rights shares subscribed cost their issue price (plus any price paid to a renouncer) and their holding period starts on allotment: 500 rights shares at 250 sold at 520 within two months give a 1.35 lakh short-term gain at 20%.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'equity'],
    keywords: ['buyback tax 2024', 'buyback dividend capital loss', 'rights issue tax', 'renounce rights tax', 'rights entitlement', 'rights shares cost'],
  },
  {
    id: 'xb-13-slb',
    title: 'Securities lending and borrowing',
    principle:
      'Under SEBI’s scheme, through NSE and BSE clearing corporations, holders lend F&O-eligible stocks and liquid index ETFs for a fee for 1 day to 12 months including rollovers; lenders post 25% margin unless they lend same-day, borrowers post 100% of value plus fees and margins, and if a borrower defaults the clearing corporation buys back shares from the collateral. Lending is not a transfer, so lenders owe no capital gains; the fee is business or other income less expenses (20 a share on 10,000 shares less 2,000 of charges: 1.98 lakh taxable). Borrowers use SLB to short, avoid settlement failure or run arbitrage, and are taxed on their trading gains with the fee deductible. It lets long-term holders earn extra on idle shares.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'equity', 'derivatives'],
    keywords: ['securities lending and borrowing', 'SLB', 'stock lending tax', 'lend shares earn fee', 'short selling borrow'],
  },
  {
    id: 'xb-13-mf-segregation-consolidation-windup',
    title: 'Segregated portfolios, scheme mergers and wind-ups',
    principle:
      'When a debt fund side-pockets a defaulted holding, investors get equal units in a segregated portfolio; holding period runs from the original purchase and cost is split by NAV: 1,000 units bought at 15 with total NAV 12 just before segregation and segregated NAV 2 gives the side pocket a cost of 2,500 (2.5 a unit) and the main units 12,500. Merging two equity schemes, or two non-equity schemes, or two plans of one scheme, is not a transfer; cost and holding period carry over. A scheme is wound up at the end of its term or when trustees decide, 75% of unitholders resolve, or SEBI directs: after notice it stops issuing and redeeming, sells assets, pays liabilities and distributes the rest pro rata; the payout is taxed like a normal redemption.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'mutual-funds'],
    keywords: ['segregated portfolio tax', 'side pocket', 'mutual fund merger tax', 'scheme consolidation not transfer', 'mutual fund wind up', 'scheme closure tax'],
  },
  {
    id: 'xb-13-tax-slabs',
    title: 'Income-tax slab rates and special rates',
    principle:
      'New regime (section 115BAC), FY 2025-26: nil to 4 lakh, 5% to 8 lakh, 10% to 12 lakh, 15% to 16 lakh, 20% to 20 lakh, 25% to 24 lakh, 30% above (with the 87A rebate, no tax up to 12 lakh). FY 2024-25: nil to 3 lakh, 5% to 7 lakh, 10% to 10 lakh, 15% to 12 lakh, 20% to 15 lakh, 30% above. Old regime: nil to 2.5 lakh (3 lakh for seniors 60+, 5 lakh for 80+), 5% to 5 lakh, 20% to 10 lakh, 30% above. Surcharge: 10% above 50 lakh, 15% above 1 crore, 25% above 2 crore, 37% above 5 crore (old regime only; new regime capped at 25%; capital gains under 111A, 112, 112A and dividends capped at 15%), plus 4% cess. Special rates: virtual digital assets (crypto) and online-game winnings 30%; unexplained income 60% (with a 25% surcharge); non-residents’ dividends 20%.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax'],
    keywords: ['tax slabs', 'new regime slabs 2025-26', 'old regime slabs', 'senior citizen exemption', 'surcharge rates', 'crypto tax 30%', 'VDA tax', 'online gaming tax'],
  },
  {
    id: 'xb-13-cii-table',
    title: 'Cost inflation index values',
    principle:
      'Base year 2001-02 = 100. Then 2002-03 105, 2003-04 109, 2004-05 113, 2005-06 117, 2006-07 122, 2007-08 129, 2008-09 137, 2009-10 148, 2010-11 167, 2011-12 184, 2012-13 200, 2013-14 220, 2014-15 240, 2015-16 254, 2016-17 264, 2017-18 272, 2018-19 280, 2019-20 289, 2020-21 301, 2021-22 317, 2022-23 331, 2023-24 348, 2024-25 363. Indexation now matters mainly for resident individuals and HUFs selling land or buildings acquired before 23 July 2024.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'real-estate'],
    keywords: ['cost inflation index', 'CII table', 'CII 2024-25 363', 'CII values', 'indexation index'],
  },
  {
    id: 'xb-13-caselets',
    title: 'Worked tax caselets: house choice, inherited bonus shares, rebate, gifts',
    principle:
      'Choosing self-occupied houses: compute each non-let house as if let out, then treat the two with the highest taxable value as self-occupied and the rest as deemed let out (in the new regime self-occupied interest is not deductible anyway). Inherited shares carry the original owner’s grandfathered cost: an inherited lot valued 750 on 31 January 2018 sold at 600 gives no gain or loss, at 750 none; bonus shares on it cost nil, so 2,000 sold at 700 give 14 lakh long-term gain, taxable above 1.25 lakh. Marginal relief: new-regime income of 12.2 lakh in FY 2025-26 owes only 20,000 (the excess over 12 lakh) instead of the 63,000 slab tax. Gifts: listed shares worth 25,000 from a nephew are untaxed only because the year’s total is under 50,000 (a nephew is not a relative); cash gifts of 3 lakh on one’s marriage are fully exempt.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax'],
    keywords: ['which house self occupied', 'inherited shares tax', 'marginal relief example', 'gift from nephew', 'marriage gift exempt', 'tax caselet'],
  },
];
