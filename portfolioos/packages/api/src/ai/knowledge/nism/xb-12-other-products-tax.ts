import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-B',
  edition: '2025-12',
  chapter: 12,
  chapterTitle: 'Taxation of Other Products',
};

export const XB_12: readonly KnowledgeEntry[] = [
  {
    id: 'xb-12-esop-tax',
    title: 'How ESOPs are taxed',
    principle:
      'ESOPs are taxed twice. On exercise and allotment: (fair value on the exercise date less the exercise price) x shares is a salary perquisite, with TDS by the employer; fair value on the vesting or allotment date is irrelevant. Example: 100 options exercised at 500 when the fair value is 6,500: perquisite 6 lakh. On sale: capital gains, with cost = fair value on the exercise date and holding period from the allotment date (exercise 1 April, allotment 1 May, sale 1 August: held from 1 May). Then the usual rules apply: listed with STT, 20% short-term or 12.5% above 1.25 lakh long-term; unlisted, long-term after 24 months at 12.5%, otherwise slab rates.',
    inPractice:
      'Employees of eligible start-ups (section 80-IAC: incorporated from April 2016 within the notified window, turnover up to 100 crore, certified by the Inter-Ministerial Board) can defer the perquisite tax until the earliest of 48 months after the end of the assessment year, leaving the company, or selling the shares.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'equity'],
    keywords: ['ESOP tax', 'ESOP perquisite', 'ESOP exercise tax', 'ESOP sale capital gains', 'startup ESOP tax deferral', 'section 80-IAC', 'RSU tax'],
  },
  {
    id: 'xb-12-sgb',
    supersededBy: 'fa26-sgb',
    title: 'Sovereign Gold Bonds: features and tax',
    principle:
      'SGBs are RBI-issued government securities in grams of gold, paying 2.5% a year on the issue value half-yearly, with an 8-year term (early redemption from year five on interest dates) and redemption at the average 999 gold price of the previous three working days. Limits per financial year: 4 kg for individuals and HUFs, 20 kg for trusts. Residents can hold them (and keep them if they later become NRIs); they can be traded in demat or pledged for loans. Interest is taxable at slab rates with no TDS. Redemption by an individual with RBI, at maturity or early, is not a transfer, so no capital gains tax, even if bought on the exchange. Selling on the exchange is taxable: long-term after 12 months at 12.5%, otherwise slab; accrued interest since the last coupon is split out as interest. Non-individuals pay capital gains even on redemption.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'bonds', 'products'],
    keywords: ['SGB', 'sovereign gold bond', 'SGB tax free redemption', 'SGB interest tax', 'SGB 2.5%', 'SGB sale on exchange tax', 'gold bond'],
  },
  {
    id: 'xb-12-nps-tax-detail',
    title: 'NPS tax details for employees, the self-employed and NPS Vatsalya',
    principle:
      'Employee contributions: deductible under 80CCD(1) up to 10% of salary (basic plus DA forming part of retirement benefits) within the 1.5 lakh shared ceiling, plus 50,000 extra under 80CCD(1B), both old regime only; the self-employed may deduct up to 20% of gross income. Employer contributions are first added to salary, then deductible under 80CCD(2) up to 14% of salary (10% for private employers in the old regime). Central government staff can claim 80C for Tier II contributions locked in three years. From FY 2025-26, parents can claim 80CCD(1B) (within the same 50,000) for NPS Vatsalya contributions; partial withdrawals up to 25% of contributions are exempt, closure proceeds are taxable, and amounts received on the child’s death are exempt. Example: with 80C already full, a 1.7 lakh home-loan principal plus 65,000 NPS gives 1.5 lakh plus 50,000 = 2 lakh of deductions.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'retirement'],
    keywords: ['NPS deduction', '80CCD(1)', '80CCD(1B)', '80CCD(2)', 'NPS Vatsalya tax', 'NPS self employed deduction', 'employer NPS deduction 14%'],
  },
  {
    id: 'xb-12-nps-withdrawal-tax',
    title: 'Tax on NPS withdrawals',
    principle:
      'On closing the account or exiting, the lump sum is exempt up to 60% of the corpus; the part used to buy an annuity is not taxed when used, but the annuity income is taxable each year. Partial withdrawals are exempt up to 25% of the employee’s own contributions. Money paid to the nominee on the subscriber’s death is fully exempt. Tier II withdrawals are taxed as capital gains, like a mutual fund. Employer contributions above the 7.5 lakh combined cap (with EPF and superannuation) are taxed as a perquisite even though also added as salary, so a high earner can be taxed twice on part of employer NPS while getting the 80CCD(2) deduction only once.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'retirement'],
    keywords: ['NPS withdrawal tax', 'NPS lump sum tax free 60%', 'NPS partial withdrawal tax', 'NPS tier 2 tax', 'NPS annuity tax', 'NPS death claim tax'],
  },
  {
    id: 'xb-12-reit-invit',
    title: 'Tax on REIT and InvIT distributions and units',
    principle:
      'REITs hold income-producing property (offices, warehouses, malls) directly or via SPVs; InvITs hold infrastructure (roads, power lines, towers). Both are pass-through for some income. Interest from SPVs: exempt in the trust, taxable for unitholders. Dividends from SPVs: taxable for unitholders if the SPV chose the lower 115BAA corporate tax rate, otherwise exempt for them. Rental income of a REIT: exempt in the REIT, taxable for unitholders (an InvIT pays tax on its own rent). Other income taxed in the trust is exempt for unitholders, but if untaxed in the trust (such as capital repayment) it is taxed in unitholders’ hands. TDS on distributions to residents is 10%. Units: listed, long-term after 12 months, 12.5% above 1.25 lakh with STT, 20% short-term; unlisted after 24 months. Redemption proceeds are taxed as other income. Pre-2018 units are grandfathered.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'real-estate', 'products'],
    keywords: ['REIT tax', 'InvIT tax', 'REIT distribution tax', 'REIT dividend interest rent', 'business trust tax', 'REIT capital repayment tax', 'section 115BAA SPV'],
  },
  {
    id: 'xb-12-aif-tax',
    title: 'Tax on AIF investments',
    principle:
      'Category I and II AIFs are pass-through for everything except business income: capital gains, interest and other income are taxed on investors as if they had invested directly, in the same character and proportion, even if not distributed (deemed credited at year-end); business income is taxed in the fund (at maximum marginal rate if it is a trust) and exempt for investors. Securities they hold are capital assets from FY 2025-26. Non-business losses pass to investors who held units at least 12 months; business losses stay in the fund. The fund deducts 10% TDS for residents and reports on Forms 64C and 64D. Example: a trust AIF earning 20 lakh business income, 15 lakh gains and 5 lakh other income: a 30% investor is taxed on 4.5 lakh gains and 1.5 lakh other income. Category III AIFs have no pass-through.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'pms-aif'],
    keywords: ['AIF tax', 'pass through AIF', 'category I II AIF tax', 'category III AIF tax', 'AIF losses', 'Form 64C', 'AIF TDS'],
  },
  {
    id: 'xb-12-etf-tax',
    title: 'Tax on gold and equity ETFs',
    principle:
      'Gold ETFs follow non-equity fund rules: bought from April 2023 and sold before April 2025, always short-term at slab rates; otherwise long-term after 12 months (listed) at 12.5% without indexation, short-term at slab. Example: 10,000 units bought at 30 in 2018 and sold at 50 in 2025: 2 lakh long-term gain at 12.5%. Equity index ETFs are taxed like equity funds: long-term after 12 months, 12.5% above 1.25 lakh with STT; short-term at 20% (sales from 23 July 2024). Example: 5,000 Nifty ETF units bought at 200 and sold at 300 after five years: 5 lakh gain, with tax on the amount above 1.25 lakh.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'mutual-funds', 'index-funds'],
    keywords: ['gold ETF tax', 'silver ETF tax', 'index ETF tax', 'Nifty ETF tax', 'ETF capital gains', 'gold fund taxation 2025'],
  },
  {
    id: 'xb-12-life-insurance-tax',
    title: 'Tax on life insurance proceeds and premiums',
    principle:
      'Life policy proceeds, with bonus, are exempt under section 10(10D) except: key-person policies; amounts under 80DD schemes received when the dependant dies first; policies issued April 2003 to March 2012 where any year’s premium exceeds 20% of sum assured; from April 2012, where it exceeds 10%; ULIPs from February 2021 with aggregate annual premiums above 2.5 lakh (taxed as capital gains, equity funds within them like equity funds); and non-ULIP policies from April 2023 with aggregate premiums above 5 lakh (maturity proceeds less premiums taxed as other income, so a 60 lakh policy with 6 lakh annual premium is taxable despite the 10% test). Death proceeds are always exempt.',
    inPractice:
      'Premiums for self, spouse or children (any member, for an HUF) qualify for 80C in the old regime, up to 10% of sum assured (20% for pre-2012 policies, 15% for disabled insureds); surrendering a policy within two years (ULIPs five) reverses earlier deductions.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'insurance'],
    keywords: ['life insurance maturity tax', 'section 10(10D)', 'ULIP 2.5 lakh tax', 'insurance premium 5 lakh tax', 'death claim tax free', 'insurance 80C limit', 'policy surrender 80C reversal'],
  },
  {
    id: 'xb-12-reverse-mortgage-tax',
    title: 'Tax on reverse mortgage receipts',
    principle:
      'A reverse mortgage under a government-notified scheme is not a transfer of the house (so no capital gains on mortgaging it), and the amounts received, lump sum or instalments, are exempt as loans under section 10(43). Senior citizens can thus unlock home equity without tax while continuing to live in the house.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'retirement', 'real-estate'],
    keywords: ['reverse mortgage tax', 'section 10(43)', 'reverse mortgage not transfer', 'senior citizen home equity tax'],
  },
];
