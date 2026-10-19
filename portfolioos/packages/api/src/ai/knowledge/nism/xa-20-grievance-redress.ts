import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-A',
  edition: '2025-06',
  chapter: 20,
  chapterTitle: 'Grievance Redress Mechanism',
};

export const XA_20: readonly KnowledgeEntry[] = [
  {
    id: 'xa-20-grievance-principles',
    title: 'How financial grievances are handled, and what a good system looks like',
    principle:
      'Always complain first to the product or service provider; if unresolved, escalate to that sector’s regulator. The Consumer Protection Act covers buyers of goods and users of services for consideration (not those buying for resale or commercial use), so consumer forums are a further route. A robust grievance system checks the complaint is within the relevant laws, received within the time limit, and a genuine complaint; tries internal resolution first with a clear escalation path; shows status through action-taken reports; tracks how long each complaint has been open; and lets dissatisfied complainants escalate to an independent body. Court remains open within the law of limitation.',
    source: SRC,
    topics: ['grievance', 'regulation'],
    keywords: ['grievance redressal', 'complaint process', 'escalation', 'Consumer Protection Act', 'consumer forum', 'action taken report', 'law of limitation'],
  },
  {
    id: 'xa-20-securities-scores-odr',
    title: 'Securities complaints: provider, SCORES, then SmartODR',
    principle:
      'Advisers must display their compliance officer’s and CEO or proprietor’s contact details. For any SEBI-regulated entity (listed companies, mutual funds, PMS, AIFs, brokers, DPs, registrars, advisers) the investor first complains to the entity, then escalates on SEBI’s SCORES portal, where SEBI forwards it and the entity must file an action-taken report, trackable online. If still unhappy, or at any stage after the entity fails, the investor can start online dispute resolution (conciliation then arbitration) on the SmartODR portal within the limitation period; the entity can also start ODR after notice. SCORES does not take vague or undocumented complaints, requests for advice, complaints about share prices or illiquidity, private-agreement disputes, or matters about unlisted, delisted or wound-up companies, sub-judice cases or other regulators’ areas.',
    source: SRC,
    topics: ['grievance', 'regulation'],
    keywords: ['SCORES', 'SEBI complaint', 'SmartODR', 'online dispute resolution', 'complaint against broker', 'complaint against mutual fund', 'complaint against adviser'],
  },
  {
    id: 'xa-20-banking-ombudsman',
    title: 'Banking complaints and the RBI Integrated Ombudsman',
    principle:
      'Complain to the bank first, usually through branch, zonal and head-office customer-service levels; most banks follow the Banking Codes and Standards Board’s fair practice code. If not resolved within one month, or the reply is unsatisfactory, go to the RBI Integrated Ombudsman online, by email or in person; it covers deposits and payments, interest and charges, ATM, debit and credit cards (including NBFC cards), and loans refused without reason. The ombudsman tries settlement and, failing that within a month, passes an award after hearing both sides. Government-bank grievances can also go through the CPGRAMS public grievance portal.',
    source: SRC,
    topics: ['grievance', 'regulation'],
    keywords: ['banking ombudsman', 'RBI integrated ombudsman', 'bank complaint', 'credit card complaint', 'CPGRAMS', 'BCSBI'],
  },
  {
    id: 'xa-20-insurance-ombudsman',
    title: 'Insurance complaints: insurer, IRDAI Bima Bharosa, ombudsman',
    principle:
      'Complain first to the insurer’s grievance cell; escalate online to IRDAI’s grievance system (formerly IGMS), which forwards to the insurer and lets you track status. If still unresolved or unhappy, go to the Insurance Ombudsman for claim rejections (full or partial), premium disputes, policy-wording disputes on claims, delayed claims, or policy documents not issued after payment. With both sides’ written agreement it mediates and recommends within a month; otherwise it passes an award within three months, which the policyholder accepts within a month. Courts and consumer forums remain open afterwards.',
    source: SRC,
    topics: ['grievance', 'insurance'],
    keywords: ['insurance ombudsman', 'IRDAI complaint', 'IGMS', 'Bima Bharosa', 'claim rejected', 'claim repudiation', 'insurance complaint'],
  },
  {
    id: 'xa-20-pension-nps',
    title: 'Pension complaints and the NPS route',
    principle:
      'Mutual fund pension schemes follow SEBI’s SCORES route; insurers’ pension plans follow IRDAI’s. For NPS, complain to the Central Recordkeeping Agency online or via its call centre; if unresolved within 30 days or unsatisfactory, escalate to the NPS Trust, which must respond within 30 days; if still unresolved, appeal to the PFRDA ombudsman. Vague complaints, suggestions, requests for guidance, matters beyond PFRDA, disputes between intermediaries and sub-judice cases are not treated as grievances.',
    source: SRC,
    topics: ['grievance', 'retirement'],
    keywords: ['NPS complaint', 'CRA grievance', 'NPS Trust', 'PFRDA ombudsman', 'pension complaint'],
  },
  {
    id: 'xa-20-sat-other-fora',
    title: 'Securities Appellate Tribunal and other forums',
    principle:
      'Anyone aggrieved by an order of SEBI, its adjudicating officer, IRDAI or PFRDA can appeal to the Securities Appellate Tribunal within 45 days of receiving the order. SAT follows natural justice rather than the Civil Procedure Code but has civil-court powers (summons, documents, affidavits, reviewing decisions) and its proceedings are judicial. SAT orders can be appealed to the Supreme Court within 60 days. NBFC deposit or interest defaults go to the National Company Law Tribunal or a consumer forum; company deposits and unlisted companies’ bonds or debentures can be complained about to the Ministry of Corporate Affairs online.',
    source: SRC,
    topics: ['grievance', 'regulation'],
    keywords: ['Securities Appellate Tribunal', 'SAT appeal 45 days', 'Supreme Court 60 days', 'NCLT', 'NBFC deposit default', 'Ministry of Corporate Affairs complaint'],
  },
];
