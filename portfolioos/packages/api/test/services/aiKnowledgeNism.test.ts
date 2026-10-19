import { describe, it, expect } from 'vitest';
import { searchKnowledge } from '../../src/ai/knowledge/search.js';
import { NISM_LIBRARY } from '../../src/ai/knowledge/nism/index.js';

// One natural question per NISM chapter must find that chapter's key entry in
// the top five — the same retrieval the assistant uses at answer time.
const ids = (q: string) => searchKnowledge(q, { limit: 5 }).map((h) => h.entry.id);

describe('NISM library', () => {
  it('ids follow the series-chapter convention and match their source', () => {
    for (const e of NISM_LIBRARY) {
      expect(e.source.kind, e.id).toBe('NISM');
      if (e.source.kind !== 'NISM') continue;
      const prefix = `${e.source.series === 'X-A' ? 'xa' : 'xb'}-${String(e.source.chapter).padStart(2, '0')}-`;
      expect(e.id.startsWith(prefix), e.id).toBe(true);
    }
  });
});

describe('NISM retrieval, chapter by chapter', () => {
  it('X-A 1: six-step planning process', () => {
    expect(ids('what are the steps of the financial planning process')).toContain('xa-01-six-step-process');
  });
  it('X-A 1: advice vs distribution', () => {
    expect(ids('can an investment adviser also earn distribution commission')).toContain('xa-01-advice-vs-distribution');
  });
  it('X-A 2: CAGR', () => {
    expect(ids('how do I calculate CAGR of my fund')).toContain('xa-02-cagr');
  });
  it('X-A 2: annuity due', () => {
    expect(ids('difference between ordinary annuity and annuity due')).toContain('xa-02-annuity-types');
  });
  it('X-A 3: liquidity ratio', () => {
    expect(ids('what is the liquidity ratio and what counts as liquid assets')).toContain('xa-03-liquidity-ratio');
  });
  it('X-A 3: debt to income', () => {
    expect(ids('what debt to income ratio is too high')).toContain('xa-03-debt-to-income');
  });
  it('X-A 4: avalanche vs snowball', () => {
    expect(ids('avalanche or snowball method to pay off my loans')).toContain('xa-04-avalanche-snowball-blizzard');
  });
  it('X-A 4: hypothecation', () => {
    expect(ids('is a car loan a pledge or hypothecation')).toContain('xa-04-mortgage-pledge-hypothecation');
  });
  it('X-A 4: prepay or invest', () => {
    expect(ids('should I prepay my home loan or invest the bonus')).toContain('xa-04-invest-or-prepay');
  });
  it('X-A 5: regulators', () => {
    expect(ids('who regulates insurance and pension in India, IRDAI PFRDA')).toContain('xa-05-irdai-pfrda-sro');
  });
  it('X-A 5: depositories', () => {
    expect(ids('what do NSDL and CDSL do, depository participant')).toContain('xa-05-market-infrastructure');
  });
  it('X-A 6: book building cut-off', () => {
    expect(ids('how is the cut-off price decided in a book built IPO')).toContain('xa-06-book-building');
  });
  it('X-A 6: circuit breakers', () => {
    expect(ids('market wide circuit breaker levels')).toContain('xa-06-circuit-breakers-price-bands');
  });
  it('X-A 6: stock split', () => {
    expect(ids('what happens to face value in a stock split')).toContain('xa-06-split-buyback-delisting');
  });
  it('X-A 7: investment grade rating', () => {
    expect(ids('which credit ratings are investment grade and which are junk')).toContain('xa-07-govt-vs-corporate-debt-ratings');
  });
  it('X-A 7: preference shares', () => {
    expect(ids('cumulative vs non cumulative preference shares')).toContain('xa-07-equity-and-preference-shares');
  });
  it('X-A 8: PEG ratio', () => {
    expect(ids('how to use the PEG ratio')).toContain('xa-08-peg-eva-mva');
  });
  it('X-A 8: systematic risk', () => {
    expect(ids('which equity risk cannot be diversified away')).toContain('xa-08-equity-risks');
  });
  it('X-A 8: EV/EBITDA', () => {
    expect(ids('how is enterprise value calculated for EV/EBITDA')).toContain('xa-08-enterprise-value-multiples');
  });
  it('X-A 9: duration', () => {
    expect(ids('what is modified duration of a bond')).toContain('xa-09-duration');
  });
  it('X-A 9: yield curve shapes', () => {
    expect(ids('what does an inverted yield curve mean')).toContain('xa-09-yield-curve');
  });
  it('X-A 9: current yield and YTM', () => {
    expect(ids('difference between current yield and yield to maturity')).toContain('xa-09-coupon-current-ytm');
  });
  it('X-A 9: senior citizens scheme', () => {
    expect(ids('who can open SCSS senior citizens savings scheme')).toContain('xa-09-scss-pomis-td-rd');
  });
  it('X-A 9: Sukanya Samriddhi', () => {
    expect(ids('Sukanya Samriddhi account rules for my daughter')).toContain('xa-09-kvp-sukanya');
  });
  it('X-A 10: option moneyness', () => {
    expect(ids('when is a call option in the money, intrinsic value')).toContain('xa-10-options-basics');
  });
  it('X-A 10: futures pricing', () => {
    expect(ids('how is a futures price related to spot, cost of carry')).toContain('xa-10-futures-pricing-basis-arbitrage');
  });
  it('X-A 11: mid cap definition', () => {
    expect(ids('what rank is a mid cap company and how much must a mid cap fund hold')).toContain('xa-11-equity-categories-size');
  });
  it('X-A 11: ELSS lock-in', () => {
    expect(ids('ELSS lock in period for SIP')).toContain('xa-11-elss');
  });
  it('X-A 11: credit risk fund', () => {
    expect(ids('credit risk fund rating rule')).toContain('xa-11-debt-categories-long-credit');
  });
  it('X-A 11: SWP', () => {
    expect(ids('systematic withdrawal plan for monthly income from mutual fund')).toContain('xa-11-swp-stp-dtp-vip');
  });
  it('X-A 12: PMS high watermark', () => {
    expect(ids('how does high watermark work for PMS performance fee')).toContain('xa-12-fees-hurdle-high-watermark');
  });
  it('X-A 12: PMS minimum', () => {
    expect(ids('minimum investment for portfolio management service, discretionary PMS')).toContain('xa-12-responsibilities');
  });
  it('X-A 13: AIF categories', () => {
    expect(ids('difference between AIF category I II and III')).toContain('xa-13-categories');
  });
  it('X-A 13: accredited investor', () => {
    expect(ids('who qualifies as an accredited investor for AIF')).toContain('xa-13-accredited-investors');
  });
  it('X-A 14: efficient frontier', () => {
    expect(ids('what is the efficient frontier in portfolio optimisation')).toContain('xa-14-efficient-frontier-optimisation');
  });
  it('X-A 14: portfolio variance', () => {
    expect(ids('how does correlation reduce portfolio standard deviation of two assets')).toContain('xa-14-portfolio-return-variance');
  });
  it('X-A 15: strategic vs tactical', () => {
    expect(ids('strategic versus tactical asset allocation')).toContain('xa-15-strategic-vs-tactical');
  });
  it('X-A 15: rebalancing', () => {
    expect(ids('how often should I rebalance my portfolio')).toContain('xa-15-rebalancing');
  });
  it('X-A 15: investor personality', () => {
    expect(ids('BB&K investor personality types guardian adventurer')).toContain('xa-15-psychographic-bbk');
  });
  it('X-A 16: TWRR vs XIRR', () => {
    expect(ids('time weighted return versus XIRR money weighted return')).toContain('xa-16-twrr-vs-mwrr');
  });
  it('X-A 16: Sharpe ratio', () => {
    expect(ids('what does a Sharpe ratio tell me, compare with Treynor')).toContain('xa-16-sharpe-treynor');
  });
  it('X-A 16: information ratio', () => {
    expect(ids('information ratio and tracking error of a fund')).toContain('xa-16-sortino-information-m2');
  });
  it('X-A 16: CAGR', () => {
    expect(ids('how to calculate CAGR of my investment')).toContain('xa-16-cagr-annualising');
  });
  it('X-A 17: transmission after death', () => {
    expect(ids('my father died, how do I claim his shares and mutual funds, transmission')).toContain('xa-17-transmission');
  });
  it('X-A 17: NRI repatriation', () => {
    expect(ids('can an NRI repatriate money from NRO account')).toContain('xa-17-nri-residency-repatriation');
  });
  it('X-A 17: minor turns 18', () => {
    expect(ids('what happens to my child SIP when minor turns major at 18')).toContain('xa-17-minors');
  });
  it('X-A 17: nomination', () => {
    expect(ids('how many nominees can I add to my demat account')).toContain('xa-17-nomination');
  });
  it('X-A 17: KYC', () => {
    expect(ids('what is CKYC and KRA KYC registration')).toContain('xa-17-kyc-ckyc');
  });
  it('X-A 17: MITC', () => {
    expect(ids('MITC most important terms in investment advisory agreement')).toContain('xa-17-advice-documentation-mitc');
  });
  it('X-B 16: prospect theory', () => {
    expect(ids('why do people hold losing stocks and sell winners early, prospect theory')).toContain('xb-16-prospect-theory');
  });
  it('X-B 16: mental accounting', () => {
    expect(ids('treating a bonus differently from salary money')).toContain('xb-16-mental-accounting');
  });
  it('X-B 17: home country bias', () => {
    expect(ids('should I invest abroad through LRS for diversification')).toContain('xb-17-home-bias');
  });
  it('X-B 17: too many funds', () => {
    expect(ids('I own twelve mutual funds, is that too many')).toContain('xb-17-over-under-diversification');
  });
});
