import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-B',
  edition: '2025-12',
  chapter: 9,
  chapterTitle: 'Income from Other Sources',
};

export const XB_09: readonly KnowledgeEntry[] = [
  {
    id: 'xb-09-dividends-buyback',
    supersededBy: 'fa26-buyback',
    title: 'Tax on dividends and share buybacks',
    principle:
      'Since dividend distribution tax was abolished (from AY 2021-22), dividends from companies, mutual funds and business trusts are taxed in the shareholder’s hands under other sources at slab rates; non-residents pay 20% plus surcharge and cess, or the DTAA rate if lower. Deemed dividends include distributions of accumulated profits on liquidation or capital reduction and loans from closely held companies to shareholders. From 1 October 2024 money received in a company buyback is taxed as dividend with no deduction for costs, and the cost of the shares bought back becomes a capital loss that can be set off under the normal rules. Companies and funds deduct TDS on dividends.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'equity'],
    keywords: ['dividend tax', 'dividend taxable at slab', 'buyback tax', 'buyback taxed as dividend October 2024', 'DDT abolished', 'deemed dividend', 'NRI dividend tax 20%'],
  },
  {
    id: 'xb-09-interest-on-securities',
    title: 'Interest on securities',
    principle:
      'Interest on central or state government securities and on debentures or other securities of companies, local authorities and statutory corporations is taxed under other sources unless the securities are business stock-in-trade (then business income). It is taxed on accrual or receipt depending on the accounting method the person regularly uses. Deductible: collection charges, interest on money borrowed to buy the securities, and other expenses incurred wholly to earn the income. Foreign-currency interest is converted at the SBI TT buying rate on the last day of the month before it fell due. Profits on selling the securities are capital gains if held as investments.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'bonds'],
    keywords: ['interest on securities', 'bond interest tax', 'interest taxable accrual', 'other sources interest', 'debenture interest tax'],
  },
  {
    id: 'xb-09-gifts',
    title: 'Tax on gifts of money, property and securities',
    principle:
      'Money or property (including shares and securities) received free or cheaply is taxable to the recipient as other income if the total value received free, or the total shortfall below fair value, exceeds 50,000 in a year; above that the whole amount is taxed. Fair value of shares follows Rule 11UA. Exempt regardless of amount: gifts on the recipient’s marriage, under a will or inheritance, in contemplation of the donor’s death, from local authorities, charitable or educational institutions and registered trusts, through HUF partitions, and from relatives (every member of an HUF counts as a relative of the HUF).',
    inPractice:
      'Relatives: spouse, children (incl. step and adopted), parents and step-parents, siblings and half-siblings and their spouses, grand- and great-grandparents and grand- and great-grandchildren with spouses, in-laws (parents, siblings, children’s spouses, spouse’s grandparents), and parents’ siblings with spouses. Not relatives: step-siblings, nephews, nieces, cousins.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'estate'],
    keywords: ['gift tax', 'gift from relative tax free', '50000 gift limit', 'who is a relative for gift', 'gift of shares tax', 'gift from friend taxable', 'marriage gift tax'],
  },
];
