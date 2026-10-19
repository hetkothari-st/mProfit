import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-B',
  edition: '2025-12',
  chapter: 18,
  chapterTitle: 'Risk Profiling for Investors',
};

export const XB_18: readonly KnowledgeEntry[] = [
  {
    id: 'xb-18-willingness-ability-need',
    title: 'Willingness, ability and need to take risk',
    principle:
      'Offered a coin toss costing 1 lakh that pays 2.1 lakh on a correct call (an expected gain of 5,000), most people decline from fear of losing, and more accept only as the prize grows: willingness to take risk is largely psychological. Whether risk is actually taken also depends on resources (more wealth, more capacity to absorb losses) and need (the more the payoff matters, the more likely the risk is taken). Risk appetite generally rises with more earning members, a longer life expectancy, youth, employability and steady jobs, market knowledge, a daring temperament, a larger capital base and regular income; it falls with more dependants.',
    source: SRC,
    topics: ['risk-profiling', 'risk'],
    keywords: ['risk appetite', 'risk tolerance', 'risk capacity', 'willingness vs ability to take risk', 'factors affecting risk appetite', 'need to take risk'],
  },
  {
    id: 'xb-18-questionnaires-categories',
    title: 'Risk questionnaires and investor categories',
    principle:
      'Risk tolerance is usually measured by questionnaires that score ability and willingness and map clients to categories; scenario-based tools and actual transaction behaviour can give better readings. Weaknesses: clients guess the "right" answer when there is none, and website tools have limits, so advisers must use them judiciously. A simple three-way grouping: conservative (dislike risk, new to risky products, prefer bank and safe income products, maybe a little in risky assets for the long term); moderate (some experience, accept that long-term goals need some risk, willing to risk part of their assets); aggressive (experienced, active, willing to put a significant share at risk for long-term returns).',
    source: SRC,
    topics: ['risk-profiling'],
    keywords: ['risk profile questionnaire', 'conservative moderate aggressive', 'investor risk category', 'risk score', 'limitations of risk questionnaire'],
  },
  {
    id: 'xb-18-sebi-risk-profiling-rules',
    title: 'SEBI’s risk-profiling obligations for advisers',
    principle:
      'Under the IA Regulations an adviser must collect age, objectives and time frames, income, investments, loans and innate risk appetite; use an objective process that assesses willingness and ability to take risk, including capacity to absorb losses, without over-weighting some answers; use tools fit for purpose with known limitations mitigated; keep questionnaires fair, clear, plain and free of leading questions; complete risk profiling before any advice, with no free trial unless the profile is communicated and the client consents to it; and update the information and profile periodically, especially on changes in family, income, expenses, assets or liabilities.',
    source: SRC,
    topics: ['risk-profiling', 'regulation'],
    keywords: ['SEBI risk profiling rules', 'regulation 16', 'risk profile before advice', 'free trial risk profile consent', 'update risk profile'],
  },
  {
    id: 'xb-18-saa-taa-daa',
    title: 'Strategic, tactical and dynamic asset allocation',
    principle:
      'Asset allocation spreads money across classes that do not move together (in 2007-09 equities fell while gold rose), and research suggests it explains more of a portfolio’s results than security selection. Strategic allocation follows the client’s goals, horizon and risk profile; it changes only when those change, never on forecasts, and is rebalanced back to target, avoiding forecast errors but also missing hot assets. Tactical allocation overweights an asset on a market view (more equity when a boom is expected); it suits only seasoned investors with large surpluses, on a limited slice of the portfolio. Dynamic allocation shifts by predefined model rules triggered by valuations or performance, removing subjectivity.',
    source: SRC,
    topics: ['asset-allocation', 'risk-profiling', 'market-timing'],
    keywords: ['strategic asset allocation', 'tactical asset allocation', 'dynamic asset allocation', 'asset allocation importance', 'rebalance to target'],
  },
  {
    id: 'xb-18-model-portfolios',
    title: 'Model portfolios by client profile (illustrative)',
    principle:
      'Advisers keep a model portfolio for each distinct client profile and tailor it. Illustrations: a young, high-risk worker with no dependants: about 50% diversified equity (preferably via SIP), 20% sector funds, 10% gold ETF, 10% debt funds or FDs, 10% liquid funds or bank. A young single-income family with school-age children, moderate: 35% equity, 10% sector, 15% gold, 30% debt or FDs, 10% liquid. A single-income family with grown children not yet settled, conservative: 35% equity, 15% gold, 10% gilt, 20% debt or FDs, 20% short-term or liquid. A couple in their seventies without family support: 15% equity index fund, 5% gold, 35% debt hybrid, MIS or SCSS, 30% debt or FDs, 15% liquid; if healthy with a large corpus, more equity (about 25%) and gold (10%). These figures are educational and subjective, not advice.',
    source: SRC,
    asOf: '2025-12',
    topics: ['asset-allocation', 'risk-profiling'],
    keywords: ['model portfolio', 'asset allocation by age', 'portfolio for retiree', 'portfolio for young investor', 'sample asset allocation'],
  },
  {
    id: 'xb-18-matching-objectives',
    title: 'Matching investments to objectives, and reviewing',
    principle:
      'For growth: shares, equity funds, property, gold. For steady income: deposits, bonds and debt funds, rented property. Liquidity: cash, bank deposits, short-term funds. Capital preservation: cash, deposits, ultra-short funds. Single-asset portfolios fail in predictable ways: all property leaves no quick cash; all savings account cannot outgrow expenses; all equity may not be there when needed; all gold yields no income; all FDs lag rising expenses. Mixing assets that do not move together cushions falls. Review at least yearly: are goals still relevant and on track, are investments performing, do any need changing? Rebalance to match the client’s needs, not to chase short-term moves; for example, shift an education fund out of equity a few years before it is needed.',
    source: SRC,
    topics: ['asset-allocation', 'diversification', 'rebalancing', 'goals'],
    keywords: ['investment objectives', 'growth income liquidity', 'diversification examples', 'concentration risk', 'annual portfolio review', 'move to debt near goal'],
  },
];
