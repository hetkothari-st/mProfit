import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-A',
  edition: '2025-06',
  chapter: 2,
  chapterTitle: 'Time Value of Money',
};

export const XA_02: readonly KnowledgeEntry[] = [
  {
    id: 'xa-02-time-value-of-money',
    title: 'Time value of money: a rupee today beats a rupee later',
    principle:
      'Money now is worth more than the same sum later because it can earn a return meanwhile and people prefer consuming now. Future cash flows are discounted at a discount (required return) rate to get present value; present sums are compounded forward to get future value. The later a cash flow arrives, and the higher the discount rate, the lower its present value. Every TVM problem involves four things: the cash flows (single, annuity or uneven), the rate, the time period, and the frequency, and usually asks for one of them.',
    inPractice:
      'To compare an offer of a lump sum now with payments later, bring both to present value at the client’s realistic alternative return.',
    source: SRC,
    asOf: '2025-06',
    topics: ['compounding'],
    keywords: ['time value of money', 'TVM', 'discount rate', 'present value', 'future value', 'discounting', 'compounding'],
  },
  {
    id: 'xa-02-present-value-formula',
    title: 'Present value of a single sum and of a regular stream',
    principle:
      'Single sum: PV = FV / (1 + r)^n, where r is the rate per compounding period and n the number of periods. Level stream of C per period (ordinary annuity): PV = C x [1 - 1/(1 + r)^n] / r. In Excel: PV(rate, nper, pmt, fv, type), with type 0 for end-of-period payments and 1 for start-of-period. Worked figure: 2,00,000 due in 6 years at 7% is worth 2,00,000 / 1.07^6 = about 1,33,268 today.',
    source: SRC,
    asOf: '2025-06',
    topics: ['compounding'],
    keywords: ['present value', 'PV formula', 'discount', 'annuity factor', 'Excel PV', 'lump sum vs payments'],
  },
  {
    id: 'xa-02-future-value-compounding-frequency',
    title: 'Future value and the effect of compounding frequency',
    principle:
      'FV = PV x (1 + r)^n. Divide the annual rate by the number of compounding periods and multiply the years by the same number: 9% compounded quarterly over 4 years means 2.25% for 16 periods. Simple interest (interest withdrawn, not reinvested) earns less than cumulative compounding; more frequent compounding earns more because interest earns interest sooner. Worked figure: 1,00,000 at 9% for 4 years gives 1,41,158 compounded annually but 1,42,762 compounded quarterly, versus 36,000 interest under simple interest. Excel: FV(rate, nper, pmt, pv, type).',
    source: SRC,
    asOf: '2025-06',
    topics: ['compounding'],
    keywords: ['future value', 'FV formula', 'compounding frequency', 'quarterly compounding', 'simple interest', 'cumulative deposit', 'Excel FV'],
  },
  {
    id: 'xa-02-cagr',
    title: 'CAGR: the single annual rate linking start and end values',
    principle:
      'Compound annual growth rate = (End value / Beginning value)^(1/n) - 1, n in years (fractional years allowed: days/365). It assumes the investment grew at one steady compounded rate, and is the standard return measure for periods of a year or more; below a year, absolute or simple annualised returns are used. Excel: RATE(nper, , -PV, FV). Worked figure: a NAV of 20 rising to 26 in 3 years is (26/20)^(1/3) - 1 = 9.14% a year; 15 to 17 over 300 days is (17/15)^(365/300) - 1 = 16.4%.',
    source: SRC,
    asOf: '2025-06',
    topics: ['compounding', 'performance'],
    keywords: ['CAGR', 'compound annual growth rate', 'annualised return', 'RATE function', 'point to point return', 'growth rate'],
  },
  {
    id: 'xa-02-emi-pmt',
    title: 'EMI: the level payment that repays a loan',
    principle:
      'An equated monthly instalment is the PMT of the loan: EMI = P x r x (1 + r)^n / [(1 + r)^n - 1], with r the monthly rate (annual rate / 12) and n the months. Excel: PMT(rate/12, months, -loan). Re-running it with a new rate shows the client how a rate change moves the EMI. Worked figure: 20 lakh at 8.5% for 15 years (180 months) is an EMI of about 19,695.',
    source: SRC,
    asOf: '2025-06',
    topics: ['debt', 'compounding'],
    keywords: ['EMI', 'equated monthly instalment', 'PMT', 'loan payment', 'home loan EMI', 'interest rate change'],
  },
  {
    id: 'xa-02-nper',
    title: 'NPER: how long a loan or saving plan takes',
    principle:
      'NPER solves for the number of periods given the rate, the level payment and the present value. Excel: NPER(rate per period, -payment, PV). Used to see when a loan will be cleared at a chosen EMI, or how long a SIP needs to reach a target, and to check affordability. Worked figure: a 3 lakh loan at 10% a year repaid at 10,000 a month takes about 34.7 months.',
    source: SRC,
    asOf: '2025-06',
    topics: ['debt', 'goals'],
    keywords: ['NPER', 'number of periods', 'loan tenure', 'time to repay', 'how long'],
  },
  {
    id: 'xa-02-annuity-types',
    title: 'Annuities: fixed or floating, ordinary or due',
    principle:
      'An annuity is a sum paid at regular intervals, pension being the classic case. Fixed annuities pay a set amount; floating (flexible) annuities move with a chosen benchmark such as inflation or an index. An ordinary annuity pays at the end of each period (most bond coupons); an annuity due pays at the start (rent, insurance premiums). An annuity due is worth more to the receiver and costs more to the payer, by one period’s interest: PV(due) = PV(ordinary) x (1 + r); Excel type = 1. Annuity tables give the factor to multiply by the payment.',
    inPractice:
      'Premiums paid at the start of the year cost a little more in present-value terms than the same amount at year-end; annual vs monthly premium comparisons should account for that.',
    source: SRC,
    topics: ['compounding', 'retirement'],
    keywords: ['annuity', 'ordinary annuity', 'annuity due', 'fixed annuity', 'floating annuity', 'annuity table', 'pension', 'payment at start'],
  },
  {
    id: 'xa-02-perpetuity',
    title: 'Perpetuity: PV = C / r',
    principle:
      'A perpetuity pays a constant cash flow forever, like a perpetual bond or a lifelong pension approximated as unending. Its present value is the payment divided by the discount rate: PV = C / r. Worked figure: 6,000 a year forever at 7.5% is worth 6,000 / 0.075 = 80,000.',
    source: SRC,
    asOf: '2025-06',
    topics: ['compounding', 'bonds'],
    keywords: ['perpetuity', 'perpetual bond', 'C/r', 'value of perpetuity', 'infinite cash flow'],
  },
];
