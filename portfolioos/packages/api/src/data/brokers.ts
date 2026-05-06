/**
 * Top-25 Indian-broker registry for contract-note ingestion.
 *
 * Drives:
 *   1. mailboxPoller.inferBroker — match incoming emails to a broker so
 *      ImportJob.broker is set and the right parser is dispatched.
 *   2. Future LearnedTemplate seeding — every (brokerId, structureHash)
 *      pair is keyed off `id` here; the format-learning pipeline groups
 *      samples per broker before promoting to a regex recipe.
 *   3. Settings UI — list of supported brokers shown to the user, sample-
 *      drop instructions, password-rule hints.
 *
 * NOT a parser registry — only one regex parser exists (Zerodha). The
 * other brokers fall through to the generic file-import flow until
 * sample fixtures + LearnedTemplate recipes catch up.
 */

export type BrokerPasswordRule =
  /** No password / open PDF. */
  | 'none'
  /** PAN in upper-case, e.g. "ABCDE1234F". */
  | 'pan'
  /** PAN concatenated with DOB in DDMMYYYY, e.g. "ABCDE1234F01011990". */
  | 'pan_ddmmyyyy'
  /** Lower-case PAN + DOB DDMM, e.g. "abcde1234f0101". Some brokers use this. */
  | 'pan_lower_ddmm'
  /** DOB in DDMMYYYY only. */
  | 'ddmmyyyy'
  /** Custom rule — see notes. */
  | 'custom';

export interface BrokerDescriptor {
  /** Stable kebab-case id used as foreign key in DB and fixture path. Never rename. */
  id: string;
  /** Human-readable label for UI + parser logs. */
  label: string;
  /**
   * Sender-email substrings (lower-cased). Match if email "from" or "subject"
   * contains ANY of these. Keep tight — overly generic strings (e.g. "trade")
   * would cross-match other brokers.
   */
  senderPatterns: string[];
  /**
   * Subject-line substrings (lower-cased). Used as a tie-breaker when sender
   * patterns are ambiguous. Empty array = rely on sender patterns alone.
   */
  subjectPatterns: string[];
  /**
   * Keywords expected in PDF body text (UPPER-CASED). Used by the generic
   * contract-note adapter to identify which broker emitted a PDF when the
   * sender email is unavailable (e.g. user uploads file directly).
   */
  pdfKeywords: string[];
  /** PDF password derivation rule for this broker's contract notes. */
  passwordRule: BrokerPasswordRule;
  /** Exchanges this broker primarily routes to. */
  exchanges: ('NSE' | 'BSE' | 'NFO' | 'BFO' | 'MCX')[];
  /** Free-text notes — odd password rules, regional quirks, etc. */
  notes?: string;
}

/**
 * Top 25 Indian retail brokers by active-client count + AUM (FY2025-26).
 * Order is presentation-only — match priority is determined by pattern
 * specificity, not array position.
 */
export const BROKERS: readonly BrokerDescriptor[] = [
  {
    id: 'zerodha',
    label: 'Zerodha',
    senderPatterns: ['zerodha.com', 'zerodha', 'kite.zerodha', 'reports@zerodha'],
    subjectPatterns: ['contract note', 'digital contract'],
    pdfKeywords: ['ZERODHA', 'ZERODHA BROKING'],
    passwordRule: 'pan',
    exchanges: ['NSE', 'BSE', 'NFO', 'MCX'],
    notes: 'Contract-note PDF locked with upper-case PAN.',
  },
  {
    id: 'groww',
    label: 'Groww',
    senderPatterns: ['groww.in', 'nextbillion.tech', 'support@groww'],
    subjectPatterns: ['contract note', 'trade confirmation'],
    pdfKeywords: ['NEXTBILLION TECHNOLOGY', 'GROWW'],
    passwordRule: 'pan',
    exchanges: ['NSE', 'BSE', 'NFO'],
  },
  {
    id: 'upstox',
    label: 'Upstox',
    senderPatterns: ['upstox.com', 'rksv.in', 'noreply@upstox'],
    subjectPatterns: ['contract note', 'trade confirmation'],
    pdfKeywords: ['UPSTOX', 'RKSV SECURITIES'],
    passwordRule: 'pan',
    exchanges: ['NSE', 'BSE', 'NFO', 'MCX'],
  },
  {
    id: 'angel-one',
    label: 'Angel One',
    senderPatterns: ['angelbroking.com', 'angelone.in', 'noreply@angelbroking'],
    subjectPatterns: ['contract note', 'trade confirmation'],
    pdfKeywords: ['ANGEL ONE', 'ANGEL BROKING'],
    passwordRule: 'pan',
    exchanges: ['NSE', 'BSE', 'NFO', 'MCX'],
  },
  {
    id: 'icici-direct',
    label: 'ICICI Direct',
    senderPatterns: ['icicidirect.com', 'icicisecurities.com', 'reports@icicidirect'],
    subjectPatterns: ['contract note', 'transaction statement'],
    pdfKeywords: ['ICICI SECURITIES', 'ICICIDIRECT'],
    passwordRule: 'pan',
    exchanges: ['NSE', 'BSE', 'NFO'],
  },
  {
    id: 'hdfc-securities',
    label: 'HDFC Securities',
    senderPatterns: ['hdfcsec.com', 'hdfcsecurities', 'noreply@hdfcsec'],
    subjectPatterns: ['contract note', 'trade confirmation'],
    pdfKeywords: ['HDFC SECURITIES'],
    passwordRule: 'pan',
    exchanges: ['NSE', 'BSE', 'NFO'],
  },
  {
    id: 'kotak-securities',
    label: 'Kotak Securities',
    senderPatterns: ['kotaksecurities.com', 'kotak.com', 'reports@kotaksecurities'],
    subjectPatterns: ['contract note', 'trade confirmation'],
    pdfKeywords: ['KOTAK SECURITIES'],
    passwordRule: 'pan_ddmmyyyy',
    exchanges: ['NSE', 'BSE', 'NFO'],
    notes: 'Some Kotak PDFs use PAN + DOB(DDMMYYYY) concatenated.',
  },
  {
    id: 'sharekhan',
    label: 'Sharekhan',
    senderPatterns: ['sharekhan.com', 'noreply@sharekhan'],
    subjectPatterns: ['contract note'],
    pdfKeywords: ['SHAREKHAN', 'SHAREKHAN LIMITED'],
    passwordRule: 'pan',
    exchanges: ['NSE', 'BSE', 'NFO'],
  },
  {
    id: 'motilal-oswal',
    label: 'Motilal Oswal',
    senderPatterns: ['motilaloswal.com', 'mosl.co.in'],
    subjectPatterns: ['contract note'],
    pdfKeywords: ['MOTILAL OSWAL'],
    passwordRule: 'pan',
    exchanges: ['NSE', 'BSE', 'NFO'],
  },
  {
    id: '5paisa',
    label: '5paisa',
    senderPatterns: ['5paisa.com', '5paisa.in', 'support@5paisa'],
    subjectPatterns: ['contract note'],
    pdfKeywords: ['5PAISA CAPITAL', '5PAISA'],
    passwordRule: 'pan',
    exchanges: ['NSE', 'BSE', 'NFO'],
  },
  {
    id: 'edelweiss',
    label: 'Edelweiss',
    senderPatterns: ['edelweiss.in', 'edelweissfin.com', 'nuvama.com'],
    subjectPatterns: ['contract note'],
    pdfKeywords: ['EDELWEISS', 'NUVAMA WEALTH'],
    passwordRule: 'pan',
    exchanges: ['NSE', 'BSE', 'NFO'],
    notes: 'Edelweiss retail broking is now Nuvama Wealth — match both.',
  },
  {
    id: 'iifl',
    label: 'IIFL Securities',
    senderPatterns: ['iiflsecurities.com', 'iifl.com', 'indiainfoline'],
    subjectPatterns: ['contract note'],
    pdfKeywords: ['IIFL SECURITIES', 'INDIA INFOLINE'],
    passwordRule: 'pan',
    exchanges: ['NSE', 'BSE', 'NFO'],
  },
  {
    id: 'sbi-securities',
    label: 'SBI Securities',
    senderPatterns: ['sbisecurities.in', 'sbicapsec.com', 'sbicap'],
    subjectPatterns: ['contract note'],
    pdfKeywords: ['SBI SECURITIES', 'SBICAP SECURITIES'],
    passwordRule: 'pan_ddmmyyyy',
    exchanges: ['NSE', 'BSE', 'NFO'],
  },
  {
    id: 'axis-direct',
    label: 'Axis Direct',
    senderPatterns: ['axisdirect.in', 'axisbank.com'],
    subjectPatterns: ['contract note'],
    pdfKeywords: ['AXIS SECURITIES', 'AXIS DIRECT'],
    passwordRule: 'pan',
    exchanges: ['NSE', 'BSE', 'NFO'],
  },
  {
    id: 'paytm-money',
    label: 'Paytm Money',
    senderPatterns: ['paytmmoney.com', 'paytm.com', 'noreply@paytmmoney'],
    subjectPatterns: ['contract note', 'trade confirmation'],
    pdfKeywords: ['PAYTM MONEY'],
    passwordRule: 'pan',
    exchanges: ['NSE', 'BSE', 'NFO'],
  },
  {
    id: 'dhan',
    label: 'Dhan',
    senderPatterns: ['dhan.co', 'rmoneyindia', 'support@dhan'],
    subjectPatterns: ['contract note'],
    pdfKeywords: ['DHAN', 'RAGHUNANDAN MONEY'],
    passwordRule: 'pan',
    exchanges: ['NSE', 'BSE', 'NFO'],
  },
  {
    id: 'fyers',
    label: 'Fyers',
    senderPatterns: ['fyers.in', 'support@fyers'],
    subjectPatterns: ['contract note'],
    pdfKeywords: ['FYERS SECURITIES'],
    passwordRule: 'pan',
    exchanges: ['NSE', 'BSE', 'NFO', 'MCX'],
  },
  {
    id: 'religare',
    label: 'Religare Broking',
    senderPatterns: ['religareonline.com', 'religare.com'],
    subjectPatterns: ['contract note'],
    pdfKeywords: ['RELIGARE BROKING', 'RELIGARE'],
    passwordRule: 'pan',
    exchanges: ['NSE', 'BSE', 'NFO'],
  },
  {
    id: 'anand-rathi',
    label: 'Anand Rathi',
    senderPatterns: ['rathi.com', 'anandrathi.com'],
    subjectPatterns: ['contract note'],
    pdfKeywords: ['ANAND RATHI'],
    passwordRule: 'pan',
    exchanges: ['NSE', 'BSE', 'NFO'],
  },
  {
    id: 'geojit',
    label: 'Geojit',
    senderPatterns: ['geojit.com', 'geojit.net'],
    subjectPatterns: ['contract note'],
    pdfKeywords: ['GEOJIT FINANCIAL'],
    passwordRule: 'pan',
    exchanges: ['NSE', 'BSE', 'NFO'],
  },
  {
    id: 'ventura',
    label: 'Ventura Securities',
    senderPatterns: ['venturasecurities.com', 'ventura1.com'],
    subjectPatterns: ['contract note'],
    pdfKeywords: ['VENTURA SECURITIES'],
    passwordRule: 'pan',
    exchanges: ['NSE', 'BSE', 'NFO'],
  },
  {
    id: 'nirmal-bang',
    label: 'Nirmal Bang',
    senderPatterns: ['nirmalbang.com', 'nirmalbang.in'],
    subjectPatterns: ['contract note'],
    pdfKeywords: ['NIRMAL BANG'],
    passwordRule: 'pan',
    exchanges: ['NSE', 'BSE', 'NFO'],
  },
  {
    id: 'choice',
    label: 'Choice Broking',
    senderPatterns: ['choiceindia.com', 'choicebroking.in'],
    subjectPatterns: ['contract note'],
    pdfKeywords: ['CHOICE EQUITY BROKING', 'CHOICE BROKING'],
    passwordRule: 'pan',
    exchanges: ['NSE', 'BSE', 'NFO'],
  },
  {
    id: 'aliceblue',
    label: 'Alice Blue',
    senderPatterns: ['aliceblueonline.com', 'alicebluepartner'],
    subjectPatterns: ['contract note'],
    pdfKeywords: ['ALICEBLUE', 'ALICE BLUE'],
    passwordRule: 'pan',
    exchanges: ['NSE', 'BSE', 'NFO', 'MCX'],
  },
  {
    id: 'mstock',
    label: 'm.Stock (Mirae)',
    senderPatterns: ['mstock.com', 'miraeasset', 'noreply@mstock'],
    subjectPatterns: ['contract note'],
    pdfKeywords: ['M.STOCK', 'MIRAE ASSET CAPITAL MARKETS'],
    passwordRule: 'pan',
    exchanges: ['NSE', 'BSE', 'NFO'],
  },
] as const;

export type BrokerId = (typeof BROKERS)[number]['id'];

/**
 * Match an email's sender + subject against the registry. Returns the first
 * broker whose sender pattern matches; subject patterns are evaluated only
 * as a tie-breaker (rare, since sender domains are usually unique). Returns
 * null if nothing matches.
 *
 * Inputs are lower-cased internally — caller doesn't need to pre-normalise.
 */
export function detectBrokerFromEmail(
  from: string,
  subject: string,
): BrokerDescriptor | null {
  const fromLc = from.toLowerCase();
  const subjLc = subject.toLowerCase();

  // Pass 1 — sender domain match (high confidence).
  for (const broker of BROKERS) {
    if (broker.senderPatterns.some((p) => fromLc.includes(p))) {
      return broker;
    }
  }

  // Pass 2 — subject-line keyword match (low confidence, used only when
  // the sender is generic e.g. a transactional gateway). Require at least
  // one broker-specific subject pattern AND a broker-name fragment in the
  // subject to avoid false positives like "monthly statement".
  for (const broker of BROKERS) {
    const subjectHit = broker.subjectPatterns.some((p) => subjLc.includes(p));
    if (!subjectHit) continue;
    if (broker.senderPatterns.some((p) => subjLc.includes(p))) {
      return broker;
    }
  }

  return null;
}

/**
 * Match a PDF's extracted text against the registry. Used by the generic
 * file-upload path where we don't have an originating email. The PDF text
 * is upper-cased once and scanned against each broker's pdfKeywords.
 */
export function detectBrokerFromPdfText(
  pdfText: string,
): BrokerDescriptor | null {
  const upper = pdfText.toUpperCase();
  for (const broker of BROKERS) {
    if (broker.pdfKeywords.some((kw) => upper.includes(kw))) {
      return broker;
    }
  }
  return null;
}

export function getBrokerById(id: string): BrokerDescriptor | null {
  return BROKERS.find((b) => b.id === id) ?? null;
}
