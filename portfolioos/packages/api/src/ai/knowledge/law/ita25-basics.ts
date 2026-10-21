/**
 * Income-tax Act 2025 (Act 30 of 2025, in force 1 April 2026) as amended by
 * the Finance Act 2026: tax year, residence, the two regimes, rebate and
 * surcharge — in our own words.
 */
import type { KnowledgeEntry } from '../library.js';

const law = (ref: string): KnowledgeEntry['source'] => ({
  kind: 'LAW',
  instrument: 'Income-tax Act 2025',
  ref,
  date: '2026-04-01',
});
const FA_RATES: KnowledgeEntry['source'] = {
  kind: 'LAW',
  instrument: 'Finance Act 2026',
  ref: 'First Schedule, Part III',
  date: '2026-04-01',
};

export const ITA25_BASICS: KnowledgeEntry[] = [
  {
    id: 'ita25-tax-year',
    title: 'The Income-tax Act 2025 and the "tax year"',
    principle:
      'From 1 April 2026 the Income-tax Act 2025 replaces the Income-tax Act 1961. Income is now taxed by "tax year": the financial year from 1 April to 31 March in which it is earned (s.3). The old pair of "previous year" (when income is earned) and "assessment year" (when it is assessed) is gone, so FY 2026-27 income is simply tax year 2026-27. Sections are renumbered throughout: for example the new-regime slabs move from s.115BAC to s.202, the rebate from s.87A to s.156, and capital gains rates from ss.111A/112/112A to ss.196–198. Income earned up to 31 March 2026 is still assessed under the 1961 Act.',
    inPractice:
      'Clients and older documents will keep quoting 1961 section numbers (80C, 112A, 54EC); answer in the new numbering and give the old one once so they can match it.',
    source: law('s.3, s.536'),
    asOf: '2026-04',
    topics: ['tax'],
    keywords: ['income tax act 2025', 'new income tax act', 'tax year', 'previous year', 'assessment year', 'section numbers changed', '1961 act replaced'],
  },
  {
    id: 'ita25-residence',
    title: 'Residential status: resident, RNOR and non-resident',
    principle:
      'An individual is resident in India for a tax year if present here 182 days or more in that year, or 60 days or more in the year plus 365 days or more over the four preceding years (s.6). The 60-day test does not apply to a citizen leaving India for employment abroad or as crew of an Indian ship, nor to a citizen or person of Indian origin visiting India — but for a visitor with Indian income above 15 lakh it becomes 120 days. A citizen with Indian income above 15 lakh who is not taxable in any other country is deemed resident. A resident is "not ordinarily resident" (RNOR) if non-resident in 9 of the previous 10 years, or in India 729 days or less in the previous 7, or resident only through the 120-day or deemed-residence rules.',
    inPractice:
      'Residents are taxed on worldwide income; RNORs and non-residents broadly only on Indian income. A returning NRI is usually RNOR for a couple of years, a useful window to realise foreign gains.',
    source: law('s.6'),
    asOf: '2026-04',
    topics: ['tax'],
    keywords: ['residential status', 'resident', 'non resident', 'NRI tax status', 'RNOR', '182 days', '120 days', 'deemed resident', 'days in India'],
  },
  {
    id: 'ita25-new-regime',
    title: 'New tax regime: the default slabs for 2026-27',
    principle:
      'Unless the taxpayer opts out, an individual or HUF is taxed under the new regime (s.202, formerly s.115BAC): nil up to 4 lakh, 5% from 4 to 8 lakh, 10% to 12 lakh, 15% to 16 lakh, 20% to 20 lakh, 25% to 24 lakh and 30% above. Most deductions are not allowed: no Chapter VIII deductions (the old 80C, 80D and the like) except the employer’s NPS contribution, no exemption for HRA or LTA, no deduction for interest on a self-occupied home, and no setting a house-property loss against other income. Salaried taxpayers get a 75,000 standard deduction. Someone without business income can choose the old regime afresh each year with the return; someone with business income opts out by the return due date, stays out until withdrawing, can withdraw only once, and then cannot opt out again while that business income continues.',
    inPractice:
      'The new regime usually wins unless deductions (home-loan interest, 80C, 80D, HRA) together exceed roughly 4–5 lakh; compute both before advising.',
    source: law('s.202, s.19'),
    asOf: '2026-04',
    topics: ['tax'],
    keywords: ['new tax regime', 'new regime slabs', 'tax slabs 2026-27', '115BAC', 'section 202', 'old vs new regime', 'opt out new regime', 'standard deduction 75000'],
  },
  {
    id: 'ita25-old-regime',
    title: 'Old tax regime slabs for 2026-27',
    principle:
      'A taxpayer who opts out of the new regime pays the old slabs, unchanged for tax year 2026-27 (Finance Act 2026, First Schedule Part III): nil up to 2.5 lakh, 5% to 5 lakh, 20% to 10 lakh and 30% above. A resident aged 60 to 79 pays nil up to 3 lakh, and a resident aged 80 or more nil up to 5 lakh, with the same 20% and 30% bands above. The old regime keeps the deductions and exemptions the new one removes; the salaried standard deduction is 50,000 (s.19). Health and education cess of 4% applies on top of tax and surcharge in both regimes.',
    inPractice:
      'Old-regime clients are typically those with a large home loan on a self-occupied house plus full 80C and 80D use; check each year, because the choice can change annually for non-business taxpayers.',
    source: FA_RATES,
    asOf: '2026-04',
    topics: ['tax'],
    keywords: ['old tax regime', 'old regime slabs', 'senior citizen tax slab', 'super senior citizen', '2.5 lakh exemption', 'standard deduction 50000', 'cess 4%'],
  },
  {
    id: 'ita25-rebate',
    title: 'Rebate: no tax up to 12 lakh (new) or 5 lakh (old)',
    principle:
      'A resident individual under the new regime whose total income is 12 lakh or less gets a rebate of the full tax up to 60,000, so pays nothing (s.156, formerly s.87A). Just above 12 lakh, marginal relief caps the tax at the amount by which income exceeds 12 lakh, so 12.1 lakh pays at most 10,000. Under the old regime the rebate is the tax up to 12,500 where total income is 5 lakh or less. The rebate cannot be used against tax on special-rate income such as long-term gains on listed shares and equity funds, and non-residents cannot claim it.',
    inPractice:
      'With the 75,000 standard deduction a salaried person pays no tax up to 12.75 lakh of salary under the new regime, but listed equity gains taxed at special rates still bear tax.',
    source: law('s.156'),
    asOf: '2026-04',
    topics: ['tax'],
    keywords: ['rebate', '87A rebate', 'section 156', '12 lakh tax free', 'marginal relief', 'zero tax income', '12.75 lakh salary'],
  },
  {
    id: 'ita25-surcharge',
    title: 'Surcharge on high incomes, and its caps',
    principle:
      'Individuals and HUFs pay a surcharge on income tax when total income crosses a threshold: 10% above 50 lakh, 15% above 1 crore, 25% above 2 crore, and 37% above 5 crore (Finance Act 2026). Under the new regime the top rate is 25%: there is no 37% band. On dividends and on capital gains taxed at the special rates of ss.196–198 (listed equity, equity funds and other long-term gains), surcharge never exceeds 15% whatever the income. Marginal relief stops the surcharge from exceeding the income above each threshold. Cess of 4% is then charged on tax plus surcharge.',
    inPractice:
      'Very high earners on the old regime face a top marginal rate near 42.7%; the new regime caps it near 39%, and capital gains near 14.95% (12.5% x 1.15 x 1.04) for listed equity.',
    source: { ...FA_RATES, ref: 'Part III, Surcharge Table 1; Part II' },
    asOf: '2026-04',
    topics: ['tax'],
    keywords: ['surcharge', 'surcharge rates', '37% surcharge', '25% surcharge cap', 'surcharge on capital gains 15%', 'high income tax', 'marginal relief surcharge'],
  },
];
