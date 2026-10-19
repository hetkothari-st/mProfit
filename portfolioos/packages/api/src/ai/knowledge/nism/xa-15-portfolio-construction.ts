import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-A',
  edition: '2025-06',
  chapter: 15,
  chapterTitle: 'Portfolio Construction Process',
};

export const XA_15: readonly KnowledgeEntry[] = [
  {
    id: 'xa-15-asset-allocation-importance',
    title: 'Asset allocation drives most of the outcome',
    principle:
      'Asset allocation decides how wealth is split across asset classes (equity, bonds, cash; with sub-classes such as large, mid and small cap or government, corporate and junk bonds). It matters more than individual security selection. Brinson, Hood and Beebower (1986) found target allocation explained most of a diversified portfolio’s return variability over time; Ibbotson and Kaplan (2000) found it explains about 90% of a single fund’s return variation over time and about 40% of the differences in returns across funds.',
    source: SRC,
    asOf: '2025-06',
    topics: ['asset-allocation', 'portfolio-theory'],
    keywords: ['asset allocation', 'Brinson Hood Beebower', 'Ibbotson Kaplan', '90 percent', 'importance of asset allocation', 'security selection'],
  },
  {
    id: 'xa-15-correlation-across-classes',
    title: 'Correlation across and within asset classes',
    principle:
      'Correlation runs from -1 (perfectly opposite) to +1 (perfectly together). Assets in the same class share drivers and are highly correlated; different classes usually less so, which is where diversification gains come from. Correlations shift over time and across economic regimes, so allocation should not rely only on past correlations.',
    source: SRC,
    topics: ['diversification', 'asset-allocation', 'portfolio-theory'],
    keywords: ['correlation', 'correlation coefficient', 'diversification', 'asset class correlation', 'regime change'],
  },
  {
    id: 'xa-15-portfolio-process-ips',
    title: 'The portfolio management process and the investment policy statement',
    principle:
      'The process runs plan, execute, evaluate: write an investment policy statement (IPS); study current conditions and forecasts; construct the portfolio; measure and evaluate performance; review periodically and rebalance. The IPS is the road map: goals and priorities, objectives with horizons, risk and return profile, liquidity needs, preferred and excluded asset classes, constraints, benchmarks, rebalancing policy, reporting and review. It sets realistic expectations, guides the manager, provides a yardstick for evaluating the manager, and protects the investor against inappropriate or unethical decisions; it is the basis for strategic asset allocation and must be updated as circumstances change.',
    source: SRC,
    topics: ['planning', 'asset-allocation'],
    keywords: ['investment policy statement', 'IPS', 'portfolio management process', 'plan execute evaluate', 'review'],
  },
  {
    id: 'xa-15-objectives-constraints',
    title: 'Investment objectives and constraints',
    principle:
      'Objectives are framed as risk, return and liquidity, typically capital preservation (tilt to safe debt), regular income (dividend stocks, bonds, rental property) or capital appreciation (equity). Risk and return move together; illiquidity earns a premium. Constraints: liquidity (an emergency reserve, often two to three months’ spending or more if income is volatile; money for goals within a year in liquid low-risk assets; flexibility to seize opportunities), regulatory (LRS cap of USD 250,000 a year for residents, a ban on insider trading), tax (different treatment of income and gains and by tax bracket), time horizon, and unique preferences such as excluding harmful industries or reluctance to sell the employer’s stock. Sector, issuer and asset-class exposure limits guard against concentration (PMS agreements must state the investment approach).',
    source: SRC,
    asOf: '2025-06',
    topics: ['planning', 'asset-allocation', 'regulation'],
    keywords: ['investment objectives', 'capital preservation', 'regular income', 'capital appreciation', 'liquidity constraint', 'tax constraint', 'regulatory constraint', 'LRS', 'exposure limits', 'concentration risk'],
  },
  {
    id: 'xa-15-esg-ethical',
    title: 'Sustainable (ESG) and ethical investing',
    principle:
      'Sustainable investing weighs environmental (pollution, water use, clean technology), social (workplace safety, community, human rights) and governance (board independence and diversity, executive pay) criteria alongside returns, often expecting better long-term resilience. Ethical investing is more personal: it screens by the investor’s own moral rules, typically excluding "sin" sectors such as gambling, alcohol, tobacco and firearms.',
    source: SRC,
    topics: ['ethics', 'equity'],
    keywords: ['ESG', 'sustainable investing', 'ethical investing', 'sin stocks', 'governance', 'socially responsible investing'],
  },
  {
    id: 'xa-15-goal-sheet',
    title: 'Assessing needs: priorities and horizons decide the vehicle',
    principle:
      'List every goal with its priority, date and amount. Near-term, high-priority goals belong in cash equivalents or fixed income maturing on the goal date, because missing them hurts too much. Long-term, high-priority goals such as retirement suit diversified multi-asset portfolios given the time to recover from dips. Low-priority wants (a farmhouse, a luxury car) can take more aggressive approaches since missing them is tolerable.',
    source: SRC,
    topics: ['goals', 'asset-allocation'],
    keywords: ['goal sheet', 'goal priority', 'time horizon', 'near term goal', 'long term goal', 'goal based investing'],
  },
  {
    id: 'xa-15-psychographic-bbk',
    title: 'Psychographic profiling: the BB&K five personalities',
    principle:
      'Personal financial statements (net worth and income-expenditure) give the numbers; psychographic analysis adds personality. The Bailard, Biehl and Kaiser model uses two axes, confident versus anxious and careful versus impetuous. Adventurers (confident, impetuous) make big concentrated bets, often entrepreneurs who rarely use advisers. Celebrities (anxious, impetuous) chase whatever is hot, fear missing out and are hard to advise. Individualists (confident, careful) research for themselves, avoid extreme volatility and are often contrarian. Guardians (anxious, careful), often near retirement, seek to preserve wealth. Straight arrows sit in the centre, balanced and medium-risk. Recent experience can push anyone temporarily toward another type.',
    source: SRC,
    topics: ['risk-profiling', 'behaviour'],
    keywords: ['psychographic', 'BB&K', 'Bailard Biehl Kaiser', 'adventurer', 'celebrity', 'individualist', 'guardian', 'straight arrow', 'investor personality'],
  },
  {
    id: 'xa-15-life-cycle',
    title: 'Life-cycle stages of an investor',
    principle:
      'Accumulation (early career): small net worth relative to debts, few undiversified investments, goals like education and a home; a long horizon and rising income allow higher-risk growth assets. Consolidation (mid to late career): income exceeds spending, portfolios are built up, and some capital preservation begins while still holding growth assets 15 to 20 years before retirement. Spending (decumulation): living off investments, prioritising stable income from dividends, interest and rent, but keeping some growth and inflation hedges because retirement can last 15 to 20 years or more. Gifting: assets exceed lifetime needs and are directed to legacy or charity. The boundaries between stages are fuzzy.',
    source: SRC,
    topics: ['risk-profiling', 'retirement', 'asset-allocation', 'estate'],
    keywords: ['life cycle', 'accumulation phase', 'consolidation phase', 'spending phase', 'decumulation', 'gifting phase', 'age based allocation'],
  },
  {
    id: 'xa-15-forecasts-benchmarks',
    title: 'Capital-market forecasts and choosing benchmarks',
    principle:
      'Allocation combines what is known about the investor with forecasts of each asset class’s return and its likely deviation, usually starting from historical risk and return. The IPS should name a benchmark that matches the portfolio, comparing like with like: large-cap equity against Nifty 50 or Sensex, mid-cap against a mid-cap index, long bonds against a bond index of similar maturity and credit. Mixed portfolios need several benchmarks or a hybrid benchmark weighted to the stable allocation. A wrong benchmark misleads decisions; benchmarks should be reviewed when the portfolio or index changes.',
    source: SRC,
    topics: ['performance', 'asset-allocation'],
    keywords: ['benchmark', 'benchmark selection', 'hybrid benchmark', 'capital market expectations', 'Nifty 50 benchmark'],
  },
  {
    id: 'xa-15-construction-principles',
    title: 'Building equity, debt, hybrid and other sleeves',
    principle:
      'Equity: blend large caps for stability with mid and small caps for growth to suit risk capacity; dividend-yield stocks add cash flow but returns come mainly from appreciation; how much equity depends on goals and horizon. Debt: match maturities to the horizon, use short-term instruments for near goals and even for parking money briefly, and take credit risk only as far as the investor can bear. Hybrids add stability with some upside and help shift allocation smoothly as a long-term goal nears. Others such as gold, precious metals and alternatives add diversification and potential return. The final mix should maximise after-tax return within the investor’s needs, risk and liquidity.',
    source: SRC,
    topics: ['asset-allocation', 'equity', 'bonds', 'mutual-funds'],
    keywords: ['portfolio construction', 'equity allocation', 'debt allocation', 'maturity matching', 'hybrid allocation', 'gold allocation'],
  },
  {
    id: 'xa-15-strategic-vs-tactical',
    title: 'Strategic versus tactical asset allocation',
    principle:
      'Strategic asset allocation is the long-term target mix translated from the IPS: time in the market. Tactical asset allocation makes temporary, short-term deviations within the strategic framework to exploit perceived mispricing, for example cutting equity when it looks overvalued and adding debt, then returning to target after booking gains: timing the market, an attempt to beat it.',
    source: SRC,
    topics: ['asset-allocation', 'market-timing'],
    keywords: ['strategic asset allocation', 'tactical asset allocation', 'SAA', 'TAA', 'target allocation', 'market timing'],
  },
  {
    id: 'xa-15-rebalancing',
    title: 'Rebalancing: why, how often, and what it costs',
    principle:
      'Different returns across asset classes drift the portfolio away from its target risk, and investor circumstances change too, so portfolios need monitoring and periodic rebalancing. The IPS should say how often and how far drift is tolerated. Rebalancing typically sells what has risen and buys what has fallen. It is a trade-off between the cost of rebalancing (brokerage, research, taxes on gains, and the opportunity cost if the sold asset keeps rising) and the cost of not doing it (carrying unintended risk). Liquid assets like listed equity and government bonds are easy to rebalance; private equity and real estate are not.',
    inPractice:
      'Using fresh contributions to top up the underweight asset rebalances without triggering capital-gains tax.',
    source: SRC,
    topics: ['rebalancing', 'asset-allocation', 'tax'],
    keywords: ['rebalancing', 'portfolio drift', 'rebalancing frequency', 'tolerance band', 'cost of rebalancing', 'tax on rebalancing'],
  },
];
