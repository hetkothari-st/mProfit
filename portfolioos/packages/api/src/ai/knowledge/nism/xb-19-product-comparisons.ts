import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-B',
  edition: '2025-12',
  chapter: 19,
  chapterTitle: 'Comparison of Products across Categories',
};

export const XB_19: readonly KnowledgeEntry[] = [
  {
    id: 'xb-19-tax-savers',
    title: 'ELSS versus NPS versus PPF and tax-saver FDs',
    principle:
      'Products are compared on risk, return and liquidity; SEBI-mandated disclosures (mutual funds, PMS) feed many free comparison sites. ELSS: all equity, high risk, market-linked and potentially highest return, gains taxed at equity rates, three-year lock-in then freely redeemable. NPS Tier I: mixes equity (up to 75%), government and corporate debt and a little alternatives, so risk can be moderate or low by choice, market-linked returns, locked until 60 with conditional partial withdrawals and most of an early exit forced into annuities. PPF: sovereign, low risk, quarterly-reset rate, tax-free returns, 1.5 lakh a year, 15-year lock-in with partial withdrawals from year seven. Five-year tax-saver bank FDs: low risk, fixed but taxable interest, locked for the full term.',
    source: SRC,
    asOf: '2025-12',
    topics: ['products', 'tax', 'retirement'],
    keywords: ['ELSS vs PPF', 'ELSS vs NPS', 'best tax saving investment', 'tax saver FD', '80C options comparison'],
  },
  {
    id: 'xb-19-mf-pms-aif',
    title: 'Mutual funds versus PMS versus Category III AIFs',
    principle:
      'Mutual funds pool money with units for each investor and a common portfolio, start from about 1,000, have SEBI limits on concentration and on fees, suit retail investors and are redeemable any day (exit loads may apply). PMS holds securities in each client’s own demat, can be customised and concentrated, needs 50 lakh, allows no upfront fee, caps operating expenses at 0.5%, with management fees fixed, performance-linked or both by agreement, suits HNIs, and may charge on exit or handover. Category III AIFs pool money for complex or leveraged strategies including derivatives, need 1 crore, limit single-company exposure, set fees by agreement, suit sophisticated HNIs, and close-ended ones lock money in with poor liquidity.',
    source: SRC,
    asOf: '2025-12',
    topics: ['products', 'mutual-funds', 'pms-aif'],
    keywords: ['mutual fund vs PMS', 'PMS vs AIF', 'PMS minimum 50 lakh', 'AIF minimum 1 crore', 'which is better PMS or mutual fund'],
  },
  {
    id: 'xb-19-mf-vs-ulip-active-passive',
    title: 'Mutual funds versus ULIPs; active funds versus index funds; stocks versus funds',
    principle:
      'Mutual funds are pure investments with SEBI-capped charges, strong disclosure and many independent trackers, and are redeemable any time; ULIPs combine insurance and investment under IRDAI caps, deduct mortality and other charges from fund value (hard to compare returns), disclose less, lock in for five years, and are tax-free on maturity only if cover is 10 times premium and, from February 2021, premiums stay within 2.5 lakh a year. Active funds try to beat their benchmark at higher cost; index funds replicate it cheaply and aim only to track it. Direct stocks concentrate risk and need expertise (one’s own, a PMS or an adviser); equity funds spread risk and can be chosen by style, including index funds.',
    source: SRC,
    asOf: '2025-12',
    topics: ['products', 'mutual-funds', 'index-funds', 'insurance'],
    keywords: ['mutual fund vs ULIP', 'active vs passive', 'index fund vs active fund', 'direct stocks vs mutual funds'],
  },
  {
    id: 'xb-19-etf-vs-index-fund',
    title: 'ETFs versus index funds',
    principle:
      'An ETF trades on the exchange at live prices like a share; an index fund is bought from and sold to the fund house at end-of-day NAV. ETFs usually have lower management costs but add brokerage, demat charges and bid-ask spreads; index funds may charge slightly more but have no other costs. Outside a few large ETFs, Indian ETF liquidity is poor, with wide spreads and prices that can drift from the underlying NAV; index funds always redeem at NAV.',
    source: SRC,
    topics: ['products', 'index-funds', 'mutual-funds'],
    keywords: ['ETF vs index fund', 'ETF liquidity India', 'bid ask spread ETF', 'index fund NAV'],
  },
  {
    id: 'xb-19-gold-options',
    title: 'Physical gold versus gold funds, gold ETFs and SGBs',
    principle:
      'Physical gold: bought at the live price, carries GST, purity worries (eased by hallmarking), storage and safety costs, no income, capital gains on sale, sellable in the market. Gold funds: bought at end-of-day NAV, GST borne inside the fund, purity assured, costs inside the expense ratio, no income. Gold ETFs: live exchange prices, similar fund-level costs, convertible to physical gold for a fee, reasonable liquidity after trading costs. Sovereign Gold Bonds: priced off the previous three days’ gold rate at each issue, no GST, purity or storage worries, 2.5% interest (taxable), tax-free on RBI redemption at maturity only for the original subscriber (Finance Act 2026), redeemable on anniversaries after five years with final redemption at eight, and only moderately liquid on the exchange.',
    source: SRC,
    asOf: '2025-12',
    topics: ['products', 'tax'],
    keywords: ['gold ETF vs SGB', 'physical gold vs gold ETF', 'best way to buy gold', 'gold fund vs gold ETF', 'sovereign gold bond benefits'],
  },
  {
    id: 'xb-19-real-estate-reit-invit',
    title: 'Direct property versus REITs and InvITs',
    principle:
      'Direct real estate means large, lumpy, concentrated exposure to one or two properties (often risky under-construction ones) that the owner must manage, with poor, slow liquidity. REITs spread money across professionally managed rent-earning commercial properties with lower minimums and exchange liquidity, offering rent plus possible appreciation. InvITs do the same for infrastructure projects such as roads, bridges and power lines.',
    source: SRC,
    topics: ['products', 'real-estate'],
    keywords: ['REIT vs real estate', 'InvIT', 'invest in property vs REIT', 'REIT benefits'],
  },
  {
    id: 'xb-19-debt-choices',
    title: 'Bonds, debt funds, FMPs, FDs, company deposits',
    principle:
      'Individual debt instruments: safety depends on the issuer, return matches risk, and secondary liquidity in India is poor (selling early often means a lower price). Open-ended debt funds: diversification gives more safety for the same ratings, redeemable from the fund house (some exit loads), and growth options with planned withdrawals can be tax-efficient. Fixed maturity plans: predictable if held to maturity but very illiquid despite listing. Bank FDs: high safety, fixed returns, instant liquidity with premature-withdrawal penalties. From the same company, unsecured deposits pay slightly more than secured debentures, can be redeemed early with the company (no interest within a year), while debenture liquidity depends on the market.',
    source: SRC,
    topics: ['products', 'bonds', 'mutual-funds'],
    keywords: ['debt fund vs FD', 'FMP', 'bonds vs FD', 'company deposit vs debenture', 'fixed maturity plan liquidity'],
  },
  {
    id: 'xb-19-derivatives-vs-funds-insurance',
    title: 'Futures and options versus funds; accident versus life cover',
    principle:
      'Index or gold futures last up to about three months (gold up to a year) and cost mainly the carry for delayed purchase, with the same price risk as owning the asset; options add a premium, which caps the buyer’s loss; index funds, gold funds and ETFs can be held for life at market price plus management costs. Market-linked retirement products (NPS, ELSS, mutual funds) carry risk depending on the option chosen; non-market products like PPF protect principal but give moderate returns reset periodically; both lock money in. Personal accident cover pays only for accidental death plus temporary or permanent disability; life insurance pays on death from any cause but not for disability; accident cover is a top-up, life cover is essential for earners with dependants.',
    source: SRC,
    topics: ['products', 'derivatives', 'insurance', 'retirement'],
    keywords: ['index futures vs index fund', 'options vs futures', 'personal accident vs life insurance', 'market linked vs PPF'],
  },
];
