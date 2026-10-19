import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-A',
  edition: '2025-06',
  chapter: 14,
  chapterTitle: 'Introduction to Modern Portfolio Theory',
};

export const XA_14: readonly KnowledgeEntry[] = [
  {
    id: 'xa-14-markowitz-assumptions',
    title: 'Modern portfolio theory and its assumptions',
    principle:
      'Harry Markowitz’s 1952 paper "Portfolio Selection" (Nobel 1990) turned "don’t put all your eggs in one basket" into mathematics: portfolio risk is the variance of returns, and diversification works through covariance or correlation between assets. MPT assumes investors maximise return for a given risk (choosing the less risky of two equal-return assets), maximise one-period expected utility, have diminishing marginal utility of wealth, judge risk by the variability of expected returns, and decide on expected return and variance (or standard deviation) alone.',
    source: SRC,
    topics: ['portfolio-theory', 'diversification'],
    keywords: ['modern portfolio theory', 'MPT', 'Markowitz', 'portfolio selection', 'mean variance', 'utility', 'covariance'],
  },
  {
    id: 'xa-14-risk-attitudes',
    title: 'Risk-averse, risk-neutral and risk-seeking investors',
    principle:
      'A fair game offers no risk premium. Risk-averse investors reject fair games and take risk only for a positive risk premium, demanding more as risk rises; they score portfolios with a utility that penalises risk. The certainty-equivalent rate is the risk-free return that would be just as attractive as a given risky portfolio; a very risk-averse investor’s certainty equivalent can fall below the risk-free rate, so the risky portfolio is rejected. Risk-neutral investors judge purely on expected return (their certainty equivalent equals the expected return). Risk seekers accept fair games, adding utility for risk.',
    source: SRC,
    topics: ['portfolio-theory', 'risk', 'risk-profiling'],
    keywords: ['risk averse', 'risk neutral', 'risk seeking', 'risk premium', 'fair game', 'certainty equivalent rate', 'utility score'],
  },
  {
    id: 'xa-14-expected-return-variance',
    title: 'Expected return and standard deviation of a single asset',
    principle:
      'Expected return = sum of each scenario’s return x its probability. Example: returns of 18%, 9% and -4% with probabilities 0.25, 0.55 and 0.20 give 4.5 + 4.95 - 0.8 = 8.65%. Standard deviation measures risk as dispersion around the mean: from historical returns, compute the mean, square each deviation from it, sum, divide by (n - 1) for the sample variance, then take the square root.',
    source: SRC,
    asOf: '2025-06',
    topics: ['portfolio-theory', 'risk'],
    keywords: ['expected return', 'probability weighted return', 'variance', 'standard deviation', 'n-1', 'dispersion'],
  },
  {
    id: 'xa-14-portfolio-return-variance',
    title: 'Portfolio return and portfolio variance',
    principle:
      'Portfolio expected return is the weighted average of the assets’ expected returns. Portfolio variance for two assets = w1²σ1² + w2²σ2² + 2 w1 w2 ρ1,2 σ1 σ2: squared-weight variances plus a weighted covariance term. With n assets there are n variance terms and (n² - n) / 2 covariance terms (1,225 for 50 assets). Example: two assets each with 20% standard deviation, half each, correlation 0.4, give variance 0.01 + 0.01 + 0.008 = 0.028, standard deviation about 16.7%: lower than either asset alone. With correlation +1 the risk is simply the weighted average and there is no diversification benefit; the risk-return combinations fall on a straight line.',
    source: SRC,
    asOf: '2025-06',
    topics: ['portfolio-theory', 'diversification', 'risk'],
    keywords: ['portfolio variance', 'portfolio standard deviation', 'correlation coefficient', 'covariance', 'two asset portfolio', 'diversification benefit', 'n(n-1)/2'],
  },
  {
    id: 'xa-14-efficient-frontier-optimisation',
    title: 'The efficient frontier and portfolio optimisation',
    principle:
      'Of all possible combinations of assets, the efficient frontier is the umbrella-shaped set offering the highest expected return for each level of risk (or lowest risk for each return); portfolios below it give too little return for their risk, those to its right too much risk for their return. Optimisation needs estimates of every asset’s expected return, standard deviation and pairwise correlations plus the investor’s constraints, then picks the efficient portfolio that fits the investor. Results are only as good as the inputs: estimation risk grows fast because the number of correlations explodes with more assets; larger problems use a variance-covariance matrix.',
    source: SRC,
    topics: ['portfolio-theory', 'asset-allocation'],
    keywords: ['efficient frontier', 'optimal portfolio', 'portfolio optimisation', 'estimation risk', 'variance covariance matrix', 'mean variance optimisation'],
  },
];
