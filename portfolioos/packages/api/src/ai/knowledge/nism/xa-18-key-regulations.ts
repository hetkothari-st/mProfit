import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-A',
  edition: '2025-06',
  chapter: 18,
  chapterTitle: 'Key Regulations',
};

export const XA_18: readonly KnowledgeEntry[] = [
  {
    id: 'xa-18-scra-sebi-act',
    title: 'SCRA 1956 and the SEBI Act 1992',
    principle:
      'The Securities Contracts (Regulation) Act 1956 gives the government control over stock exchanges (recognition and supervision), securities contracts and listing. The SEBI Act 1992 set up SEBI to protect investors and to develop and regulate the securities market. SEBI regulates exchanges; registers and supervises brokers, registrars, merchant bankers, portfolio managers, investment advisers, depositories, custodians, FPIs, rating agencies, mutual funds, venture and collective schemes; prohibits fraud, unfair practices and insider trading; regulates takeovers; inspects and audits market participants; promotes investor education; and can adjudicate and impose penalties.',
    source: SRC,
    topics: ['regulation'],
    keywords: ['SCRA', 'Securities Contracts Regulation Act', 'SEBI Act', 'SEBI functions', 'SEBI powers'],
  },
  {
    id: 'xa-18-pfutp-insider-trading',
    title: 'Fraud, unfair trade practices and insider trading',
    principle:
      'The 2003 PFUTP Regulations ban fraudulent, manipulative and unfair practices in securities. Fraud includes any act, statement, omission or concealment meant to induce someone to deal in securities, whether or not anyone gains: deliberate misstatement or hiding of material facts, asserting what one does not believe, promises made with no intent to keep them, or reckless representations, true or false. The 2015 Insider Trading Regulations treat as an insider anyone connected to a company or holding unpublished price-sensitive information (UPSI); trading on UPSI is prohibited, and listed companies and intermediaries must keep fair-disclosure and conduct policies.',
    source: SRC,
    topics: ['regulation', 'ethics'],
    keywords: ['PFUTP', 'fraudulent and unfair trade practices', 'market manipulation', 'insider trading', 'UPSI', 'unpublished price sensitive information', 'connected person'],
  },
  {
    id: 'xa-18-intermediaries-code',
    title: 'Code of conduct for SEBI intermediaries',
    principle:
      'Under the 2008 Intermediaries Regulations every intermediary must protect investors’ interests and give the best advice suited to the client’s needs; keep high standards of integrity, fairness and professionalism, and answer for its employees and agents; use due skill and diligence and never collude against investors; not raise fees without advance notice; pass on dividends and interest promptly; disclose clearly and in time; never misrepresent or exaggerate its qualifications or past results; and keep client information confidential unless the law requires disclosure.',
    source: SRC,
    topics: ['regulation', 'ethics'],
    keywords: ['intermediaries regulations', 'code of conduct', 'due diligence', 'confidentiality', 'misrepresentation'],
  },
  {
    id: 'xa-18-ia-definitions-exemptions',
    title: 'What counts as investment advice, and who is exempt from IA registration',
    principle:
      'Under the SEBI (Investment Advisers) Regulations 2013, investment advice is advice on buying, selling or dealing in securities or on a portfolio containing securities, written, oral or otherwise, and includes financial planning. Advice in widely available media and trading calls (intraday, very short-term or non-personalised tips) are not investment advice under these rules. Anyone giving advice for a fee must register; there is no other way to call oneself an adviser. Exempt: general market comment naming no securities; insurance agents advising only on insurance (IRDAI); pension advisers only on pensions (PFRDA); mutual fund distributors advising incidentally; lawyers, CAs, CSs, cost accountants and actuaries advising incidentally to their practice; fund managers of SEBI-registered entities; those advising only clients outside India (advising NRIs or PIOs still needs registration).',
    source: SRC,
    asOf: '2025-06',
    topics: ['regulation'],
    keywords: ['investment adviser regulations 2013', 'definition of investment advice', 'trading calls', 'exemption from registration', 'unregistered adviser', 'RIA'],
  },
  {
    id: 'xa-18-ia-registration-qualification',
    title: 'IA registration, qualifications and client limits',
    principle:
      'SEBI weighs the applicant’s type, qualifications and NISM certification of everyone giving advice, the deposit, fit-and-proper status, infrastructure, past refusals and disciplinary history; banks and NBFCs need RBI permission and must advise through a subsidiary or separate division, and foreign entities through an Indian subsidiary or office. Registration lasts until suspended or cancelled. Individual advisers or principal officers need a finance-related professional qualification, degree or two-year post-graduate diploma (or NISM’s one-year PG programme or a CFA charter); other advice staff need any graduate degree; all must hold current NISM certification, renewed before expiry.',
    inPractice:
      'Non-individuals must have "investment adviser" in their name; individuals use the term in correspondence. Individuals exceeding 300 clients or 3 crore of fees in a year must move to non-individual registration; part-time advisers may have at most 75 clients. A deposit is kept with a scheduled bank under lien.',
    source: SRC,
    asOf: '2025-06',
    topics: ['regulation'],
    keywords: ['IA registration', 'IA qualification', 'NISM certification', 'part time investment adviser', '300 clients', '3 crore fee', '75 clients', 'IA deposit', 'principal officer'],
  },
  {
    id: 'xa-18-ia-general-obligations',
    title: 'An adviser’s general obligations',
    principle:
      'Act as a fiduciary and disclose conflicts as they arise; accept payment only from the client, never from product makers; keep advisory work at arm’s length and segregated from other businesses; keep client information confidential; not trade on its own account against advice given for 15 days (unless it first gives the client a revised view at least 24 hours before trading); follow KYC; never sell its own securities to, or buy from, a client; get SEBI approval before a change of control; file reports; keep qualifications current. An adviser using AI tools carries sole responsibility for client-data security and confidentiality, for the data used, for advice based on AI output, and for legal compliance, and must tell clients how far AI is used.',
    source: SRC,
    asOf: '2025-06',
    topics: ['regulation', 'ethics'],
    keywords: ['fiduciary duty', 'IA obligations', 'conflict of interest', 'front running advice', '15 days', 'AI tools adviser', 'arm’s length'],
  },
  {
    id: 'xa-18-ia-fees-segregation',
    title: 'IA fees, implementation and the advice-distribution split',
    principle:
      'Fees are charged as SEBI specifies; with consent, up to one year may be taken in advance. Fee limits, modes, refunds, advance and breakage rules apply to individual and HUF clients who are not accredited investors. An individual adviser may not distribute products, and family members may not distribute to the adviser’s clients. A non-individual must separate clients at group level: a client is either advisory (no commission anywhere in the group) or distribution (no advisory fee). Advisers may help implement advice, but only through direct plans, with no commission, referral or implementation fee to the adviser’s group or family, and the client is never obliged to use the service.',
    source: SRC,
    asOf: '2025-06',
    topics: ['regulation', 'costs', 'ethics'],
    keywords: ['IA fees', 'advance fee', 'advisory distribution segregation', 'client level segregation', 'implementation services', 'direct plans', 'commission ban', 'adviser commission', 'adviser as distributor', 'distribution services'],
  },
  {
    id: 'xa-18-risk-profiling-suitability',
    title: 'Risk profiling and suitability duties',
    principle:
      'The adviser must gather age, objectives, horizon, income, assets, liabilities and risk appetite, and update them periodically. Risk assessment must judge capacity to absorb loss, spot clients unwilling or unable to risk capital, and read answers sensibly without over-weighting any one. Questionnaires must be fit for purpose, clear, free of double negatives, jargon and leading questions; the resulting profile is communicated to the client. Suitability: advice must fit the profile; there must be a documented selection process; the adviser must understand each product’s risks; and must reasonably believe a recommendation meets the objectives, is bearable for the client, and that the client understands it. Complex products demand a specific assessment that their structure fits the client’s experience, knowledge, goals, risk appetite and loss capacity.',
    source: SRC,
    topics: ['regulation', 'risk-profiling'],
    keywords: ['risk profiling', 'suitability', 'risk questionnaire', 'capacity for loss', 'complex products', 'leading questions', 'documented selection process'],
  },
  {
    id: 'xa-18-ia-disclosures-records',
    title: 'IA disclosures, records, audit and compliance officer',
    principle:
      'Before onboarding, disclose business, disciplinary history, terms, affiliations, own holdings in advised securities, conflicts, material product facts including track record, warnings in product documents, when a product is outside SEBI’s purview (with no SEBI recourse), and use of AI. Keep for at least five years (digitally signed if electronic and signature is needed): KYC, risk profiles, suitability assessments, agreements, all advice given, its signed and dated rationale, a client register with PAN, advice date and fees, and communications including call recordings. Get an annual compliance audit from a CA, CS or cost accountant, run a functional website, and (for non-individuals) appoint a compliance officer or a certified independent professional.',
    source: SRC,
    topics: ['regulation'],
    keywords: ['IA disclosures', 'record keeping', 'five years records', 'annual compliance audit', 'compliance officer', 'disclose AI use', 'rationale for advice'],
  },
  {
    id: 'xa-18-ia-code-charter-penalties',
    title: 'IA code of conduct, investor charter, supervision and penalties',
    principle:
      'The code demands honesty and fairness, diligence with analysis of alternatives, adequate capabilities, knowing and protecting client information, adequate disclosure, fair fees within any SEBI ceiling, avoiding or disclosing conflicts, compliance, and senior management accountability; free trials are restricted and fees go only through banking channels. The investor charter (2025) must be shown on the website, in offices and at onboarding; complaint data must be published monthly by the 7th. Investors are told to deal only with registered advisers, pay fees by bank or the CeFCoM, insist on risk profiling, never hand money or logins to an adviser, ignore tips or assured returns. BSE Administration & Supervision Ltd supervises advisers for SEBI. Defaults are handled under the Intermediaries Regulations; penalties under the SEBI Act run from 1 lakh, up to 1 lakh a day, capped at 1 crore.',
    source: SRC,
    asOf: '2025-06',
    topics: ['regulation', 'ethics', 'grievance'],
    keywords: ['IA code of conduct', 'investor charter', 'BASL', 'BSE Administration and Supervision', 'IA penalty', 'free trial', 'complaint disclosure', 'CeFCoM'],
  },
  {
    id: 'xa-18-ia-grievances',
    title: 'Client grievances against advisers',
    principle:
      'Advisers must resolve complaints promptly within SEBI’s timelines and have a quick redress process. Complaints about a product bought on advice go to that product’s regulator. Disputes between adviser and client go to mediation, conciliation or arbitration under SEBI’s online dispute resolution, or to an ombudsman where applicable.',
    source: SRC,
    topics: ['regulation', 'grievance'],
    keywords: ['IA grievance', 'complaint against adviser', 'dispute resolution', 'arbitration', 'ODR'],
  },
  {
    id: 'xa-18-pmla',
    title: 'Prevention of Money Laundering Act duties',
    principle:
      'Money laundering is any knowing involvement with proceeds of crime, concealing, possessing, acquiring, using or presenting them as clean, and the offence continues as long as the proceeds are enjoyed. Reporting entities (banks, financial institutions, intermediaries) must keep transaction records for five years, report prescribed transactions to the Financial Intelligence Unit director, and keep client and beneficial-owner identity records for five years after the relationship ends, all confidential. For specified high-risk transactions (large cash, forex, high-value remittances) they must do enhanced due diligence: Aadhaar authentication where eligible, checking ownership and source of funds, recording purpose, refusing if the client does not comply, and watching suspicious clients more closely. SEBI’s AML/CFT guidelines and the 2011 KRA Regulations apply to all intermediaries.',
    source: SRC,
    topics: ['regulation', 'operations'],
    keywords: ['PMLA', 'money laundering', 'AML', 'CFT', 'enhanced due diligence', 'beneficial owner', 'record retention', 'suspicious transaction'],
  },
  {
    id: 'xa-18-fema-fdi-fpi',
    title: 'FEMA, foreign portfolio and direct investment',
    principle:
      'FEMA 1999 governs foreign exchange and external payments, covering Indian residents’ branches abroad and violations committed outside India. Capital-account transactions are allowed only as RBI and government rules permit, separately for residents investing abroad and for non-residents investing in India. A non-resident’s stake below 10% of a listed company’s post-issue paid-up equity (fully diluted) is foreign portfolio investment; 10% or more is foreign direct investment. Foreign investment means repatriable investment in Indian company capital or LLPs.',
    source: SRC,
    asOf: '2025-06',
    topics: ['regulation'],
    keywords: ['FEMA', 'foreign portfolio investment', 'FPI', 'foreign direct investment', 'FDI 10%', 'capital account transaction'],
  },
  {
    id: 'xa-18-other-acts',
    title: 'Other laws an adviser meets: contracts, guardianship, cheques, insolvency, FATCA',
    principle:
      'Indian Contract Act 1872: a contract is an agreement enforceable by law, needing offer and acceptance, intent to create legal relations, free consent, a lawful object and competent parties; an advisory agreement is one. Guardians and Wards Act 1890: courts appoint or declare a guardian of a minor’s person or property on application by the would-be guardian, a relative or friend, or the Collector. Negotiable Instruments Act 1881 covers promissory notes, bills of exchange and cheques (including truncated and electronic ones) and cheque dishonour penalties. The Insolvency and Bankruptcy Code 2016 gives one time-bound framework for companies, LLPs, partnerships, personal guarantors and individuals. FATCA (US) and CRS require every investor to self-certify tax residency; reporting institutions verify and upload these to the KRA system from July 2024 and report reportable accounts in Form 61B.',
    source: SRC,
    asOf: '2025-06',
    topics: ['regulation', 'estate'],
    keywords: ['Indian Contract Act', 'essentials of a valid contract', 'Guardians and Wards Act', 'Negotiable Instruments Act', 'cheque bounce', 'IBC', 'insolvency', 'FATCA', 'CRS', 'Form 61B'],
  },
  {
    id: 'xa-18-enforcement-cases',
    title: 'Lessons from SEBI actions against advisers',
    principle:
      'SEBI has acted against firms that sold tips and "investment plans" for fees without registration, and against an adviser who obtained registration with a forged experience certificate, solicited clients through free trials and promised big returns in months; it barred him from the market and cancelled his registration. Lessons: anyone advising for a fee must be registered; clients of unregistered advisers lose access to SEBI grievance redress and arbitration; promising outsized or assured returns is itself a violation.',
    source: SRC,
    topics: ['regulation', 'ethics', 'grievance'],
    keywords: ['unregistered adviser', 'SEBI order', 'stock tips fraud', 'free trial tips', 'assured returns', 'fake adviser', 'verify SEBI registration'],
  },
];
