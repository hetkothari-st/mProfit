import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-A',
  edition: '2025-06',
  chapter: 8,
  chapterTitle: 'Investing in Stocks',
};

export const XA_08: readonly KnowledgeEntry[] = [
  {
    id: 'xa-08-equity-vs-debt-tradeoff',
    title: 'Equity versus debt: owners versus lenders',
    principle:
      'Equity holders have a residual claim: no promised repayment or periodic payment, but votes and all surplus value; their reward (dividends plus capital gains, neither assured) should exceed lenders’ to compensate for more risk. Debt gives lower, steadier returns. Most investors mix the two according to expected return, horizon, risk appetite and needs.',
    source: SRC,
    topics: ['equity', 'asset-allocation'],
    keywords: ['equity vs debt', 'residual claim', 'shareholder rights', 'risk return trade-off'],
  },
  {
    id: 'xa-08-cross-sectional-time-diversification',
    title: 'Diversifying equity: across businesses and across time',
    principle:
      'Cross-sectional diversification holds many businesses, sectors and countries at once so that weakly correlated performances offset. Time diversification holds equity long enough for good periods to outweigh bad ones: time in the market rather than timing the market. Business cycles matter: counter-cyclical or defensive businesses peak when the economy troughs, recession-proof ones do well in downturns, and leading sectors recover earlier than lagging ones.',
    source: SRC,
    topics: ['diversification', 'equity', 'market-timing'],
    keywords: ['diversification', 'cross sectional diversification', 'time diversification', 'time in the market', 'defensive sectors', 'counter-cyclical', 'leading sectors', 'lagging sectors'],
  },
  {
    id: 'xa-08-equity-risks',
    title: 'Risks in equity: market, sector, company, transaction, liquidity, currency',
    principle:
      'Market (systematic) risk affects all stocks, is measured by beta, and cannot be diversified away, only hedged. Sector and company-specific (unsystematic, idiosyncratic) risks can be diversified away by spreading across sectors and companies. Transaction (counterparty) risk is removed by trading on an exchange with a clearing guarantee. Liquidity risk is measured by impact cost: the percentage price move a given order size causes from the mid of the best bid and offer; thinly traded stocks have high impact cost. Currency risk enters through foreign investors’ flows; inflation, fuel prices, interest rates and growth also move markets.',
    source: SRC,
    topics: ['risk', 'equity'],
    keywords: ['market risk', 'systematic risk', 'unsystematic risk', 'beta', 'company specific risk', 'sector risk', 'impact cost', 'liquidity risk', 'currency risk', 'FPI flows'],
  },
  {
    id: 'xa-08-buy-vs-sell-side-research',
    title: 'Equity research: buy side versus sell side',
    principle:
      'Equity research estimates intrinsic value to compare with price and decide buy, hold or sell, using fundamental analysis (top-down or bottom-up), quantitative screens and technical indicators. Sell-side analysts work for brokers and investment banks and publish reports with ratings and price targets for clients; they are paid for useful, actionable ideas across sectors. Buy-side analysts work for mutual funds, pension funds, hedge funds and portfolio managers, produce recommendations for internal fund managers, and are judged on accuracy.',
    source: SRC,
    topics: ['equity', 'valuation'],
    keywords: ['equity research', 'buy side', 'sell side', 'price target', 'analyst', 'stock selection'],
  },
  {
    id: 'xa-08-fundamental-eic',
    title: 'Fundamental analysis and the EIC framework',
    principle:
      'Fundamental analysis estimates intrinsic value from future earnings or cash flows, rates and risk, buying when price is below value (after costs) on the belief that price converges to value. Economy-Industry-Company (EIC): top-down starts with the economy (GDP, inflation, interest rates, unemployment, fiscal and monetary policy, data such as CPI, WPI and IIP), then industries, then companies; bottom-up starts from the company. The stock market is a leading indicator of the economy, though sentiment can make it run ahead or lag. Banks are highly interest-rate sensitive; pharma less so.',
    source: SRC,
    topics: ['equity', 'valuation'],
    keywords: ['fundamental analysis', 'EIC framework', 'top down', 'bottom up', 'intrinsic value', 'economy analysis', 'leading indicator', 'interest rate sensitive'],
  },
  {
    id: 'xa-08-industry-analysis-cycles',
    title: 'Industry analysis: business cycles and industry life cycle',
    principle:
      'Banks and financials tend to do well near the end of a recession; consumer durables (cars, appliances) and cyclical, high-operating-leverage or high-debt businesses do well in early recovery; at the peak, inflation favours producers of basic materials (oil, metals) that can raise prices; in recession defensive sectors (FMCG, pharma) outperform. The industry life cycle runs introduction (small sales, little or negative profit), growth (high margins, few competitors), maturity (longest stage, growth near GDP, competition normalises margins) and decline (falling sales and margins).',
    source: SRC,
    topics: ['equity', 'valuation'],
    keywords: ['industry analysis', 'business cycle', 'cyclical sectors', 'defensive sectors', 'industry life cycle', 'growth stage', 'maturity stage', 'operating leverage'],
  },
  {
    id: 'xa-08-company-analysis-swot',
    title: 'Company analysis: good company is not always a good stock',
    principle:
      'Company analysis starts with the financial statements (profit and loss, balance sheet, cash flow) and ratios read against industry and history, plus SWOT: internal strengths and weaknesses (competitive advantages) and external opportunities and threats (tax, consumer trends, regulation, big competitors, technology). Strategy may be defensive (positioned to deflect competition) or offensive (using strengths to reshape the industry). A great company trading far above intrinsic value is not a good investment. Price is a fact; value is an opinion, so valuation is art as well as science.',
    source: SRC,
    topics: ['equity', 'valuation'],
    keywords: ['company analysis', 'SWOT', 'financial statements', 'ratio analysis', 'good company vs good stock', 'price vs value'],
  },
  {
    id: 'xa-08-dcf-asset-based',
    title: 'Discounted cash flow and asset-based valuation',
    principle:
      'DCF values a business as the present value of expected future cash flows at the investors’ required return; it needs the cash flows, their timing and the discount rate. Because accounting profit includes accrual adjustments, analysts derive cash flows from profit rather than use profit directly. Asset-based valuation adds the adjusted market values of tangible, intangible, financial and net current assets and subtracts outside liabilities to get equity value; suited to asset-heavy firms whose assets are marked to market (financial institutions, real estate, jewellery), but it ignores future earnings and innovation.',
    source: SRC,
    topics: ['valuation', 'equity'],
    keywords: ['DCF', 'discounted cash flow', 'intrinsic value', 'asset based valuation', 'net asset value', 'free cash flow'],
  },
  {
    id: 'xa-08-pe-ratio',
    title: 'P/E ratio: trailing, forward and how to read it',
    principle:
      'P/E = price / earnings per share over the latest 12 months (not one quarter). Trailing P/E uses the last four quarters’ EPS, forward P/E the next four quarters’ estimated EPS, current P/E the latest annual EPS. A P/E of 20 means investors pay 20 for each 1 of annual earnings. Compare with the market (Nifty, Sensex), the industry average or peers: a company at 15 against peers at 20 looks undervalued. Limits: forward estimates may be wrong, negative earnings make P/E meaningless, it changes constantly and average P/Es swing with the economy. A low share price says nothing about cheapness: a 10-rupee stock at 75 times earnings is dearer than a 1,000-rupee stock at 20.',
    source: SRC,
    topics: ['valuation', 'equity'],
    keywords: ['P/E ratio', 'price to earnings', 'trailing PE', 'forward PE', 'EPS', 'relative valuation', 'overvalued', 'undervalued'],
  },
  {
    id: 'xa-08-pb-ps-ratios',
    title: 'Price-to-book and price-to-sales',
    principle:
      'P/BV = market price / book value per share (shareholders’ equity, excluding miscellaneous assets not written off, divided by shares). Below 1 means either the market is missing something (a bargain) or the books hold worthless assets or inflated reserves; book values reflect historical cost and miss intangibles, but P/BV is widely used for banks and financial companies whose assets are close to market value. P/S = market cap / trailing 12-month revenue; useful when earnings are negative, margins thin, or profits may be manipulated, since sales are harder to manipulate.',
    source: SRC,
    topics: ['valuation', 'equity'],
    keywords: ['price to book', 'P/BV', 'book value per share', 'price to sales', 'P/S ratio', 'bank valuation'],
  },
  {
    id: 'xa-08-peg-eva-mva',
    title: 'PEG ratio, EVA and MVA',
    principle:
      'PEG = P/E / expected annual EPS growth rate (in percentage points, usually over about five years). Around 1 is fair; below 1 suggests undervaluation relative to growth, above 1 overvaluation; it is only as good as the growth estimate. Example: P/E 30 with 20% expected growth gives a PEG of 1.5. Economic value added (economic profit) = net operating profit after tax - invested capital x cost of capital, showing whether the business earns more than its capital costs. Market value added = current market value of the firm - capital contributed by investors; positive means value created, negative value destroyed.',
    source: SRC,
    asOf: '2025-06',
    topics: ['valuation', 'equity'],
    keywords: ['PEG ratio', 'earnings growth', 'EVA', 'economic value added', 'economic profit', 'MVA', 'market value added', 'cost of capital'],
  },
  {
    id: 'xa-08-enterprise-value-multiples',
    title: 'Enterprise value, EV/EBITDA, EBIT/EV and EV/Sales',
    principle:
      'Enterprise value = market cap of equity + market value of debt - excess cash and equivalents: the capital committed to the operating business, or the cash an acquirer would need (no one pays cash to buy cash). EV/EBITDA compares it with earnings before interest, tax, depreciation and amortisation, a cash-like measure available to all capital providers; useful for capital-intensive firms that are not yet profitable after depreciation and interest. EBIT/EV is an earnings yield on the whole firm. EV/Sales improves on P/S by including debt, useful for capital-intensive businesses.',
    source: SRC,
    topics: ['valuation', 'equity'],
    keywords: ['enterprise value', 'EV/EBITDA', 'EBITDA', 'EBIT/EV', 'EV/Sales', 'acquisition value', 'capital intensive'],
  },
  {
    id: 'xa-08-yields-sector-metrics',
    title: 'Dividend yield, earnings yield and choosing the metric by sector',
    principle:
      'Dividend yield = dividend per share / market price x 100 (a 3 dividend on a 60 share is 5%). Earnings yield = EPS / price x 100, the inverse of P/E (EPS 4 on a price of 50 is 8%). No method fits every sector: stable cash generators such as FMCG and pharma suit DCF; capital-intensive cement and steel are often valued on replacement cost; P/BV is the norm for banks and financial services; P/E is used everywhere as a cross-check and for market-level comparisons. Multiples are a shorthand for DCF: both rest on the same value drivers.',
    source: SRC,
    asOf: '2025-06',
    topics: ['valuation', 'equity'],
    keywords: ['dividend yield', 'earnings yield', 'inverse of PE', 'replacement cost', 'sector valuation', 'relative valuation vs DCF'],
  },
  {
    id: 'xa-08-technical-analysis',
    title: 'Technical analysis: trends in price and volume',
    principle:
      'Technical analysts assume all information is already in prices and forecast direction from historical price and volume patterns: prices move in persistent trends set by supply and demand, and shifts in that balance show up in market action. Volume confirms a trend’s strength. Tools include trend lines and channels, moving averages (5 to 200 days; a simple rule buys well below the average and sells well above), and Bollinger bands (two standard deviations above the moving average signals overbought, two below oversold). The same methods work for bonds with price and volume data. It suits short-term timing; the usual advice is to pick stocks on fundamentals, and long-term investors should not try to time the market.',
    source: SRC,
    topics: ['equity', 'market-timing'],
    keywords: ['technical analysis', 'chart', 'trend line', 'moving average', 'Bollinger bands', 'overbought', 'oversold', 'volume', 'chartist'],
  },
  {
    id: 'xa-08-corporate-governance',
    title: 'Qualitative evaluation: corporate governance',
    principle:
      'Qualitative factors, above all corporate governance, can matter as much as the numbers. Frauds, accounting scandals and excessive pay have destroyed shareholder value and even driven companies into bankruptcy, so management integrity, board independence and disclosure quality belong in every stock evaluation.',
    source: SRC,
    topics: ['equity', 'ethics'],
    keywords: ['corporate governance', 'management quality', 'accounting fraud', 'qualitative analysis', 'board independence'],
  },
];
