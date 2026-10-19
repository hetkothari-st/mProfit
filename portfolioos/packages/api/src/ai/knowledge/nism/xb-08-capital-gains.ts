import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-B',
  edition: '2025-12',
  chapter: 8,
  chapterTitle: 'Capital Gains',
};

export const XB_08: readonly KnowledgeEntry[] = [
  {
    id: 'xb-08-capital-asset',
    title: 'What is and is not a capital asset',
    principle:
      'Capital gains tax applies to profit on transferring a capital asset: property of any kind (movable or immovable, tangible or intangible), including securities, gold, jewellery, management rights, a partner’s share, leasehold rights and goodwill; securities held by FPIs and Category I and II AIFs; and from FY 2025-26 any ULIP that does not qualify for the life-insurance exemption. Excluded: stock-in-trade and business raw materials; personal effects such as clothes, furniture, cars and appliances, but not jewellery, precious stones, art, paintings, sculptures or archaeological collections, which remain taxable; rural agricultural land in India (urban agricultural land and foreign farmland are capital assets); and some old gold bonds and gold monetisation deposit certificates.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax'],
    keywords: ['capital asset', 'personal effects', 'jewellery capital gains', 'agricultural land capital gains', 'rural agricultural land exempt', 'ULIP capital asset', 'stock in trade'],
  },
  {
    id: 'xb-08-holding-periods',
    title: 'Short-term versus long-term: holding periods (transfers from 23 July 2024)',
    principle:
      'Most assets turn long-term after more than 24 months. Listed shares, listed securities (bonds, debentures, government securities, units), UTI units, equity-oriented fund units (listed or not), zero-coupon bonds and taxable ULIPs turn long-term after more than 12 months. Unlisted shares, REIT or InvIT units that are unlisted, and property need more than 24 months. Some are always short-term whatever the holding: depreciable assets, market-linked debentures, unlisted bonds and debentures redeemed or sold after 23 July 2024, and "specified mutual funds" bought from April 2023 (funds with 65% or more in debt or money-market instruments). Funds with 35% or less in domestic equity bought from April 2023 and sold from April 2025 are long-term after 12 months (listed) or 24 (unlisted).',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'mutual-funds', 'equity', 'bonds'],
    keywords: ['holding period', 'long term capital gain period', '12 months', '24 months', 'debt fund always short term', 'specified mutual fund', 'section 50AA', 'market linked debenture tax', 'when is LTCG'],
  },
  {
    id: 'xb-08-holding-period-special',
    title: 'Counting the holding period in special cases',
    principle:
      'Demat securities use first-in, first-out: the earliest shares credited are deemed sold first. Bonus and rights shares count from allotment; ESOP and sweat-equity shares from allotment on exercise. Converted securities (preference to equity, bonds or debentures into shares) include the original holding; shares received in a merger include the time held in the old company; demerged shares count from when the original shares were bought. Inherited or gifted assets include the previous owner’s holding period. Mutual fund scheme consolidations, segregated portfolios and gold converted to or from electronic gold receipts carry the original period too.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'equity', 'mutual-funds'],
    keywords: ['FIFO capital gains', 'bonus shares holding period', 'inherited asset holding period', 'demerger holding period', 'merger shares period', 'ESOP holding period'],
  },
  {
    id: 'xb-08-transfer-not-transfer',
    title: 'What counts as a transfer, and what does not',
    principle:
      'Transfer includes sale, exchange (including shares received in a reconstruction), relinquishing rights (a partner retiring and giving up rights in firm assets), extinguishment of rights, and maturity of certain zero-coupon bonds. Not transfers, so no capital gain: partition of an HUF; gifts, wills and irrevocable trusts (except ESOP shares); specified non-resident-to-non-resident transfers abroad or on IFSC exchanges; redemption of Sovereign Gold Bonds by individuals; converting bonds, debentures or preference shares into shares of the same company; mutual fund scheme consolidation; SEBI-approved securities lending; distribution of assets to shareholders on liquidation (shareholders are taxed instead); and converting gold into electronic gold receipts or back.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax'],
    keywords: ['transfer capital gains', 'gift not transfer', 'will inheritance tax', 'SGB redemption tax free', 'bonus conversion not transfer', 'securities lending tax', 'HUF partition'],
  },
  {
    id: 'xb-08-computation',
    title: 'Computing capital gains: consideration, costs, cost of acquisition',
    principle:
      'Gain = full value of consideration less transfer expenses (brokerage, stamp duty, legal fees; never STT or CTT; adviser fees only if tied to that specific sale) less cost of acquisition and improvement (capital spending on or after April 2001). Special values: unquoted shares sold below fair value or unascertainable prices use fair market value. Cost rules: shares bought before April 2001 may use the higher of cost or 1 April 2001 value; listed equity and equity funds bought by 31 January 2018 use the higher of actual cost and the lower of the 31 January 2018 value and the sale price (grandfathering); bonus shares after April 2001 cost nil; renounced rights cost nil; ESOP shares cost their value at exercise; inherited or gifted assets take the previous owner’s cost; merged and demerged shares carry or apportion the original cost.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax'],
    keywords: ['cost of acquisition', 'grandfathering 31 January 2018', 'bonus shares cost nil', 'inherited property cost', 'fair market value 2001', 'STT not deductible', 'cost of improvement'],
  },
  {
    id: 'xb-08-indexation',
    title: 'Indexation after July 2024',
    principle:
      'Indexation raised cost by the cost inflation index (indexed cost = cost x CII of sale year / CII of year first held or 2001-02, whichever is later). For transfers from 23 July 2024 it is gone for almost everything. The exception: resident individuals and HUFs selling land or buildings acquired before 23 July 2024 may compute tax both ways, 20% with indexation or 12.5% without, and pay the lower; an indexation loss cannot be claimed. Example: a house bought for 1 crore in April 2011 (CII 184) sold for 3 crore in December 2024 (CII 363): indexed cost about 1.97 crore and gain about 1.03 crore; without indexation the gain is 2 crore. With 1.5 crore reinvested in a new house under section 54, the indexed route leaves nothing taxable, while the other leaves 50 lakh at 12.5% (6.25 lakh), so tax is nil.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'real-estate'],
    keywords: ['indexation', 'cost inflation index', 'CII', 'indexation removed July 2024', 'property sale tax 12.5% or 20%', 'indexed cost of acquisition', 'house sale capital gains'],
  },
  {
    id: 'xb-08-rates',
    title: 'Capital gains tax rates (transfers from 23 July 2024)',
    principle:
      'Short-term: listed equity shares, equity-oriented fund units, taxable equity ULIPs and business-trust units on which STT is paid are taxed at 20% (section 111A); all other short-term gains at slab rates. Long-term: 12.5% for all assets; for STT-paid listed equity, equity funds, taxable equity ULIPs and business-trust units the first 1.25 lakh of long-term gains each year is exempt (section 112A). Property bought before 23 July 2024 can instead use 20% with indexation if lower. Debt funds bought from April 2023, market-linked debentures and unlisted bonds are taxed as short-term at slab rates whatever the holding.',
    inPractice:
      'Remember the 87A rebate cannot reduce tax on 112A equity gains, and resident individuals with low income can set the basic exemption limit against long-term gains.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'equity', 'mutual-funds'],
    keywords: ['capital gains tax rates', 'STCG 20%', 'LTCG 12.5%', '1.25 lakh exemption', 'section 111A', 'section 112A', 'equity tax 2024', 'debt fund taxed at slab'],
  },
  {
    id: 'xb-08-foreign-currency',
    title: 'Capital gains in foreign currency',
    principle:
      'Non-residents (other than FPIs) who bought Indian company shares or debentures with foreign currency compute the gain in that currency (sale price and transfer costs at the SBI average TT rate on the sale date, cost at the average rate on the purchase date, no indexation) and convert the gain to rupees at the TT buying rate on the sale date, insulating them from rupee depreciation; this does not apply to unlisted or closely held shares. Other foreign-currency gains, such as a resident selling land in Dubai, are converted at the TT buying rate on the last day of the month before the sale.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax'],
    keywords: ['NRI capital gains currency', 'foreign currency capital gains', 'TT buying rate', 'rule 115A', 'foreign property sale tax'],
  },
  {
    id: 'xb-08-exemptions-54',
    title: 'Reinvestment exemptions: sections 54, 54F, 54EC and others',
    principle:
      'Section 54 (individuals, HUFs): long-term gain on a house is exempt to the extent reinvested in one house in India bought one year before or two years after, or built within three years; two houses once if the gain is up to 2 crore; capped at 10 crore. Section 54F: long-term gain on any other asset is exempt in proportion (investment / net sale price) when the net sale price is put into a house within the same windows, capped at 10 crore of investment. Unused amounts go to the Capital Gains Account Scheme before the return due date. Section 54EC: up to 50 lakh of long-term gain on land or buildings in NHAI or REC bonds within six months.',
    inPractice:
      'Less common: 54B agricultural land, 54D compulsory acquisition of industrial land, 54G and 54GA industrial relocation, 54GB house sale into an eligible start-up, 115F NRI reinvestment of foreign-currency assets. For compulsory acquisitions the clock starts on receipt of compensation.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'real-estate', 'bonds'],
    keywords: ['section 54', 'section 54F', 'section 54EC', 'capital gains exemption', 'capital gains account scheme', 'buy new house to save tax', '54EC bonds 50 lakh', 'reinvest capital gains'],
  },
];
