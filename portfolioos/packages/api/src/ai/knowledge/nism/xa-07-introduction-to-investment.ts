import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-A',
  edition: '2025-06',
  chapter: 7,
  chapterTitle: 'Introduction to Investment',
};

export const XA_07: readonly KnowledgeEntry[] = [
  {
    id: 'xa-07-classifying-investments',
    title: 'Ways to classify investments',
    principle:
      'Investments are financial (claims on future cash flows) or non-financial (real estate, gold, commodities). Financial instruments split by claim into debt and equity, by market into public and private, and by maturity into capital-market (long term) and money-market (under a year) instruments.',
    source: SRC,
    topics: ['asset-allocation', 'markets'],
    keywords: ['types of investment', 'financial vs non-financial', 'debt vs equity', 'asset classes', 'capital market vs money market'],
  },
  {
    id: 'xa-07-equity-and-preference-shares',
    title: 'Equity shares, preference shares and DVRs',
    principle:
      'Equity shareholders own the company, vote (usually one share, one vote) and are residual claimants, earning dividends and capital gains; over long periods equity also benefits from time diversification. Preference shares rank ahead of equity for dividends and in liquidation, usually without voting rights, and pay a mostly fixed dividend: cumulative (unpaid dividends carry forward) or non-cumulative (they lapse); participating (extra dividend on set conditions) or non-participating; and possibly convertible into equity, which makes them hybrids. Shares with differential voting rights (DVRs) carry more or fewer votes or a different dividend; allowed in India since 2000 but rarely used (Tata Motors’ 2008 DVR had one-tenth the vote and a slightly higher dividend).',
    source: SRC,
    topics: ['equity'],
    keywords: ['equity shares', 'preference shares', 'cumulative preference', 'participating preference', 'convertible preference', 'DVR', 'differential voting rights', 'residual claimant'],
  },
  {
    id: 'xa-07-govt-vs-corporate-debt-ratings',
    title: 'Government versus corporate debt, credit spreads and rating grades',
    principle:
      'Debt instruments promise a stream of payments and set the borrower’s obligations and holders’ rights on default. G-secs (treasury bills under a year from the Centre; dated bonds from the Centre and states) are practically default-free. Corporate bonds yield more; the extra yield over a G-sec of the same maturity is the credit spread, a risk premium that widens with default probability. SEBI-registered agencies rate from AAA (highest safety) through AA, A, BBB (moderate safety), BB (moderate risk), B, C to D (default). BBB and above is investment grade; below BBB is high-yield or junk, which many institutions may not hold.',
    source: SRC,
    topics: ['bonds'],
    keywords: ['government securities', 'corporate bonds', 'credit spread', 'credit rating', 'AAA', 'investment grade', 'junk bonds', 'high yield', 'default risk'],
  },
  {
    id: 'xa-07-commodities-real-estate',
    title: 'Commodities and real estate as asset classes',
    principle:
      'Soft commodities (grown: wheat, sugar, soy) are perishable, volatile and weather- and cycle-driven, usually accessed through futures; hard commodities (mined: gold, silver, oil, copper) are priced by global supply and demand. Commodities have low correlation with stocks and bonds, aiding diversification, but generate no income: return is price change only. Gold is a global safe haven in uncertainty. Real estate (residential or commercial, across city tiers) offers rental income and appreciation, historically hedges inflation and diversifies, but needs large commitments; real estate funds and REITs give exposure with smaller sums.',
    source: SRC,
    topics: ['diversification', 'real-estate', 'asset-allocation'],
    keywords: ['commodities', 'soft commodities', 'hard commodities', 'gold safe haven', 'correlation', 'real estate', 'REIT', 'inflation hedge'],
  },
  {
    id: 'xa-07-structured-distressed-collectibles',
    title: 'Structured products, distressed securities, art and overseas investing',
    principle:
      'Structured products use derivatives to give customised, large-ticket exposure linked to indices, baskets, currencies, rates or commodities, with partial or full principal protection or enhanced yield depending on design; outcomes depend on the underlying strategy, so they must not be sold as guaranteed or assured-return products (market-linked debentures are the common Indian form). Distressed securities of troubled companies trade at deep discounts and need expert valuation; often barred for mainstream funds, offered via some PMS and AIFs. Art and collectibles are unique, illiquid, unregulated, income-free and need specialist knowledge, though weakly correlated with financial assets. Residents can invest up to USD 250,000 a year abroad under LRS for currency and geographic diversification.',
    source: SRC,
    asOf: '2025-06',
    topics: ['products', 'diversification'],
    keywords: ['structured products', 'market linked debentures', 'MLD', 'capital protection', 'distressed securities', 'fallen angels', 'art investment', 'collectibles', 'LRS'],
  },
  {
    id: 'xa-07-direct-vs-managed-ria',
    title: 'Investing directly, through advisers, or through managed portfolios',
    principle:
      'Investors can buy securities and gold directly (using brokers, depositories and advisers for a fee) or indirectly through professionally managed pools: mutual funds, AIFs, portfolio managers and collective investment schemes. Since the SEBI (Investment Advisers) Regulations 2013, only SEBI-registered investment advisers may call themselves advisers; they are paid by clients, owe a duty to act in the client’s best interest, must disclose conflicts, profile risk, assess needs and build financial plans; distributors and agents can no longer use the title.',
    source: SRC,
    topics: ['regulation', 'mutual-funds', 'pms-aif'],
    keywords: ['direct investing', 'managed portfolio', 'RIA', 'registered investment adviser', 'IA regulations 2013', 'fiduciary', 'collective investment scheme'],
  },
  {
    id: 'xa-07-mf-vs-pms-vs-aif',
    title: 'Mutual funds versus PMS versus AIFs',
    principle:
      'All three are SEBI-regulated managed portfolios. Mutual funds serve retail investors and are the most tightly regulated (high-touch). PMS (minimum 50 lakh) and AIFs (minimum 1 crore) serve HNIs and institutions expected to understand complex strategies, so regulation is lighter and investment restrictions fewer; they are sometimes called the rich man’s mutual funds.',
    source: SRC,
    asOf: '2025-06',
    topics: ['mutual-funds', 'pms-aif', 'regulation'],
    keywords: ['mutual fund vs PMS', 'PMS minimum 50 lakh', 'AIF minimum 1 crore', 'light touch regulation', 'HNI products'],
  },
];
