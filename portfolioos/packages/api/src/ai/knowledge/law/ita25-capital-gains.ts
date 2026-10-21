/**
 * Capital gains under the Income-tax Act 2025 as amended by the Finance Act
 * 2026, in our own words. Buyback and SGB changes live in fa2026-changes.ts.
 */
import type { KnowledgeEntry } from '../library.js';

const law = (ref: string): KnowledgeEntry['source'] => ({
  kind: 'LAW',
  instrument: 'Income-tax Act 2025',
  ref,
  date: '2026-04-01',
});

export const ITA25_CAPITAL_GAINS: KnowledgeEntry[] = [
  {
    id: 'ita25-cg-holding-periods',
    title: 'When a holding turns long-term',
    principle:
      'An asset is short-term if held 24 months or less before transfer, and long-term after that (s.2(101), formerly s.2(42A)). The period is 12 months for securities listed in India (shares, listed bonds, ETFs, REIT and InvIT units), UTI units, units of equity-oriented funds (listed or not) and zero-coupon bonds. Unlisted shares, unlisted bonds, property, gold, and non-equity fund units need more than 24 months. For an asset received by gift, will, inheritance or HUF partition, the previous owner’s holding period counts, and the previous owner’s cost becomes the new owner’s cost. Shares received in an amalgamation or demerger carry over the holding period of the original shares.',
    inPractice:
      'An inherited flat bought by a parent in 1998 is long-term the day it is inherited, with cost taken as the parent’s cost (or fair value on 1 April 2001, whichever is higher).',
    source: law('s.2(101), s.73'),
    asOf: '2026-04',
    topics: ['tax'],
    keywords: ['holding period', 'become long term', 'long term after how many months', 'listed share long term', 'long term capital asset', 'short term capital asset', '12 months', '24 months', 'inherited property cost', 'gifted shares holding period', 'when long term'],
  },
  {
    id: 'ita25-cg-equity',
    title: 'Tax on gains from listed shares and equity funds',
    principle:
      'For equity shares, equity-oriented fund units and business-trust (REIT, InvIT) units where STT applies, short-term gains are taxed at 20% (s.196, formerly s.111A) and long-term gains at 12.5% on the amount above 1.25 lakh a year (s.198, formerly s.112A). For shares, STT must have been paid on both purchase and sale (with notified exceptions such as IPO and bonus shares); for fund units, on sale. For holdings bought before 1 February 2018, cost is the higher of actual cost and the 31 January 2018 price (highest quoted price, or NAV for units), capped at the sale price. A resident whose other income is below the basic exemption limit can use the shortfall against these gains. No Chapter VIII deductions (the old 80C and the like) can be set against them.',
    inPractice:
      'Booking up to 1.25 lakh of long-term equity gains each year and reinvesting ("harvesting") resets cost tax-free; it does not trigger any minimum holding rule.',
    source: law('s.196, s.198, s.72'),
    asOf: '2026-04',
    topics: ['tax', 'equity', 'mutual-funds'],
    keywords: ['LTCG equity', 'STCG equity', '112A', '111A', 'equity mutual fund tax', '1.25 lakh exemption', 'grandfathering 31 January 2018', 'tax harvesting', 'share sale tax'],
  },
  {
    id: 'ita25-cg-other-assets',
    title: 'Long-term gains on property, gold, bonds and other assets',
    principle:
      'Long-term gains on any other asset — property, gold, unlisted shares, listed bonds, international and gold funds — are taxed at 12.5% without indexation (s.197, formerly s.112). One concession survives: a resident individual or HUF selling land or a building bought before 23 July 2024 pays the lower of 12.5% without indexation and 20% on the gain computed with indexed cost (using the Cost Inflation Index). For assets bought before 1 April 2001, cost can be taken as the fair market value on that date. Short-term gains on these assets are added to income and taxed at slab rates. A non-resident’s long-term gain on unlisted shares is computed without the foreign-exchange adjustment.',
    inPractice:
      'For a flat held since the early 2010s, compute both ways before advising; indexation usually wins for older purchases, flat 12.5% for property that rose fast.',
    source: law('s.197, s.72'),
    asOf: '2026-04',
    topics: ['tax', 'real-estate'],
    keywords: ['property capital gains', 'LTCG property', 'indexation', 'cost inflation index', '23 July 2024', '12.5% without indexation', '20% with indexation', 'gold capital gains', 'sell flat tax'],
  },
  {
    id: 'ita25-cg-specified-mf',
    title: 'Debt funds, market-linked debentures and unlisted bonds: always short-term',
    principle:
      'Gains are short-term, taxed at slab rates, whatever the holding period (s.76, formerly s.50AA) on: units of a "specified mutual fund" bought on or after 1 April 2023; market-linked debentures; and unlisted bonds or debentures transferred, redeemed or maturing on or after 23 July 2024. A specified mutual fund is one that invests more than 65% of its money in debt and money-market instruments, or 65% or more in units of such a fund, measured on the annual average of daily closing figures. The gain is simply sale value minus cost minus transfer expenses, with no indexation, and STT is not deductible.',
    inPractice:
      'Debt fund units bought before April 2023 still follow normal rules (long-term after 24 months, 12.5%); gold, international and fund-of-funds schemes that are not specified funds can still turn long-term.',
    source: law('s.76'),
    asOf: '2026-04',
    topics: ['tax', 'mutual-funds', 'bonds'],
    keywords: ['debt fund tax', 'specified mutual fund', '50AA', 'market linked debenture', 'unlisted bond tax', 'debt fund after April 2023', 'slab rate debt fund', '65% debt'],
  },
  {
    id: 'ita25-cg-house-to-house',
    title: 'Exemption for reinvesting a house sale in another house',
    principle:
      'An individual or HUF with a long-term gain from selling a residential house pays no tax on the part of the gain reinvested in one residential house in India, bought within one year before or two years after the sale, or built within three years (s.82, formerly s.54). Gains not reinvested before the return due date must be parked in the Capital Gains Account Scheme, or the exemption lapses; unused deposits are taxed when the period ends. Once in a lifetime, if the gain is 2 crore or less, it can be spread over two houses. Gains and new-house cost above 10 crore are ignored. Selling the new house within three years claws the exemption back.',
    inPractice:
      'Time the purchase and the deposit before the return due date; a buyer who plans to upgrade later should keep the three-year lock-in in mind.',
    source: law('s.82'),
    asOf: '2026-04',
    topics: ['tax', 'real-estate'],
    keywords: ['section 54', 'house to house exemption', 'reinvest in house', 'capital gains account scheme', 'two houses exemption', '10 crore cap', 'save tax on property sale'],
  },
  {
    id: 'ita25-cg-bonds',
    title: 'Exemption by investing gains in specified bonds',
    principle:
      'A long-term gain from land or a building is exempt to the extent invested within six months of the sale in "long-term specified assets": bonds redeemable after five years issued by NHAI, REC and other notified issuers (s.85, formerly s.54EC). The investment is capped at 50 lakh across the tax year of the sale and the next. If the bonds are sold, transferred or used as loan security within five years, the exempted gain becomes taxable in that year. Interest on the bonds is taxable.',
    inPractice:
      'Useful when the client does not want another property; compare the bond yield after tax with paying 12.5% and investing freely.',
    source: law('s.85'),
    asOf: '2026-04',
    topics: ['tax', 'bonds', 'real-estate'],
    keywords: ['54EC bonds', 'capital gain bonds', 'NHAI bonds', 'REC bonds', '50 lakh limit', 'save capital gains tax bonds', 'six months'],
  },
  {
    id: 'ita25-cg-asset-to-house',
    title: 'Exemption for investing sale proceeds of any asset in a house',
    principle:
      'An individual or HUF selling any long-term asset other than a residential house — shares, funds, gold, land — is exempt on the gain if the full net sale proceeds go into one residential house in India within the same windows as the house-to-house rule (one year before, two years after, three years to build); a partial investment exempts a proportionate part (s.86, formerly s.54F). It is not available if, on the sale date, the seller owns more than one house other than the new one, or buys another within one year or builds one within three years of the sale; buying another within two years later withdraws it. Proceeds and cost above 10 crore are ignored; selling the new house within three years claws it back.',
    inPractice:
      'The whole sale value, not just the gain, must be reinvested for full exemption; a client selling a large equity portfolio to buy a home can wipe out the tax if they own at most one other house.',
    source: law('s.86'),
    asOf: '2026-04',
    topics: ['tax', 'real-estate', 'equity'],
    keywords: ['section 54F', 'sell shares buy house', 'net consideration exemption', 'reinvest sale proceeds house', 'own more than one house'],
  },
  {
    id: 'ita25-cg-losses',
    title: 'Setting off and carrying forward capital losses',
    principle:
      'Short-term losses may absorb gains of either kind, short or long; long-term losses absorb only long-term gains (s.108). Capital losses cannot be set against salary, interest or any other head. What remains is carried forward for up to eight tax years and used under the same rules (s.111), provided the loss return was filed by the due date.',
    inPractice:
      'Booking losses before year end to offset gains is legitimate; file on time, or carried-forward losses are lost.',
    source: law('s.108, s.111'),
    asOf: '2026-04',
    topics: ['tax'],
    keywords: ['capital loss set off', 'carry forward capital loss', 'short term loss', 'long term loss', 'tax loss harvesting', 'eight years', 'loss set off rules'],
  },
];
