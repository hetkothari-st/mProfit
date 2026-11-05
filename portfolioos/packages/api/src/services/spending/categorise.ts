import type { SpendCategory, SpendCategorySource } from '@everypaisa/shared';

/**
 * Sort one bank or card movement into a spending category. Pure; no DB.
 *
 * Order (spec §5, first match wins):
 *   1. the user's own tag for this payee, which always wins;
 *   2. rules on the movement's type and text (ATM, EMI, SIP, card bill, tax…);
 *   3. the merchant list below;
 *   4. a tag the AI fallback gave this payee earlier;
 *   5. otherwise "uncategorised", which the user is asked to tag.
 *
 * Credits are never spending: they become income, refund, investment or a
 * self transfer.
 */

export interface CategoriseInput {
  direction: string;
  /** The CanonicalEvent type the row came from, when it came from one. */
  eventType: string | null;
  counterparty: string | null;
  narration: string | null;
  excludeReason: string | null;
}

export interface CategoryResult {
  category: SpendCategory;
  source: SpendCategorySource;
}

/**
 * The key a payee's tag is stored under: a UPI handle as is, otherwise the
 * name in lower case with digits, punctuation and filler ("upi", "pvt ltd")
 * removed, so "SWIGGY LTD" and "Swiggy" share one tag.
 */
export function payeeKey(counterparty: string | null, narration: string | null): string | null {
  const raw = (counterparty?.trim() || narration?.trim() || '').toLowerCase();
  if (!raw) return null;
  const vpa = raw.match(/[a-z0-9._-]+@[a-z]+/);
  if (vpa) return vpa[0];
  const key = raw
    .replace(/[^a-z\s&]/g, ' ')
    .replace(/\b(upi|imps|neft|rtgs|ach|nach|pos|ecom|to|by|from|payment|paid|txn|ref|pvt|private|ltd|limited|llp|india|co|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return key || null;
}

function haystack(i: CategoriseInput): string {
  return ` ${[i.counterparty, i.narration].filter(Boolean).join(' ').toLowerCase().replace(/[^a-z0-9@&.\s]/g, ' ').replace(/\s+/g, ' ')} `;
}

const has = (text: string, re: RegExp) => re.test(text);

const REFUND = /\b(refund(ed)?|reversal|reversed|cash ?back|chargeback)\b/;
const INVEST_CREDIT = /\b(redemption|redeem(ed)?|mutual fund|dividend|interest|maturity|clearing corp\w*|nsccl|iccl|zerodha|groww|upstox)\b/;

const RULES: readonly [RegExp, SpendCategory][] = [
  [/\b(atm|cash withdrawal|cash wdl|nwd|awd|cash wd)\b/, 'cash_withdrawal'],
  [/\b(credit card|card bill|card payment|card dues|cc payment|cc bill|cred club|cred)\b/, 'credit_card_bill'],
  [/\b(emi|loan|bajaj finance|home credit|tata capital|hdb financial)\b/, 'loan_emi'],
  [/\b(sip|mutual fund|mf|amc|bse star|nsccl|iccl|indian clearing|zerodha|groww|upstox|angel one|kuvera|paytm money|fixed deposit|recurring deposit|fd|ppf|nps|sukanya)\b/, 'investment'],
  [/\b(income tax|incometax|advance tax|self assessment|tds|cbdt|tin nsdl|e pay tax|epay tax|gst payment)\b/, 'tax'],
  [/\b(lic|life insurance|term plan|term insurance|hdfc life|icici pru\w*|sbi life|max life|tata aia|bajaj allianz life|kotak life|pnb metlife)\b/, 'insurance_premium_life'],
  [/\b(health insurance|star health|niva bupa|care health|hdfc ergo|mediclaim|aditya birla health)\b/, 'healthcare'],
  [/\b(property tax|municipal corporation|bbmp|mcgm|ghmc)\b/, 'utilities'],
  [/\b(rent|nobroker|landlord)\b/, 'rent'],
];

/** Common Indian merchants and payees. Longer phrases are tried first. */
const MERCHANTS: Record<string, SpendCategory> = {
  // Groceries
  bigbasket: 'groceries', blinkit: 'groceries', grofers: 'groceries', zepto: 'groceries', dmart: 'groceries',
  'avenue supermarts': 'groceries', 'reliance fresh': 'groceries', 'reliance smart': 'groceries', jiomart: 'groceries',
  'more retail': 'groceries', 'spencers': 'groceries', 'nature s basket': 'groceries', 'swiggy instamart': 'groceries',
  instamart: 'groceries', 'amazon fresh': 'groceries', 'flipkart minutes': 'groceries', 'milkbasket': 'groceries',
  'country delight': 'groceries', 'licious': 'groceries', 'freshtohome': 'groceries', 'star bazaar': 'groceries',
  // Eating out
  zomato: 'dining_out', swiggy: 'dining_out', dominos: 'dining_out', 'domino s': 'dining_out', mcdonald: 'dining_out',
  mcdonalds: 'dining_out', kfc: 'dining_out', 'pizza hut': 'dining_out', starbucks: 'dining_out', 'burger king': 'dining_out',
  subway: 'dining_out', 'cafe coffee day': 'dining_out', haldiram: 'dining_out', 'chaayos': 'dining_out', 'eatsure': 'dining_out',
  restaurant: 'dining_out', cafe: 'dining_out', 'barbeque nation': 'dining_out',
  // Fuel and travel
  'indian oil': 'fuel_transport', iocl: 'fuel_transport', hpcl: 'fuel_transport', 'hindustan petroleum': 'fuel_transport',
  bpcl: 'fuel_transport', 'bharat petroleum': 'fuel_transport', 'shell': 'fuel_transport', 'nayara': 'fuel_transport',
  petrol: 'fuel_transport', fuel: 'fuel_transport', uber: 'fuel_transport', ola: 'fuel_transport', rapido: 'fuel_transport',
  irctc: 'fuel_transport', 'redbus': 'fuel_transport', fastag: 'fuel_transport', 'metro': 'fuel_transport',
  'namma yatri': 'fuel_transport', 'blablacar': 'fuel_transport',
  // Phone and internet
  jio: 'phone_internet', airtel: 'phone_internet', vodafone: 'phone_internet', 'vi recharge': 'phone_internet',
  bsnl: 'phone_internet', 'act fibernet': 'phone_internet', hathway: 'phone_internet', 'tata play': 'phone_internet',
  'dish tv': 'phone_internet', 'excitel': 'phone_internet', 'you broadband': 'phone_internet',
  // Utilities
  bescom: 'utilities', msedcl: 'utilities', mahadiscom: 'utilities', 'tata power': 'utilities', 'adani electricity': 'utilities',
  'torrent power': 'utilities', 'bses': 'utilities', 'tneb': 'utilities', 'tangedco': 'utilities', 'cesc': 'utilities',
  'mahanagar gas': 'utilities', 'indraprastha gas': 'utilities', igl: 'utilities', 'gujarat gas': 'utilities',
  'indane': 'utilities', 'bharat gas': 'utilities', 'hp gas': 'utilities', electricity: 'utilities', 'water bill': 'utilities',
  // Education
  school: 'education', college: 'education', university: 'education', vidyalaya: 'education', academy: 'education',
  byju: 'education', byjus: 'education', unacademy: 'education', vedantu: 'education', 'physics wallah': 'education',
  coursera: 'education', udemy: 'education', 'tuition': 'education',
  // Healthcare
  apollo: 'healthcare', pharmeasy: 'healthcare', '1mg': 'healthcare', 'tata 1mg': 'healthcare', netmeds: 'healthcare',
  practo: 'healthcare', hospital: 'healthcare', clinic: 'healthcare', diagnostics: 'healthcare', pharmacy: 'healthcare',
  medplus: 'healthcare', 'dr lal pathlabs': 'healthcare', 'thyrocare': 'healthcare', chemist: 'healthcare', medical: 'healthcare',
  // Clothing
  myntra: 'clothing', ajio: 'clothing', zara: 'clothing', 'h&m': 'clothing', 'h m': 'clothing', westside: 'clothing',
  'max fashion': 'clothing', pantaloons: 'clothing', 'lifestyle stores': 'clothing', 'trends': 'clothing', 'uniqlo': 'clothing',
  bata: 'clothing', 'decathlon': 'clothing', 'fabindia': 'clothing', 'manyavar': 'clothing',
  // Household goods and services
  ikea: 'household', pepperfry: 'household', 'urban ladder': 'household', croma: 'household', 'reliance digital': 'household',
  'vijay sales': 'household', 'home centre': 'household', 'wakefit': 'household',
  // Domestic help
  'urban company': 'domestic_help', urbanclap: 'domestic_help', 'maid': 'domestic_help', 'driver salary': 'domestic_help',
  'snabbit': 'domestic_help', 'pronto': 'domestic_help',
  // Personal care
  nykaa: 'personal_care', 'purplle': 'personal_care', salon: 'personal_care', 'lakme salon': 'personal_care',
  'naturals salon': 'personal_care', 'mamaearth': 'personal_care', 'tira': 'personal_care',
  // Entertainment and leisure
  netflix: 'lifestyle', spotify: 'lifestyle', 'prime video': 'lifestyle', hotstar: 'lifestyle', 'jiohotstar': 'lifestyle',
  'sony liv': 'lifestyle', 'zee5': 'lifestyle', bookmyshow: 'lifestyle', pvr: 'lifestyle', inox: 'lifestyle', 'district': 'lifestyle',
  makemytrip: 'lifestyle', goibibo: 'lifestyle', cleartrip: 'lifestyle', 'easemytrip': 'lifestyle', airbnb: 'lifestyle',
  oyo: 'lifestyle', 'cult fit': 'lifestyle', cultfit: 'lifestyle', 'youtube premium': 'lifestyle', indigo: 'lifestyle',
  'air india': 'lifestyle', 'akasa': 'lifestyle', 'spicejet': 'lifestyle', 'steam': 'lifestyle', 'playstation': 'lifestyle',
  // Marketplaces: everything, so "other"
  amazon: 'other_consumption', flipkart: 'other_consumption', meesho: 'other_consumption', 'tata cliq': 'other_consumption',
  'snapdeal': 'other_consumption',
};

const MERCHANT_KEYS = Object.keys(MERCHANTS).sort((a, b) => b.length - a.length);
const MERCHANT_RES = MERCHANT_KEYS.map((k) => [new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`), MERCHANTS[k]!] as const);

/** The merchant-list category for this text, if any. */
export function merchantCategory(text: string): SpendCategory | null {
  for (const [re, cat] of MERCHANT_RES) if (re.test(text)) return cat;
  return null;
}

const EVENT_RULES: Record<string, SpendCategory> = {
  EMI_DEBIT: 'loan_emi',
  SIP_INSTALLMENT: 'investment',
  CARD_PAYMENT: 'credit_card_bill',
  RENT_PAID: 'rent',
};

/** Rules only (step 2). Null when no rule applies. */
export function ruleCategory(i: CategoriseInput): SpendCategory | null {
  if (i.excludeReason === 'self_transfer') return 'self_transfer';
  const text = haystack(i);
  if (i.direction === 'CREDIT') {
    if (has(text, REFUND)) return 'refund';
    if (has(text, INVEST_CREDIT)) return 'investment';
    return 'income';
  }
  const byEvent = i.eventType ? EVENT_RULES[i.eventType] : undefined;
  if (byEvent) return byEvent;
  for (const [re, cat] of RULES) if (has(text, re)) return cat;
  return null;
}

export function categorise(
  i: CategoriseInput,
  userTags: ReadonlyMap<string, SpendCategory>,
  modelTags: ReadonlyMap<string, SpendCategory>,
): CategoryResult {
  const key = payeeKey(i.counterparty, i.narration);
  const own = key ? userTags.get(key) : undefined;
  if (own) return { category: own, source: 'user' };
  const rule = ruleCategory(i);
  if (rule) return { category: rule, source: 'rule' };
  const merchant = merchantCategory(haystack(i));
  if (merchant) return { category: merchant, source: 'dictionary' };
  const model = key ? modelTags.get(key) : undefined;
  if (model) return { category: model, source: 'model' };
  return { category: 'uncategorised', source: 'none' };
}
