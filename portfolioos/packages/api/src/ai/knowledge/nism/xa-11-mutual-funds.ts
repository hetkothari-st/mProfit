import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-A',
  edition: '2025-06',
  chapter: 11,
  chapterTitle: 'Mutual Funds',
};

export const XA_11: readonly KnowledgeEntry[] = [
  {
    id: 'xa-11-mf-structure',
    title: 'How a mutual fund is structured',
    principle:
      'A sponsor (promoter) sets up the fund; trustees protect investors’ interests across schemes; an asset management company launches, markets and manages schemes per their objectives, helped by banks, registrar and transfer agents (who keep investor records and communications), investor service centres, brokers and custodians, all SEBI-regulated. A scheme is first offered in a new fund offer (NFO) through an offer document: the Scheme Information Document (SID), summarised in the Key Information Memorandum (KIM) attached to application forms, both on the AMC’s website. The portfolio belongs only to the unitholders, in proportion to their units.',
    source: SRC,
    topics: ['mutual-funds'],
    keywords: ['mutual fund structure', 'sponsor', 'trustee', 'AMC', 'RTA', 'NFO', 'scheme information document', 'SID', 'KIM', 'key information memorandum', 'custodian'],
  },
  {
    id: 'xa-11-units-nav',
    title: 'Units, net assets and NAV',
    principle:
      'Each investor’s holding is a number of units (amount / price per unit, fractions allowed). Net assets = market value of the portfolio plus cash and receivables minus fees and expenses; NAV = net assets / units outstanding. Market gains, income received and fresh money raise net assets; falls, expenses and redemptions lower them. Purchases and redemptions at NAV do not change NAV, because units change in proportion; issuing units at any price other than NAV would dilute existing holders. The portfolio is marked to market daily (SEBI prescribes methods for untraded or stale securities). Worked figure: net assets of 2.4 crore over 15 lakh units is a NAV of 16.',
    source: SRC,
    asOf: '2025-06',
    topics: ['mutual-funds'],
    keywords: ['NAV', 'net asset value', 'units', 'net assets', 'mark to market', 'units allotted', 'dilution'],
  },
  {
    id: 'xa-11-cut-off-applicable-nav',
    title: 'Cut-off times and the applicable NAV',
    principle:
      'Every fund applies the same rules so no investor is favoured: the NAV a purchase, redemption or switch gets depends on the scheme type, the day, the time the request is received relative to the cut-off, and (for purchases) when clear funds reach the fund’s account. NAVs are computed every business day.',
    source: SRC,
    topics: ['mutual-funds', 'operations'],
    keywords: ['cut-off time', 'applicable NAV', 'clear funds', 'same day NAV', 'purchase timing'],
  },
  {
    id: 'xa-11-open-closed-interval-etf',
    title: 'Open-ended, close-ended, interval funds and ETFs',
    principle:
      'Open-ended schemes sell and redeem units continuously at NAV and have no fixed end; unit capital changes daily. Close-ended schemes sell units only in the NFO, run for a fixed term, redeem at NAV on maturity and must be listed so investors can exit by selling to others meanwhile; unit capital stays fixed. Interval funds are close-ended but open for purchases and redemptions in set windows of at least two days with at least 15 days between windows, and are listed. ETFs are listed funds, usually tracking an index or gold, traded all day at changing market prices between investors rather than with the fund at one daily NAV.',
    source: SRC,
    topics: ['mutual-funds'],
    keywords: ['open ended fund', 'close ended fund', 'interval fund', 'ETF', 'exchange traded fund', 'listing', 'unit capital'],
  },
  {
    id: 'xa-11-mf-regulation-amfi',
    title: 'Mutual fund regulation and AMFI',
    principle:
      'SEBI is the primary regulator under the SEBI (Mutual Funds) Regulations 1996: set-up, schemes, portfolios, investor protection and service, with prescribed turnaround times and mandatory disclosures. RBI is involved where foreign exchange or banks are concerned. AMFI is the industry body that sets best practices and represents the industry. From 31 December 2024 SEBI’s MF Lite framework applies to fund houses running only passive schemes. SEBI’s categorisation allows one scheme per category per fund house, except index funds and ETFs on different indices, fund of funds with different underlyings, and sector or thematic funds on different sectors or themes.',
    source: SRC,
    asOf: '2025-06',
    topics: ['mutual-funds', 'regulation'],
    keywords: ['SEBI mutual fund regulations 1996', 'AMFI', 'MF Lite', 'scheme categorisation', 'one scheme per category'],
  },
  {
    id: 'xa-11-equity-categories-size',
    title: 'Equity fund categories by company size',
    principle:
      'AMFI ranks stocks by full market cap: large caps are 1 to 100, mid caps 101 to 250, small caps 251 onwards. Large-cap funds hold at least 80% in large caps; mid-cap funds at least 65% in mid caps; large and mid-cap funds at least 35% each in large and mid caps; small-cap funds at least 65% in small caps; multi-cap funds at least 75% in equity with at least 25% each in large, mid and small caps; flexi-cap funds at least 65% in equity with no size limits. Mid and small caps grow faster but fall harder and face more business risk in slowdowns.',
    source: SRC,
    asOf: '2025-06',
    topics: ['mutual-funds', 'equity'],
    keywords: ['large cap fund', 'mid cap fund', 'small cap fund', 'large and mid cap fund', 'multi cap fund', 'flexi cap fund', 'SEBI categorisation', 'AMFI market cap list', 'top 100'],
  },
  {
    id: 'xa-11-equity-categories-style',
    title: 'Equity fund categories by strategy: passive, sector, thematic, value, contra, dividend yield, focused',
    principle:
      'Passive funds mirror an index with no stock selection, so returns track the market; active funds pick and time stocks to beat it, adding selection risk. Sector funds (at least 80% in one sector such as banking or technology) and thematic funds (at least 80% in a theme like infrastructure, or ESG under exclusion, integration, best-in-class, impact, sustainable or transition strategies) are concentrated and need good timing as sectors are cyclical. Value funds buy below intrinsic value and need patience; contra funds buy out-of-favour stocks; a fund house may offer value or contra, not both; both need at least 65% in equity, as do dividend-yield funds that buy high-dividend, stable, low-growth companies. Focused funds hold at most 30 stocks.',
    source: SRC,
    asOf: '2025-06',
    topics: ['mutual-funds', 'equity', 'index-funds'],
    keywords: ['passive fund', 'active fund', 'sector fund', 'thematic fund', 'ESG fund', 'value fund', 'contra fund', 'dividend yield fund', 'focused fund', '30 stocks'],
  },
  {
    id: 'xa-11-elss',
    title: 'ELSS: the tax-saving equity fund',
    principle:
      'An Equity Linked Savings Scheme is an open-ended equity fund holding at least 80% in equities whose investments qualify for deduction under Section 80C up to 1.5 lakh a year for taxpayers in the old tax regime. Each investment is locked in for three years and cannot be redeemed, transferred or pledged in that time; for SIPs every instalment has its own three-year lock-in. It has the shortest lock-in among 80C options.',
    source: SRC,
    asOf: '2025-06',
    topics: ['mutual-funds', 'tax'],
    keywords: ['ELSS', 'tax saving mutual fund', 'section 80C', '3 year lock in', 'old tax regime', 'equity linked savings scheme'],
  },
  {
    id: 'xa-11-debt-categories-short',
    title: 'Short-term debt fund categories',
    principle:
      'Debt funds balance credit risk (judged by ratings) and interest-rate risk (longer tenors swing more). SEBI categories at the short end: overnight funds (one-day securities), liquid funds (securities maturing within 91 days), ultra-short duration (portfolio Macaulay duration 3 to 6 months), low duration (6 to 12 months), and money market funds (money-market instruments up to one year). Next come short duration (1 to 3 years), medium duration (3 to 4 years) and medium-to-long duration (4 to 7 years) funds; medium and medium-to-long funds may cut duration to one year when the manager expects adverse conditions. Short-term funds can beat liquid funds but carry more mark-to-market risk.',
    source: SRC,
    asOf: '2025-06',
    topics: ['mutual-funds', 'bonds'],
    keywords: ['overnight fund', 'liquid fund', 'ultra short duration fund', 'low duration fund', 'money market fund', 'short duration fund', 'medium duration fund', 'Macaulay duration', 'debt fund categories'],
  },
  {
    id: 'xa-11-debt-categories-long-credit',
    title: 'Long-term and credit-focused debt fund categories',
    principle:
      'Long-duration funds (Macaulay duration over 7 years) earn interest plus capital gains when rates fall and lose when they rise, so returns are volatile. Corporate bond funds hold at least 80% in bonds rated AA+ and above; credit-risk funds at least 65% in bonds rated AA and below (more yield, more default risk); banking and PSU funds at least 80% in paper of banks, PSUs, public financial institutions and municipal bonds; gilt funds at least 80% in G-secs (no default risk, high liquidity, high rate sensitivity; popular with provident fund trusts); 10-year constant-duration gilt funds keep portfolio duration at 10 years; dynamic bond funds move freely across durations; floater funds hold at least 65% in floating-rate instruments, limiting rate risk.',
    source: SRC,
    asOf: '2025-06',
    topics: ['mutual-funds', 'bonds'],
    keywords: ['long duration fund', 'corporate bond fund', 'credit risk fund', 'banking and PSU fund', 'gilt fund', 'constant duration gilt', 'dynamic bond fund', 'floater fund', 'AA+'],
  },
  {
    id: 'xa-11-fmp-target-maturity',
    title: 'Fixed maturity plans and target maturity funds',
    principle:
      'Fixed maturity plans are close-ended debt funds (3 months to 5 years) holding securities that mature with the plan; held to maturity they largely avoid interest-rate risk, which suits rising-rate periods when yields can be locked. Target maturity funds also have a defined maturity date but are open-ended (buy and redeem with the AMC anytime) with longer ranges (3 to 15 years seen). Both "roll down": residual maturity falls daily.',
    source: SRC,
    topics: ['mutual-funds', 'bonds'],
    keywords: ['fixed maturity plan', 'FMP', 'target maturity fund', 'TMF', 'roll down', 'lock in yield', 'hold to maturity debt fund'],
  },
  {
    id: 'xa-11-hybrid-categories',
    title: 'Hybrid fund categories',
    principle:
      'Conservative hybrid: 75 to 90% debt, 10 to 25% equity, aimed at regular income with low volatility (taxed as debt). Balanced hybrid: 40 to 60% each; aggressive hybrid: 65 to 80% equity, 20 to 35% debt; a fund house offers one of these two. Dynamic asset allocation or balanced advantage funds shift between equity and debt, often hedging part of the equity with derivatives while keeping gross equity above 65% for equity taxation. Multi-asset allocation funds hold at least 10% in each of at least three asset classes (foreign securities are not a separate class). Arbitrage funds earn the cash-futures gap. Equity savings funds hold at least 65% in equity (including arbitrage) and at least 10% in debt. Capital protection funds are close-ended: enough in debt to grow back to the principal by maturity, the rest in equity derivatives.',
    source: SRC,
    asOf: '2025-06',
    topics: ['mutual-funds', 'asset-allocation'],
    keywords: ['hybrid funds', 'conservative hybrid', 'balanced hybrid', 'aggressive hybrid', 'balanced advantage fund', 'dynamic asset allocation', 'multi asset allocation fund', 'arbitrage fund', 'equity savings fund', 'capital protection fund'],
  },
  {
    id: 'xa-11-solution-other-funds',
    title: 'Solution-oriented funds, fund of funds, ETFs, gold and silver ETFs',
    principle:
      'Retirement funds lock in for at least five years or until retirement age, whichever is earlier; children’s funds for five years or until the child comes of age, whichever is earlier. A fund of funds invests at least 95% in other mutual funds (same house or multi-manager), adding a layer of cost; an equity FoF does not get equity-fund taxation (after the July 2024 Budget, gains on growth units held over two years are taxed at 12.5% plus surcharge and cess). ETFs hold at least 95% in the tracked index’s securities, are bought in an NFO then traded in demat at real-time prices, with index-fund-like costs. Gold ETFs hold 99.5% pure gold or gold receipts (up to 20% in bank gold deposit schemes); silver ETFs hold 99.9% pure silver bars and silver derivatives; expenses and cash make returns trail the metal slightly.',
    source: SRC,
    asOf: '2025-06',
    topics: ['mutual-funds', 'products', 'tax'],
    keywords: ['retirement fund', 'children fund', 'solution oriented', 'fund of funds', 'FoF taxation', 'ETF', 'gold ETF', 'silver ETF', 'tracking'],
  },
  {
    id: 'xa-11-real-estate-infra-sif',
    title: 'Real estate MFs, infrastructure debt schemes and specialised investment funds',
    principle:
      'Real estate mutual funds (close-ended, listed) must hold at least 35% in physical property and at least 75% in property plus real-estate securities; none has launched yet. Infrastructure debt schemes are close-ended (at least five years), at least 90% in infrastructure debt, minimum investment 1 crore, unit face value 10 lakh, NAV disclosed at least quarterly, sponsors with infrastructure experience. Specialised investment funds are a new SEBI category with a 10 lakh minimum, sitting between mutual funds and PMS (50 lakh), allowing strategies MFs cannot run, such as long-short and derivative positions beyond hedging.',
    source: SRC,
    asOf: '2025-06',
    topics: ['mutual-funds', 'products'],
    keywords: ['real estate mutual fund', 'infrastructure debt fund', 'specialised investment fund', 'SIF', '10 lakh minimum', 'long short fund'],
  },
  {
    id: 'xa-11-idcw-growth-triggers',
    title: 'Growth versus IDCW options, and triggers',
    principle:
      'In the growth option returns stay in the fund and show up as a higher NAV, realised by redeeming. The income distribution cum capital withdrawal (IDCW, formerly dividend) option pays out distributions, which reduce NAV by the amount paid and may include the investor’s own capital; IDCW reinvestment buys new units at the post-distribution NAV instead. Triggers automatically redeem or switch when a set condition is met: a target return, a value, a NAV level, a date or an index level, so the investor need not watch continuously.',
    source: SRC,
    topics: ['mutual-funds'],
    keywords: ['growth option', 'IDCW', 'dividend option', 'dividend reinvestment', 'capital withdrawal', 'trigger', 'auto redemption'],
  },
  {
    id: 'xa-11-transactions',
    title: 'Buying, redeeming and switching mutual fund units',
    principle:
      'A first purchase (in the NFO or later) needs PAN and KYC, holder details (up to three holders), mode of holding, bank details and nomination; the RTA creates a folio, the investor’s identity for all later transactions. Redemptions can be by units or amount, at the day’s applicable NAV less any exit load, paid to the first holder’s registered bank account; instant access on liquid funds pays the same day up to 50,000 or 90% of the holding, whichever is lower, per day per scheme for resident individuals. NRI proceeds go to NRO if invested from non-repatriable funds, or NRE/NRO as chosen if from repatriable funds. Funds may close a folio that falls below a minimum balance, restrict redemptions in systemic crises, and must list schemes being wound up. A switch is a redemption plus purchase, so exit loads and tax apply.',
    source: SRC,
    asOf: '2025-06',
    topics: ['mutual-funds', 'operations'],
    keywords: ['folio', 'KYC', 'redemption', 'exit load', 'switch', 'instant access facility', 'NRI redemption', 'NRE NRO', 'nomination'],
  },
  {
    id: 'xa-11-sip-rupee-cost-averaging',
    title: 'SIP and rupee-cost averaging',
    principle:
      'A systematic investment plan invests a fixed sum at fixed intervals into a scheme. Because the amount is constant, it buys more units when the NAV is low and fewer when high, lowering the average cost per unit over time: rupee-cost averaging, its main advantage alongside building a corpus from small sums. The investor chooses scheme and option, instalment (often below the lump-sum minimum), frequency, date, tenor and payment mode (NACH, standing instruction, post-dated cheques). SIPs can be cancelled with notice; failed instalments may lead the fund to cancel the SIP.',
    inPractice:
      'Worked figure: 10,000 a month buys 1,000 units at 10, 1,250 at 8 and 800 at 12.5; average cost is 30,000 / 3,050 units = 9.84, below the average NAV of 10.17.',
    source: SRC,
    asOf: '2025-06',
    topics: ['sip', 'mutual-funds', 'behaviour'],
    keywords: ['SIP', 'systematic investment plan', 'rupee cost averaging', 'NACH', 'SIP cancellation', 'average cost'],
  },
  {
    id: 'xa-11-swp-stp-dtp-vip',
    title: 'SWP, STP, dividend transfer and value averaging',
    principle:
      'A systematic withdrawal plan redeems a fixed amount at set intervals for a regular payout and spreads redemption price risk; each withdrawal attracts exit load and capital-gains tax; variants withdraw only appreciation. A systematic transfer plan redeems from a source scheme and invests in a target scheme of the same fund house in the same folio, for example moving equity gains into short-term debt as a goal nears, avoiding a single-day exit. A dividend (IDCW) transfer plan sends distributions from one scheme into another. Value averaging invests more when the portfolio is below a target growth path and less when above (target growing 1% a month, a shortfall of 300 adds 300 to the next instalment); it is complex and few AMCs automate it.',
    source: SRC,
    asOf: '2025-06',
    topics: ['mutual-funds', 'sip', 'retirement'],
    keywords: ['SWP', 'systematic withdrawal plan', 'STP', 'systematic transfer plan', 'dividend transfer plan', 'value averaging', 'VIP'],
  },
  {
    id: 'xa-11-direct-vs-regular',
    title: 'Direct plan versus regular plan, and the adviser’s role',
    principle:
      'Every scheme offers a direct plan (bought from the AMC or RTA without a distributor) and a regular plan (bought through a distributor who is paid commission from the scheme). The portfolio is identical; the direct plan’s lower expense ratio means a higher net return. Regular plans buy a distributor’s help with paperwork, service issues and regulatory changes; direct plans are do-it-yourself, including monitoring. The adviser should explain this trade-off, judge whether the client has the knowledge and time to manage direct plans, and show how to transact in them.',
    inPractice:
      'For a client with an adviser already giving the advice, the direct plan avoids paying twice; the saving compounds over decades.',
    source: SRC,
    topics: ['mutual-funds', 'costs'],
    keywords: ['direct plan', 'regular plan', 'expense ratio', 'distributor commission', 'direct vs regular', 'TER'],
  },
];
