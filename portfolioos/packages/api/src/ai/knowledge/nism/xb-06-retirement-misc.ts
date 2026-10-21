import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-B',
  edition: '2025-12',
  chapter: 6,
  chapterTitle: 'Miscellaneous Aspects of Retirement Planning',
};

export const XB_06: readonly KnowledgeEntry[] = [
  {
    id: 'xb-06-adviser-role',
    title: 'What an adviser does in retirement planning',
    principle:
      'An adviser pulls together savings, pensions, part-time income and home equity into a reliable monthly income, which needs real knowledge of tax, employer benefits and scheme rules. Typical questions: when and how to take employer benefits and pension options, whether an annuity suits, what income is realistic, a sustainable withdrawal rate, how much to keep in guaranteed products, how to cut taxable income, whether to clear the mortgage, whether a reverse mortgage fits, and whether to keep life policies. No recommendation comes before understanding horizon, experience, goals, risk tolerance, need for guaranteed income, and all assets, debts and income sources, ideally seeing every holding so the whole portfolio works together.',
    source: SRC,
    topics: ['retirement', 'planning'],
    keywords: ['retirement adviser', 'retirement income planning', 'withdrawal rate', 'pay off mortgage before retirement', 'keep life insurance after retirement'],
  },
  {
    id: 'xb-06-corpus-worked-example',
    title: 'Worked retirement corpus calculation',
    principle:
      'Today’s spending inflates sharply: 10,000 a month at 7% becomes about 54,274 in 25 years. Retirement spending is often 50 to 60% of current spending once loans and children’s costs end, but medical costs rise, and plans should assume living well past 80. Example: a 35-year-old spending 15,000 a month expects 60% (9,000) in retirement; at 7% inflation that is about 48,847 a month at 60. Funding 25 years (to 85) with the corpus earning 8% and expenses rising 6% (real rate about 1.89% a year, applied monthly) needs about 1.17 crore; 25,000 and 40,000 of current spending need about 1.95 and 3.11 crore.',
    source: SRC,
    asOf: '2025-12',
    topics: ['retirement', 'planning', 'compounding'],
    keywords: ['retirement corpus calculation', 'how much corpus to retire', 'retirement calculator', 'PV formula retirement', 'expense at retirement'],
  },
  {
    id: 'xb-06-cost-of-delay',
    title: 'The cost of starting late, and stepping up savings',
    principle:
      'To build 1.18 crore by 60 at 12% a year, monthly saving is about 3,376 starting at 30, 6,280 at 35 and 11,928 at 40: every five years of delay roughly doubles the bill. Stepping up contributions each year (a step-up SIP, raising EPF or VPF, extra NPS) lets saving start smaller and grow with income: a level 20,217 a month reaches 2 crore in 20 years at 12%, but a 7% yearly step-up can start much lower. A useful habit is raising the SIP by at least 5 to 7% whenever income rises about 10%, and adding bonuses.',
    source: SRC,
    asOf: '2025-12',
    topics: ['retirement', 'sip', 'compounding'],
    keywords: ['cost of delay', 'start investing early', 'step up SIP', 'top up SIP', 'increase SIP every year', 'monthly saving for retirement'],
  },
  {
    id: 'xb-06-early-withdrawals-transfers',
    title: 'Don’t raid retirement money; carry it across jobs',
    principle:
      'Many people reach retirement with little EPF because they withdrew it for education, weddings, emergencies or homes, sometimes needlessly. 75,000 taken out with 30 years to go at 8.5% forgoes about 8.7 lakh at retirement; the gap means working longer or living on less. On changing jobs, transfer EPF online via the UAN (keep KYC updated) instead of withdrawing: it avoids tax on withdrawals before five years’ service, counts old service toward the five years, and keeps compounding. NPS is simpler: one PRAN moves with you, or continues under the all-citizens model if the new employer does not offer NPS.',
    source: SRC,
    asOf: '2025-12',
    topics: ['retirement', 'behaviour', 'tax'],
    keywords: ['EPF transfer', 'UAN', 'withdraw PF early', 'job change PF', 'NPS PRAN transfer', 'premature withdrawal retirement'],
  },
  {
    id: 'xb-06-evaluating-by-life-stage',
    title: 'Choosing retirement products by stage',
    principle:
      'Pre-retirement (15 to 20 years out): accumulate, with growth assets whose short-term falls the long horizon can absorb; judge products on cost, inflation-beating return, risk fit and tax efficiency (EPF, NPS, PPF, suitable mutual funds); income products do not belong here. Early retirement: split into an income bucket (judged on beating inflation for life and protecting capital) and a growth bucket with a 10 to 15 year horizon (PPF, suitable mutual funds, since EPF and NPS contributions have ended). Late retirement (75+): income and capital safety first, low risk, and liquidity for leaving money to heirs.',
    source: SRC,
    topics: ['retirement', 'asset-allocation', 'products'],
    keywords: ['retirement product selection', 'bucket strategy', 'income bucket growth bucket', 'investing after 75', 'pre retirement investing'],
  },
  {
    id: 'xb-06-philanthropy',
    title: 'Raising philanthropy with clients',
    principle:
      'More Indians across income levels want to give back. For advisers, talking about clients’ values and causes deepens the relationship. Raise it naturally once the core plan is on track, at moments like selling a business or receiving an inheritance, drafting a will, retirement, marriage or a grandchild’s birth, or the annual review; then follow up with options and next steps, because good intentions easily slip down a busy client’s list.',
    source: SRC,
    topics: ['estate', 'planning'],
    keywords: ['philanthropy', 'charitable giving', 'donation planning', 'giving plan', 'legacy giving'],
  },
];
