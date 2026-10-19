import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-A',
  edition: '2025-06',
  chapter: 16,
  chapterTitle: 'Portfolio Performance Measurement and Evaluation',
};

export const XA_16: readonly KnowledgeEntry[] = [
  {
    id: 'xa-16-holding-period-return',
    title: 'Holding-period (point-to-point) return',
    principle:
      'Judging performance needs both return and risk; looking at return alone is the common mistake. The simplest return is the holding-period return: (income received + ending value - beginning value) / beginning value. A portfolio worth 1,00,000 that ends at 1,20,000 and paid 5,000 of dividends and interest earned 25%. It assumes income arrives at the end of the period, but it is the usual starting point.',
    source: SRC,
    asOf: '2025-06',
    topics: ['performance'],
    keywords: ['holding period return', 'HPR', 'point to point return', 'total return', 'absolute return'],
  },
  {
    id: 'xa-16-twrr-vs-mwrr',
    title: 'Time-weighted versus money-weighted return',
    principle:
      'Money-weighted return (MWRR) is the IRR of all contributions, withdrawals and the ending value, so it depends on when money went in: it shows what the investor actually earned. Time-weighted return (TWRR) strips out cash-flow timing: value the portfolio at every external flow, compute each sub-period return, add one to each, multiply them, then take the root for the number of years and subtract one. Same five years, rising yearly contributions: TWRR about 6.0% a year but MWRR about 15.2%, because most money arrived before the strong later years. SEBI requires discretionary portfolio managers to report TWRR; MWRR (XIRR) suits personal reporting where money flows in and out over years.',
    inPractice:
      'TWRR judges the manager; XIRR judges the investor’s own experience including their timing. When the two differ a lot, the investor’s timing of flows explains the gap.',
    source: SRC,
    asOf: '2025-06',
    topics: ['performance', 'pms-aif'],
    keywords: ['time weighted return', 'TWRR', 'money weighted return', 'MWRR', 'IRR', 'XIRR', 'chain linking', 'wealth relative', 'PMS performance reporting'],
  },
  {
    id: 'xa-16-geometric-vs-arithmetic',
    title: 'Geometric versus arithmetic average return',
    principle:
      'The arithmetic mean simply averages yearly returns; it is the best single-year estimate. The geometric mean compounds them and depends only on start and end values, so it shows what wealth really did over many years. A fall of 50% then a rise of 100% averages 25% arithmetically, yet the money is back where it started: geometric return 0%. Two years of 10% give 10% both ways. Over more than one period the geometric mean is always below the arithmetic one unless every year’s return is identical, and the gap widens with volatility.',
    source: SRC,
    asOf: '2025-06',
    topics: ['performance', 'risk'],
    keywords: ['geometric mean return', 'arithmetic mean return', 'compound return', 'volatility drag', 'average return'],
  },
  {
    id: 'xa-16-cagr-annualising',
    title: 'CAGR and annualising returns',
    principle:
      'CAGR = (ending value / starting value)^(1 / years) - 1, assuming all income is reinvested. Returns over several periods are annualised the same way: link (1 + each period’s return), raise the product to one over the number of years, subtract one. Returns of 15.5%, 9.5% and -6.9% over three years annualise to about 5.6%, not their simple average of about 6%. Periods shorter than a year should not be annualised into misleading headline numbers.',
    source: SRC,
    asOf: '2025-06',
    topics: ['performance'],
    keywords: ['CAGR', 'compounded annual growth rate', 'annualised return', 'annualizing return'],
  },
  {
    id: 'xa-16-gross-net-tax',
    title: 'Gross versus net, pre-tax versus post-tax return',
    principle:
      'Gross return is before fees, expenses and commissions; net return is after them and is what the investor keeps. In a PMS-style example, a 20% gross year, after 0.5% other expenses, a 1.5% fixed fee, a 20% performance fee above a 10% hurdle and a 2% exit load, nets about 13.9%. To get the post-tax figure, multiply by (1 - tax rate): 5% pre-tax at a 15% tax rate is 4.25%. Products are quoted pre-tax because investors’ brackets differ, but decisions should rest on post-tax, post-cost returns.',
    source: SRC,
    asOf: '2025-06',
    topics: ['performance', 'costs', 'tax'],
    keywords: ['gross return', 'net return', 'post tax return', 'pre tax return', 'fee drag', 'performance fee impact'],
  },
  {
    id: 'xa-16-cash-drag-portfolio-return',
    title: 'Cash drag and portfolio return',
    principle:
      'Return must be measured on all the money the client gave, not only the part invested. If 75 of 100 lakh goes into equity that earns 10% and 25 lakh sits in a liquid fund at 4%, the portfolio made 8.5%, not 10%. More generally, a portfolio’s return is the weighted average of its holdings’ returns, using their weights in the portfolio.',
    source: SRC,
    asOf: '2025-06',
    topics: ['performance'],
    keywords: ['cash drag', 'uninvested cash', 'portfolio return', 'weighted average return'],
  },
  {
    id: 'xa-16-alpha-beta-return',
    title: 'Splitting return into risk-free, beta and alpha',
    principle:
      'Using CAPM, required return = risk-free rate + beta x (market return - risk-free rate). Beta return rewards market risk; alpha (Jensen’s alpha) is actual return minus that required return and rewards skill or non-market risk. Example: portfolio 25%, market 15%, risk-free 5%, beta 1.5: required = 5 + 1.5 x 10 = 20%, so alpha is 5%. Some practitioners loosely call the simple excess over the benchmark (here 10%) the alpha.',
    source: SRC,
    asOf: '2025-06',
    topics: ['performance', 'portfolio-theory'],
    keywords: ['alpha', 'Jensen alpha', 'beta return', 'CAPM', 'required return', 'excess return over benchmark'],
  },
  {
    id: 'xa-16-risk-measures',
    title: 'Measuring risk: standard deviation, downside risk, beta, tracking error',
    principle:
      'Total risk is the variability of returns, measured by variance or standard deviation, usable for any kind of portfolio. Downside risk counts only bad outcomes: semi-variance looks at returns below the mean (target semi-variance below a chosen target); it adds little when returns are symmetric. Portfolio risk is not the weighted average of holdings’ risks; it depends on correlations, and lower correlation means lower risk. Systematic (market) risk from rates, currencies and the economy cannot be diversified away, only hedged, and is measured by beta; unsystematic (company or sector) risk can be diversified away. Portfolio beta is the weighted average of holdings’ betas: 60% at 1.2 and 40% at 1.1 gives 1.16. Beta above 1 means more volatile than the index. Liquidity and credit risk matter too.',
    source: SRC,
    asOf: '2025-06',
    topics: ['performance', 'risk', 'diversification'],
    keywords: ['standard deviation', 'semi variance', 'downside risk', 'beta', 'portfolio beta', 'systematic risk', 'unsystematic risk', 'liquidity risk', 'credit risk'],
  },
  {
    id: 'xa-16-tracking-error',
    title: 'Tracking error and tracking difference',
    principle:
      'Tracking error is the standard deviation of the gap between the portfolio’s returns and its benchmark’s, always measured against the total-return index (which includes dividends). The lower it is, the more closely the portfolio follows the index; it arises mainly when the portfolio’s risk profile differs from the benchmark’s. Tracking difference is the simpler point-to-point gap between fund return and index return over a period.',
    source: SRC,
    topics: ['performance', 'risk', 'mutual-funds'],
    keywords: ['tracking error', 'tracking difference', 'index fund tracking', 'total return index', 'active risk'],
  },
  {
    id: 'xa-16-sharpe-treynor',
    title: 'Sharpe and Treynor ratios',
    principle:
      'Sharpe ratio = (portfolio return - risk-free rate) / standard deviation: excess return per unit of total risk, using annualised figures for the same period. Return 10.5%, risk-free 5.5%, standard deviation 6.5% gives about 0.77. Treynor ratio divides the same excess return by beta instead (beta 1 gives 5.0 percentage points per unit of market risk). Higher is better for both. For a fully diversified portfolio the two rank funds alike; when they disagree, the difference is diversification, since Treynor ignores unsystematic risk. Use Sharpe when the portfolio is most of the investor’s wealth or not well diversified; Treynor when it is one part of an already diversified whole.',
    source: SRC,
    asOf: '2025-06',
    topics: ['performance', 'risk'],
    keywords: ['Sharpe ratio', 'Treynor ratio', 'risk adjusted return', 'reward to variability', 'reward to volatility', 'excess return per unit risk'],
  },
  {
    id: 'xa-16-sortino-information-m2',
    title: 'Sortino, information ratio and M-squared',
    principle:
      'Sortino ratio = excess return over the risk-free rate / semi (downside) standard deviation, for investors who see risk as the chance of loss. Information (appraisal) ratio = (portfolio return - benchmark return) / tracking error: active return per unit of active risk, a test of whether alpha came from skill or chance. Modigliani’s M-squared levers or de-levers the portfolio with T-bills to match the market’s volatility, then compares returns directly. Example: portfolio 35% with 42% volatility, market 28% with 30%, T-bills 6%: holding 30/42 in the portfolio and the rest in T-bills gives about 26.7%, below the market, so the manager underperformed on a risk-matched basis.',
    source: SRC,
    asOf: '2025-06',
    topics: ['performance', 'risk'],
    keywords: ['Sortino ratio', 'information ratio', 'appraisal ratio', 'active return', 'active risk', 'M squared', 'M2', 'Modigliani'],
  },
  {
    id: 'xa-16-benchmarks-peer-groups',
    title: 'Benchmarks, custom benchmarks and peer-group comparison',
    principle:
      'Evaluation is relative: did the manager beat what a passive index would have given, and justify the fees? GIPS describes a benchmark as an independent yardstick for the strategy. A good one has clearly defined constituents and weights, is investable, matches the portfolio’s style and risk-return profile, and is measurable. When no market index fits, a custom benchmark built from the manager’s investment universe can be used, at higher cost. Common errors: an unrepresentative benchmark, not changing it after a style change, a hard-to-replicate or unstable index, and using a price index where a total-return index is needed. Peer-group (managers’ universe) analysis ranks similar portfolios, often against the median, on a risk-adjusted measure.',
    source: SRC,
    topics: ['performance'],
    keywords: ['benchmark', 'good benchmark criteria', 'GIPS', 'customised benchmark', 'benchmarking errors', 'peer group analysis', 'managers universe', 'total return index'],
  },
  {
    id: 'xa-16-attribution',
    title: 'Performance attribution: allocation, selection, timing',
    principle:
      'Attribution splits return into what the benchmark delivered and the difference, then asks whether the difference was skill or luck. Allocation effect: being overweight sectors or asset classes that beat the benchmark and underweight laggards. Selection effect: picking securities that beat their peers or avoiding weak ones. Market timing is anticipating market moves; studies mostly find it does not explain superior results, while evidence on selectivity is mixed. Fama’s net selectivity is the fund’s excess return over the risk-free rate minus what its total risk would have earned in the market.',
    source: SRC,
    topics: ['performance', 'market-timing'],
    keywords: ['performance attribution', 'allocation effect', 'selection effect', 'market timing', 'selectivity', 'Fama net selectivity', 'skill or luck'],
  },
  {
    id: 'xa-16-currency-return',
    title: 'Currency effect on foreign investments',
    principle:
      'An Indian investor in foreign assets earns the asset’s local return plus or minus the rupee’s move. 50 lakh put into a US fund at 70 rupees per dollar that gains 15%, with the rupee strengthening to 65, returns about 6.8% in rupees, not 15%. Usually the rupee weakens, which adds to returns: part of gold’s rupee return, for example, is rupee depreciation.',
    source: SRC,
    asOf: '2025-06',
    topics: ['performance', 'risk'],
    keywords: ['currency risk', 'foreign investment return', 'rupee depreciation', 'rupee appreciation', 'international fund return'],
  },
];
