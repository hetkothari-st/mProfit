import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-A',
  edition: '2025-06',
  chapter: 17,
  chapterTitle: 'Operational Aspects of Investment Management',
};

export const XA_17: readonly KnowledgeEntry[] = [
  {
    id: 'xa-17-investor-types-onboarding',
    title: 'Who can invest, and what onboarding needs',
    principle:
      'Eligible investors include resident individuals, minors through guardians, HUFs, NRIs and PIOs, and institutions such as companies, trusts, societies, banks, insurers, pension funds and FPIs; each product’s offer document says who may invest and any minimums, maximums or age limits (NRIs, for example, cannot open post-office small savings). Institutions invest only if their charter allows it, decide through the board or trustees, and act through authorised signatories. Every application must carry the mandatory fields: name and holding mode, signatures of all joint holders, address matching KYC, bank details, PAN and KYC status. Payouts, tax and correspondence follow the first holder. IPO applications must use ASBA (or UPI with blocking for retail), which blocks money in the bank account until allotment.',
    source: SRC,
    topics: ['operations'],
    keywords: ['who can invest', 'onboarding', 'joint holders', 'first holder', 'mandatory fields', 'ASBA', 'UPI IPO', 'institutional investor'],
  },
  {
    id: 'xa-17-pan-requirements',
    title: 'PAN: when it is required and when it is not',
    principle:
      'PAN is the single identifier for capital-market transactions and is needed for most financial products, including for NRIs and for guardians investing for minors; without it, Form 60/61 is filed where allowed. Exemptions: mutual fund "micro" investments by individuals up to 50,000 a year across a fund house (lump sum or SIP), backed by a PAN-exempt KYC reference; cash mutual fund purchases up to 50,000 per investor per fund house per year; basic savings bank deposit accounts; insurance premiums in cash up to 50,000 per transaction; NPS cash contributions up to 50,000. Bank FDs and insurance premiums above 50,000 need PAN.',
    source: SRC,
    asOf: '2025-06',
    topics: ['operations', 'regulation'],
    keywords: ['PAN', 'Form 60', 'PAN exempt', 'micro investment', 'micro SIP', 'cash investment mutual fund', 'PAN mandatory'],
  },
  {
    id: 'xa-17-kyc-ckyc',
    title: 'KYC, KRAs and central KYC',
    principle:
      'KYC under the Prevention of Money Laundering Act verifies identity (a photo document such as passport, driving licence, voter ID or Aadhaar) and address, plus PAN, before banking, broking, demat, mutual fund, insurance, NPS or post-office business. Since 2012 securities-market KYC is uniform: done once with a KYC Registration Agency (KRA) and usable at every mutual fund, broker, DP, PMS or AIF. CERSAI runs the Central KYC Records Registry (CKYCR), shared by RBI, SEBI, IRDAI and PFRDA entities, which issues a KYC identifier so documents need not be resubmitted unless details changed. Online KYC can use Aadhaar e-KYC, DigiLocker, eSign, OTP checks, penny-drop bank verification and video in-person verification (IPV is not needed when Aadhaar or online-verified documents are used). Banks and post offices apply stricter checks to higher-risk customers.',
    source: SRC,
    topics: ['operations', 'regulation'],
    keywords: ['KYC', 'KRA', 'KYC registration agency', 'CKYC', 'CKYCR', 'CERSAI', 'e-KYC', 'video KYC', 'IPV', 'in person verification', 'PMLA', 'DigiLocker'],
  },
  {
    id: 'xa-17-demat-remat',
    title: 'Dematerialisation and rematerialisation',
    principle:
      'A depository (NSDL or CDSL, under the Depositories Act 1996) holds securities electronically, like a bank holds money; investors deal through a depository participant (DP). Demat securities are fungible and identified only by ISIN (a 12-character code) and quantity. To demat, the investor gives certificates and a Dematerialisation Request Form to the DP; the request goes electronically to the registrar and depository, the registrar checks and destroys the certificates, the depository replaces the investor in the register of members, and the DP account is credited (no stamp duty). Requests fail for mismatched names or signatures, fake or duplicate certificates. Rematerialisation reverses this via a Rematerialisation Request Form. Physical transfer of shares stopped from April 2019, and issues above 10 crore must be in demat form.',
    source: SRC,
    asOf: '2025-06',
    topics: ['operations', 'equity'],
    keywords: ['demat', 'dematerialisation', 'rematerialisation', 'depository', 'NSDL', 'CDSL', 'depository participant', 'DRF', 'ISIN', 'physical shares'],
  },
  {
    id: 'xa-17-power-of-attorney',
    title: 'Power of attorney in investing',
    principle:
      'A power of attorney lets a grantor authorise a holder (often for NRIs or busy investors) to transact on their behalf; both must be PAN and KYC compliant. A general PoA covers broad affairs (banking, tax filing, property, contracts, claims); a specific PoA covers named acts only. Validity: on non-judicial stamp paper stamped per state rules, signed by the grantor on every page and by both parties on the last, and notarised where the provider requires. One executed abroad can be on plain paper attested by the Indian embassy or a notary there, then stamped in India. Opening or closing bank and demat accounts, and making or changing nominations, stay with the holder, not the attorney, and the grantor can still operate the account. Minors cannot grant a PoA; the guardian acts for them.',
    source: SRC,
    topics: ['operations', 'estate'],
    keywords: ['power of attorney', 'PoA', 'general power of attorney', 'specific power of attorney', 'grantor', 'attorney holder', 'NRI PoA'],
  },
  {
    id: 'xa-17-nri-residency-repatriation',
    title: 'NRI status and repatriation',
    principle:
      'For tax, an individual is resident if in India 182 days or more in the year, or 60 days or more in the year plus 365 days or more over the previous four years (the 60-day test does not apply to citizens or PIOs visiting India); otherwise non-resident. Under FEMA an NRI is an Indian citizen resident outside India. What an NRI can take out depends on the money’s source: investments from NRE or FCNR accounts, or foreign remittances backed by FIRC, are fully repatriable; from NRO accounts, up to USD 1 million per financial year. Current income (interest, rent, dividends) is freely repatriable after tax. NRIs also file FATCA/CRS self-declarations.',
    source: SRC,
    asOf: '2025-06',
    topics: ['operations', 'regulation', 'tax'],
    keywords: ['NRI', 'residential status', '182 days', 'repatriation', 'NRE account', 'NRO account', 'FCNR', 'USD 1 million', 'FATCA', 'CRS', 'PIO'],
  },
  {
    id: 'xa-17-nri-pins-demat-trading',
    title: 'NRI share investing: PINS, demat and trading accounts',
    principle:
      'NRIs and PIOs buying listed shares or convertible debentures on exchanges must route trades through a Portfolio Investment (NRI) Scheme account at one RBI-designated bank branch: one NRE (PIS) account for repatriable and one NRO (PIS) account for non-repatriable investing. Limits: 5% of a company’s paid-up capital per NRI and 10% for all NRIs together (raisable to 24% by shareholder resolution). Separate repatriable and non-repatriable demat accounts are needed; trading accounts link to NRE or NRO. NRIs cannot buy stocks on the foreign-investment breach list, must settle cash-segment trades by delivery, cannot short sell or trade currency or commodity segments through these accounts, and need clear funds before buying.',
    source: SRC,
    asOf: '2025-06',
    topics: ['operations', 'regulation', 'equity'],
    keywords: ['PINS', 'PIS account', 'portfolio investment scheme', 'NRI demat', 'NRI trading account', 'NRI 5% limit', 'NRI 10% limit', 'NRI short selling'],
  },
  {
    id: 'xa-17-status-changes-nri',
    title: 'Becoming an NRI or returning to India',
    principle:
      'Resident to NRI: tell every provider; redesignate resident bank accounts and FDs to NRO; open NRE/NRO accounts; open a new NRI demat and trading account, move holdings across (they become non-repatriable); update mutual fund KYC status, address and bank via the KRA change form, after which TDS applies on redemptions. Old holdings can be kept on a non-repatriable basis; small-savings schemes can continue to maturity into NRO. NRI to resident: NRE/NRO/FCNR accounts cannot be operated as such; convert to resident accounts, optionally moving NRE/FCNR balances into a Resident Foreign Currency (RFC) account; open resident demat and trading accounts and transfer holdings; update KYC with the KRA.',
    source: SRC,
    topics: ['operations', 'regulation'],
    keywords: ['change of status', 'resident to NRI', 'NRI to resident', 'returning NRI', 'RFC account', 'NRO redesignation', 'KYC change form'],
  },
  {
    id: 'xa-17-folio-maintenance',
    title: 'Folios and keeping account details current',
    principle:
      'Each investor gets a folio, account or certificate number on first investment; nominations, holding mode, address and bank details apply to everything under it, and additional purchases, switches and redemptions use the same folio (via transaction slips that need no fresh PAN or KYC proof). NPS uses one PRAN with one Tier I and one Tier II account. Changes of address, name or status for capital-market holdings must be made in the KRA’s KYC record, which then informs all intermediaries; telling only the AMC or DP is not enough. Changes need supporting proof and the signatures of all joint holders. Mutual funds do not allow adding a joint holder (that would be a transfer); a new folio is used instead. Several bank accounts can be registered to a folio, with one default for payouts.',
    source: SRC,
    topics: ['operations', 'mutual-funds'],
    keywords: ['folio', 'transaction slip', 'change of address', 'change of name', 'bank mandate', 'add joint holder', 'PRAN', 'KRA update'],
  },
  {
    id: 'xa-17-lien-pledge',
    title: 'Lien and pledge on investments',
    principle:
      'Shares, mutual fund units, deposits, small savings and insurance policies (by assignment) can be pledged as loan collateral. The investor and lender notify the provider, which records the lien (for mutual funds it appears as a transaction on the statement). Pledged securities cannot be redeemed or transferred until the lender authorises release; non-financial changes and dividends normally stay with the investor. If the loan defaults, the lender invokes the lien and the securities are sold or redeemed with proceeds paid to the lender; on repayment the lender writes to have the lien removed.',
    source: SRC,
    topics: ['operations', 'debt'],
    keywords: ['lien', 'pledge', 'loan against securities', 'loan against mutual funds', 'lien marking', 'invoke lien', 'assignment as collateral'],
  },
  {
    id: 'xa-17-transmission',
    title: 'Transmission of investments after death',
    principle:
      'Transmission passes holdings to the entitled persons when an investor dies. Order of entitlement: surviving joint holders first (they take as owners, not trustees, and outrank nominees); for a sole holder with a nominee, the nominee; with no nominee, legal heirs proving succession. On an HUF Karta’s death, the new Karta with an indemnity from the coparceners. If all joint holders die together, the nominees. Documents: death certificate always; probate of the will or succession certificate where needed; proof of relationship; indemnity bond; NOC from other heirs; claimant’s bank and KYC details. Simplified documents apply below thresholds (5 lakh for physical securities, 15 lakh for demat). Providers that pay as per process are discharged; a nominee may hold in trust if heirs dispute.',
    source: SRC,
    asOf: '2025-06',
    topics: ['operations', 'estate'],
    keywords: ['transmission', 'death of investor', 'claim after death', 'succession certificate', 'probate', 'indemnity bond', 'legal heir', 'survivorship'],
  },
  {
    id: 'xa-17-nomination',
    title: 'Nomination rules',
    principle:
      'Nomination names who receives an investment if the holder dies; one nomination covers the whole folio or account. Only individuals can nominate; all joint holders must sign to make, change or cancel it, and a PoA holder cannot. Mutual fund and demat investors since October 2022 must either nominate or opt out in a signed declaration. From March 2025, up to 10 nominees are allowed; each needs one identifier (PAN, driving licence number or last four Aadhaar digits), contact details, relationship, and date of birth if a minor; forms can be submitted online or offline; surviving joint holders take as owners, and if all joint holders die together the nominees receive the assets.',
    source: SRC,
    asOf: '2025-06',
    topics: ['operations', 'estate'],
    keywords: ['nomination', 'nominee', '10 nominees', 'opt out of nomination', 'change nomination', 'nominee details'],
  },
  {
    id: 'xa-17-assignment',
    title: 'Assignment of insurance policies',
    principle:
      'Assignment transfers the rights under a policy to another person, a lender or a relative, by endorsing the policy or executing a deed and registering it with the insurer. It can be absolute (all rights pass, as with a lender, and cannot be revoked) or conditional (it takes effect only on a stated condition, such as the assignee surviving). Payouts on an assigned policy go to the assignee until the loan is repaid and the insurer informed.',
    source: SRC,
    topics: ['operations', 'insurance'],
    keywords: ['assignment', 'absolute assignment', 'conditional assignment', 'insurance policy assignment', 'loan against policy'],
  },
  {
    id: 'xa-17-minors',
    title: 'Investing for minors, and minor turned major',
    principle:
      'A minor (under 18) cannot contract, so a natural or court-appointed guardian invests; the minor must be the sole holder (no joint holders), the guardian completes KYC and signs, and date-of-birth proof plus proof of the guardian relationship are needed. A change of guardian needs the old guardian’s consent, a court order or a death certificate, plus the new guardian’s KYC. At 18 the minor-turned-major must complete their own KYC, get their signature attested by their bank, reissue the PAN card with their signature, and open a new demat account to receive the holdings. Mutual fund folios freeze for the guardian on the date of majority and all SIPs, STPs and SWPs stop until the change-of-status documents arrive.',
    source: SRC,
    topics: ['operations', 'mutual-funds', 'goals'],
    keywords: ['minor investment', 'guardian', 'minor turned major', 'minor attains majority', 'SIP stops at 18', 'change of guardian', 'child investment account'],
  },
  {
    id: 'xa-17-payments',
    title: 'Payment modes and third-party payment rules',
    principle:
      'Capital-market investments must be paid from the first holder’s own bank account by cheque, draft, NEFT, RTGS (2 lakh and above, settled real time; NEFT settles in batches and has no minimum), net banking, UPI, debit card, NACH/ACH mandate or post-dated cheques for SIPs, and ASBA for IPOs and NFOs; IFSC (11 characters) identifies branches for transfers and MICR (9 digits) is on cheques. Mutual funds accept cash up to 50,000 per investor per fund house per year, but redemptions go only through banks. Third-party payments are refused except a parent or grandparent paying up to 50,000 per transaction for a minor, employers via payroll, and custodians for FPIs, each with a declaration. Paying from and to the investor’s own account guards against fraud.',
    source: SRC,
    asOf: '2025-06',
    topics: ['operations', 'mutual-funds', 'regulation'],
    keywords: ['payment modes', 'third party payment', 'NEFT', 'RTGS', 'ACH mandate', 'NACH', 'cash investment limit', 'IFSC', 'MICR', 'ASBA'],
  },
  {
    id: 'xa-17-advice-documentation-mitc',
    title: 'Documenting advice, and the MITC in advisory agreements',
    principle:
      'An adviser must sign an agreement setting scope, fees and responsibilities, explain its clauses, collect and record the client’s age, income, assets, liabilities and goals, risk-profile them and communicate the result, document how products were short-listed and why they suit, record the advice given, and keep records (physical or digitally signed electronic) for at least five years. Since 2025 the agreement must carry Most Important Terms and Conditions, including: the adviser takes only fees, never client money or securities; no guaranteed returns; no trades without the client’s specific consent each time; fee caps for individuals and HUFs; advance fees for at most one year with a pro-rata refund on early termination (adviser may keep up to one quarter’s fee); no cash fees; no distribution services to the client’s family; direct plans only.',
    inPractice:
      'The MITC also tells clients to take grievances to the adviser first, then SEBI SCORES, then SmartODR, and never to share login credentials or OTPs with anyone, the adviser included.',
    source: SRC,
    asOf: '2025-06',
    topics: ['regulation', 'ethics', 'operations'],
    keywords: ['MITC', 'most important terms and conditions', 'investment advisory agreement', 'advice documentation', 'record keeping five years', 'advance fee one year', 'adviser cannot hold client money'],
  },
  {
    id: 'xa-17-exchange-mf-platforms',
    title: 'Buying mutual funds through stock exchange platforms',
    principle:
      'BSE StAR MF and NSE NMF II let AMFI-registered distributors and investors buy, redeem, switch and run SIPs, STPs and SWPs through exchange infrastructure, in demat or physical (statement) form, with the clearing corporation handling money and units, which removes counterparty risk. Units still come from and go back to the AMC. For advisers, the platforms give one consolidated view of clients’ holdings and transaction status, family grouping, little paperwork and easier fixes when something goes wrong.',
    source: SRC,
    topics: ['operations', 'mutual-funds'],
    keywords: ['BSE StAR MF', 'NSE NMF', 'exchange platform mutual fund', 'mutual fund in demat', 'buy mutual fund on exchange'],
  },
];
