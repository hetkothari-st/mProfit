import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-B',
  edition: '2025-12',
  chapter: 20,
  chapterTitle: 'Case Studies',
};

export const XB_20: readonly KnowledgeEntry[] = [
  {
    id: 'xb-20-retirement-corpus-cases',
    title: 'Case method: retirement corpus and accumulation',
    principle:
      'Retirement need: inflate current spending to the retirement date with FV, then find the corpus as the present value, payments at the start of each year, at the real rate ((1 + return) / (1 + inflation) - 1). Spending of 4.8 lakh a year at 52, 10% inflation to 60 (about 10.29 lakh), funded 15 years at 11% (real about 0.91%), needs about 1.45 crore; 50,000 a month at 40, 8% inflation for 20 years and 25 years of retirement at 9% (real about 0.93%), needs about 6.2 crore. Accumulation: grow each year’s rising contributions and the existing corpus to the retirement date (FV of each, then add), or run a year-by-year table: 15 lakh plus 1.2 lakh a year rising 10%, at 8%, reaches about 1.14 crore in 15 years. Track the debt-equity split each year to see whether the allocation drifts.',
    source: SRC,
    asOf: '2025-12',
    topics: ['retirement', 'planning', 'compounding'],
    keywords: ['retirement corpus case study', 'PV FV retirement calculation', 'real rate of return formula', 'how to compute retirement corpus excel'],
  },
  {
    id: 'xb-20-goal-funding-cases',
    title: 'Case method: funding education and marriage goals from a corpus',
    principle:
      'Inflate each goal cost to its year (education costing 15 lakh a year at 15% inflation: about 30.17 lakh in year 5 and 34.70 lakh in year 6; a 1 crore wedding at 10% for 7 years: about 1.95 crore). Money needed at year 5 for both education years, if set aside at 6%, is 30.17 lakh plus the present value of 34.70 lakh one year later, about 62.90 lakh. Then grow the remaining corpus at its expected return, subtract each goal as it falls due, and check what is left; a corpus earning 8% from a debt-equity mix while funding near-term goals is a fairly conservative policy.',
    source: SRC,
    asOf: '2025-12',
    topics: ['goals', 'planning', 'compounding'],
    keywords: ['education goal calculation', 'marriage goal planning', 'future cost of goal', 'goal funding case study', 'set aside money for child education'],
  },
  {
    id: 'xb-20-insurance-need-cases',
    title: 'Case method: life cover and insurance product checks',
    principle:
      'Needs-based cover: present value of household expenses over the period at the real rate, plus loans and lump-sum goals, minus existing cover. 25,000 a month for 30 years at 8% return and 6% inflation (real 1.89%) is about 68 lakh; plus a 30 lakh loan and 10 lakh for a child, less 50 lakh existing cover, about 58 lakh more is needed. Income replacement: 50,000 a month for 25 working years at 10% return and 6% growth (real 3.77%) is about 96 lakh; less 40 lakh existing, about 56 lakh more. Savings policy return: premium minus equivalent term cost, compounded to the maturity value: 6,000 a year minus 150 for term cover, growing to 2 lakh in 20 years, earns about 5.3%. Claims: 50,000 with a 10,000 deductible and 5% co-pay on the rest pays 38,000. Top-ups apply the deductible per claim, super top-ups to the year’s total, which changes out-of-pocket costs on several smaller claims.',
    source: SRC,
    asOf: '2025-12',
    topics: ['insurance', 'planning'],
    keywords: ['life insurance need calculation', 'how much cover case study', 'insurance policy return RATE', 'co-pay deductible claim example', 'top up super top up example'],
  },
  {
    id: 'xb-20-returning-nri-case',
    title: 'Case: a couple returning from the US',
    principle:
      'Returning Indian citizens who become tax residents pay Indian tax on US rental income, with credit for US tax under the treaty. Tax-deferred US retirement accounts (such as 401(k) or IRA) are taxed in India on withdrawal if they are notified accounts under section 89A, with credit for US tax; otherwise accrued income could be taxed annually. They need not replace their US life policies: premiums can be paid from US rental income or remitted from India under the LRS. Worldwide health cover can be renewed, but adding an Indian health policy too is sensible to build a claim-free history and a local base for later, even at extra cost.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'insurance', 'planning'],
    keywords: ['returning NRI planning', 'US rental income tax India', '401k India tax', 'keep US life insurance', 'NRI health insurance India'],
  },
  {
    id: 'xb-20-retiree-and-estate-cases',
    title: 'Cases: retiree income shortfall, leverage, and estate timing',
    principle:
      'A retiree whose pension rises with only half of inflation must fund the gap plus extra spending; compute the yearly shortfall over joint life expectancy, discount it, compare with the corpus, and find the return needed; for safe income, Senior Citizens’ Savings Scheme (up to 30 lakh) is the top government option. Leverage: investing 60,000 at 10% with borrowing 1.4 times own money at 9% means 25,000 own funds, 35,000 borrowed, 3,150 interest, 2,850 net gain and an 11.4% return on equity. Estate timing: a grandparent can invest in equity for a grandchild’s goal 13 years away regardless of her own age; a will gives no rights until death and can be changed, so a son cannot borrow against an inherited house in advance; to give a child money now, redeem and gift it (gifts to children are tax-free), since a will cannot unlock funds during life.',
    source: SRC,
    asOf: '2025-12',
    topics: ['retirement', 'estate', 'debt', 'planning'],
    keywords: ['pension inflation shortfall', 'leverage return on equity', 'will takes effect on death', 'invest for grandchild', 'gift money to children'],
  },
];
