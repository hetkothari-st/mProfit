import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-B',
  edition: '2025-12',
  chapter: 17,
  chapterTitle: 'Behavioural Finance in Practice',
};

export const XB_17: readonly KnowledgeEntry[] = [
  {
    id: 'xb-17-emotional-spending',
    title: 'Stress spending: make it visible and give it a budget',
    principle:
      'Some clients relieve stress by shopping ("retail therapy"); it feels good briefly and creates more financial stress later. The adviser first helps the client see that the spending is stress-driven, then sets a fixed budget for it, in extreme cases kept in a separate account spent only by debit card or cash, so the limit is built in. Credit cards make impulse spending easier and are a poor fit for such clients.',
    source: SRC,
    topics: ['behaviour', 'savings'],
    keywords: ['retail therapy', 'impulse spending', 'stress', 'budget', 'credit card', 'separate account'],
  },
  {
    id: 'xb-17-overtrading-action-bias',
    title: 'Action bias turns investing into trading',
    principle:
      'People feel a need to do something, while investing rewards years of patience; investing should be boring. Action bias plus other biases leads to too many, too frequent transactions. The remedy is priming the client in advance on why patience and staying invested pay off, before the urge to act arrives.',
    inPractice:
      'In a sharp fall, the SIP that keeps running buys more units cheaply; stopping it is the action bias at work.',
    source: SRC,
    topics: ['behaviour', 'market-timing', 'sip'],
    keywords: ['action bias', 'overtrading', 'frequent transactions', 'patience', 'stop SIP', 'market crash', 'panic', 'stay invested'],
  },
  {
    id: 'xb-17-chasing-performance',
    title: 'Chasing last year’s winner is driving by the rear-view mirror',
    principle:
      'Some investors move into whatever did best last year, gold after gold rose, equity after equity rose. Asset classes move in cycles and revert to the mean, so this eventually buys high. A pre-agreed asset-allocation policy with an upper limit per asset class, and a maximum per security within a class, prevents overexposure.',
    source: SRC,
    topics: ['behaviour', 'asset-allocation'],
    keywords: ['performance chasing', 'past performance', 'mean reversion', 'asset allocation limit', 'recency', 'last year winner'],
  },
  {
    id: 'xb-17-home-bias',
    title: 'Home-country bias and global diversification',
    principle:
      'Investors favour home-market securities out of familiarity, giving up diversification from assets that do not move with local markets. Other barriers: little knowledge of overseas options, legal limits, access cost, foreign tax compliance and advisers unfamiliar with them. Indian residents can invest abroad under the Liberalised Remittance Scheme (up to USD 250,000 per financial year) or through Indian mutual funds investing overseas, including S&P 500 and Nasdaq 100 index funds.',
    inPractice:
      'Overseas exposure is a diversification decision, not a return bet; size it in the allocation and check LRS and TCS before remitting.',
    source: SRC,
    asOf: '2025-12',
    topics: ['behaviour', 'diversification'],
    keywords: ['home bias', 'home country bias', 'global investing', 'international', 'LRS', 'liberalised remittance scheme', 'S&P 500', 'Nasdaq 100', 'overseas'],
  },
  {
    id: 'xb-17-insurance-for-tax',
    title: 'Buying insurance to save tax leads to the wrong cover',
    principle:
      'Generations of Indians bought insurance mainly to save tax and ended up with the wrong product and too little cover. Adequate insurance is the first step of a plan; the tax saving only lowers its cost. Comparing like for like, a term policy plus an equivalent investment such as PPF will typically beat an endowment plan costing the same premium.',
    source: SRC,
    topics: ['behaviour', 'insurance', 'tax'],
    keywords: ['insurance for tax saving', 'endowment', 'term plan', 'buy term invest the rest', 'PPF', 'section 80C', 'wrong cover'],
  },
  {
    id: 'xb-17-over-under-diversification',
    title: 'Too many funds or too few holdings',
    principle:
      'Owning many securities is not diversification: two large-cap, four mid-cap and six small-cap funds overlap heavily and can be replaced by one broad index fund covering the top 500 companies. The opposite error is putting everything into one or two securities. The adviser finds the middle ground to fit the client’s risk profile, resources and goal horizons.',
    source: SRC,
    topics: ['behaviour', 'diversification', 'mutual-funds'],
    keywords: ['over-diversification', 'too many funds', 'concentrated portfolio', 'overlap', 'index fund', 'Nifty 500', 'diworsification'],
  },
  {
    id: 'xb-17-framing-in-advice',
    title: 'Frame the recommendation the way the client hears it',
    principle:
      'Some clients respond to what they will gain by following a plan, others to what they will lose by not following it. The recommendation is the same either way; the framing decides whether it lands. Diagnostic tools can suggest which framing suits a client, to be confirmed in conversation, and framing also skews answers to risk-tolerance questions.',
    source: SRC,
    topics: ['behaviour', 'risk-profiling'],
    keywords: ['framing', 'gain frame', 'loss frame', 'risk tolerance', 'communication'],
  },
  {
    id: 'xb-17-nudges-ground-rules',
    title: 'Ground rules agreed in advance act as nudges',
    principle:
      'Rules the client signs up to before markets move become built-in nudges. A rebalancing rule, for example, makes the client book profits when an asset class runs up and buy when it falls, without a fresh emotional decision each time. The adviser’s steady presence through greed and fear cycles keeps the client on the planned path.',
    inPractice:
      'Agree the rebalancing band (say ±5 points around target) at plan time; when a fall triggers it, buying is a rule, not a judgment call.',
    source: SRC,
    topics: ['behaviour', 'rebalancing'],
    keywords: ['nudge', 'ground rules', 'rebalancing rule', 'greed', 'fear', 'discipline', 'investment policy'],
  },
  {
    id: 'xb-17-competing-goals-emotion',
    title: 'Prioritising goals when emotion and money collide',
    principle:
      'When resources cannot fund every goal, clients often favour the emotional one, such as a child’s best possible education, over a vital but distant one like retirement. The adviser shows how far retirement is being compromised and offers alternatives, for instance funding part of the education with a loan the child repays after graduating.',
    source: SRC,
    topics: ['behaviour', 'goals', 'retirement'],
    keywords: ['goal prioritisation', 'education vs retirement', 'education loan', 'competing goals', 'emotional decision'],
  },
];
