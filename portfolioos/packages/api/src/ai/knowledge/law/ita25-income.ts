/**
 * Other sources, house property, clubbing and the old-regime deductions under
 * the Income-tax Act 2025 as amended by the Finance Act 2026, in our own words.
 * Dividends: see fa2026-changes.ts.
 */
import type { KnowledgeEntry } from '../library.js';

const law = (ref: string): KnowledgeEntry['source'] => ({
  kind: 'LAW',
  instrument: 'Income-tax Act 2025',
  ref,
  date: '2026-04-01',
});

export const ITA25_INCOME: KnowledgeEntry[] = [
  {
    id: 'ita25-gifts',
    title: 'When gifts are taxable',
    principle:
      'Money, property or other assets received without payment are taxed as income from other sources when their total value from non-relatives exceeds 50,000 in a tax year — and then the whole amount is taxable, not just the excess (s.92(2)(m), formerly s.56(2)(x)). Property bought below its stamp-duty value is taxed on the shortfall only if it exceeds the higher of 50,000 and 10% of the price; other assets bought below fair value by more than 50,000 are taxed on the shortfall. Gifts are fully exempt when they come from a relative (spouse, siblings and their spouses, parents’ siblings, lineal ascendants and descendants and their spouses, and the spouse’s equivalents), on the occasion of the recipient’s marriage, under a will or inheritance, or from a trust set up for the recipient’s relatives.',
    inPractice:
      'A gift from a parent or sibling is tax-free to the recipient but income it later earns may be clubbed with the giver if the recipient is a spouse, son’s wife or minor child.',
    source: law('s.92(2)(m)'),
    asOf: '2026-04',
    topics: ['tax', 'estate'],
    keywords: ['gift tax', 'cash gift taxable', 'gift from relative', 'gift from friend', '50000 gift limit', 'wedding gift', 'inheritance tax', 'gift of shares', 'relative definition'],
  },
  {
    id: 'ita25-interest-income',
    title: 'Interest from deposits, bonds and small savings',
    principle:
      'Interest from bank and post-office deposits, recurring deposits, company deposits, bonds, debentures and NSC is income from other sources (formerly s.56), taxed at slab rates as it accrues or is received under the taxpayer’s regular method; most individuals declare cumulative FD interest each year as it accrues, not only at maturity. Payers deduct TDS above a threshold; TDS is only an advance credit, and the full interest must still be declared. Interest on PPF and Sukanya Samriddhi is exempt, as are tax-free bonds issued with that status. Against interest, expenses spent wholly to earn it are deductible (for example interest on money borrowed to buy the bond), as is a banker’s collection commission (s.93, formerly s.57); old-regime taxpayers also get the separate savings-interest deduction.',
    inPractice:
      'Cumulative FDs do not defer tax; for clients in the 30% slab, compare a debt fund (also slab-taxed since 2023 but taxed only on sale) on timing, not rate.',
    source: law('s.92, s.93, s.153'),
    asOf: '2026-04',
    topics: ['tax', 'bonds', 'savings'],
    keywords: ['FD interest tax', 'fixed deposit tax', 'interest income taxable', 'cumulative FD tax', 'bond interest tax', 'NSC interest', 'PPF interest tax free', 'TDS on interest'],
  },
  {
    id: 'ita25-house-property',
    title: 'Income from house property and home-loan interest',
    principle:
      'A let-out property is taxed on its annual value (broadly the higher of expected and actual rent) less municipal taxes paid, less a flat 30% for repairs, less interest on a loan used to buy, build or repair it (ss.21–22, formerly ss.23–24). Up to two self-occupied homes have nil annual value; for them, old-regime taxpayers may deduct loan interest up to 2 lakh a year in total — including the five instalments of pre-construction interest, per the Finance Act 2026 — if construction finishes within five years of the loan, otherwise 30,000. Under the new regime there is no interest deduction on a self-occupied home, and a loss on a let-out property cannot reduce other income. Under the old regime such a loss offsets other income up to 2 lakh, the rest carrying forward eight years.',
    inPractice:
      'For a let-out flat, the full interest is deductible against its rent in either regime; the 2 lakh cap and the new-regime bar only bite on self-occupied homes and on setting losses against salary.',
    source: law('ss.20-22, s.110'),
    asOf: '2026-04',
    topics: ['tax', 'real-estate', 'debt'],
    keywords: ['house property income', 'home loan interest deduction', 'section 24', '2 lakh interest', 'self occupied property', 'let out property tax', 'rental income tax', '30% standard deduction rent', 'pre construction interest'],
  },
  {
    id: 'ita25-clubbing',
    title: 'Clubbing: when a family member’s income is taxed in your hands',
    principle:
      'An individual is taxed on income from assets they transferred without adequate payment to their spouse or son’s wife, on their minor child’s income other than from the child’s own work or skill or where the child has a specified disability, and on a spouse’s pay from a business in which the individual has a substantial interest unless it is for real qualifications (s.99, formerly s.64). A minor’s income is clubbed with the parent whose income is higher (or, if the parents are separated, the parent who maintains the child). Gifts to adult children, parents or siblings are not clubbed.',
    inPractice:
      'To shift investment income within the family, gift to adult children or parents in a lower slab, or lend to a spouse at interest; a gift to a spouse saves nothing.',
    source: law('s.99'),
    asOf: '2026-04',
    topics: ['tax', 'planning'],
    keywords: ['clubbing of income', 'investment in wife name', 'spouse income clubbing', 'minor child income', 'section 64', 'gift to spouse tax', 'income in husband name'],
  },
  {
    id: 'ita25-deductions-investments',
    title: 'Old-regime deductions for savings and pension contributions',
    principle:
      'Old-regime taxpayers may deduct up to 1.5 lakh a year in total for the payments listed in Schedule XV (s.123, formerly s.80C): life insurance premiums, EPF and PPF contributions, ELSS units, five-year tax-saving bank deposits, NSC, Sukanya Samriddhi, senior-citizen savings scheme deposits, home-loan principal and stamp duty, and children’s tuition fees, among others. Own contributions to NPS count within that limit, plus a further 50,000 on top (s.124, formerly s.80CCD(1B)). The employer’s NPS contribution (up to 14% of salary for government and new-regime employees, 10% otherwise) is deductible in both regimes.',
    inPractice:
      'For a new-regime client none of these save tax except the employer NPS contribution; choose them on merit, not for the deduction.',
    source: law('s.123, s.124, Schedule XV'),
    asOf: '2026-04',
    topics: ['tax', 'savings', 'retirement'],
    keywords: ['80C', '80C limit', '1.5 lakh deduction', 'ELSS tax saving', 'PPF deduction', 'NPS 50000', '80CCD 1B', 'employer NPS contribution', 'tax saving investments'],
  },
  {
    id: 'ita25-deductions-health',
    title: 'Old-regime deductions for health insurance and medical costs',
    principle:
      'Old-regime taxpayers may deduct health-insurance premiums (paid other than in cash) and preventive check-ups up to 25,000 for self, spouse and children, and a further 25,000 for parents; each limit becomes 50,000 where the insured person is a senior citizen (s.126, formerly s.80D). Medical spending on an uninsured senior citizen counts within the same limit. Treatment of specified diseases for self or a dependant allows up to 40,000, or 1 lakh for a senior citizen, net of insurance reimbursement (s.128, formerly s.80DDB).',
    inPractice:
      'Paying a senior parent’s health premium can save up to 50,000 of taxable income; a multi-year premium is spread across the years it covers.',
    source: law('s.126, s.128'),
    asOf: '2026-04',
    topics: ['tax', 'insurance'],
    keywords: ['80D', 'health insurance deduction', 'mediclaim deduction', 'parents health insurance tax', 'senior citizen 50000', 'preventive health check up', '80DDB'],
  },
  {
    id: 'ita25-deduction-interest',
    title: 'Deduction for interest on savings and deposits',
    principle:
      'Under the old regime, an individual other than a senior citizen may deduct savings-account interest up to 10,000 a year (time deposits excluded), and a resident senior citizen may deduct interest on any deposits — savings, fixed or recurring, with banks, co-operative banks and the post office — up to 50,000 (s.153, formerly ss.80TTA and 80TTB). Neither applies under the new regime.',
    inPractice:
      'A retired client on the old regime can earn 50,000 of FD interest free of tax on top of the rebate and exemption limit.',
    source: law('s.153'),
    asOf: '2026-04',
    topics: ['tax', 'savings', 'retirement'],
    keywords: ['80TTA', '80TTB', 'savings interest deduction', 'senior citizen interest deduction', '10000 savings interest', '50000 senior FD interest'],
  },
];
