import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-B',
  edition: '2025-12',
  chapter: 11,
  chapterTitle: 'Taxation of Equity Products',
};

export const XB_11: readonly KnowledgeEntry[] = [
  {
    id: 'xb-11-trading-charges',
    title: 'Charges and taxes on share trades',
    principle:
      'Buying and selling listed shares costs: brokerage (varies by broker and order type); securities transaction tax (STT, on securities other than debt and debt funds, collected by exchanges, fund trustees or IPO bankers); stamp duty (a single national rate on listed securities since April 2020, including off-market transfers); exchange transaction charges (same for intraday and delivery); SEBI turnover fee (10 per crore, both sides); depository charges per debit from demat; and 18% GST on brokerage and exchange and clearing charges. STT is never deductible in computing capital gains.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'costs', 'equity'],
    keywords: ['STT', 'securities transaction tax', 'brokerage', 'stamp duty shares', 'DP charges', 'GST on brokerage', 'trading charges'],
  },
  {
    id: 'xb-11-listed-equity-tax',
    title: 'Tax on listed shares and equity funds',
    principle:
      'Dividends: taxed at slab rates for residents (final dividends in the year declared, interim when made available), with no deduction from April 2026 (Finance Act 2026; earlier interest up to 20%); non-residents 20% or the DTAA rate (usually 5 to 15%). Gains: listed shares and equity-oriented fund units are long-term after 12 months. With STT paid (or on an IFSC exchange in foreign currency), short-term gains are taxed at 20% (section 111A) and long-term gains at 12.5% above 1.25 lakh a year (section 112A); without STT, 12.5% long-term without the exemption and slab rates short-term. No 80C to 80U deductions against these gains and no 87A rebate against 112A tax. Example: 1,000 shares bought at 105 and sold at 107 after 13 months give a 2,000 long-term gain, tax-free within the 1.25 lakh; 1,000 bought at 120 and sold at 135 after 10 months give a 15,000 short-term gain at 20%.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'equity', 'mutual-funds'],
    keywords: ['equity tax', 'share sale tax', 'STCG 20% equity', 'LTCG 12.5% equity', '1.25 lakh exemption', 'section 112A', 'section 111A', 'equity mutual fund tax', 'dividend 20% deduction limit'],
  },
  {
    id: 'xb-11-stt-conditions-surcharge',
    title: 'When the STT condition is relaxed, and surcharge on equity gains',
    principle:
      'Section 112A normally needs STT paid on both purchase and sale of shares, but purchase-side STT is not needed for shares bought before October 2004, through IPOs or other issues by the company, preferential allotments outside SEBI ICDR, ESOPs, court, NCLT, SEBI or RBI-approved acquisitions, FDI-route purchases by non-residents, takeover-code acquisitions, purchases from the government, and acquisitions by funds, QIBs, banks and similar institutions in normal business (and by inheritance or gift from such holders). Unlisted shares sold in an IPO’s offer for sale also get 112A treatment. Surcharge on capital gains under 111A, 112 and 112A is capped at 15% (nil up to 50 lakh income, 10% to 1 crore), while other income can attract up to 25% (new regime) or 37% (old).',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'equity'],
    keywords: ['STT condition 112A', 'IPO shares STT', 'ESOP 112A', 'surcharge capital gains 15%', 'surcharge on equity gains', 'offer for sale tax'],
  },
  {
    id: 'xb-11-grandfathering',
    title: 'Grandfathering for equity bought before 1 February 2018',
    principle:
      'Equity gains were tax-free before 2018, so shares and equity fund units bought by 31 January 2018 take as cost the higher of actual cost and the lower of the 31 January 2018 fair value and the sale price. Fair value is the highest quoted price that day (or the last traded day before); for units not listed then, the NAV on that date; for shares listed only later, cost indexed to 2017-18. Scenarios with cost 100 and 31 January 2018 value 200: sold at 250, gain 50; sold at 150, gain nil (grandfathering cannot create a loss); sold at 50, loss 50 from actual cost. With cost 100 and value 50, sold at 150, gain 50. Fund example: units bought at 200, valued 225 on that date, sold at 300: cost 225 per unit.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'equity', 'mutual-funds'],
    keywords: ['grandfathering', '31 January 2018', 'fair market value 2018', 'old shares tax', 'equity bought before 2018', 'cost of acquisition equity'],
  },
  {
    id: 'xb-11-fifo-demat',
    title: 'FIFO for demat holdings',
    principle:
      'Holding period and cost for demat securities follow first-in, first-out by date of credit to the demat account, applied separately for each demat account. Old physical certificates dematerialised later enter the queue on their demat-credit date, though their original purchase date and cost still apply. Example: credits of 2,000 (bought May 2020), then 5,000 from certificates bought in 2005, then others; selling 2,500 uses the 2,000 first, then 500 with the 2005 cost and date.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'equity', 'operations'],
    keywords: ['FIFO demat', 'first in first out shares', 'which shares sold first tax', 'multiple demat accounts FIFO', 'dematerialised physical shares cost'],
  },
  {
    id: 'xb-11-unlisted-preference-warrants',
    title: 'Unlisted shares, preference shares and warrants',
    principle:
      'Unlisted shares are long-term after 24 months (12.5%), otherwise slab rates. Preference shares follow the same rules as equity (12 months if listed, 24 if unlisted; 12.5% long-term, slab short-term): 1,000 listed preference shares bought at 105 and sold at 120 after six years give 15,000 of gain and 1,875 of tax. Share warrants give the right to subscribe at a strike price (at least 25% paid upfront, tenure up to 18 months). Converting a warrant into shares is a transfer: gain = fair value of the shares on allotment less the strike price (warrants for 2 crore converted into shares worth 2.5 crore after 15 months: 50 lakh long-term at 12.5%). Selling warrants: gain over the amount paid (75 lakh received for warrants that cost 50 lakh upfront within 12 months: 25 lakh short-term at slab). A forfeited warrant payment is simply ignored.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'equity'],
    keywords: ['unlisted shares tax', 'preference shares tax', 'share warrants tax', 'warrant conversion tax', 'startup shares sale tax', 'pre IPO shares tax'],
  },
  {
    id: 'xb-11-mf-definitions',
    title: 'What makes a fund "equity-oriented" for tax; ELSS, SIP, SWP, STP',
    principle:
      'An equity-oriented fund invests at least 65% in listed domestic equity (a fund of funds qualifies if at least 90% is in one listed ETF that itself holds 90% listed domestic equity), measured as the annual average of monthly opening and closing figures; equity ULIPs without the insurance exemption are treated the same. ELSS gives an 80C deduction up to 1.5 lakh in the old regime with a three-year lock-in, the shortest among tax-saving products. SIPs invest fixed sums regularly; each instalment has its own purchase date for holding period. SWPs redeem in instalments, each a taxable sale. STPs move money between schemes of the same fund house, each transfer a redemption.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'mutual-funds'],
    keywords: ['equity oriented fund definition', '65% equity', 'ELSS', 'ELSS lock in', 'SIP tax each instalment', 'STP tax', 'fund of funds equity'],
  },
  {
    id: 'xb-11-derivatives-tax',
    title: 'Tax on futures and options',
    principle:
      'Exchange-traded derivatives through SEBI-registered brokers, with time-stamped contract notes showing client ID and PAN, are not speculative even though settled without delivery; their profits and losses are normal business income at slab rates (unless the activity is not a business, when it is other income). Business losses offset other income except salary and carry forward 8 years against business income only if the return is filed on time. Turnover (for tax audit) follows the ICAI Guidance Note as revised in 2022: the total of favourable and unfavourable differences, taken without sign; option premium is no longer added on top. The workbook allows presumptive taxation under section 44AD (6% of turnover via banking channels, turnover up to 2 or 3 crore), freeing the trader from books and audit and allowing advance tax in one instalment by 15 March.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'derivatives'],
    keywords: ['F&O tax', 'futures and options tax', 'derivatives business income', 'F&O loss set off', 'F&O turnover calculation', 'tax audit F&O', 'non speculative business', 'option premium tax'],
  },
  {
    id: 'xb-11-options-examples',
    title: 'Worked examples: option trades as business income',
    principle:
      'One call lot of 1,000 at a premium of 35 with strike 450: exercised and the shares later sold at 550, income = 5,50,000 - (450 + 35) x 1,000 = 65,000; sold at 30, loss 5,000; sold at 37, gain 2,000; settled at expiry when worth 10, loss 25,000. Five lots bought at 22 (strike 200): two exercised and the shares sold at 250 (5,00,000) plus three lots sold at 27 (81,000), against costs of 4,00,000 for shares and 1,10,000 for premiums, gives 71,000 of business income.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'derivatives'],
    keywords: ['option exercise tax', 'call option tax example', 'option expiry loss', 'option premium cost'],
  },
  {
    id: 'xb-11-bonus-stripping-exemption-limit',
    title: 'Bonus stripping and using the basic exemption against gains',
    principle:
      'Bonus stripping: if securities or units are bought within three months before a bonus record date and sold within nine months after it, while still holding bonus units, the loss on the originals is ignored and added to the cost of the bonus units. Example: 1,000 shares at 106, 1:1 bonus, originals sold at 95 within nine months: the 11,000 loss is disallowed and becomes the bonus shares’ cost (11 each). Exemption limit: a resident individual or HUF whose other income is below the basic exemption can use the shortfall against gains taxed at special rates (sections 111A, 112, 112A); with other income of 1,85,000 and a 2,50,000 long-term gain, 65,000 of the gain is covered (old-regime 2.5 lakh limit).',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'equity', 'mutual-funds'],
    keywords: ['bonus stripping', 'section 94(8)', 'bonus units loss', 'basic exemption limit capital gains', 'low income capital gains tax'],
  },
];
