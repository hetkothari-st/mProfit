import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-A',
  edition: '2025-06',
  chapter: 3,
  chapterTitle: 'Evaluating the Financial Position of Clients',
};

export const XA_03: readonly KnowledgeEntry[] = [
  {
    id: 'xa-03-household-budget-order',
    title: 'Building a household budget: income, then mandatory, essential, discretionary',
    principle:
      'List regular and definite income; deduct mandatory expenses (taxes, loan EMIs, compulsory PF/NPS contributions) to get disposable income; deduct essential living costs (groceries, rent, fees, utilities, transport); deduct discretionary spending (entertainment, lifestyle). What remains is savings. Monthly surplus in hand is computed after mandatory deductions; adding back PF and NPS contributions gives true savings. Savings should be a target, not a leftover: decide the amount the goals need and pay it first, by automatic transfer.',
    inPractice:
      'When savings fall short, look first at discretionary items, then at loan EMIs (debt rationalisation); income rarely expands on demand.',
    source: SRC,
    topics: ['savings', 'planning'],
    keywords: ['household budget', 'mandatory expenses', 'essential expenses', 'discretionary expenses', 'disposable income', 'surplus', 'pay yourself first'],
  },
  {
    id: 'xa-03-cash-management',
    title: 'Cash management: the budget must work in actual cash, on actual dates',
    principle:
      'A budget can show a surplus while cash runs short, for example when part of the salary is unclaimed reimbursements or when big bills fall early in the month before income arrives. Keep a working buffer in the bank, separate from the emergency fund (which covers loss of income), to absorb timing mismatches and avoid costly short-term borrowing.',
    source: SRC,
    topics: ['savings', 'emergency-fund'],
    keywords: ['cash management', 'cash flow timing', 'buffer', 'reimbursement', 'cash crunch', 'working balance'],
  },
  {
    id: 'xa-03-income-expenditure-statement',
    title: 'Income and expenditure statement versus cash statement',
    principle:
      'An income and expenditure statement records income earned and expenses incurred in a period whether or not cash has moved (accrual basis): salary for March counts in March even if paid on 1 April, and a credit-card purchase counts when made, not when the bill is paid. It shows the true surplus and where money goes, and is compared with the budget to find deviations.',
    source: SRC,
    topics: ['savings', 'planning'],
    keywords: ['income and expenditure statement', 'accrual', 'cash statement', 'actual vs budget', 'credit card expense'],
  },
  {
    id: 'xa-03-forecasting-monitoring',
    title: 'Forecast, monitor, correct',
    principle:
      'Forecasting projects income and spending from a stated basis and assumptions that are revisited as conditions change; experience and expert input improve it. A budget is only useful if actuals are recorded and compared: a line that keeps overshooting (say transport budgeted at 4,000 but running at 6,000) means either the budget or the behaviour must change. Mid-month reviews are possible with regular record-keeping.',
    source: SRC,
    asOf: '2025-06',
    topics: ['savings', 'planning'],
    keywords: ['forecasting', 'budget monitoring', 'variance', 'actual vs budget', 'review'],
  },
  {
    id: 'xa-03-raising-savings',
    title: 'Closing a large savings gap step by step',
    principle:
      'If actual savings are far below what goals require, raise them in stages: set a modest target increase (for example ten percent more), then a further one once reached; cut wasteful and discretionary spending; send lump sums such as bonuses straight to savings; and do not let pay rises be absorbed by new spending.',
    source: SRC,
    asOf: '2025-06',
    topics: ['savings', 'goals'],
    keywords: ['increase savings', 'savings gap', 'step up', 'bonus', 'lifestyle inflation', 'pay rise'],
  },
  {
    id: 'xa-03-budget-steps',
    title: 'Steps to create a budget and savings plan',
    principle:
      'Gather every income and expense head and recheck that none is missed; base figures on past actuals or expected changes; adjust for seasonal or one-off months; include a contingency line; set the savings figure the goals need and reach it by curbing expenses within limits; and allocate savings first through automatic transfers so they are a fixed line, not what is left over.',
    source: SRC,
    topics: ['savings', 'planning'],
    keywords: ['create budget', 'savings plan', 'contingency', 'automatic transfer', 'seasonal expenses'],
  },
  {
    id: 'xa-03-personal-balance-sheet',
    title: 'Personal balance sheet: position on a date',
    principle:
      'A personal balance sheet lists assets (property, car, investments, PPF, bank balances) and liabilities (home loan, other loans, credit-card dues) on a given date; net worth is the difference. Total assets can look impressive while net worth is small because assets were bought with loans still outstanding; net worth is the figure that matters and should be tracked over time.',
    source: SRC,
    topics: ['planning', 'debt'],
    keywords: ['balance sheet', 'personal balance sheet', 'net worth', 'assets', 'liabilities'],
  },
  {
    id: 'xa-03-contingency-planning',
    title: 'Contingency planning and the emergency fund',
    principle:
      'Provide for: death of an earner (life insurance), medical costs (health insurance), job loss (two incomes help), and loss of income generally through an emergency fund, which is the first goal to save for. It should cover about six months of expenses, held in liquid assets; with secure income it can be laddered, around three months liquid and the rest in less liquid but higher-yielding assets. Replenish it after use, and review it yearly or when a large new commitment such as an EMI is added.',
    inPractice:
      'Count the EMI in monthly expenses when sizing the fund: six months of expenses means six months of EMIs too.',
    source: SRC,
    topics: ['emergency-fund', 'insurance', 'planning'],
    keywords: ['emergency fund', 'contingency', 'six months expenses', 'liquid', 'laddered emergency fund', 'replenish', 'job loss'],
  },
  {
    id: 'xa-03-holding-pattern-couples',
    title: 'Holding patterns for couples',
    principle:
      'Spread the family’s assets and liabilities sensibly between spouses: alternate first and joint holders across investments, or hold each investment in the name of the partner whose income funded it. Keeping each partner’s salary account for investments and a separate joint account for household spending simplifies monitoring, investment records and tax records. A home can be bought as joint owners and joint borrowers. (Pre-nuptial agreements are not established law in India.)',
    source: SRC,
    topics: ['planning', 'tax', 'estate'],
    keywords: ['joint holding', 'first holder', 'couple finances', 'joint account', 'joint home loan', 'spouse', 'clubbing'],
  },
  {
    id: 'xa-03-savings-expense-ratio',
    title: 'Savings ratio and expense ratio',
    principle:
      'Savings ratio = savings in the year / annual income. Savings include everything invested in the year (FDs, funds, PPF, NSC, gold, property) and amounts not received in hand such as employer and employee PF and superannuation contributions; income includes salary or business income plus interest, dividends and rent. Expense ratio = annual recurring expenses / annual income = 1 - savings ratio. One-off expenses are left out, but recurring lumpy ones are annualised (a holiday costing 4.5 lakh every three years counts as 1.5 lakh a year).',
    source: SRC,
    asOf: '2025-06',
    topics: ['savings', 'planning'],
    keywords: ['savings ratio', 'expense ratio', 'savings rate', 'PF contribution', 'recurring expenses', 'annualise'],
  },
  {
    id: 'xa-03-savings-to-income',
    title: 'Accumulated savings to income: a readiness gauge by age',
    principle:
      'Total accumulated savings (current value of investments and PF, net of loans taken to buy them, excluding the self-occupied home) divided by annual income shows preparedness for long-term goals like retirement. It is naturally low when young and should rise with age; a common guide is at least three times annual income by the early forties, which means stepping up the saving rate as income grows.',
    source: SRC,
    asOf: '2025-06',
    topics: ['savings', 'retirement'],
    keywords: ['savings to income ratio', 'accumulated savings', 'retirement readiness', 'three times income', 'age 40'],
  },
  {
    id: 'xa-03-leverage-solvency-net-worth',
    title: 'Leverage, solvency and net worth ratios',
    principle:
      'Leverage ratio = total liabilities / total assets; solvency ratio = net worth / total assets = 1 - leverage. Net worth = total assets - total liabilities and must be positive; a leverage ratio above 1 means assets cannot cover debts. Leverage spikes right after a loan-funded purchase and eases as the asset appreciates; judge it alongside the ability to service debt, and never combine a risky investment with heavy borrowing. A conservative view of assets for goals excludes personal jewellery, the family home and personal-use assets like a car. Worked figure: assets 80 lakh, liabilities 20 lakh gives leverage 25%, solvency 75%, net worth 60 lakh.',
    source: SRC,
    asOf: '2025-06',
    topics: ['debt', 'planning'],
    keywords: ['leverage ratio', 'solvency ratio', 'net worth', 'total assets', 'total liabilities', 'debt to assets'],
  },
  {
    id: 'xa-03-liquidity-ratio',
    title: 'Liquid assets and the liquidity ratio',
    principle:
      'Liquid assets can be turned into cash quickly at a predictable value: savings balances, FDs maturing within six months, liquid funds and similar. Shares and equity or even debt funds are encashable but their values swing, and closed-end funds and property are slow to realise, so they are excluded. Liquidity ratio = liquid assets / monthly expenses (including EMIs); four to six (months) is comfortable. Too much liquidity costs return, so hold enough and invest the rest for the long term. Liquid assets to net worth should be low when goals are far off and higher as goals approach.',
    inPractice:
      'Worked figure: savings 3 lakh + short FD 1 lakh + liquid fund 2 lakh = 6 lakh of liquid assets against 1 lakh monthly spend gives a ratio of 6.',
    source: SRC,
    asOf: '2025-06',
    topics: ['emergency-fund', 'planning'],
    keywords: ['liquidity ratio', 'liquid assets', 'emergency fund months', 'liquid assets to net worth', 'closed-end fund', 'shares not liquid'],
  },
  {
    id: 'xa-03-financial-assets-ratio',
    title: 'Financial assets ratio',
    principle:
      'Financial assets ratio = financial assets (shares, bonds, deposits, PPF, mutual funds) / total assets (financial plus physical such as land, gold, jewellery). Financial assets are more liquid, flexible and convenient, and suit small regular investing; a higher share is preferable as goals near and income or cash is needed. Worked figure: 30 lakh financial out of 50 lakh total is 60%.',
    source: SRC,
    asOf: '2025-06',
    topics: ['planning', 'asset-allocation'],
    keywords: ['financial assets ratio', 'physical assets', 'gold', 'land', 'financial vs physical'],
  },
  {
    id: 'xa-03-debt-to-income',
    title: 'Debt-to-income ratio: can income carry the loans?',
    principle:
      'Debt-to-income = monthly debt servicing (all principal and interest due to lenders) / monthly income. Lenders use it to judge eligibility. Above roughly 35 to 40% is excessive: regular expenses and saving get squeezed, new loans in an emergency become hard to get, and any income dip causes stress. All personal ratios should be recomputed at least yearly and compared with past values; benchmarks are guides to be tailored.',
    source: SRC,
    asOf: '2025-06',
    topics: ['debt'],
    keywords: ['debt to income ratio', 'DTI', 'EMI to income', 'FOIR', 'loan eligibility', '40 percent'],
  },
];
