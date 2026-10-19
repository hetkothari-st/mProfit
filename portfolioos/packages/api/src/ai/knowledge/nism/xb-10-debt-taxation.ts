import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-B',
  edition: '2025-12',
  chapter: 10,
  chapterTitle: 'Taxation of Debt Products',
};

export const XB_10: readonly KnowledgeEntry[] = [
  {
    id: 'xb-10-bond-tax',
    title: 'How bonds and debentures are taxed',
    principle:
      'Coupon interest is other income at slab rates, on accrual or receipt basis per the holder’s accounting method. Gains on sale or redemption are capital gains: listed bonds and debentures held over 12 months are long-term at 12.5% without indexation; within 12 months, slab rates. Unlisted bonds and debentures, and market-linked debentures even if listed, are always short-term at slab rates. If a bond is sold between coupon dates, the accrued interest inside the price is interest income and is removed from the sale price for the capital-gain calculation: a 10,500 cost bond sold for 13,000 including 75 of accrued interest gives 75 of interest and a 2,425 short-term gain. Non-residents pay 12.5% on long-term gains from listed bonds, without indexation or currency benefit.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'bonds'],
    keywords: ['bond tax', 'debenture tax', 'listed bond LTCG 12.5%', 'unlisted bond tax slab', 'accrued interest on sale', 'bond capital gains', 'NCD tax'],
  },
  {
    id: 'xb-10-gsec-tbill-taxfree',
    title: 'G-secs, T-bills and tax-free bonds',
    principle:
      'Government securities: cash management bills (under 91 days) and T-bills (91, 182 or 364 days) are issued at a discount with no coupon, so the gain to face value is short-term capital gain at slab rates. Dated G-secs (central, 5 to 40 years) and state development loans pay half-yearly coupons and are taxed like listed bonds. No TDS on interest paid to residents on government securities, except the RBI Savings (Taxable) Bonds, where TDS applies above 10,000 a year. Tax-free bonds (such as NABARD, NHAI, REC issues) pay interest exempt under section 10, but gains on sale or redemption are taxed like any bond: 5,000 bonds bought at 120 and redeemed at 150 after more than a year, listed, give a 1.5 lakh long-term gain at 12.5%.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'bonds'],
    keywords: ['T-bill tax', 'treasury bill taxation', 'G-sec tax', 'SDL', 'tax free bonds', 'tax free bond capital gain', 'RBI floating rate bond TDS'],
  },
  {
    id: 'xb-10-mutual-fund-tax-categories',
    title: 'Mutual fund taxation by category',
    principle:
      'For tax, funds fall into four groups. Equity-oriented funds (covered in the equity chapter). Specified mutual funds type 1: 65% or more in debt or money-market instruments, bought from 1 April 2023: every gain is short-term at slab rates, whatever the holding, with no cost-of-improvement deduction. Type 2: other funds with 35% or less in domestic equity bought from April 2023 and sold before April 2025: also always short-term. All other funds (including debt funds bought before April 2023, and gold, silver, international or fund-of-funds schemes and hybrid debt funds sold from April 2025): long-term after 12 months if listed (ETFs) or 24 months if unlisted, taxed at 12.5%; short-term at slab rates. Example: debt fund units bought in January 2017 at 150 and sold in March 2025 at 300 give a 1.5 lakh long-term gain at 12.5%.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'mutual-funds'],
    keywords: ['debt fund tax', 'specified mutual fund', 'debt mutual fund taxed at slab', 'gold fund tax', 'international fund tax', 'fund of funds tax', 'mutual fund bought before April 2023', 'section 50AA'],
  },
  {
    id: 'xb-10-mf-dividend-nri',
    title: 'Mutual fund dividends (IDCW) and non-resident investors',
    principle:
      'IDCW payouts are dividends taxed at slab rates for residents, who may deduct only interest on money borrowed to invest, capped at 20% of the dividend (5 lakh dividend with 1.5 lakh interest: only 1 lakh deductible, 4 lakh taxable). Non-residents pay 20% on dividends with no deductions, or the DTAA rate if lower (claiming it needs a tax residency certificate and Form 10F). DTAA rates vary: interest under the India-US treaty 15%; dividends 25% under the US treaty (so the 20% domestic rate applies) but 10% under the UK treaty. NRIs and PIOs investing in foreign exchange may choose Chapter XII-A: 20% on investment income and 12.5% on long-term gains, with exemption when proceeds are reinvested within six months in eligible assets (clawed back if those are sold within three years).',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'mutual-funds'],
    keywords: ['IDCW tax', 'mutual fund dividend tax', 'NRI mutual fund tax', 'DTAA rate', 'tax residency certificate', 'Form 10F', 'Chapter XII-A', 'NRI investment income 20%'],
  },
  {
    id: 'xb-10-mld-overseas-retirement',
    title: 'Market-linked debentures and foreign retirement accounts',
    principle:
      'Market-linked debentures have a debt base with returns tied to an index or security; they may or may not protect principal, are issued by companies with net worth of at least 100 crore, run about 12 to 36 months and pay only at maturity, mostly to wealthy investors. Since April 2023 every gain on sale, redemption or maturity of an MLD is short-term and taxed at slab rates, even for MLDs bought earlier, with no cost-of-improvement deduction. Separately, residents who opened retirement accounts (such as US 401(k) or IRA, Canadian or UK pension accounts) while living in the US, Canada or UK are taxed in India on withdrawal, not annually, under section 89A, avoiding a timing mismatch with the foreign country.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'bonds', 'retirement'],
    keywords: ['market linked debenture', 'MLD tax', 'principal protected', '401k tax India', 'foreign retirement account tax', 'section 89A', 'returning NRI pension tax'],
  },
];
