/**
 * The adviser's reading list — the core ideas of five classic books on
 * investing and personal finance, written in our own words and credited to
 * their authors, plus the planning framework the adviser follows.
 *
 * Nothing here is copied text: each entry paraphrases one well-known idea so
 * the assistant can say "as Bogle argues…" and apply it to the client's own
 * numbers. The books are credited, not reproduced. (A test guards against
 * long verbatim quotes.) Figures that are law — tax rates, IRDAI rules — do
 * NOT live here; they come from the services that own them.
 *
 * Searched in-process (search.ts): no embeddings service, no database.
 */

export type KnowledgeTopic =
  | 'planning'
  | 'behaviour'
  | 'costs'
  | 'diversification'
  | 'asset-allocation'
  | 'rebalancing'
  | 'risk'
  | 'emergency-fund'
  | 'insurance'
  | 'debt'
  | 'goals'
  | 'tax'
  | 'market-timing'
  | 'compounding'
  | 'valuation'
  | 'index-funds'
  | 'savings'
  | 'retirement'
  | 'real-estate'
  | 'sip';

export interface KnowledgeBook {
  title: string;
  author: string;
  year: number;
}

export type KnowledgeSource =
  | { kind: 'BOOK'; book: string; author: string }
  | { kind: 'FRAMEWORK'; label: string };

export interface KnowledgeEntry {
  id: string;
  title: string;
  /** The idea, in our own words. */
  principle: string;
  /** How it plays out for an Indian investor, in our own words. */
  inPractice?: string;
  source: KnowledgeSource;
  topics: KnowledgeTopic[];
  keywords: string[];
}

export const KNOWLEDGE_BOOKS: readonly KnowledgeBook[] = [
  { title: 'The Intelligent Investor', author: 'Benjamin Graham', year: 1949 },
  { title: 'The Little Book of Common Sense Investing', author: 'John C. Bogle', year: 2007 },
  { title: 'A Random Walk Down Wall Street', author: 'Burton G. Malkiel', year: 1973 },
  { title: 'The Psychology of Money', author: 'Morgan Housel', year: 2020 },
  { title: "Let's Talk Money", author: 'Monika Halan', year: 2018 },
];

const [GRAHAM, BOGLE, MALKIEL, HOUSEL, HALAN] = KNOWLEDGE_BOOKS.map(
  (b): KnowledgeSource => ({ kind: 'BOOK', book: b.title, author: b.author }),
) as [KnowledgeSource, KnowledgeSource, KnowledgeSource, KnowledgeSource, KnowledgeSource];

const FRAMEWORK: KnowledgeSource = { kind: 'FRAMEWORK', label: 'Planning framework' };

export const KNOWLEDGE_LIBRARY: readonly KnowledgeEntry[] = [
  // ── The planning framework the adviser follows ─────────────────────
  {
    id: 'plan-order',
    title: 'Plan in order, foundation first',
    principle:
      'Work through a household’s money in a fixed order: an emergency fund, then protection (term life and health cover), then clearing expensive debt, then investing for named goals, then setting the asset mix, then trimming costs and tax, and throughout, guarding against costly behaviour. Skipping ahead to picking investments before the foundation is in place is the most common planning mistake.',
    source: FRAMEWORK,
    topics: ['planning', 'goals'],
    keywords: ['where to start', 'first step', 'priority', 'order', 'new money', 'invest now', 'what should i do', 'plan', 'review'],
  },
  {
    id: 'plan-emergency-fund',
    title: 'Emergency fund: about six months of expenses',
    principle:
      'Keep roughly six months of household expenses somewhere safe and instantly available before investing for growth. Its job is to stop a job loss, illness or big repair from forcing you to sell investments at a bad time or borrow at a high rate.',
    inPractice:
      'In India that usually means a savings account, sweep-in FD or a liquid or overnight mutual fund — not equity, and not money locked in a long FD or PPF.',
    source: FRAMEWORK,
    topics: ['emergency-fund', 'planning'],
    keywords: ['emergency fund', 'emergency', 'liquid', 'buffer', 'months of expenses', 'job loss', 'rainy day', 'savings account', 'liquid fund'],
  },
  {
    id: 'plan-term-cover',
    title: 'Protection: term cover sized to income',
    principle:
      'If anyone depends on your income, pure term life cover of roughly 10 to 15 times your annual income is the usual starting point, adjusted for loans and big goals. Life insurance is for protection; buying it for returns usually gets you too little cover and poor returns.',
    source: FRAMEWORK,
    topics: ['insurance', 'planning'],
    keywords: ['term insurance', 'life cover', 'how much cover', 'dependants', 'sum assured', 'term plan', 'life insurance'],
  },
  {
    id: 'plan-health-cover',
    title: 'Protection: health cover that doesn’t end with your job',
    principle:
      'Have health cover of your own for the family, not just the employer’s group policy, which ends when the job does. A base policy plus a super top-up is a common, cost-effective way to reach an adequate sum insured.',
    source: FRAMEWORK,
    topics: ['insurance', 'planning'],
    keywords: ['health insurance', 'mediclaim', 'family floater', 'super top-up', 'employer cover', 'hospital', 'medical'],
  },
  {
    id: 'plan-expensive-debt',
    title: 'Clear expensive debt before investing',
    principle:
      'Credit-card balances and personal loans usually cost far more in interest than any investment can reliably earn, so paying them off is a guaranteed, tax-free return. New investing can wait until they are gone.',
    source: FRAMEWORK,
    topics: ['debt', 'planning'],
    keywords: ['credit card', 'personal loan', 'debt', 'interest', 'pay off', 'prepay', 'outstanding', 'emi'],
  },
  {
    id: 'plan-goal-first',
    title: 'Every rupee needs a purpose and a date',
    principle:
      'Before choosing any investment, ask what the money is for and when it will be needed. The goal and its timeline decide how much risk the money can take, so a product chosen without them is a guess.',
    source: FRAMEWORK,
    topics: ['goals', 'planning'],
    keywords: ['goal', 'purpose', 'timeline', 'what for', 'when', 'which fund', 'what should i buy', 'where to invest'],
  },
  {
    id: 'plan-horizon-allocation',
    title: 'Match the asset mix to the horizon',
    principle:
      'Money needed within about three years belongs in debt and cash; money not needed for seven years or more can hold a large share of equity; in between, blend the two. Within those limits, the client’s risk profile sets the exact mix.',
    source: FRAMEWORK,
    topics: ['asset-allocation', 'goals', 'risk'],
    keywords: ['horizon', 'equity', 'debt', 'allocation', 'short term', 'long term', 'years', 'mix'],
  },
  {
    id: 'plan-rebalance',
    title: 'Rebalance on a schedule, not on a feeling',
    principle:
      'Check the mix against its target once a year, or when it drifts by more than about five percentage points, and bring it back. Rebalancing is a rule, not a forecast; it avoids the temptation to time the market.',
    source: FRAMEWORK,
    topics: ['rebalancing', 'asset-allocation'],
    keywords: ['rebalance', 'drift', 'schedule', 'annual review', 'target allocation', 'overweight', 'underweight'],
  },
  {
    id: 'plan-costs-tax',
    title: 'Keep costs and tax low',
    principle:
      'Prefer direct plans to regular ones, and low-cost index funds unless there is a clear reason for an active fund. Where it makes sense, hold equity long enough for the long-term capital-gains rate. When sizing a tax saving, use the capital-gains rate that actually applies, not the income-tax slab.',
    source: FRAMEWORK,
    topics: ['costs', 'tax', 'index-funds'],
    keywords: ['direct plan', 'regular plan', 'expense ratio', 'commission', 'index fund', 'ltcg', 'stcg', 'holding period', 'tax saving'],
  },
  {
    id: 'plan-concentration',
    title: 'No single position above a quarter',
    principle:
      'Any one holding above roughly 25% of the portfolio is a risk in itself, however good the company or fund looks. Concentration is how a single piece of bad news becomes a financial setback.',
    source: FRAMEWORK,
    topics: ['diversification', 'risk'],
    keywords: ['concentration', 'single stock', 'one company', 'position size', 'too much', 'overweight', 'employer stock'],
  },
  {
    id: 'plan-behaviour',
    title: 'Behaviour costs more than fund choice',
    principle:
      'Most long-run damage comes from panic selling, chasing whatever is hot and trading too often, not from picking a slightly worse fund. The adviser’s job is often to slow a decision down.',
    source: FRAMEWORK,
    topics: ['behaviour'],
    keywords: ['panic', 'fomo', 'overtrading', 'emotion', 'fear', 'greed', 'sell everything', 'everyone is buying'],
  },

  // ── Benjamin Graham, The Intelligent Investor ──────────────────────
  {
    id: 'graham-mr-market',
    title: 'The moody business partner',
    principle:
      'Graham pictures the market as an emotional partner who names a price for your share every day — euphoric one day, gloomy the next. You are free to ignore his offers or use them; his mood tells you about his feelings, not about what the business is worth.',
    inPractice: 'A sharp fall is an offer, not an instruction. What matters is whether the goal and its horizon have changed.',
    source: GRAHAM,
    topics: ['behaviour', 'market-timing', 'valuation'],
    keywords: ['mr market', 'volatility', 'crash', 'market fall', 'price', 'panic', 'sell', 'market down'],
  },
  {
    id: 'graham-margin-of-safety',
    title: 'Margin of safety',
    principle:
      'Graham’s central idea: buy only when the price is comfortably below a conservative estimate of value, so that errors of judgement or plain bad luck don’t turn into permanent losses.',
    source: GRAHAM,
    topics: ['valuation', 'risk'],
    keywords: ['margin of safety', 'valuation', 'overpay', 'cheap', 'expensive', 'buy', 'value'],
  },
  {
    id: 'graham-investing-vs-speculating',
    title: 'Investing is not speculating',
    principle:
      'Graham defines investing as an operation that, after thorough analysis, protects the principal and promises an adequate return; anything else is speculation. He doesn’t forbid speculation, but says to keep it small, separate and clearly labelled in your own mind.',
    inPractice: 'F&O, crypto and tips from friends belong in a small, separate pot, never in money meant for goals.',
    source: GRAHAM,
    topics: ['risk', 'behaviour'],
    keywords: ['speculation', 'trading', 'f&o', 'options', 'crypto', 'gamble', 'tip', 'quick money'],
  },
  {
    id: 'graham-defensive-investor',
    title: 'The defensive investor',
    principle:
      'Graham separates the defensive investor, who wants sound results with little time or effort, from the enterprising one, who puts in real work. Most people are better off being defensive: a diversified, low-maintenance portfolio of quality holdings.',
    source: GRAHAM,
    topics: ['asset-allocation', 'index-funds'],
    keywords: ['defensive investor', 'passive', 'simple', 'low effort', 'busy', 'no time'],
  },
  {
    id: 'graham-stock-bond-split',
    title: 'Keep a balance between stocks and bonds',
    principle:
      'Graham suggests keeping somewhere between a quarter and three-quarters in stocks, with an even split as the default, and restoring the balance when markets push it off course — trimming stocks after big rises and adding after big falls.',
    source: GRAHAM,
    topics: ['asset-allocation', 'rebalancing'],
    keywords: ['equity debt split', 'balance', 'stocks bonds', 'rebalance', '50 50', 'allocation'],
  },
  {
    id: 'graham-yourself',
    title: 'The investor’s own worst enemy',
    principle:
      'Graham argues that the investor’s chief problem — and even his worst enemy — is likely to be himself. Temperament, patience and discipline matter more than cleverness.',
    source: GRAHAM,
    topics: ['behaviour'],
    keywords: ['temperament', 'emotion', 'discipline', 'mistakes', 'patience'],
  },
  {
    id: 'graham-price-matters',
    title: 'A good company can be a bad investment',
    principle:
      'Graham warns that no company is so good that it can’t be overpriced. Popularity pushes prices above value, and a great business bought at too high a price can deliver poor returns for years.',
    source: GRAHAM,
    topics: ['valuation', 'risk'],
    keywords: ['overvalued', 'expensive stock', 'popular', 'quality stock', 'price', 'high pe'],
  },
  {
    id: 'graham-new-issues',
    title: 'Be wary of hot new issues',
    principle:
      'Graham cautions against buying new issues in buoyant markets: they tend to come to market when conditions favour the seller, priced for the seller’s benefit rather than the buyer’s.',
    inPractice: 'An oversubscribed IPO is a signal of demand, not of value.',
    source: GRAHAM,
    topics: ['risk', 'behaviour'],
    keywords: ['ipo', 'new issue', 'listing gains', 'hot market', 'oversubscribed'],
  },
  {
    id: 'graham-formula-investing',
    title: 'Invest a fixed sum regularly',
    principle:
      'For the defensive investor Graham endorses putting the same amount in at regular intervals, which buys more units when prices are low and fewer when they are high, and removes the need to judge the timing.',
    inPractice: 'This is the logic behind a monthly SIP.',
    source: GRAHAM,
    topics: ['sip', 'market-timing'],
    keywords: ['sip', 'regular investing', 'rupee cost averaging', 'dollar cost averaging', 'timing', 'monthly'],
  },

  // ── John C. Bogle, The Little Book of Common Sense Investing ───────
  {
    id: 'bogle-costs-matter',
    title: 'Costs come straight out of your return',
    principle:
      'Bogle’s arithmetic: investors as a group earn the market’s return before costs, so after costs they must fall short of it by exactly what they pay. Fees, commissions and expense ratios are the one part of returns you can control, and every rupee saved is yours to keep.',
    inPractice: 'The gap between a regular and a direct plan, or an active fund and an index fund, is paid every single year.',
    source: BOGLE,
    topics: ['costs', 'index-funds'],
    keywords: ['expense ratio', 'costs', 'fees', 'commission', 'index fund', 'active fund', 'direct plan', 'regular plan', 'returns'],
  },
  {
    id: 'bogle-own-the-market',
    title: 'Own the whole market',
    principle:
      'Rather than hunting for the few stocks or funds that will win, Bogle recommends owning the entire market through a broad, low-cost index fund, which guarantees your fair share of its return.',
    inPractice: 'For an Indian investor, a Nifty 50 or broader-market index fund does this job.',
    source: BOGLE,
    topics: ['index-funds', 'diversification'],
    keywords: ['index fund', 'nifty 50', 'whole market', 'stock picking', 'which stock', 'broad market'],
  },
  {
    id: 'bogle-active-underperform',
    title: 'Most active funds trail their index over time',
    principle:
      'Bogle shows that over long periods most actively managed funds fall behind their benchmark once costs are counted, and that it is very hard to identify the few winners in advance.',
    source: BOGLE,
    topics: ['index-funds', 'costs'],
    keywords: ['active fund', 'underperform', 'benchmark', 'fund manager', 'beat the market', 'alpha'],
  },
  {
    id: 'bogle-past-performance',
    title: 'Don’t chase last year’s winner',
    principle:
      'Bogle warns that past fund performance is a poor guide to the future: yesterday’s top funds often drift back towards the average, and investors who switch into them usually buy after the gains.',
    source: BOGLE,
    topics: ['behaviour', 'costs'],
    keywords: ['past performance', 'top fund', 'best fund', 'chasing returns', 'star rating', 'switch fund'],
  },
  {
    id: 'bogle-compounding-costs',
    title: 'Small costs compound into large sums',
    principle:
      'A difference of one percentage point a year in costs looks trivial, but compounded over decades Bogle shows it can consume a large share of the final corpus.',
    source: BOGLE,
    topics: ['costs', 'compounding'],
    keywords: ['compounding', 'long term', 'expense ratio difference', 'one percent', 'fees over time'],
  },
  {
    id: 'bogle-simplicity',
    title: 'Simple beats complicated',
    principle:
      'Bogle’s case for simplicity: a few broad, low-cost funds usually do better than a sprawling collection, which adds cost and overlap without adding real diversification.',
    inPractice: 'Ten funds that all hold the same large companies are not ten times diversified.',
    source: BOGLE,
    topics: ['diversification', 'costs'],
    keywords: ['too many funds', 'overlap', 'simple portfolio', 'complicated', 'consolidate'],
  },
  {
    id: 'bogle-stay-the-course',
    title: 'Stay the course',
    principle:
      'Bogle’s repeated advice is to pick a sensible allocation and stay with it, rather than jumping in and out as markets rise and fall — the moves in and out are where most investors lose returns.',
    source: BOGLE,
    topics: ['behaviour', 'market-timing'],
    keywords: ['stay invested', 'market fall', 'crash', 'exit', 're-enter', 'timing', 'hold', 'stop sip'],
  },
  {
    id: 'bogle-age-in-bonds',
    title: 'A rough rule for the bond share',
    principle:
      'As a starting point, Bogle suggests a bond share roughly equal to your age, adjusted for your own tolerance for risk and your circumstances — a guide, not a rule.',
    source: BOGLE,
    topics: ['asset-allocation', 'retirement'],
    keywords: ['age', 'allocation', 'bonds', 'debt percentage', 'retirement', 'how much equity'],
  },
  {
    id: 'bogle-turnover',
    title: 'Trading adds costs and taxes',
    principle:
      'Bogle points out that frequent trading, whether by a fund or by the investor, adds transaction costs and taxes that quietly erode returns — money that simply holding would have kept.',
    source: BOGLE,
    topics: ['costs', 'tax', 'behaviour'],
    keywords: ['trading', 'turnover', 'churn', 'overtrading', 'short term gains', 'tax drag'],
  },

  // ── Burton G. Malkiel, A Random Walk Down Wall Street ──────────────
  {
    id: 'malkiel-random-walk',
    title: 'Short-term prices are hard to predict',
    principle:
      'Malkiel argues that short-term price movements are close to random, so forecasting, chart-reading and market timing rarely beat a simple buy-and-hold approach after costs.',
    source: MALKIEL,
    topics: ['market-timing'],
    keywords: ['predict market', 'forecast', 'technical analysis', 'charts', 'timing', 'good time to buy', 'where market goes'],
  },
  {
    id: 'malkiel-index-core',
    title: 'Index funds as the sensible core',
    principle:
      'Because professional managers as a group struggle to beat broad indices after costs, Malkiel concludes that low-cost index funds make a sensible core for most portfolios.',
    source: MALKIEL,
    topics: ['index-funds', 'costs'],
    keywords: ['index fund', 'efficient market', 'active fund', 'fund manager', 'core portfolio'],
  },
  {
    id: 'malkiel-bubbles',
    title: 'Manias end badly',
    principle:
      'Malkiel’s history of speculative manias — from Dutch tulips to the dot-com boom — shows crowds pushing prices far past any sensible value. When everyone is talking about one asset, extra caution is warranted.',
    inPractice: 'Ask what goal the purchase serves, and how much of the portfolio it would become.',
    source: MALKIEL,
    topics: ['behaviour', 'risk'],
    keywords: ['bubble', 'mania', 'hype', 'fomo', 'everyone buying', 'crypto', 'hot stock', 'multibagger'],
  },
  {
    id: 'malkiel-risk-return',
    title: 'No free lunch',
    principle:
      'Malkiel stresses that higher expected returns come only with higher risk. An offer of high returns with no risk should be treated as a warning sign.',
    source: MALKIEL,
    topics: ['risk'],
    keywords: ['guaranteed return', 'high return', 'safe', 'risk free', 'too good to be true', 'scheme'],
  },
  {
    id: 'malkiel-life-cycle',
    title: 'Allocation follows your stage of life',
    principle:
      'Malkiel ties the right mix to age, capacity for risk and attitude to risk: someone young with a steady income can hold more equity; someone near a big spending need should hold less.',
    source: MALKIEL,
    topics: ['asset-allocation', 'retirement'],
    keywords: ['age', 'life cycle', 'young', 'near retirement', 'risk capacity', 'allocation'],
  },
  {
    id: 'malkiel-rebalancing',
    title: 'Rebalancing buys low and sells high',
    principle:
      'Malkiel recommends periodically restoring the target mix; doing so mechanically trims what has risen and adds to what has fallen, reducing risk without needing a forecast.',
    source: MALKIEL,
    topics: ['rebalancing'],
    keywords: ['rebalance', 'target allocation', 'drift', 'trim', 'book profit'],
  },
  {
    id: 'malkiel-steady-investing',
    title: 'Invest steadily',
    principle:
      'Malkiel notes that investing a fixed amount at regular intervals reduces the risk of putting everything in just before a fall — useful discipline for anyone investing from monthly income.',
    source: MALKIEL,
    topics: ['sip', 'market-timing'],
    keywords: ['sip', 'lump sum', 'regular investing', 'peak', 'timing', 'stp'],
  },
  {
    id: 'malkiel-asset-classes',
    title: 'Diversify across asset classes',
    principle:
      'Malkiel’s case for spreading money across equities, bonds and other assets: because they don’t all fall together, the mix reduces risk without giving up much return.',
    source: MALKIEL,
    topics: ['diversification', 'asset-allocation'],
    keywords: ['diversification', 'asset classes', 'gold', 'real estate', 'bonds', 'mix'],
  },
  {
    id: 'malkiel-provisions',
    title: 'Cash reserve and insurance come first',
    principle:
      'Before investing, Malkiel advises putting provisions in place: a cash reserve for emergencies and adequate insurance, so a setback doesn’t force you to sell investments.',
    source: MALKIEL,
    topics: ['emergency-fund', 'insurance', 'planning'],
    keywords: ['cash reserve', 'emergency', 'insurance', 'before investing', 'foundation'],
  },

  // ── Morgan Housel, The Psychology of Money ─────────────────────────
  {
    id: 'housel-behaviour',
    title: 'Behaviour beats brilliance',
    principle:
      'Housel’s theme: doing well with money has less to do with intelligence or knowledge and more to do with how you behave — and behaviour is hard to teach, even to very smart people.',
    source: HOUSEL,
    topics: ['behaviour'],
    keywords: ['behaviour', 'discipline', 'emotions', 'smart', 'knowledge'],
  },
  {
    id: 'housel-room-for-error',
    title: 'Leave room for error',
    principle:
      'Housel argues for planning with a margin for things going wrong — a cash buffer, conservative assumptions, a savings rate that isn’t stretched — because staying in the game matters more than squeezing out the last bit of return.',
    source: HOUSEL,
    topics: ['emergency-fund', 'risk', 'planning'],
    keywords: ['buffer', 'room for error', 'unexpected', 'conservative', 'savings'],
  },
  {
    id: 'housel-time-compounding',
    title: 'Compounding needs time',
    principle:
      'Housel shows that most long-run wealth comes from staying invested for a very long time; the length of time matters more than finding the highest return.',
    source: HOUSEL,
    topics: ['compounding', 'behaviour'],
    keywords: ['compounding', 'long term', 'patience', 'start early', 'time in market'],
  },
  {
    id: 'housel-survival',
    title: 'Getting rich and staying rich are different skills',
    principle:
      'Housel notes that building wealth takes risk-taking and optimism, while keeping it takes caution and humility — above all, avoiding the kind of loss or leverage you can’t recover from.',
    source: HOUSEL,
    topics: ['risk', 'debt'],
    keywords: ['leverage', 'ruin', 'survive', 'loan against shares', 'margin', 'borrow to invest'],
  },
  {
    id: 'housel-volatility-fee',
    title: 'Volatility is the price of admission',
    principle:
      'Housel frames market swings as the fee you pay for equity’s long-run returns, not a penalty for having done something wrong. Treat it as a cost worth paying and it becomes easier to sit through.',
    source: HOUSEL,
    topics: ['behaviour', 'market-timing'],
    keywords: ['volatility', 'market fall', 'crash', 'drop', 'decline', 'down', 'correction'],
  },
  {
    id: 'housel-wealth-unseen',
    title: 'Wealth is what you don’t spend',
    principle:
      'Housel points out that wealth is invisible — it is the income not spent on things. A high savings rate builds wealth more reliably than a high income alone.',
    source: HOUSEL,
    topics: ['savings'],
    keywords: ['saving', 'spending', 'income', 'wealth', 'lifestyle', 'savings rate'],
  },
  {
    id: 'housel-enough',
    title: 'Know what is enough',
    principle:
      'Housel warns that without a sense of "enough", people risk what they have and need for things they don’t — the endlessly moving goalpost of comparison.',
    source: HOUSEL,
    topics: ['goals', 'risk'],
    keywords: ['enough', 'greed', 'comparison', 'more', 'retire early'],
  },
  {
    id: 'housel-save-without-reason',
    title: 'Save even without a reason',
    principle:
      'Housel argues for saving even when there is no specific goal: savings buy independence, options and the ability to handle surprises.',
    source: HOUSEL,
    topics: ['savings', 'emergency-fund'],
    keywords: ['save', 'savings', 'independence', 'options', 'surprise'],
  },
  {
    id: 'housel-reasonable',
    title: 'Reasonable beats rational',
    principle:
      'Housel’s view is that a plan you can live with and stick to beats a theoretically optimal one you’ll abandon at the first bad stretch.',
    source: HOUSEL,
    topics: ['behaviour', 'asset-allocation'],
    keywords: ['stick with plan', 'optimal', 'comfortable', 'sleep at night', 'too aggressive'],
  },
  {
    id: 'housel-tails',
    title: 'A few outcomes drive most results',
    principle:
      'Housel notes that a small number of events — a few stocks, a few strong days — account for most long-run returns, so you have to stay invested to benefit from them.',
    source: HOUSEL,
    topics: ['market-timing', 'behaviour'],
    keywords: ['best days', 'miss rally', 'few stocks', 'stay invested', 'timing'],
  },

  // ── Monika Halan, Let's Talk Money ─────────────────────────────────
  {
    id: 'halan-money-box',
    title: 'Give your money a structure',
    principle:
      'Halan’s approach is to set up a simple structure (her "money box") before choosing products: money for spending, an emergency fund, protection through insurance, and investments for goals — each with its own job.',
    source: HALAN,
    topics: ['planning', 'goals'],
    keywords: ['money box', 'structure', 'buckets', 'organise', 'budget', 'where to start'],
  },
  {
    id: 'halan-separate-money',
    title: 'Keep spending money and saving money apart',
    principle:
      'Halan suggests separating the money you spend from the money you save and invest — even with separate bank accounts — so savings aren’t quietly spent and each pot is easy to track.',
    source: HALAN,
    topics: ['savings'],
    keywords: ['bank account', 'salary account', 'spending', 'separate', 'automate', 'savings'],
  },
  {
    id: 'halan-emergency-fund',
    title: 'The emergency fund comes before investing',
    principle:
      'Halan puts an emergency fund of several months of expenses, in something safe and quick to access, before any investing — so a crisis doesn’t mean breaking investments or borrowing.',
    inPractice: 'A savings account, sweep-in FD or liquid fund does the job.',
    source: HALAN,
    topics: ['emergency-fund'],
    keywords: ['emergency fund', 'emergency', 'months of expenses', 'liquid fund', 'fd'],
  },
  {
    id: 'halan-insurance-not-investment',
    title: 'Don’t mix insurance and investment',
    principle:
      'Halan’s advice is to buy pure term cover for life and a proper health policy for the family, and to keep investing separate — products that bundle the two usually give too little cover and weak returns.',
    inPractice: 'Endowment, money-back and many traditional plans are the usual examples.',
    source: HALAN,
    topics: ['insurance'],
    keywords: ['term plan', 'endowment', 'ulip', 'money back', 'insurance investment', 'traditional plan', 'lic policy'],
  },
  {
    id: 'halan-ask-how-paid',
    title: 'Ask how the seller is paid',
    principle:
      'Halan cautions against products pushed by bank relationship managers and agents, where commissions can drive the recommendation. Asking how the seller is paid is the simplest protection.',
    source: HALAN,
    topics: ['costs', 'insurance'],
    keywords: ['relationship manager', 'agent', 'commission', 'mis-selling', 'bank', 'distributor'],
  },
  {
    id: 'halan-direct-plans',
    title: 'Direct plans keep the commission in your pocket',
    principle:
      'Halan recommends direct plans of mutual funds, which skip the distributor commission built into regular plans and so leave more of the return with the investor.',
    source: HALAN,
    topics: ['costs'],
    keywords: ['direct plan', 'regular plan', 'commission', 'mutual fund', 'expense ratio'],
  },
  {
    id: 'halan-simple-start',
    title: 'Start simple',
    principle:
      'For someone new to investing, Halan suggests starting with a simple, broad fund — such as an index fund — through a monthly SIP, and adding complexity only when there’s a reason.',
    source: HALAN,
    topics: ['index-funds', 'sip'],
    keywords: ['beginner', 'first investment', 'start investing', 'sip', 'index fund', 'which mutual fund'],
  },
  {
    id: 'halan-epf-ppf',
    title: 'EPF and PPF as the steady base',
    principle:
      'Halan treats EPF and PPF as part of the safe, debt side of long-term savings, which matters when judging how much equity the rest of the portfolio should hold.',
    source: HALAN,
    topics: ['asset-allocation', 'retirement', 'tax'],
    keywords: ['ppf', 'epf', 'provident fund', 'debt', 'safe', 'retirement savings'],
  },
  {
    id: 'halan-debt-discipline',
    title: 'Borrow with care',
    principle:
      'Halan warns against revolving credit-card debt and borrowing for consumption, reserving loans for essentials and assets that are expected to hold or grow in value.',
    source: HALAN,
    topics: ['debt'],
    keywords: ['credit card', 'loan', 'emi', 'borrow', 'consumption', 'personal loan'],
  },
  {
    id: 'halan-home',
    title: 'A home is a lifestyle choice first',
    principle:
      'Halan distinguishes the home you live in — largely a lifestyle decision — from property bought as an investment, which is illiquid, lumpy and costly to buy and sell.',
    source: HALAN,
    topics: ['real-estate'],
    keywords: ['house', 'property', 'real estate', 'buy home', 'second home', 'plot', 'rent vs buy'],
  },
];
