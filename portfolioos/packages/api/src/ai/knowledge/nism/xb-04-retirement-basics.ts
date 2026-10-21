import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-B',
  edition: '2025-12',
  chapter: 4,
  chapterTitle: 'Retirement Planning Basics',
};

export const XB_04: readonly KnowledgeEntry[] = [
  {
    id: 'xb-04-why-retirement-differs',
    title: 'Why retirement is unlike any other goal',
    principle:
      'Longer lives, thinner employer benefits, job changes and rising health costs make retirement the central planning goal: someone retiring at 60 with life expectancy of 80 must fund 20 years without work. It has the longest accumulation and distribution periods and needs the largest corpus. Unlike education or a home, no one lends for retirement, and it is the goal people keep postponing or raiding for others, which compounds the shortfall. Its phases are preparation (education, home, insurance), pre-retirement (adjusting, learning the rules) and retirement itself. Starting early is what makes it achievable.',
    source: SRC,
    topics: ['retirement', 'goals'],
    keywords: ['retirement planning', 'why plan for retirement', 'no loan for retirement', 'start early retirement', 'life expectancy', 'retirement phases'],
  },
  {
    id: 'xb-04-retirement-process-variables',
    title: 'The retirement planning process and its variables',
    principle:
      'Steps: estimate retirement expenses (housing and upkeep, living costs, medical care, transport, recreation, insurance, taxes); turn them into the income needed while keeping the desired lifestyle; fix the time horizon; then compute the corpus. Years to retirement drive how much inflation inflates costs and how long savings compound (longer means smaller annual saving). Years in retirement can only be estimated from life expectancy, gender, health, genes and lifestyle; underestimating it is longevity risk, running out of money. The corpus depends on the income needed, inflation, the return the corpus earns, and the length of retirement. Review the assumptions periodically as they will change.',
    source: SRC,
    topics: ['retirement', 'planning'],
    keywords: ['retirement corpus', 'how much to retire', 'longevity risk', 'years to retirement', 'years in retirement', 'retirement expenses'],
  },
  {
    id: 'xb-04-inflation-real-return',
    title: 'Inflation and return in retirement maths',
    principle:
      'Inflation hits twice: today’s expenses must be grown to the retirement date (at 6%, 100 becomes about 179 in 10 years, 321 in 20 and 574 in 30), and the income then keeps rising through retirement (60,000 a month becomes about 1,07,451 after 10 years and 1,92,428 after 20). Health and travel costs usually rise faster than general inflation. Returns work the other way: the higher the expected return, the smaller the saving and corpus needed, but more risk can be taken while accumulating than once withdrawals begin. Plan with the real (inflation-adjusted) return.',
    source: SRC,
    asOf: '2025-12',
    topics: ['retirement', 'compounding'],
    keywords: ['inflation retirement', 'real rate of return', 'medical inflation', 'future value of expenses', 'inflation adjusted corpus'],
  },
  {
    id: 'xb-04-replacement-ratio',
    title: 'Estimating retirement income: replacement ratio method',
    principle:
      'Assume a percentage of pre-retirement income (often 70 to 80%) keeps the same lifestyle, then grow it with inflation each year of retirement. Example: earning 1,00,000 a month at 50 with 10% raises, income at 60 is about 2,59,374 a month; at a 50% replacement target, retirement starts on about 1,29,687 a month, rising 7% a year to about 1,38,765 in year two. Some costs fall at retirement (home loan, children’s education, work costs, often tax as income drops) while medical and travel costs rise. The method gets less accurate the further away retirement is.',
    source: SRC,
    asOf: '2025-12',
    topics: ['retirement', 'planning'],
    keywords: ['replacement ratio', 'income replacement method', '80 percent of income', 'retirement income estimate'],
  },
  {
    id: 'xb-04-expense-method',
    title: 'Estimating retirement income: expense method',
    principle:
      'Build retirement income from a budget of expected expenses, adding costs that grow (medical, travel, gifts, home upkeep) and removing those that stop (loan EMIs, children’s education, some taxes), then inflate to the retirement date. Example: a 40-year-old spending 30,000 a month who expects 15,000 more in retirement needs 45,000 in today’s money; at 6% inflation over 20 years that is about 1,44,321 a month at 60. It is easiest close to retirement; far away, estimates are guesses and need regular review.',
    source: SRC,
    asOf: '2025-12',
    topics: ['retirement', 'planning'],
    keywords: ['expense method retirement', 'retirement budget', 'monthly expense at retirement', 'retirement expense estimate'],
  },
  {
    id: 'xb-04-superannuation',
    title: 'Employer superannuation schemes',
    principle:
      'Superannuation is a company pension plan. Apart from the statutory Employees’ Pension Scheme 1995 and government or similar bodies, employers must provide pensions by buying annuities from LIC or another IRDAI-registered life insurer; paying pensions from current profits is not allowed because retirees would depend on the employer’s future health, and accounting rules require providing for benefits as they accrue. Schemes are funded either by the employer buying annuities or through an irrevocable trust separate from the employer, whose trustees collect contributions (actuarially set for defined-benefit schemes), invest as prescribed, arrange annuities, deduct tax, and file audited accounts.',
    source: SRC,
    topics: ['retirement', 'products'],
    keywords: ['superannuation', 'company pension', 'superannuation fund', 'employer pension scheme', 'superannuation trust', 'annuity purchase'],
  },
  {
    id: 'xb-04-approved-superannuation-tax',
    title: 'Tax treatment of approved superannuation funds',
    principle:
      'A superannuation fund approved by the Income-tax Commissioner must be an irrevocable trust for an Indian business (at least 90% of employees in India), exist solely to provide retirement, incapacity or survivor annuities, have employer contributions, and pay benefits only in India. Benefits: employer contributions within limits are a deductible business expense; the fund’s income is tax-free; payments on death, commutation of pension at retirement or incapacity, refunds on death, and transfers to NPS are exempt; employee contributions qualify for deduction within the overall ceiling.',
    source: SRC,
    asOf: '2025-12',
    topics: ['retirement', 'tax'],
    keywords: ['approved superannuation fund', 'superannuation tax', 'commuted pension tax', 'superannuation transfer to NPS', 'section 10(13)'],
  },
];
