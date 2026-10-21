/**
 * The rules SEBI-registered investment advisers work under: the SEBI
 * (Investment Advisers) Regulations 2013 as amended to 25 November 2025 and
 * the Master Circular for Investment Advisers of 6 February 2026, in our own
 * words.
 */
import type { KnowledgeEntry } from '../library.js';

const regs = (ref: string): KnowledgeEntry['source'] => ({
  kind: 'LAW',
  instrument: 'SEBI (Investment Advisers) Regulations 2013',
  ref,
  date: '2025-11-25',
});
const mc = (ref: string): KnowledgeEntry['source'] => ({
  kind: 'LAW',
  instrument: 'SEBI Master Circular for Investment Advisers',
  ref,
  date: '2026-02-06',
});

export const SEBI_IA: KnowledgeEntry[] = [
  {
    id: 'sebi-ia-fiduciary',
    title: 'An investment adviser’s fiduciary duties',
    principle:
      'A SEBI-registered investment adviser owes clients a fiduciary duty (Reg. 15). It may be paid only by the client it advises, never by product makers for the products it recommends; must disclose every conflict of interest as it arises, including its own holdings in what it recommends; must keep advice at arm’s length from any other business; must keep client information confidential unless the client agrees or law requires; may not trade on its own account against its advice for fifteen days, unless it first gives the client a revised view at least 24 hours before; and may not buy from or sell to a client as principal. It must follow KYC and the Third Schedule code of conduct.',
    inPractice:
      'When a client asks why the adviser recommends a fund, the honest answer can never be "it pays us"; an adviser’s only income from a client is the client’s fee.',
    source: regs('Reg. 15'),
    asOf: '2025-11',
    topics: ['regulation', 'ethics'],
    keywords: ['fiduciary duty adviser', 'investment adviser conflict of interest', 'adviser commission banned', 'RIA duties', 'front running adviser', 'adviser confidentiality', 'regulation 15'],
  },
  {
    id: 'sebi-ia-segregation',
    title: 'Advice or distribution, never both, for the same client',
    principle:
      'An adviser’s group or family may give a client either advice or distribution, not both (Reg. 22, Master Circular para 1(i)). A new client chooses one at onboarding; existing holdings bought through the other route need not be sold. A client’s whole family (dependants whose assets come from one earning member) counts as one client, tracked by PAN. Advisers must recommend direct (non-commission) plans wherever they exist. They may help a client implement advice in the securities market, but only through direct plans, with no implementation fee and no commission or referral fee anywhere in the group, and the client is free to execute elsewhere (Reg. 22A). Stock broking is not treated as distribution. Institutional clients and accredited investors may waive segregation in writing.',
    inPractice:
      'A client paying an adviser’s fee should hold direct plans; regular-plan holdings bought earlier through a distributor can stay, and the adviser can still give a fee-based second opinion on them.',
    source: mc('para 1(i); Reg. 22, 22A'),
    asOf: '2026-02',
    topics: ['regulation', 'ethics', 'mutual-funds'],
    keywords: ['advice vs distribution', 'adviser distributor segregation', 'direct plan only adviser', 'implementation services', 'adviser commission', 'family of client', 'regulation 22A'],
  },
  {
    id: 'sebi-ia-fees',
    title: 'Limits on what an investment adviser may charge',
    principle:
      'For individual and HUF clients who are not accredited investors, an adviser may charge either up to 2.5% a year of assets under advice or a fixed fee of up to 1,51,000 a year per family, across all its services (Master Circular para 1(iii)); the fixed limit is revised every three years using the Cost Inflation Index. The mode can be switched at any time, but the year’s total may not exceed the higher of the two limits. Statutory charges are extra. Fees may be taken in advance for at most one year; if the client ends the service early, unused fees are refunded less a break fee of at most one quarter’s fee. A second opinion on assets held through a distributor may be charged at up to 2.5% of those assets, with annual consent. Non-individual clients and accredited investors negotiate freely.',
    inPractice:
      'An adviser asking a retail client for two years’ fees upfront, or more than 2.5% of advised assets, is breaking the rules; payment can also go through SEBI’s optional centralised fee collection mechanism.',
    source: mc('para 1(iii); Reg. 15A'),
    asOf: '2026-02',
    topics: ['regulation', 'costs'],
    keywords: ['investment adviser fees', 'SEBI adviser fee limit', '2.5% AUA fee', '151000 fixed fee', 'advisory fee cap', 'advance fee adviser', 'fee refund adviser', 'CeFCoM'],
  },
  {
    id: 'sebi-ia-agreement',
    title: 'The advisory agreement and its key terms',
    principle:
      'No advice may be given and no fee charged until the client has signed an investment advisory agreement and received a copy (Reg. 19(1)(d), Master Circular para 1(ii)). It must include SEBI’s standard terms and the Most Important Terms and Conditions (MITC) agreed with the industry forum, including that the adviser may not place any trade for the client without the client’s specific consent for that trade. It can be signed in person or electronically (for example Aadhaar e-sign), must explain the optional centralised fee collection mechanism, and may add terms that do not dilute the regulations. Where the adviser also advises on products outside SEBI’s remit (insurance, property, gold), it must say so at onboarding and get the client’s acknowledgement that SEBI offers no recourse for those.',
    inPractice:
      'Before any advice is shared, the signed agreement must exist; a free first "advisory call" that gives specific recommendations is not allowed.',
    source: mc('para 1(ii), 1(xi); Reg. 19(1)(d)'),
    asOf: '2026-02',
    topics: ['regulation', 'operations'],
    keywords: ['investment advisory agreement', 'MITC', 'most important terms and conditions', 'adviser cannot trade without consent', 'onboarding adviser', 'e-sign agreement'],
  },
  {
    id: 'sebi-ia-risk-profiling',
    title: 'What risk profiling must cover',
    principle:
      'Before advising, an adviser must collect at least the client’s age, investment objectives and time horizon, income, existing investments and assets, risk appetite, and loans and liabilities (Reg. 16). It needs a process that assesses both the risk the client is willing to take and the risk they can bear, including capacity to absorb loss and whether they can accept any loss of capital, without over-weighting single answers. Questionnaires must be clear, free of jargon, double negatives and leading questions; any tool used must be fit for purpose with known limits addressed. The resulting profile must be told to the client and updated periodically.',
    inPractice:
      'A profile is not a single score from a quiz: a young client keen on risk but with an EMI-heavy budget and no emergency fund has low capacity, and capacity caps willingness.',
    source: regs('Reg. 16'),
    asOf: '2025-11',
    topics: ['regulation', 'risk-profiling'],
    keywords: ['risk profiling', 'risk profile questionnaire', 'risk capacity', 'risk tolerance', 'regulation 16', 'know your client adviser', 'capacity for loss'],
  },
  {
    id: 'sebi-ia-suitability',
    title: 'Suitability: every recommendation must fit the client',
    principle:
      'Every investment an adviser recommends must suit the client’s risk profile (Reg. 17). The adviser needs a documented process for choosing investments from the client’s objectives and finances, must understand each product’s nature and risks, and must have reasonable grounds to believe the recommendation meets the client’s objectives, is a risk they can bear, and is one they have the experience and knowledge to understand. A complex product may be recommended only after judging that its structure and risk-reward profile match the client’s experience, knowledge, objectives, appetite and capacity for loss.',
    inPractice:
      'Recommending a market-linked debenture or an options strategy to a first-time investor fails suitability even if the client asks for "high returns".',
    source: regs('Reg. 17'),
    asOf: '2025-11',
    topics: ['regulation', 'risk-profiling', 'ethics'],
    keywords: ['suitability', 'suitability adviser', 'complex product suitability', 'regulation 17', 'appropriate investment', 'mis-selling'],
  },
  {
    id: 'sebi-ia-disclosures-ai',
    title: 'What an adviser must disclose, including its use of AI',
    principle:
      'An adviser must tell prospective clients all material facts about itself — business, disciplinary history, terms, affiliations (Reg. 18). With each recommendation it must disclose its own holdings in the product, any link with the issuer that could affect its objectivity, the product’s key features and track record, and point the client to the product’s warnings. For products outside SEBI’s remit it must say SEBI offers no recourse. It must also disclose how far it uses artificial-intelligence tools in giving advice, at the agreement stage and whenever that changes (Reg. 18(9)); and an adviser using AI tools, at any scale, remains solely responsible for client-data security and confidentiality and for advice based on those tools’ output (Reg. 15(14)).',
    inPractice:
      'An advisory app whose recommendations come from an AI assistant must tell clients so in its agreement, and the registered adviser answers for every AI-produced recommendation as if they had written it.',
    source: regs('Reg. 18, Reg. 15(14)'),
    asOf: '2025-11',
    topics: ['regulation', 'ethics'],
    keywords: ['adviser disclosure', 'AI disclosure adviser', 'artificial intelligence investment advice', 'disciplinary history', 'conflict disclosure', 'regulation 18', 'AI tools responsibility'],
  },
  {
    id: 'sebi-ia-advertising',
    title: 'Advertising rules for investment advisers',
    principle:
      'Every advertisement and client communication must carry a disclaimer that SEBI registration, IAASB enlistment and NISM certification do not guarantee the adviser’s performance or any return (Master Circular para 10). Advertisements may not include misleading testimonials, any promise of assured, minimum or target returns or accuracy rates, or anything suggesting the advice is risk-free; may not cite past performance or risk-return figures unless verified by a Past Risk and Return Verification Agency and presented as SEBI specifies; may not use the SEBI logo; and may not run games, leagues or contests. A suspended adviser may not advertise.',
    inPractice:
      'A landing page saying "our picks returned 32% last year" is not allowed unless verified through the PaRRVA route; "SEBI-registered" must sit next to the no-guarantee disclaimer.',
    source: mc('para 10'),
    asOf: '2026-02',
    topics: ['regulation', 'ethics'],
    keywords: ['adviser advertisement code', 'testimonials adviser', 'past performance advertising', 'PaRRVA', 'assured returns advertisement', 'SEBI logo', 'adviser marketing rules'],
  },
  {
    id: 'sebi-ia-grievance',
    title: 'Complaining about an investment adviser',
    principle:
      'A client with a complaint first approaches the adviser’s compliance officer, then its head (CEO, partner or proprietor), whose contact details the adviser must display. If unresolved, the complaint goes to SEBI’s SCORES portal (scores.gov.in), which links to the Online Dispute Resolution platform for conciliation and arbitration (Master Circular para 6). SEBI’s toll-free helplines are 1800 22 7575 and 1800 266 7575. Advisers must publish SEBI’s investor charter and monthly complaint data on their websites.',
    inPractice:
      'Keep written records of the advice and fee receipts; SCORES complaints move faster with the agreement and communications attached.',
    source: mc('paras 6, 7'),
    asOf: '2026-02',
    topics: ['regulation', 'grievance'],
    keywords: ['complaint against adviser', 'SCORES', 'SEBI complaint', 'online dispute resolution', 'ODR', 'investor charter adviser', 'grievance redressal adviser'],
  },
  {
    id: 'sebi-ia-records-audit',
    title: 'Records and annual compliance audit',
    principle:
      'Advisers must keep a record of every advice-related interaction with clients and prospective clients, from the first contact to the end of the service — signed notes, call recordings, emails from the registered address, SMS or other verifiable records — plus time-stamped recordings of every consent to execute a trade taken by phone (Master Circular para 1(xiii)). Records are kept five years, or longer if a dispute is pending. An annual compliance audit must be completed within six months of the financial year end and reported to IAASB/SEBI within a month, with adverse findings and actions taken; the audit status is published on the adviser’s website, together with an annual certificate on advice-distribution segregation.',
    inPractice:
      'An advisory chat or app conversation that contains advice is itself a record that must be retained for five years.',
    source: mc('paras 1(xiii), 1(xiv); Reg. 19'),
    asOf: '2026-02',
    topics: ['regulation', 'operations'],
    keywords: ['adviser record keeping', 'five years records', 'call recording adviser', 'compliance audit adviser', 'regulation 19', 'audit report IAASB'],
  },
  {
    id: 'sebi-ia-registration',
    title: 'Who can register as an investment adviser',
    principle:
      'An individual adviser, or the principal officer and advice staff of a firm, needs a graduate degree with NISM-recognised certification, or a NISM postgraduate programme in investment advisory or financial planning; certification must be renewed within three years of registration (Reg. 7, as relaxed from 25 November 2025). Professionals in unrelated or separately regulated work (CAs, lawyers, doctors, teachers, insurance agents) may register as part-time advisers with a prominent disclaimer on their other work. An individual adviser whose clients exceed 300, or annual fees exceed 3 crore, must move to a firm registration. Advisers keep a lien-marked deposit of 1 to 10 lakh depending on client numbers.',
    inPractice:
      'A CA giving general asset-class advice during tax work needs no registration; recommending specific securities to a client does.',
    source: mc('para 1(iv)–(viii); Reg. 7, Reg. 13'),
    asOf: '2026-02',
    topics: ['regulation'],
    keywords: ['register as investment adviser', 'RIA qualification', 'NISM X-A X-B requirement', 'part time investment adviser', '300 clients non individual', 'adviser deposit', 'who needs SEBI registration'],
  },
];
