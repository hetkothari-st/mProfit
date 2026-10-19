import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-A',
  edition: '2025-06',
  chapter: 19,
  chapterTitle: 'Ethical Issues',
};

export const XA_19: readonly KnowledgeEntry[] = [
  {
    id: 'xa-19-why-ethics',
    title: 'Ethics in advice: beyond what is legal',
    principle:
      'Ethics (from the Greek ethos, character) are moral rules for conduct that affects others: honesty, fairness, diligence, care and respect. Staying within the law is the floor; ethics asks what is right. Because advisers handle people’s money and life goals, trust is the whole business: it takes years to build and moments to lose. The test is "client first": the client’s interest above the adviser’s own, shown consistently over time, including proactively raising what the client needs instead of waiting to be asked, and keeping up after-sales service.',
    source: SRC,
    topics: ['ethics'],
    keywords: ['ethics', 'client first', 'trust', 'ethical conduct', 'after sales service'],
  },
  {
    id: 'xa-19-common-failings',
    title: 'Where advisers commonly go wrong',
    principle:
      'Typical grievances: not understanding the client’s situation (small-cap funds pitched to a senior citizen; risk profiling settles conflicts between wishes and needs); not understanding the product (arbitrage funds sold as liquid-fund substitutes despite short-horizon volatility); not knowing the wider market (selling small caps during a rally without perspective); churning clients between products for commissions; showing only the upside and hiding risks (a distressed-debt AIF’s default risk); and poor service or not delivering what was promised. Sales targets are a frequent root cause.',
    source: SRC,
    topics: ['ethics', 'risk-profiling'],
    keywords: ['mis-selling', 'churning', 'unsuitable advice', 'hiding risks', 'sales targets', 'investor grievances'],
  },
  {
    id: 'xa-19-ethical-dilemmas',
    title: 'Ethical dilemmas and how to resolve them',
    principle:
      'A dilemma is a choice where no option is clearly better, and each choice signals the adviser’s standards. Examples: selling a client services they do not need for revenue versus telling them they need not; signing up more clients than can be served well versus growing slowly; personal belief in term cover versus an employer’s push for high-commission ULIPs or whole-life plans; a consistently underperforming fund pushed for its commission; aggressive products pushed to older clients. Ways through: analyse deeper (it is often not really a dilemma), apply a principle (most good or least harm), or reframe the problem. With social media full of opinions, advisers must also be ready to justify their advice.',
    source: SRC,
    topics: ['ethics', 'insurance'],
    keywords: ['ethical dilemma', 'conflict of interest', 'commission bias', 'personal versus professional values', 'mis-selling ULIP'],
  },
  {
    id: 'xa-19-fiduciary-duty',
    title: 'The adviser’s fiduciary duty',
    principle:
      'Investment advisers are fiduciaries: they must act in the client’s best interest under utmost good faith (uberrimae fidei), never profit at the client’s expense or exploit their trust, and rise above conflicts. Duties: full disclosure of all material facts, especially actual or even perceived conflicts; suitable advice for that specific client; an objective, reasonable basis for every recommendation, not one that benefits the adviser; and execution free of conflicts.',
    source: SRC,
    topics: ['ethics', 'regulation'],
    keywords: ['fiduciary', 'fiduciary duty', 'best interest', 'utmost good faith', 'uberrimae fidei', 'full disclosure'],
  },
  {
    id: 'xa-19-sebi-investor-dos-donts',
    title: 'SEBI’s dos and don’ts for investors using advisers',
    principle:
      'Do: deal only with SEBI-registered advisers (finfluencers often are not), check the registration number on SEBI’s list, pay only advisory fees through banking channels with signed receipts, insist on risk profiling before any advice, ask questions until clear, weigh risk, return, liquidity and safety, get signed written terms, stay vigilant, and report advisers promising assured returns. Don’t: deal with unregistered entities or judge by social-media followers, act on stock tips, hand money to the adviser to invest, believe assured or exorbitant returns, act on adverts, rumours, calls or repeated messages, chase limited-period discounts or gifts, or rush into investments that do not suit your goals or risk appetite.',
    source: SRC,
    topics: ['ethics', 'regulation', 'grievance'],
    keywords: ['SEBI dos and donts', 'check SEBI registration', 'finfluencer', 'stock tips', 'assured returns', 'registered investment adviser'],
  },
  {
    id: 'xa-19-audit-global-practice',
    title: 'Audit observations and global ethics standards',
    principle:
      'Advisers undergo an annual compliance audit and should tell clients about any material audit observations. Globally, the US SEC requires advisers to disclose financial conditions that could impair service and material disciplinary events of the past 10 years, and to keep a written code of ethics covering conduct standards, legal compliance, reporting of personal holdings and trades by access persons, pre-approval of their IPO and private-placement buys, reporting of violations, written acknowledgement of the code, and records. Australia’s Corporations Act sets a "best interests" duty: identify the client’s situation, objectives and needs and the subject of the advice, fill gaps, investigate products thoroughly before recommending, and base every judgement on the client’s circumstances.',
    source: SRC,
    topics: ['ethics', 'regulation'],
    keywords: ['compliance audit', 'audit observations', 'SEC code of ethics', 'best interests duty', 'Australia Corporations Act', 'personal trading disclosure'],
  },
];
