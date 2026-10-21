/**
 * Trading income, crypto and advance tax under the Income-tax Act 2025 as
 * amended by the Finance Act 2026, in our own words. STT rates: see
 * fa2026-changes.ts.
 */
import type { KnowledgeEntry } from '../library.js';

const law = (ref: string): KnowledgeEntry['source'] => ({
  kind: 'LAW',
  instrument: 'Income-tax Act 2025',
  ref,
  date: '2026-04-01',
});

export const ITA25_TRADING: KnowledgeEntry[] = [
  {
    id: 'ita25-fo-intraday',
    title: 'F&O and intraday trading: business income and its losses',
    principle:
      'Exchange-traded futures and options are not "speculative" (s.2(31) excludes specified derivative transactions), so their profit or loss is ordinary business income taxed at slab rates. An F&O loss can be set off against any income in the same year except salary, and the rest carried forward eight tax years against business income, if the return was filed on time. Intraday share trades, settled without delivery, are a speculation business: their losses set off only against speculative profits and carry forward only four tax years (s.113). Expenses such as brokerage, STT, internet and advisory fees are deductible from trading income.',
    inPractice:
      'A salaried client with F&O losses cannot reduce salary tax with them but can carry them forward; file an ITR that reports business income, and file on time to keep the loss.',
    source: law('s.2(31), s.109, s.112, s.113'),
    asOf: '2026-04',
    topics: ['tax', 'derivatives'],
    keywords: ['F&O tax', 'F&O loss set off', 'futures and options income', 'intraday tax', 'speculative income', 'speculation loss four years', 'trading loss carry forward', 'F&O loss against salary'],
  },
  {
    id: 'ita25-audit-presumptive',
    title: 'Tax audit and presumptive taxation for traders and small businesses',
    principle:
      'A business must have its accounts audited if turnover exceeds 1 crore, raised to 10 crore where cash receipts and cash payments are each no more than 5% of the total (s.63, formerly s.44AB). An eligible resident individual, HUF or firm with turnover up to 2 crore (3 crore if cash receipts are within 5%) may instead declare profit of at least 6% of turnover received through banking or digital channels and 8% of the rest, without keeping detailed books (s.58, formerly s.44AD); presumptive taxpayers may pay all advance tax by 15 March. Professionals have a parallel scheme at 50% of receipts up to 50 lakh (75 lakh with low cash). For F&O traders, turnover is measured as the ICAI note prescribes — the absolute total of profits and losses on each trade.',
    inPractice:
      'Most retail F&O traders stay below the 10 crore audit threshold because turnover is the sum of trade-wise gains and losses, not contract value; check before assuming an audit is needed.',
    source: law('s.58, s.63'),
    asOf: '2026-04',
    topics: ['tax', 'derivatives', 'operations'],
    keywords: ['tax audit', '44AB', 'tax audit limit 10 crore', 'presumptive taxation', '44AD', '6% presumptive', 'trading turnover', 'F&O turnover audit', '44ADA'],
  },
  {
    id: 'ita25-crypto',
    title: 'Crypto and other virtual digital assets',
    principle:
      'Gains on transferring a virtual digital asset (crypto tokens, NFTs and similar) are taxed at a flat 30% plus surcharge and cess, whatever the holding period, with only the cost of acquisition deductible — no expenses and no exemption limit benefit (s.194). A loss on a virtual digital asset cannot be set off against any other income, including gains on other virtual digital assets, and cannot be carried forward. A transfer can attract TDS at the payer’s end, and crypto received as a gift is taxed as income from other sources unless an exemption (relative, marriage, inheritance) applies.',
    inPractice:
      'Because losses are wasted, the effective tax on a volatile crypto portfolio can exceed 30% of net gains; treat crypto as a small, speculative allocation.',
    source: law('s.194, s.2(109)'),
    asOf: '2026-04',
    topics: ['tax', 'products', 'risk'],
    keywords: ['crypto tax', 'bitcoin tax India', 'virtual digital asset', 'VDA 30%', 'crypto loss set off', 'NFT tax', 'crypto TDS'],
  },
  {
    id: 'ita25-advance-tax',
    title: 'Advance tax instalments',
    principle:
      'Tax not covered by TDS must be paid during the year as advance tax: at least 15% of the year’s estimated tax by 15 June, 45% by 15 September, 75% by 15 December and 100% by 15 March. Those on the presumptive scheme may pay it all by 15 March. Shortfalls attract interest for deferment of each instalment and, if less than 90% is paid by year end, interest until the tax is paid. Capital gains and dividends that arise after an instalment date only need to be covered by the remaining instalments.',
    inPractice:
      'A client who books a large capital gain in January can pay the tax on it by 15 March without interest for the earlier instalments.',
    source: law('Chapter XIX-C'),
    asOf: '2026-04',
    topics: ['tax', 'operations'],
    keywords: ['advance tax', 'advance tax due dates', '15 June 15%', 'advance tax instalments', 'interest on late advance tax', 'advance tax capital gains'],
  },
];
