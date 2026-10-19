import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-A',
  edition: '2025-06',
  chapter: 5,
  chapterTitle: 'Introduction to the Indian Financial Markets',
};

export const XA_05: readonly KnowledgeEntry[] = [
  {
    id: 'xa-05-market-structure',
    title: 'What financial markets do and how they are divided',
    principle:
      'Financial markets channel surplus savings to borrowers and businesses, with banks, mutual funds and insurers as intermediaries; they pool funds, provide liquidity and spread information for pricing. Money markets handle short-term borrowing and lending; capital markets handle long-term debt and equity. New securities are issued in the primary market and existing ones trade in the secondary market. Commodity, foreign-exchange, insurance and pension markets complete the system.',
    source: SRC,
    topics: ['markets'],
    keywords: ['financial markets', 'money market', 'capital market', 'primary market', 'secondary market', 'intermediaries'],
  },
  {
    id: 'xa-05-regulators',
    title: 'Who regulates what in Indian finance',
    principle:
      'RBI regulates banks, NBFCs, money and forex markets and payment systems; SEBI regulates securities and commodity derivatives markets; IRDAI regulates insurance; PFRDA regulates pensions including NPS. The Finance Ministry oversees them: its Department of Economic Affairs handles macro policy and capital markets, Department of Revenue taxes (through CBDT and CBIC), Department of Financial Services public-sector banks, insurers and pension reform, and DIPAM disinvestment. The Ministry of Corporate Affairs administers the Companies Act, LLP Act and Competition Act and oversees ICAI, ICSI and the cost accountants’ institute; the Registrar of Companies registers companies. The FSDC coordinates financial stability, development and inclusion.',
    source: SRC,
    topics: ['regulation', 'markets'],
    keywords: ['regulators', 'RBI', 'SEBI', 'IRDAI', 'PFRDA', 'Ministry of Finance', 'Ministry of Corporate Affairs', 'Registrar of Companies', 'FSDC', 'CBDT', 'DIPAM'],
  },
  {
    id: 'xa-05-rbi-sebi-roles',
    title: 'RBI and SEBI: their core functions',
    principle:
      'RBI: sets and runs monetary policy aimed at price stability with an eye on growth; regulates and supervises the financial system (via its Board for Financial Supervision covering banks, NBFCs, payments banks, small finance banks, credit information companies and primary dealers); manages foreign exchange; issues currency; oversees payment and settlement systems; and acts as banker to governments and to banks. SEBI, a statutory body under the SEBI Act 1992, protects investors in securities and develops and regulates the market: it regulates exchanges, registers intermediaries (brokers, transfer agents, bankers to an issue), prohibits fraud and insider trading, inspects and investigates, and promotes investor education.',
    source: SRC,
    topics: ['regulation'],
    keywords: ['RBI functions', 'monetary policy', 'SEBI functions', 'SEBI Act 1992', 'investor protection', 'banker to banks', 'Board for Financial Supervision'],
  },
  {
    id: 'xa-05-irdai-pfrda-sro',
    title: 'IRDAI, PFRDA and self-regulatory organisations',
    principle:
      'IRDAI (under the IRDA Act 1999) licenses insurers and sets their capital norms, approves products and policy terms (sum assured, surrender value, claims, nomination, assignment, insurable interest), regulates intermediaries’ qualifications and commissions, and lays down investment rules. PFRDA (PFRDA Act 2013) regulates NPS and other pension schemes, registers fund managers, custodians, the central recordkeeping agency and trustee bank, approves schemes and investment guidelines, and handles grievances. A self-regulatory organisation is a SEBI-recognised body of intermediaries from one market segment (not a stock exchange) that follows SEBI directions, has SEBI-nominated directors, inspects members and reports violations.',
    source: SRC,
    topics: ['regulation', 'insurance', 'retirement'],
    keywords: ['IRDAI', 'IRDA Act', 'PFRDA', 'PFRDA Act 2013', 'NPS regulator', 'self regulatory organisation', 'SRO'],
  },
  {
    id: 'xa-05-banks-nbfcs',
    title: 'Banks, payments banks, small finance banks, NBFCs and HFCs',
    principle:
      'Banks take deposits, lend after credit assessment, run payment systems and distribute third-party products. Scheduled commercial banks include public, private, foreign and regional rural banks; co-operative banks serve urban and rural needs. Payments banks accept savings and current deposits up to 1 lakh per customer, issue debit (not credit) cards and cannot lend. Small finance banks serve small businesses, marginal farmers and the unorganised sector. NBFCs lend, lease and do hire purchase but cannot take demand deposits, issue cheques or offer DICGC deposit insurance. Housing finance companies are now regulated by RBI (previously National Housing Bank). P2P platforms are RBI-regulated.',
    source: SRC,
    asOf: '2025-06',
    topics: ['markets', 'regulation', 'debt'],
    keywords: ['scheduled commercial bank', 'payments bank', 'small finance bank', 'NBFC', 'housing finance company', 'co-operative bank', 'DICGC', 'P2P regulated'],
  },
  {
    id: 'xa-05-money-forex-markets',
    title: 'Money market and foreign-exchange market',
    principle:
      'The money market trades instruments of under one year: call (overnight) and notice money (up to 14 days), treasury bills, commercial paper, certificates of deposit and commercial bills; a wholesale, liquid market dominated by banks, FIs and primary dealers, with heavy RBI involvement. The forex market quotes currency pairs (in USD/INR, USD is the base currency and INR the quoting currency) across spot, forward and exchange-traded currency derivatives; the interbank segment makes two-way quotes, the merchant segment takes prices. FBIL publishes daily reference rates for USD, EUR, GBP and JPY against INR.',
    source: SRC,
    topics: ['markets'],
    keywords: ['money market', 'call money', 'notice money', 'treasury bill', 'commercial paper', 'certificate of deposit', 'forex market', 'currency pair', 'base currency', 'FBIL reference rate'],
  },
  {
    id: 'xa-05-account-aggregators',
    title: 'Credit information companies and account aggregators',
    principle:
      'Four credit information companies (TransUnion CIBIL, Experian, Equifax, CRIF High Mark) operate under the CIC (Regulation) Act 2005; specified users (lenders, insurers, brokers, telecoms, rating agencies) may pull reports, and individuals get one free full report with score per calendar year. Account aggregators are RBI-licensed entities that gather a customer’s financial data from different institutions and share it with third parties only with the customer’s explicit, revocable consent, cutting paperwork and widening access to formal credit.',
    source: SRC,
    topics: ['regulation', 'debt'],
    keywords: ['credit information company', 'account aggregator', 'AA framework', 'consent', 'data sharing', 'CIC Act'],
  },
  {
    id: 'xa-05-what-are-securities',
    title: 'What counts as a security under SCRA',
    principle:
      'Section 2(h) of the Securities Contracts (Regulation) Act 1956 defines securities to include shares, bonds, debentures and similar marketable instruments of companies; derivatives; units of collective investment schemes and mutual funds; security receipts of asset reconstruction; securitised debt instruments; government securities; rights or interests in securities; and others the government notifies (such as electronic gold receipts). Unit-linked insurance policies are expressly excluded.',
    source: SRC,
    topics: ['regulation', 'markets'],
    keywords: ['definition of securities', 'SCRA', 'Securities Contracts Regulation Act', 'ULIP not a security', 'electronic gold receipt', 'security receipt'],
  },
  {
    id: 'xa-05-market-infrastructure',
    title: 'Exchanges, clearing corporations, depositories, DPs and custodians',
    principle:
      'Stock exchanges (NSE, BSE) match orders electronically and anonymously. Clearing corporations confirm, settle and guarantee trades and run risk management so one defaulter cannot hurt the system. Depositories (NSDL and CDSL) hold securities electronically; securities must be dematerialised to trade on exchanges. Depository participants (brokers, banks) open investors’ demat accounts and act as the depositories’ agents. Custodians, usually large banks, hold securities and cash for institutional investors and collect their corporate benefits. Brokers are exchange members through whom all secondary-market trades must go.',
    source: SRC,
    topics: ['markets', 'operations'],
    keywords: ['stock exchange', 'NSE', 'BSE', 'clearing corporation', 'depository', 'NSDL', 'CDSL', 'depository participant', 'demat account', 'custodian', 'stock broker'],
  },
  {
    id: 'xa-05-other-intermediaries',
    title: 'Other intermediaries: KRAs, rating agencies, investment banks, AMCs, PMS, RTAs',
    principle:
      'KYC registration agencies keep verified investor records centrally (CKYC Registry for individuals; KRAs such as CVL, CAMS and NDML) so KYC is done once. Credit rating agencies grade issuers’ debt so investors can judge default risk. Investment banks advise on capital raising, M&A and valuation. Asset management companies pool money into mutual fund units; portfolio managers manage individual portfolios and may not pool money. Registrars and transfer agents keep investor records, pay dividends, run e-voting and process mutual fund transactions and detail changes. Investment advisers help investors build suitable portfolios; AIFs privately pool money from sophisticated investors.',
    source: SRC,
    topics: ['markets', 'regulation'],
    keywords: ['KRA', 'CKYC', 'KYC registration agency', 'credit rating agency', 'investment bank', 'asset management company', 'portfolio manager', 'registrar and transfer agent', 'RTA'],
  },
  {
    id: 'xa-05-insurance-pension-markets',
    title: 'The insurance and pension markets',
    principle:
      'Life insurance (opened to private insurers in 2001) offers traditional products (term, endowment, whole life), variable products and unit-linked plans; term insurance is pure protection with no maturity benefit. General insurance covers motor, health, travel, fire and personal accident. Distribution runs through agents (typically one life, one general and one standalone health insurer), corporate agents such as banks, brokers (who can place any insurer’s policy), and direct sales; surveyors assess general claims and TPAs process health claims. In pensions, government moved from defined-benefit to defined-contribution pensions; private-sector employees rely on EPF (with part of the employer share going to EPS) and NPS, a voluntary defined-contribution scheme with a choice of fund managers.',
    source: SRC,
    topics: ['insurance', 'retirement', 'markets'],
    keywords: ['insurance market', 'term insurance', 'ULIP', 'insurance agent', 'insurance broker', 'bancassurance', 'TPA', 'surveyor', 'NPS', 'EPF', 'EPS', 'defined contribution', 'defined benefit'],
  },
];
