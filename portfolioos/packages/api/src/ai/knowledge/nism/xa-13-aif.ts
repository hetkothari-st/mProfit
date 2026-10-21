import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-A',
  edition: '2025-06',
  chapter: 13,
  chapterTitle: 'Overview of Alternative Investment Funds (AIFs)',
};

export const XA_13: readonly KnowledgeEntry[] = [
  {
    id: 'xa-13-what-alternatives-are',
    title: 'What makes an investment "alternative"',
    principle:
      'Alternatives are investments outside traditional listed stocks, bonds, mutual funds and ETFs (and outside deposits, government schemes, jewellery or a home to live in). They serve sophisticated investors such as institutions, family offices and HNIs with higher risk capacity, aiming for higher long-term risk-adjusted returns that complement traditional holdings. Their defining trait is illiquidity: off-market or complex holdings without a ready buyer. India’s path ran from 1980s venture capital by state agencies and banks, through the 1996 SEBI VCF Regulations and the 2000 tax reforms after the K.B. Chandrasekhar Committee, the dotcom boom, a broadening of private equity after 2001, and a setback after 2008.',
    source: SRC,
    topics: ['pms-aif', 'diversification'],
    keywords: ['alternative investments', 'illiquidity', 'private equity', 'venture capital history', 'HNI investments'],
  },
  {
    id: 'xa-13-aif-rules',
    title: 'AIF rules: minimums, corpus, sponsor stake, investor limit',
    principle:
      'Under the SEBI (Alternative Investment Funds) Regulations 2012, an AIF is a privately pooled vehicle with a defined investment policy, raising money only by private placement from Indian, foreign or NRI investors. Each scheme needs a corpus of at least 20 crore; minimum investment is 1 crore (25 lakh for employees or directors of the AIF or its manager); at most 1,000 investors per scheme. The manager or sponsor must keep a continuing interest of the lower of 2.5% of corpus or 5 crore (lower of 5% or 10 crore for Category III), not via fee waivers, and disclose it. Close-ended AIF units may list only after final close, in minimum lots of 1 crore.',
    source: SRC,
    asOf: '2025-06',
    topics: ['pms-aif', 'regulation'],
    keywords: ['AIF regulations 2012', 'AIF minimum 1 crore', 'corpus 20 crore', '1000 investors', 'sponsor commitment', 'private placement', 'AIF listing'],
  },
  {
    id: 'xa-13-accredited-investors',
    title: 'Accredited investors in AIFs',
    principle:
      'Some AIFs accept accredited investors at a 25 lakh minimum instead of 1 crore (adoption is optional for the AIF). Individuals, HUFs, family trusts and sole proprietors qualify with annual income of at least 2 crore; or net worth of at least 7.5 crore with at least 3.75 crore in financial assets; or income of at least 1 crore plus net worth of at least 5 crore with at least 2.5 crore financial. Partnerships qualify if every partner does; other trusts and body corporates need net worth of at least 50 crore.',
    source: SRC,
    asOf: '2025-06',
    topics: ['pms-aif', 'regulation'],
    keywords: ['accredited investor', 'AIF 25 lakh', 'income 2 crore', 'net worth 7.5 crore', 'accreditation criteria'],
  },
  {
    id: 'xa-13-investment-conditions',
    title: 'AIF investment limits',
    principle:
      'AIFs may invest overseas within RBI and SEBI conditions. Co-investment by the manager, sponsor or co-investors may not be on better terms than the AIF’s. Category I and II AIFs may put at most 25% of investable funds into one investee company (directly or via other AIFs); Category III at most 10%. Investing in associates needs approval from investors holding 75% by value. Uninvested money may sit in liquid funds, bank deposits, T-bills, CPs, CDs and similar until deployed.',
    source: SRC,
    asOf: '2025-06',
    topics: ['pms-aif', 'regulation'],
    keywords: ['AIF concentration limit', '25% one company', 'category III 10%', 'co-investment', 'associate investment 75% approval'],
  },
  {
    id: 'xa-13-categories',
    title: 'AIF Category I, II and III',
    principle:
      'Category I invests in start-ups, early-stage, social ventures, SMEs, infrastructure or other areas the government considers socially or economically desirable: venture capital (including angel funds), SME, social venture, infrastructure and special situations funds. Category II is everything not in I or III that does not borrow except for day-to-day operations: private equity and debt funds without special incentives. Category III uses diverse or complex trading strategies and may use leverage including derivatives: hedge funds and short-term trading funds, which may be open-ended.',
    source: SRC,
    topics: ['pms-aif', 'regulation'],
    keywords: ['AIF category I', 'AIF category II', 'AIF category III', 'hedge fund category', 'private equity AIF', 'venture capital AIF', 'leverage'],
  },
  {
    id: 'xa-13-aif-types',
    title: 'Types of AIF by strategy',
    principle:
      'Venture capital funds back unlisted start-ups and early-stage, asset-light, technology or IP-based businesses; angel funds, a VCF sub-type, raise from angel investors (individuals with net tangible assets of at least 2 crore excluding their home plus relevant experience, body corporates with net worth of at least 10 crore, or registered AIFs/VCFs). Private equity funds invest in equity of established businesses needing to scale (later stage). Debt funds hold private debt (privately placed NCDs, venture debt, mezzanine with equity kickers, subordinated "leveraged loans", distressed debt including IBC resolutions). Infrastructure funds back infrastructure projects. SME funds invest in SMEs or SME-exchange securities. Hedge funds run complex strategies. Social impact funds invest in social ventures. Special situation funds buy stressed assets and can be resolution applicants under the IBC.',
    source: SRC,
    asOf: '2025-06',
    topics: ['pms-aif'],
    keywords: ['venture capital fund', 'angel fund', 'angel investor criteria', 'private equity fund', 'private debt', 'venture debt', 'mezzanine', 'distressed debt', 'special situations fund', 'social impact fund', 'SME fund', 'infrastructure fund'],
  },
  {
    id: 'xa-13-role-in-portfolios',
    title: 'Why alternatives belong in some portfolios',
    principle:
      'Technology disruption, environmental and regulatory change, volatile economies and years of ultra-low or negative rates in developed markets have squeezed returns from traditional assets and pushed capital toward emerging markets and alternatives. Investors use alternatives not only for return but for diversification and access to opportunities absent from listed markets, accepting illiquidity and complexity.',
    source: SRC,
    topics: ['pms-aif', 'diversification', 'asset-allocation'],
    keywords: ['role of alternatives', 'AIF suitability', 'diversification', 'low interest rates', 'illiquidity premium'],
  },
];
