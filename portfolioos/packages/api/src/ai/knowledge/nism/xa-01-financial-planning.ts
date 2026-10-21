import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-A',
  edition: '2025-06',
  chapter: 1,
  chapterTitle: 'Introduction to Personal Financial Planning',
};

export const XA_01: readonly KnowledgeEntry[] = [
  {
    id: 'xa-01-what-financial-planning-is',
    title: 'Financial planning aligns income, expenses, assets and debts to goals',
    principle:
      'Financial planning makes sure a household has the resources for today’s spending and tomorrow’s needs: periods of low or no income such as retirement, unbudgeted shocks such as a large medical bill, and big future costs such as education or a home. It sets aside part of current income as savings, invests it in assets matched to those needs, and reviews progress. It is holistic: existing position, future needs, a funding process and periodic review.',
    inPractice:
      'For a sole earner the first questions are always: is there an emergency fund, enough life cover, enough health cover, and is the saving rate enough for the named goals?',
    source: SRC,
    topics: ['planning'],
    keywords: ['financial planning', 'financial plan', 'holistic', 'goals', 'household finances', 'sole earner'],
  },
  {
    id: 'xa-01-planning-vs-advice',
    title: 'How financial planning differs from ordinary financial advice',
    principle:
      'Financial planning is client-centred and comprehensive (retirement, insurance, investment, estate), puts goals at the centre, checks that every action fits the others (for example total equity exposure across all holdings), builds in monitoring, weighs risk as well as return, and is continuous. Product or transaction advice usually addresses one need, may ignore conflicts with other goals, may chase return without risk, and is often one-off.',
    source: SRC,
    topics: ['planning'],
    keywords: ['financial planner role', 'comprehensive', 'piecemeal advice', 'monitoring', 'continuity', 'equity exposure'],
  },
  {
    id: 'xa-01-smart-goals',
    title: 'Good goals are specific, measurable, realistic and time-bound',
    principle:
      '"I want to be rich" is not a goal; "a retirement corpus of a stated amount in 20 years" is. A goal needs a specific target, a measurable amount, realism against what the client can actually save, and a date. Because savings are limited, goals must be ranked: important goals (children’s education, retirement, clearing expensive debt) come before consumption goals (holidays, a luxury car). Using a windfall to repay credit-card debt improves the position even though it creates no asset.',
    inPractice:
      'Ask "how much, by when, and for what?" for every goal before suggesting any product.',
    source: SRC,
    asOf: '2025-06',
    topics: ['goals', 'planning'],
    keywords: ['goal setting', 'SMART goals', 'specific', 'measurable', 'realistic', 'time-bound', 'prioritise goals', 'goal priority'],
  },
  {
    id: 'xa-01-retirement-not-enough',
    title: 'Retirement gets postponed because it seems far away',
    principle:
      'Long-term goals like retirement lose out to urgent short-term wants because they seem to have time on their side, but each year of delay forfeits compounding and shrinks the final corpus. Clients often assume provident fund, superannuation and gratuity will be enough; frequently they are not. Every client needs a retirement plan, and the adviser should show the shortfall in numbers.',
    source: SRC,
    topics: ['retirement', 'goals', 'compounding'],
    keywords: ['retirement planning', 'provident fund', 'gratuity', 'superannuation', 'delay', 'retirement corpus', 'shortfall'],
  },
  {
    id: 'xa-01-staggering-goals',
    title: 'Defer or reshape a goal rather than abandon it',
    principle:
      'When the money does not support every goal on time, push a flexible goal back (buy the house in three years, not one) or scale it down (a shorter, cheaper holiday in the year of the home purchase) so critical goals are not compromised. Goals with a fixed date, such as a child’s education at the normal age, cannot move; prudent borrowing can bridge a shortfall there.',
    source: SRC,
    topics: ['goals', 'planning', 'debt'],
    keywords: ['defer goal', 'postpone goal', 'stagger goals', 'fixed date goal', 'down payment', 'education loan'],
  },
  {
    id: 'xa-01-cash-flow-budget',
    title: 'A dated budget prevents cash-flow mismatches',
    principle:
      'A household can spend less than it earns and still run short if big outflows come before inflows; without a reserve that forces costly short-term borrowing, eating into savings. A budget lists every inflow and outflow with its amount and its date, so one look shows whether income is managed and savings are happening. Everyone should keep a personal budget.',
    source: SRC,
    topics: ['savings', 'planning'],
    keywords: ['budget', 'budgeting', 'cash flow', 'cash flow management', 'mismatch', 'monthly budget', 'reserve'],
  },
  {
    id: 'xa-01-scope-of-planning',
    title: 'The parts of a financial plan',
    principle:
      'A complete plan covers: personal financial analysis and goal setting; cash-flow management and budgeting; insurance planning (life, health, accident, property: estimating the loss and choosing cover); debt management (what may be funded by loans, how much, repayment, protecting the credit score, counselling out of debt traps); investment planning and asset allocation (top-down: how much in each asset class for the required return within the risk the client can take, not stock picking); tax planning (post-tax returns, but tax should not drive decisions); retirement planning; and estate planning (transfer of wealth through gifts, wills and other tools).',
    source: SRC,
    topics: ['planning', 'asset-allocation', 'insurance', 'debt', 'tax', 'retirement', 'estate'],
    keywords: ['scope of financial planning', 'insurance planning', 'debt management', 'investment planning', 'tax planning', 'estate planning', 'top-down'],
  },
  {
    id: 'xa-01-assets-liabilities-net-worth',
    title: 'Assets, liabilities and net worth',
    principle:
      'Savings are invested in assets: physical assets (property, gold) that hedge inflation and grow but are illiquid, lightly regulated, lumpy and need expertise; and financial assets (deposits, shares, bonds, funds), which are claims on a benefit, standardised, regulated, more transparent and divisible. A car is consumption, not an investment. Loans create liabilities that are a charge on future income: borrowing for an appreciating asset can build wealth, borrowing to buy volatile financial assets (leverage) is risky. Net worth = assets minus liabilities, tracked periodically.',
    source: SRC,
    topics: ['planning', 'debt', 'real-estate'],
    keywords: ['net worth', 'assets', 'liabilities', 'physical assets', 'financial assets', 'leverage', 'appreciating asset', 'depreciating asset'],
  },
  {
    id: 'xa-01-six-step-process',
    title: 'The six-step financial planning process',
    principle:
      'Financial planning follows six steps: (1) establish and define the client-adviser relationship and scope; (2) gather client data including goals; (3) analyse and evaluate the financial position; (4) develop and present recommendations; (5) implement them; (6) monitor and revise. Financing investments is not one of the steps.',
    source: SRC,
    topics: ['planning'],
    keywords: ['financial planning process', 'six steps', 'client data', 'recommendations', 'implement', 'monitor', 'establish relationship'],
  },
  {
    id: 'xa-01-advice-vs-distribution',
    supersededBy: 'sebi-ia-segregation',
    title: 'Advisers are paid by clients; distributors by product makers',
    principle:
      'A seller paid commission by the product maker has a conflict of interest that can lead to mis-selling. Indian regulation separates advice from distribution: anyone giving financial advice for consideration must register with SEBI as an Investment Adviser and may not earn from product makers. Individual advisers must choose either advice or distribution, not both; non-individual advisers must segregate the two at client level across the group and keep advice at arm’s length in a separate division. Individual advisers may offer execution only through direct plans, with no consideration earned at group or family level.',
    source: SRC,
    asOf: '2025-06',
    topics: ['regulation', 'ethics'],
    keywords: ['conflict of interest', 'mis-selling', 'commission', 'fee-only', 'distributor', 'SEBI registered investment adviser', 'RIA', 'segregation', 'direct plan', 'execution'],
  },
  {
    id: 'xa-01-business-models',
    title: 'Business models for delivering advice',
    principle:
      'Fee-only advisers charge the client (one-time plan fee, review fees, asset-based fee as a percentage of assets advised, portfolio construction fees) and usually leave execution to others so commissions cannot colour the advice. Execution-only distributors earn commissions from products and may execute another adviser’s recommendations; aggregators bundle many distributors with shared research, platforms and software for a revenue share. Wraps and platforms offer standardised model portfolios with technology for execution, monitoring and reporting, sharing fees with the adviser.',
    source: SRC,
    topics: ['regulation', 'costs'],
    keywords: ['fee-only adviser', 'asset-based fee', 'execution only', 'aggregator', 'wrap', 'platform', 'model portfolio', 'business model'],
  },
];
