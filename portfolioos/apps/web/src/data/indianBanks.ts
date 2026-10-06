/**
 * Indian banks for the bank-account form's picker. IFSC prefixes (first four
 * characters of every IFSC) verified against Razorpay's IFSC dataset
 * (github.com/razorpay/ifsc, src/banknames.json) on 2026-09-10. Display names
 * use the short form people actually search for, and each starts the way
 * BankAccountVisual's palette matchers expect ("HDFC…", "State Bank…").
 *
 * Not exhaustive — the Bank field stays free text for anything missing.
 */
export interface IndianBank {
  name: string;
  ifscPrefix: string;
  /** Extra search terms: abbreviations and former names. */
  keywords?: string[];
}

export const INDIAN_BANKS: IndianBank[] = [
  // Large private banks
  { name: 'HDFC Bank', ifscPrefix: 'HDFC' },
  { name: 'ICICI Bank', ifscPrefix: 'ICIC' },
  { name: 'Axis Bank', ifscPrefix: 'UTIB', keywords: ['UTI Bank'] },
  { name: 'Kotak Mahindra Bank', ifscPrefix: 'KKBK', keywords: ['Kotak'] },
  { name: 'IndusInd Bank', ifscPrefix: 'INDB' },
  { name: 'Yes Bank', ifscPrefix: 'YESB' },
  { name: 'IDFC FIRST Bank', ifscPrefix: 'IDFB', keywords: ['IDFC'] },
  { name: 'RBL Bank', ifscPrefix: 'RATN', keywords: ['Ratnakar'] },
  { name: 'Federal Bank', ifscPrefix: 'FDRL' },
  { name: 'IDBI Bank', ifscPrefix: 'IBKL' },
  { name: 'Bandhan Bank', ifscPrefix: 'BDBL' },
  { name: 'DCB Bank', ifscPrefix: 'DCBL', keywords: ['Development Credit Bank'] },
  { name: 'South Indian Bank', ifscPrefix: 'SIBL' },
  { name: 'Karur Vysya Bank', ifscPrefix: 'KVBL', keywords: ['KVB'] },
  { name: 'City Union Bank', ifscPrefix: 'CIUB', keywords: ['CUB'] },
  { name: 'Karnataka Bank', ifscPrefix: 'KARB' },
  { name: 'CSB Bank', ifscPrefix: 'CSBK', keywords: ['Catholic Syrian Bank'] },
  { name: 'Tamilnad Mercantile Bank', ifscPrefix: 'TMBL', keywords: ['TMB'] },
  { name: 'Jammu & Kashmir Bank', ifscPrefix: 'JAKA', keywords: ['J&K Bank', 'JK Bank'] },
  { name: 'Dhanlaxmi Bank', ifscPrefix: 'DLXB' },

  // Public sector banks
  { name: 'State Bank of India', ifscPrefix: 'SBIN', keywords: ['SBI'] },
  { name: 'Bank of Baroda', ifscPrefix: 'BARB', keywords: ['BoB'] },
  { name: 'Punjab National Bank', ifscPrefix: 'PUNB', keywords: ['PNB'] },
  { name: 'Canara Bank', ifscPrefix: 'CNRB' },
  { name: 'Union Bank of India', ifscPrefix: 'UBIN', keywords: ['UBI'] },
  { name: 'Bank of India', ifscPrefix: 'BKID', keywords: ['BOI'] },
  { name: 'Indian Bank', ifscPrefix: 'IDIB' },
  { name: 'Central Bank of India', ifscPrefix: 'CBIN' },
  { name: 'Indian Overseas Bank', ifscPrefix: 'IOBA', keywords: ['IOB'] },
  { name: 'UCO Bank', ifscPrefix: 'UCBA' },
  { name: 'Bank of Maharashtra', ifscPrefix: 'MAHB' },
  { name: 'Punjab & Sind Bank', ifscPrefix: 'PSIB' },

  // Small finance banks
  { name: 'AU Small Finance Bank', ifscPrefix: 'AUBL', keywords: ['AU Bank'] },
  { name: 'Equitas Small Finance Bank', ifscPrefix: 'ESFB' },
  { name: 'Ujjivan Small Finance Bank', ifscPrefix: 'UJVN' },
  { name: 'Jana Small Finance Bank', ifscPrefix: 'JSFB' },

  // Foreign banks
  { name: 'Standard Chartered Bank', ifscPrefix: 'SCBL', keywords: ['StanChart'] },
  { name: 'HSBC', ifscPrefix: 'HSBC', keywords: ['Hongkong and Shanghai'] },
  { name: 'Citibank', ifscPrefix: 'CITI', keywords: ['Citi'] },
  { name: 'DBS Bank', ifscPrefix: 'DBSS', keywords: ['digibank'] },
  { name: 'Deutsche Bank', ifscPrefix: 'DEUT' },

  // Payments banks
  { name: 'Airtel Payments Bank', ifscPrefix: 'AIRP' },
  { name: 'India Post Payments Bank', ifscPrefix: 'IPOS', keywords: ['IPPB'] },
  { name: 'Paytm Payments Bank', ifscPrefix: 'PYTM' },
  { name: 'Fino Payments Bank', ifscPrefix: 'FINO' },

  // Co-operative banks
  { name: 'Saraswat Co-operative Bank', ifscPrefix: 'SRCB', keywords: ['Saraswat'] },
  { name: 'Cosmos Co-operative Bank', ifscPrefix: 'COSB', keywords: ['Cosmos'] },
  { name: 'SVC Co-operative Bank', ifscPrefix: 'SVCB', keywords: ['Shamrao Vithal'] },
  { name: 'Abhyudaya Co-operative Bank', ifscPrefix: 'ABHY' },
  { name: 'TJSB Sahakari Bank', ifscPrefix: 'TJSB' },
  { name: 'NKGSB Co-operative Bank', ifscPrefix: 'NKGS' },
];

/**
 * Stable key for a bank's logo/colour assets. Must match the slugs in
 * scripts/fetch-bank-logos.py: "Jammu & Kashmir Bank" → "jammu-and-kashmir-bank".
 */
export function bankSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const BY_PREFIX = new Map(INDIAN_BANKS.map((b) => [b.ifscPrefix, b]));

/** The bank an IFSC belongs to, from its first four characters. */
export function bankForIfsc(ifsc: string): IndianBank | undefined {
  const prefix = ifsc.trim().toUpperCase().slice(0, 4);
  return prefix.length === 4 ? BY_PREFIX.get(prefix) : undefined;
}

/** Case-insensitive exact match on the display name. */
export function findBankByName(name: string): IndianBank | undefined {
  const n = name.trim().toLowerCase();
  return INDIAN_BANKS.find((b) => b.name.toLowerCase() === n);
}
