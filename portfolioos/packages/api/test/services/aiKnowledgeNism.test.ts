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
  it('X-A 18: registration exemption', () => {
    expect(ids('does a CA giving investment advice need SEBI investment adviser registration')).toContain('xa-18-ia-definitions-exemptions');
  });
  it('X-A 18: advice vs distribution', () => {
    expect(ids('can an investment adviser also earn commission as distributor')).toContain('xa-18-ia-fees-segregation');
  });
  it('X-A 18: suitability', () => {
    expect(ids('adviser suitability rules for complex products and risk questionnaire')).toContain('xa-18-risk-profiling-suitability');
  });
  it('X-A 18: insider trading', () => {
    expect(ids('what is insider trading and UPSI')).toContain('xa-18-pfutp-insider-trading');
  });
  it('X-A 19: fiduciary', () => {
    expect(ids('what does fiduciary duty of an adviser mean')).toContain('xa-19-fiduciary-duty');
  });
  it('X-A 19: finfluencer warning', () => {
    expect(ids('should I follow a finfluencer stock tips with assured returns')).toContain('xa-19-sebi-investor-dos-donts');
  });
  it('X-A 20: SCORES', () => {
    expect(ids('how to file a complaint against my broker with SEBI SCORES')).toContain('xa-20-securities-scores-odr');
  });
  it('X-A 20: insurance claim rejected', () => {
    expect(ids('my insurance claim was rejected, where can I complain')).toContain('xa-20-insurance-ombudsman');
  });
  it('X-A 20: banking ombudsman', () => {
    expect(ids('bank not resolving my complaint, RBI ombudsman')).toContain('xa-20-banking-ombudsman');
  });
  it('X-B 1: non-disclosure', () => {
    expect(ids('will my insurance claim be rejected if I did not disclose smoking')).toContain('xb-01-utmost-good-faith-insurable-interest');
  });
  it('X-B 1: co-pay vs deductible', () => {
    expect(ids('difference between co-pay and deductible in health insurance')).toContain('xb-01-copay-deductible');
  });
  it('X-B 1: section 45', () => {
    expect(ids('can life insurance claim be denied after 3 years, section 45')).toContain('xb-01-nominee-section-45-moratorium');
  });
  it('X-B 2: how much life cover', () => {
    expect(ids('how much term insurance do I need, human life value')).toContain('xb-02-human-life-value');
  });
  it('X-B 2: endowment return', () => {
    expect(ids('is an endowment policy a good investment, what return')).toContain('xb-02-endowment-whole-life');
  });
  it('X-B 2: ULIP vs mutual fund', () => {
    expect(ids('ULIP vs term plan plus mutual fund')).toContain('xb-02-ulip-vs-term-plus-mf');
  });
  it('X-B 2: MWPA', () => {
    expect(ids('protect life insurance from creditors MWPA policy for wife')).toContain('xb-02-mwpa');
  });
  it('X-B 2: surrender', () => {
    expect(ids('should I surrender my LIC policy, surrender value or paid up')).toContain('xb-02-surrender-paid-up');
  });
  it('X-B 3: super top up', () => {
    expect(ids('top up vs super top up health insurance')).toContain('xb-03-top-up-super-top-up');
  });
  it('X-B 3: critical illness', () => {
    expect(ids('do I need critical illness insurance if I have health insurance')).toContain('xb-03-accident-critical-illness');
  });
  it('X-B 3: motor NCB', () => {
    expect(ids('car insurance no claim bonus transfer to new car')).toContain('xb-03-motor-insurance');
  });
  it('X-B 4: replacement ratio', () => {
    expect(ids('replacement ratio method to estimate retirement income')).toContain('xb-04-replacement-ratio');
  });
  it('X-B 4: longevity risk', () => {
    expect(ids('what is longevity risk in retirement corpus planning')).toContain('xb-04-retirement-process-variables');
  });
  it('X-B 5: EPF withdrawal tax', () => {
    expect(ids('is PF withdrawal taxable before five years of service')).toContain('xb-05-epf-vpf-tax');
  });
  it('X-B 5: gratuity formula', () => {
    expect(ids('how is gratuity calculated 15/26 formula')).toContain('xb-05-gratuity');
  });
  it('X-B 5: NPS exit', () => {
    expect(ids('NPS exit rules at 60, how much annuity is compulsory')).toContain('xb-05-nps-exit');
  });
  it('X-B 5: NPS tax', () => {
    expect(ids('NPS 80CCD(1B) extra 50000 deduction')).toContain('xb-05-nps-tax');
  });
  it('X-B 5: SCSS', () => {
    expect(ids('SCSS maximum deposit 30 lakh and premature closure')).toContain('xb-05-scss-pomis-pmvvy');
  });
  it('X-B 5: reverse mortgage', () => {
    expect(ids('how does a reverse mortgage work for senior citizens')).toContain('xb-05-reverse-mortgage');
  });
  it('X-B 5: PPF extension', () => {
    expect(ids('PPF account after 15 years extension with contribution')).toContain('xb-05-ppf-withdrawal-extension');
  });
  it('X-B 6: cost of delay', () => {
    expect(ids('how much more do I need to save if I start retirement saving at 40 instead of 30')).toContain('xb-06-cost-of-delay');
  });
  it('X-B 6: EPF transfer', () => {
    expect(ids('should I withdraw or transfer my PF when changing job')).toContain('xb-06-early-withdrawals-transfers');
  });
  it('X-B 7: RNOR status', () => {
    expect(ids('returning NRI resident but not ordinarily resident status 729 days')).toContain('xb-07-residential-status');
  });
  it('X-B 7: home loan interest', () => {
    expect(ids('home loan interest deduction 2 lakh self occupied new regime')).toContain('xb-07-house-property');
  });
  it('X-B 7: clubbing', () => {
    expect(ids('if I gift money to my wife who pays tax on the interest, clubbing')).toContain('xb-07-clubbing');
  });
  it('X-B 7: loss set off', () => {
    expect(ids('can long term capital loss be set off against short term gain, carry forward')).toContain('xb-07-set-off-carry-forward');
  });
  it('X-B 7: 87A rebate', () => {
    expect(ids('no tax up to 12 lakh new regime rebate 87A')).toContain('xb-07-deductions-rebate');
  });
  it('X-B 8: holding period', () => {
    expect(ids('after how many months is a debt fund or unlisted share long term')).toContain('xb-08-holding-periods');
  });
  it('X-B 8: indexation on property', () => {
    expect(ids('property bought before July 2024 indexation 20% or 12.5%')).toContain('xb-08-indexation');
  });
  it('X-B 8: section 54', () => {
    expect(ids('save capital gains tax by buying a new house section 54 or 54EC bonds')).toContain('xb-08-exemptions-54');
  });
  it('X-B 8: grandfathering', () => {
    expect(ids('cost of acquisition grandfathering 31 January 2018 shares')).toContain('xb-08-computation');
  });
  it('X-B 9: buyback tax', () => {
    expect(ids('how is a share buyback taxed now')).toContain('xb-09-dividends-buyback');
  });
  it('X-B 9: gift from relative', () => {
    expect(ids('is a gift of shares from my uncle taxable, who is a relative')).toContain('xb-09-gifts');
  });
  it('X-B 10: debt fund tax', () => {
    expect(ids('how is a debt mutual fund bought in 2024 taxed')).toContain('xb-10-mutual-fund-tax-categories');
  });
  it('X-B 10: tax free bonds', () => {
    expect(ids('tax free bonds capital gain on sale')).toContain('xb-10-gsec-tbill-taxfree');
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
