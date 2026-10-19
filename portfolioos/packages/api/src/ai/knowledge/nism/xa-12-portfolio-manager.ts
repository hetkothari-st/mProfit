import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-A',
  edition: '2025-06',
  chapter: 12,
  chapterTitle: 'Portfolio Manager',
};

export const XA_12: readonly KnowledgeEntry[] = [
  {
    id: 'xa-12-what-pms-is',
    title: 'Portfolio management services: who offers them and in what forms',
    principle:
      'A portfolio manager is a body corporate that, under a contract with a client, advises on, directs or manages a portfolio of securities or funds for that client, registered under the SEBI (Portfolio Managers) Regulations 2020 (PMS regulation dates back to 1993, before mutual fund regulation). Providers are AMCs, brokerages and boutique independents; products span equity, fixed income, commodity, mutual-fund and multi-asset PMS. Discretionary PMS: the manager decides and manages each client’s money individually. Non-discretionary: the client decides what and when; the manager executes. Advisory: the manager only suggests; the client decides and executes (typically institutions).',
    source: SRC,
    topics: ['pms-aif', 'regulation'],
    keywords: ['PMS', 'portfolio management service', 'discretionary PMS', 'non-discretionary PMS', 'advisory PMS', 'Portfolio Managers Regulations 2020', 'boutique PMS'],
  },
  {
    id: 'xa-12-registration',
    title: 'Registering as a portfolio manager',
    principle:
      'SEBI registration (Form A with a non-refundable fee, covering structure, infrastructure, three-year business plan, finances, disputes, risk-profiling and grievance processes, experience, draft client agreement and disclosure document, custodian) is mandatory. SEBI checks that the applicant is a body corporate with adequate infrastructure, has a compliance officer, a principal officer with a finance, law, accountancy or business-management qualification, at least five years’ relevant securities-market experience and the required NISM certification, at least one more employee who is a graduate with two years’ relevant experience, net worth of 5 crore, no adverse litigation, convictions or economic offences, and is fit and proper. Registration stays valid unless suspended or cancelled.',
    source: SRC,
    asOf: '2025-06',
    topics: ['pms-aif', 'regulation'],
    keywords: ['PMS registration', 'principal officer', 'compliance officer', 'net worth 5 crore', 'fit and proper', 'Form A'],
  },
  {
    id: 'xa-12-responsibilities',
    title: 'What a portfolio manager may and may not do',
    principle:
      'Discretionary managers run each client’s money individually, never in a pooled way like a mutual fund; non-discretionary managers follow the client’s directions. Minimum investment: 50 lakh in funds or securities. Duties: act as a fiduciary; keep each client’s securities in separate accounts and all client funds in a separate account at a scheduled commercial bank; invest at most 30% of a client’s portfolio in associates or related parties, with one-time written consent; no below-investment-grade securities; stay within the client’s RBI-related limits; take no benefit from client assets; never borrow or lend clients’ funds or securities except as permitted; handle complaints promptly; and ensure distributors comply.',
    source: SRC,
    asOf: '2025-06',
    topics: ['pms-aif', 'regulation', 'ethics'],
    keywords: ['PMS minimum 50 lakh', 'fiduciary', 'segregation of client accounts', 'related party 30%', 'below investment grade', 'PMS rules'],
  },
  {
    id: 'xa-12-fees-hurdle-high-watermark',
    title: 'PMS fees: fixed, performance-linked, hurdle, high watermark, catch-up',
    principle:
      'A fixed fee is charged regardless of results, as a percentage of assets (for example 1% a year), plus brokerage and other transaction costs. Performance (profit-sharing) fees are extra and can be large. A hurdle rate is the return that must be exceeded before any profit share (say 8%). The high-watermark principle charges profit share only on gains above the highest value on which fees were previously paid: if 50 lakh grew to 60 lakh (fees paid on 10 lakh) and then fell to 55 lakh, no profit share is due until it passes 60 lakh again; returns are measured per financial year. Without catch-up, profit share applies only to the return above the hurdle; with catch-up, once the hurdle is beaten the fee applies to the whole return.',
    source: SRC,
    asOf: '2025-06',
    topics: ['pms-aif', 'costs'],
    keywords: ['PMS fees', 'fixed fee', 'performance fee', 'profit sharing', 'hurdle rate', 'high watermark', 'catch up', 'no catch up'],
  },
  {
    id: 'xa-12-direct-access-disclosure',
    title: 'PMS direct access and SEBI disclosure rules',
    principle:
      'PMS providers must offer a direct-access option with no distributor, which costs less, while the regular route pays distributors; management is otherwise identical. An adviser should first check whether the client needs PMS at all, then favour direct access when the client understands the product, and help choose between discretionary, non-discretionary and advisory services. Before managing money the manager must sign a written agreement and give a disclosure document (fees and how they are charged, risks of each investment approach, related-party disclosures), also filed with SEBI and on its website, and must report performance uniformly across SEBI filings, marketing, client reports and website.',
    source: SRC,
    topics: ['pms-aif', 'regulation', 'costs'],
    keywords: ['PMS direct access', 'PMS disclosure document', 'PMS agreement', 'performance reporting', 'direct plan PMS'],
  },
];
