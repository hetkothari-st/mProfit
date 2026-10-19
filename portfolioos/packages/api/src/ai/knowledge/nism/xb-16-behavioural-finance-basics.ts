import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-B',
  edition: '2025-12',
  chapter: 16,
  chapterTitle: 'Basics of Behavioural Finance',
};

export const XB_16: readonly KnowledgeEntry[] = [
  {
    id: 'xb-16-standard-vs-behavioural',
    title: 'Standard finance assumes rational investors; behavioural finance studies real ones',
    principle:
      'Classical finance models assume people are rational, risk averse, self-interested, update beliefs as news arrives and see all information. Behavioural finance, rooted in psychology rather than economics, studies how real investors depart from that: concentrated portfolios, swings of greed and fear, crediting luck to skill, confusing a good company with a good stock, and preferring familiar domestic names. It explains anomalies the standard models leave unexplained. Kahneman (Nobel 2002) and Thaler (Nobel 2017) brought it into the mainstream.',
    inPractice:
      'When a client wants to act against the plan, assume a bias is at work before assuming new information: ask what changed in their goals, not in the market.',
    source: SRC,
    topics: ['behaviour'],
    keywords: ['behavioural finance', 'behavioral', 'standard finance', 'rational investor', 'psychology', 'Kahneman', 'Thaler', 'anomalies', 'emotion', 'panic'],
  },
  {
    id: 'xb-16-bounded-rationality',
    title: 'Bounded rationality: people satisfice instead of optimise',
    principle:
      'With limited time, information and capacity to process complexity, people do not search for the best option. They process a manageable slice of information, apply rules of thumb, and accept the first choice that seems good enough, which Herbert Simon (Nobel 1978) called satisficing. This is not irrational; it is rational choice inside tight limits, sitting between full analysis and pure intuition.',
    inPractice:
      'Reduce the decision to two or three clear options with the trade-off spelled out; a client handed twenty funds will satisfice on the wrong one.',
    source: SRC,
    topics: ['behaviour'],
    keywords: ['bounded rationality', 'satisficing', 'satisfice', 'Herbert Simon', 'rule of thumb', 'heuristic'],
  },
  {
    id: 'xb-16-prospect-theory',
    title: 'Prospect theory: gains and losses are judged from a reference point',
    principle:
      'Kahneman and Tversky (1979) showed that people judge outcomes as gains or losses relative to a reference point, not as final wealth. Choices happen in two phases: first the options are framed using shortcuts, then the framed options are valued and the best-looking one picked. People lock in gains early (risk averse on gains) but hang on to losers hoping to break even (risk seeking on losses), and a loss hurts more than an equal gain pleases.',
    inPractice:
      'A client anchored on their purchase price will refuse to sell a poor fund "until it recovers"; reframe the decision as where the money should sit from today.',
    source: SRC,
    topics: ['behaviour'],
    keywords: ['prospect theory', 'Kahneman', 'Tversky', 'reference point', 'loss aversion', 'framing', 'gains', 'losses', 'sell', 'hold'],
  },
  {
    id: 'xb-16-emotional-vs-cognitive',
    title: 'Two families of bias: emotional biases and cognitive errors',
    principle:
      'Investing biases fall into emotional biases, which spring from feelings and deep personal experience and are often self-protective, and cognitive errors, which come from faulty reasoning, memory or information processing such as using a shortcut instead of the calculation. Cognitive errors can usually be corrected with information and vigilance; emotional biases are harder to change and are more often accommodated. No one is free of bias, but discipline and checklists reduce the damage.',
    inPractice:
      'Correct a cognitive error with numbers; work around an emotional bias with rules the client agreed to in advance.',
    source: SRC,
    topics: ['behaviour'],
    keywords: ['emotional bias', 'cognitive error', 'cognitive bias', 'biases', 'checklist', 'discipline'],
  },
  {
    id: 'xb-16-loss-aversion-disposition',
    title: 'Loss aversion and the disposition effect',
    principle:
      'Loss aversion is an emotional bias: losses weigh far more than equal gains, so people gamble to avoid a loss but grab a sure gain. Shefrin and Statman (1985) named the disposition effect, the habit of selling winners too soon and holding losers too long. It also helps explain price momentum in markets.',
    inPractice:
      'Review losers and winners by the same test: would you buy this today at this price for this goal? If not, the purchase price is irrelevant.',
    source: SRC,
    topics: ['behaviour'],
    keywords: ['loss aversion', 'disposition effect', 'Shefrin', 'Statman', 'sell winners', 'hold losers', 'emotional bias'],
  },
  {
    id: 'xb-16-overconfidence-stereotyping',
    title: 'Overconfidence, self-attribution and stereotyping',
    principle:
      'Overconfidence is unwarranted faith in one’s own judgment; most people rate themselves above average. Combined with self-attribution (crediting wins to skill, blaming losses on others) it leads to concentrated portfolios, sector or country bets, excessive trading and holding losers in areas the investor thinks they understand, and it blurs skill with luck. Stereotyping (representativeness) is judging by surface traits, such as assuming a celebrated CEO means a good investment.',
    inPractice:
      'After a big winning bet, check the client’s allocation before they do: a lucky 5x often triggers an oversized next bet.',
    source: SRC,
    topics: ['behaviour', 'risk'],
    keywords: ['overconfidence', 'self-attribution', 'stereotyping', 'representativeness', 'excessive trading', 'concentration', 'skill', 'luck'],
  },
  {
    id: 'xb-16-endowment-status-quo-regret',
    title: 'Endowment, status quo and regret aversion',
    principle:
      'Endowment bias makes people value what they own more than the same thing they do not own; inherited shares are rarely sold even when they no longer fit the plan. Status quo bias is choosing no decision at all, closely tied to regret aversion: people fear regret from acting (an error of commission) more than from not acting (an error of omission). Thaler’s nudges, such as default enrolment into pension plans, overcame status quo bias and raised enrolment sharply.',
    inPractice:
      'Make the good choice the default (auto-SIP, auto-rebalance) so doing nothing does the right thing.',
    source: SRC,
    topics: ['behaviour'],
    keywords: ['endowment bias', 'status quo bias', 'regret aversion', 'inherited shares', 'commission', 'omission', 'nudge', 'default'],
  },
  {
    id: 'xb-16-mental-accounting',
    title: 'Mental accounting: money treated differently by its label',
    principle:
      'Mental accounting, developed by Thaler, is a cognitive error in which people treat equal sums differently depending on where the money came from or which mental bucket it sits in. Windfalls, bonuses and tax refunds get spent or gambled more freely than salary. Goal buckets help tracking but can lead to poor asset choices within each bucket; money is fungible and the portfolio should be optimised as a whole.',
    inPractice:
      'A bonus is salary paid late: run it through the same plan (debts, emergency fund, goals) before any "fun money" slice.',
    source: SRC,
    topics: ['behaviour', 'savings'],
    keywords: ['mental accounting', 'Thaler', 'fungible', 'bonus', 'windfall', 'tax refund', 'buckets'],
  },
  {
    id: 'xb-16-framing-anchoring-choice-paralysis',
    title: 'Framing, anchoring and choice paralysis',
    principle:
      'Framing: the same facts presented differently (nine in ten survive versus one in ten die; mostly lean versus a little fat) produce different choices, which matters when a client fills a risk questionnaire or judges performance. Anchoring: people lean on an initial number, like the first price in a negotiation or a stock’s past price, and read everything after it through that anchor. Choice paralysis: too many options or too much information leads people to postpone deciding.',
    inPractice:
      'Show risk both ways (what can be gained and what can be lost) so the answer reflects the client, not the wording.',
    source: SRC,
    topics: ['behaviour', 'risk-profiling'],
    keywords: ['framing', 'anchoring', 'choice paralysis', 'too many options', 'risk questionnaire', 'cognitive error'],
  },
  {
    id: 'xb-16-fusion-investing',
    title: 'Fusion investing: value and quality screens plus momentum',
    principle:
      'Fusion investing blends fundamental analysis with behavioural finance: prices reflect value over the long run but are moved by crowd behaviour in the short run (the voting machine versus weighing machine idea). A typical screen is three steps: pick stocks cheap on P/E, P/BV or P/S; keep those that are fundamentally strong on profitability, leverage and efficiency (for example a high Piotroski F-score, 0 to 9); then keep those showing positive price momentum. Momentum needs frequent rebalancing, so costs and taxes weigh heavily, and evidence that it works is not conclusive.',
    source: SRC,
    topics: ['behaviour', 'equity', 'valuation'],
    keywords: ['fusion investing', 'momentum', 'value', 'Piotroski', 'F-score', 'P/E', 'P/BV', 'voting machine', 'weighing machine'],
  },
  {
    id: 'xb-16-market-anomalies',
    title: 'Behavioural biases explain market anomalies',
    principle:
      'An anomaly is a price move that the available information and asset-pricing models such as CAPM cannot explain. Systematic investor mistakes create them: overconfidence understates risk, self-attribution and confirmation bias make people trade too often on beliefs, and the disposition effect produces momentum. Anomalies come and go; some vanish once exploited, others persist for years.',
    source: SRC,
    topics: ['behaviour', 'markets'],
    keywords: ['market anomaly', 'anomalies', 'CAPM', 'confirmation bias', 'momentum', 'mispricing'],
  },
  {
    id: 'xb-16-bubbles-crashes',
    title: 'Bubbles and crashes are psychology as much as economics',
    principle:
      'Kindleberger described a bubble as a sustained price rise where each rise breeds expectations of more and draws in speculators. Bubbles usually start from a real change (railways, electricity, technology), then cheap credit, media celebrity, momentum and herd trading, and an illusion of control push prices past value; arbitrageurs struggle to coordinate, so mispricing lasts. They are likelier where traders are inexperienced, true value is uncertain, payoffs are lottery-like, leverage is easy and short selling is hard. A crash is the same process in reverse, with everyone selling at once. Even Isaac Newton lost heavily in the South Sea bubble.',
    inPractice:
      'When a theme is everywhere in the news and the client wants in because others got rich, that is the cue to hold the allocation, not chase it.',
    source: SRC,
    topics: ['behaviour', 'markets', 'market-timing'],
    keywords: ['bubble', 'crash', 'Kindleberger', 'herd', 'speculation', 'tulip', 'South Sea', 'tech bubble', 'illusion of control', 'market crash'],
  },
];
