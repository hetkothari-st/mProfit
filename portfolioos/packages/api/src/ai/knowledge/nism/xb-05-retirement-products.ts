import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-B',
  edition: '2025-12',
  chapter: 5,
  chapterTitle: 'Retirement Products',
};

export const XB_05: readonly KnowledgeEntry[] = [
  {
    id: 'xb-05-epf-contributions',
    title: 'EPF: contributions, interest and dormancy',
    principle:
      'Employees’ Provident Fund is compulsory retirement saving for eligible employers’ staff: 12% of basic plus DA from the employee, matched by the employer, whose share splits into 8.33% to the Employees’ Pension Scheme (on pay up to 15,000 a month) and 3.67% to EPF, plus EDLI and admin charges. The rate is 10% for firms under 20 staff, loss-making firms whose losses exceed net worth, and some industries; new women employees may contribute 8% for three years (the employer still pays 12%). The EPFO trustees and Finance Ministry set the yearly rate, credited every 31 March. The EPS share earns no interest and pays a pension from 58.',
    inPractice:
      'Accounts without contributions for three years turn dormant but keep earning interest until retirement (taxable); after retirement, emigration or death they become inoperative and stop earning; unclaimed money moves to the Senior Citizens’ Welfare Fund after seven years, claimable within 25.',
    source: SRC,
    asOf: '2025-12',
    topics: ['retirement', 'products'],
    keywords: ['EPF', 'provident fund', 'EPF contribution 12%', 'EPS', 'employee pension scheme', 'EPF interest', 'dormant EPF account', 'inoperative EPF'],
  },
  {
    id: 'xb-05-epf-withdrawals',
    title: 'EPF withdrawals and advances',
    principle:
      'Full withdrawal on retirement or after two months of unemployment (75% after one month, the rest after two; transfer it on rejoining work); the wait does not apply to women leaving work to marry. Partial advances: medical treatment of self or family at any time (six months’ basic plus DA or the employee share, whichever is lower); marriage of self, children or siblings and post-matric education, each up to 50% of the employee share after seven years; buying land or a house after five years (up to 24 or 36 months’ wages, once in a career); home-loan repayment after ten years; renovation after five years of owning the house; and up to 90% from age 54 within a year of retirement.',
    source: SRC,
    asOf: '2025-12',
    topics: ['retirement', 'products'],
    keywords: ['EPF withdrawal', 'PF advance', 'EPF for house', 'EPF for marriage', 'EPF unemployment withdrawal', 'withdraw PF after leaving job'],
  },
  {
    id: 'xb-05-epf-vpf-tax',
    title: 'EPF and VPF taxation',
    principle:
      'Employee contributions qualify under section 80C (old regime). Interest on the employee’s own EPF plus VPF contributions above 2.5 lakh a year is taxable (from April 2021). Employer contributions to EPF, NPS and superannuation combined above 7.5 lakh a year, plus returns on the excess, are taxed as a perquisite. Withdrawals after five years of continuous service (counting service with previous employers whose balances were transferred) are tax-free. Earlier withdrawals are taxable unless the job ended from ill health, closure of business or reasons beyond the employee’s control; above 50,000 TDS applies at 10% with PAN (maximum rate without) unless Form 15G or 15H is filed. So always transfer EPF when changing jobs. VPF lets employees add up to 100% of basic plus DA beyond the 12%, with no employer match, earning the EPF rate.',
    source: SRC,
    asOf: '2025-12',
    topics: ['retirement', 'tax'],
    keywords: ['EPF tax', 'PF interest taxable 2.5 lakh', 'VPF', 'voluntary provident fund', 'EPF withdrawal tax five years', 'employer contribution 7.5 lakh', 'transfer PF on job change'],
  },
  {
    id: 'xb-05-ppf',
    title: 'Public Provident Fund rules',
    principle:
      'PPF is a voluntary 15-year account at banks and post offices for residents (one per person, no joint accounts; parents may open for minors). Deposit 500 to 1.5 lakh a year, the cap covering your own and your minors’ accounts together. EEE: deposits deductible under 80C (old regime), interest and maturity tax-free, though interest must be reported. The government sets the rate quarterly; minors’ accounts earn the savings-account rate until 18, and excess or duplicate deposits earn nothing. NRIs cannot open new accounts; existing ones stopped earning interest from October 2024 and cannot be extended.',
    source: SRC,
    asOf: '2025-12',
    topics: ['retirement', 'products', 'tax'],
    keywords: ['PPF', 'public provident fund', 'PPF NRI', 'PPF minor account', 'PPF 1.5 lakh', 'PPF interest rate', 'PPF tax free'],
  },
  {
    id: 'xb-05-ppf-withdrawal-extension',
    title: 'PPF loans, withdrawals, extension and early closure',
    principle:
      'Loans run from the third to sixth year (up to 25% of the balance two years earlier). From the seventh year one withdrawal a year is allowed, the lower of 50% of the balance four years earlier or at the last year-end. After 15 years the account can be extended in five-year blocks with deposits (Form 4 within a year of maturity; up to 60% of the balance withdrawable over the block) or without deposits (the default; any amount once a year); the choice cannot be switched later, and deposits made under the wrong option earn nothing. Premature closure is allowed after five years for life-threatening illness of self or family, higher education of self or dependent children, or a change of residency.',
    source: SRC,
    asOf: '2025-12',
    topics: ['retirement', 'products'],
    keywords: ['PPF extension', 'PPF withdrawal rules', 'PPF loan', 'PPF premature closure', 'PPF after 15 years', 'PPF partial withdrawal'],
  },
  {
    id: 'xb-05-gratuity',
    title: 'Gratuity: eligibility, formula and tax',
    principle:
      'Gratuity rewards service, payable after five years of continuous service (earlier on death or disablement). For employers covered by the Payment of Gratuity Act (10 or more staff on any day in the past year, and once covered always covered): 15 x last monthly basic plus DA x years / 26, counting a part year over six months as a full year. On 60,000 basic for 20 years 7 months: 15 x 60,000 x 21 / 26 = about 7.26 lakh. Non-covered employers: 15 x salary x completed years / 30 (6 lakh in the same case, 20 years). Government employees’ gratuity is fully tax-free. For private employees the exemption is the lowest of 20 lakh, the formula amount and the actual gratuity; the excess is taxable salary.',
    source: SRC,
    asOf: '2025-12',
    topics: ['retirement', 'tax'],
    keywords: ['gratuity', 'gratuity formula', 'gratuity calculation', 'gratuity 15/26', 'gratuity tax exemption 20 lakh', 'Payment of Gratuity Act', 'five years gratuity'],
  },
  {
    id: 'xb-05-nps-structure',
    title: 'NPS: models, tiers and investment choice',
    principle:
      'The National Pension System is a market-linked defined-contribution scheme, portable across jobs, with no guaranteed return. Models: government (mandatory for central and state staff, who contribute 10% of basic plus DA), all-citizens (voluntary, ages 18 to 70) and corporate. Tier I is the restricted pension account (minimum 500 per contribution, 1,000 a year); Tier II is a voluntary account with free withdrawals and no tax benefit except for government staff. Assets: equity (E), corporate debt (C), government securities (G), alternatives (A, up to 5%, Tier I active choice only). Active choice caps equity at 75%. Auto choice uses life-cycle funds that cut equity with age: LC25, LC50, LC75 (starting at 25, 50 or 75% equity to 35 and falling to 5, 10 or 15% at 55) and an aggressive variant.',
    inPractice:
      'From October 2025 the Multiple Scheme Framework lets non-government subscribers hold several schemes (up to 100% equity in high-risk variants, 15-year vesting). Fund manager and scheme can be changed once a year and allocation four times a year.',
    source: SRC,
    asOf: '2025-12',
    topics: ['retirement', 'products'],
    keywords: ['NPS', 'national pension system', 'NPS tier 1', 'NPS tier 2', 'NPS active choice', 'NPS auto choice', 'life cycle fund', 'NPS equity limit 75%', 'multiple scheme framework'],
  },
  {
    id: 'xb-05-nps-exit',
    title: 'NPS withdrawals and exit (December 2025 rules)',
    principle:
      'Partial withdrawal: after three years, up to 25% of own contributions for children’s education or marriage, a home, medical treatment and similar needs, up to four times before 60 with four-year gaps (three-year gaps after 60); Tier II is unrestricted. Exit at 60, superannuation or after 15 years: non-government subscribers annuitise at least 20% (government 40%) and take the rest as a lump sum or systematic payouts; corpus up to 8 lakh can be taken fully; 8 to 12 lakh allows up to 6 lakh lump sum with the rest as annuity or payouts over at least six years. Exit before 60 and before 15 years: at least 80% must buy an annuity unless the corpus is 5 lakh or less. Those joining after 60 annuitise 20% (none if 12 lakh or less). On death the nominee takes everything. Withdrawals and annuity purchase can be deferred to 85.',
    source: SRC,
    asOf: '2025-12',
    topics: ['retirement', 'products'],
    keywords: ['NPS withdrawal', 'NPS exit rules', 'NPS annuity 20%', 'NPS lump sum', 'NPS partial withdrawal', 'NPS before 60', 'NPS 2025 changes'],
  },
  {
    id: 'xb-05-nps-tax',
    title: 'NPS tax treatment',
    principle:
      'Own Tier I contributions are deductible under 80CCD(1) within the 1.5 lakh 80C ceiling (capped at 10% of basic plus DA for employees, 20% of gross income for the self-employed), plus an extra 50,000 under 80CCD(1B); these are old-regime benefits. Employer contributions up to 14% of basic plus DA are deductible under 80CCD(2) (allowed in the new regime too) though counted in the 7.5 lakh employer-contribution cap. Growth is untaxed. At exit, up to 60% taken as lump sum is tax-free; annuity income is taxed at slab rates; partial withdrawals up to 25% of own contributions are tax-free. Hence NPS is described as exempt, exempt, partly taxable.',
    source: SRC,
    asOf: '2025-12',
    topics: ['retirement', 'tax'],
    keywords: ['NPS tax benefit', '80CCD(1B)', '80CCD(2)', 'NPS 50000 deduction', 'NPS employer contribution 14%', 'NPS lump sum tax free 60%', 'annuity taxable'],
  },
  {
    id: 'xb-05-ups-vatsalya-apy',
    title: 'UPS, NPS Vatsalya, Atal Pension Yojana and other retirement plans',
    principle:
      'The Unified Pension Scheme (from April 2025) is an irrevocable option for central government NPS staff (new joiners choose within 30 days): 10% employee contribution matched by the employer plus about 8.5% to a pool; it promises 50% of the last 12 months’ average basic after 25 years (proportionate from 10 years, minimum 10,000 a month), a lump sum of one-tenth of monthly pay per six months served, and 60% to the spouse after death, but nothing on dismissal or resignation. NPS Vatsalya lets parents open NPS for children under 18, converting to a normal account at 18. Atal Pension Yojana gives a government-guaranteed pension to unorganised-sector citizens aged 18 to 40 who do not pay income tax. Insurers offer deferred pension plans and annuities; mutual funds offer hybrid retirement schemes with at least a five-year lock-in or until retirement age.',
    source: SRC,
    asOf: '2025-12',
    topics: ['retirement', 'products'],
    keywords: ['UPS', 'unified pension scheme', 'NPS Vatsalya', 'NPS for children', 'Atal Pension Yojana', 'APY', 'retirement mutual fund', 'pension plan insurance'],
  },
  {
    id: 'xb-05-retirement-portfolio',
    title: 'Building and drawing a retirement portfolio',
    principle:
      'Advisers first manage the emotional side of retirement or retrenchment and help clients set goals and a lifestyle plan. A retirement portfolio weighs liquidity, safety, expected return, inflation protection, tax and social security; some retirees are very conservative and others want risk, so explain the risk-return trade-off. EPF, NPS, superannuation and gratuity form the salaried client’s core, with equity, debt and gold added to suit risk. In the distribution phase, prefer products that pay regular income with low risk to capital, since the corpus can rarely be rebuilt.',
    source: SRC,
    topics: ['retirement', 'asset-allocation'],
    keywords: ['retirement portfolio', 'post retirement investment', 'income in retirement', 'retiree asset allocation', 'distribution phase'],
  },
  {
    id: 'xb-05-annuities',
    title: 'Annuities and their payout options',
    principle:
      'An annuity is an insurance contract paying regular income for life or a set period, protecting mainly against outliving savings. Deferred annuities start more than a year after purchase (bought while working); immediate annuities start within a year, usually for a single premium. The rate is fixed at purchase for life. Options: life annuity without return of purchase price (highest income), life with return of purchase price to the nominee (lowest income), guaranteed for a set period (say 10 or 20 years) then for life, joint life continuing to the spouse, and increasing or inflation-linked variants. Annuity income is fully taxable; premiums may qualify for 80C.',
    source: SRC,
    topics: ['retirement', 'products', 'insurance', 'tax'],
    keywords: ['annuity', 'immediate annuity', 'deferred annuity', 'return of purchase price', 'joint life annuity', 'annuity tax', 'pension from annuity'],
  },
  {
    id: 'xb-05-swp-laddering',
    title: 'Retirement income from SWPs and bond or FD ladders',
    principle:
      'A systematic withdrawal plan sells mutual fund units on a schedule (fixed amount or appreciation only). Unlike FD interest it reduces units: 5,000 a month from 8,000 units sells 500 units at NAV 10 but only 250 at NAV 20, so falling NAVs eat units faster; unplanned withdrawals can drain the fund. Only the gain portion of each withdrawal is taxed: debt fund gains at slab rate (purchases from April 2023); equity fund gains at 20% within a year and 12.5% after, with 1.25 lakh of equity long-term gains a year exempt (from July 2024). Laddering splits money into bonds or FDs maturing in successive years (10 lakh into five 2 lakh FDs of 1 to 5 years), reinvesting each maturity at the long end; it averages out rate changes, provides yearly liquidity and can spread across banks.',
    source: SRC,
    asOf: '2025-12',
    topics: ['retirement', 'mutual-funds', 'bonds', 'tax'],
    keywords: ['SWP', 'systematic withdrawal plan', 'SWP tax', 'SWP vs FD', 'bond ladder', 'FD ladder', 'laddering', 'monthly income retirement'],
  },
  {
    id: 'xb-05-scss-pomis-pmvvy',
    title: 'SCSS, Post Office MIS and PMVVY',
    principle:
      'Senior Citizens’ Savings Scheme: residents 60+ (55 to 60 if retired, within a month of retirement benefits; defence retirees from 50), alone or jointly with a spouse; no HUFs or NRIs; 1,000 to 30 lakh; five years, extendable once by three; interest set quarterly, paid quarterly and fully taxable (TDS above 50,000); deposit deductible under 80C; early exit costs 1.5% of deposit in year two and 1% from years two to five. Post Office MIS: five years, 9 lakh single or 15 lakh joint, monthly interest (taxable), no withdrawal in the first year, 2% penalty before three years and 1% before five. PMVVY (LIC, 10-year pension for 60+, purchase price returned at maturity or death) closed to new investors after March 2023.',
    source: SRC,
    asOf: '2025-12',
    topics: ['retirement', 'products', 'bonds'],
    keywords: ['SCSS', 'senior citizen savings scheme', 'SCSS 30 lakh', 'post office monthly income scheme', 'POMIS', 'PMVVY', 'senior citizen investment'],
  },
  {
    id: 'xb-05-reverse-mortgage',
    title: 'Reverse mortgage for retirees',
    principle:
      'Rental property gives inflation-linked income but low yields and poor liquidity. A reverse mortgage turns a self-occupied home into income: citizens 60+ (a spouse 55+) owning an unencumbered home in India with at least 20 years of residual life, used as their main residence, receive periodic payments (capped at 50,000 a month; a lump sum up to 50% or 15 lakh for medical needs) for up to 20 years. They stay owners, never repay during life, and can prepay any time; the loan falls due when the last borrower dies or moves out, settled by selling the home or by heirs repaying. Receipts are tax-free under section 10(43). The reverse-mortgage-enabled annuity variant uses the loan to buy a lifetime annuity, including for the spouse, also tax-free.',
    source: SRC,
    asOf: '2025-12',
    topics: ['retirement', 'real-estate', 'debt'],
    keywords: ['reverse mortgage', 'reverse mortgage loan', 'RML', 'income from house in retirement', 'senior citizen home loan', 'RMLEA'],
  },
];
