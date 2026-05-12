/**
 * Static map of NSE/BSE equity symbols → NSE sectoral classification.
 *
 * Covers NIFTY 500 plus other commonly-held mid/small caps. Used as the
 * primary sector source for the analytics sector pie because Yahoo's
 * `summaryProfile` endpoint requires a crumb that our environment can't
 * reliably obtain, and NSE doesn't expose a server-friendly sector API.
 *
 * Symbols are stored bare (no `.NS` / `.BO` suffix) and uppercased.
 * Sector names match NSE's "Macro-Economic Sector" taxonomy.
 *
 * Maintenance: when you find a holding that lands in "Unclassified" and
 * is a real listed stock, add it here. The list does not need to be
 * exhaustive — the lazy Yahoo backfill in analytics.service.ts still runs
 * as a secondary path.
 */
export const NSE_SECTOR_MAP: Record<string, string> = {
  // Information Technology
  TCS: 'Information Technology',
  INFY: 'Information Technology',
  WIPRO: 'Information Technology',
  HCLTECH: 'Information Technology',
  TECHM: 'Information Technology',
  LTIM: 'Information Technology',
  MPHASIS: 'Information Technology',
  PERSISTENT: 'Information Technology',
  COFORGE: 'Information Technology',
  LTTS: 'Information Technology',
  KPITTECH: 'Information Technology',
  TATAELXSI: 'Information Technology',
  OFSS: 'Information Technology',

  // Financial Services — Banks
  HDFCBANK: 'Financial Services',
  ICICIBANK: 'Financial Services',
  SBIN: 'Financial Services',
  KOTAKBANK: 'Financial Services',
  AXISBANK: 'Financial Services',
  INDUSINDBK: 'Financial Services',
  BANKBARODA: 'Financial Services',
  PNB: 'Financial Services',
  CANBK: 'Financial Services',
  IDFCFIRSTB: 'Financial Services',
  FEDERALBNK: 'Financial Services',
  AUBANK: 'Financial Services',
  YESBANK: 'Financial Services',
  RBLBANK: 'Financial Services',
  BANDHANBNK: 'Financial Services',
  CHOLAFIN: 'Financial Services',

  // Financial Services — NBFC / Insurance / Capital Markets
  BAJFINANCE: 'Financial Services',
  BAJAJFINSV: 'Financial Services',
  BAJAJHLDNG: 'Financial Services',
  SBILIFE: 'Financial Services',
  HDFCLIFE: 'Financial Services',
  ICICIPRULI: 'Financial Services',
  ICICIGI: 'Financial Services',
  HDFCAMC: 'Financial Services',
  MUTHOOTFIN: 'Financial Services',
  POWERGRID: 'Financial Services',
  RECLTD: 'Financial Services',
  PFC: 'Financial Services',
  SBICARD: 'Financial Services',
  IRFC: 'Financial Services',
  LICHSGFIN: 'Financial Services',
  LICI: 'Financial Services',
  CDSL: 'Financial Services',
  BSE: 'Financial Services',
  CAMS: 'Financial Services',
  POLICYBZR: 'Financial Services',

  // Oil, Gas & Consumable Fuels
  RELIANCE: 'Oil Gas & Consumable Fuels',
  ONGC: 'Oil Gas & Consumable Fuels',
  BPCL: 'Oil Gas & Consumable Fuels',
  IOC: 'Oil Gas & Consumable Fuels',
  HINDPETRO: 'Oil Gas & Consumable Fuels',
  GAIL: 'Oil Gas & Consumable Fuels',
  COALINDIA: 'Oil Gas & Consumable Fuels',
  PETRONET: 'Oil Gas & Consumable Fuels',
  IGL: 'Oil Gas & Consumable Fuels',
  MGL: 'Oil Gas & Consumable Fuels',
  GUJGASLTD: 'Oil Gas & Consumable Fuels',
  OIL: 'Oil Gas & Consumable Fuels',

  // Power
  NTPC: 'Power',
  TATAPOWER: 'Power',
  ADANIPOWER: 'Power',
  ADANIGREEN: 'Power',
  TORNTPOWER: 'Power',
  JSW: 'Power',
  JSWENERGY: 'Power',
  NHPC: 'Power',
  SJVN: 'Power',

  // Automobile & Auto Components
  MARUTI: 'Automobile',
  TATAMOTORS: 'Automobile',
  'M&M': 'Automobile',
  MM: 'Automobile',
  HEROMOTOCO: 'Automobile',
  'BAJAJ-AUTO': 'Automobile',
  BAJAJAUTO: 'Automobile',
  EICHERMOT: 'Automobile',
  TVSMOTOR: 'Automobile',
  ASHOKLEY: 'Automobile',
  MOTHERSON: 'Automobile',
  BOSCHLTD: 'Automobile',
  BALKRISIND: 'Automobile',
  MRF: 'Automobile',
  APOLLOTYRE: 'Automobile',
  EXIDEIND: 'Automobile',
  BHARATFORG: 'Automobile',
  TIINDIA: 'Automobile',
  ESCORTS: 'Automobile',

  // Healthcare / Pharma
  SUNPHARMA: 'Healthcare',
  DRREDDY: 'Healthcare',
  CIPLA: 'Healthcare',
  DIVISLAB: 'Healthcare',
  APOLLOHOSP: 'Healthcare',
  LUPIN: 'Healthcare',
  AUROPHARMA: 'Healthcare',
  TORNTPHARM: 'Healthcare',
  BIOCON: 'Healthcare',
  ALKEM: 'Healthcare',
  ABBOTINDIA: 'Healthcare',
  GLAND: 'Healthcare',
  ZYDUSLIFE: 'Healthcare',
  GLENMARK: 'Healthcare',
  IPCALAB: 'Healthcare',
  FORTIS: 'Healthcare',
  MAXHEALTH: 'Healthcare',
  METROPOLIS: 'Healthcare',
  LALPATHLAB: 'Healthcare',

  // FMCG / Consumer
  HINDUNILVR: 'Fast Moving Consumer Goods',
  ITC: 'Fast Moving Consumer Goods',
  NESTLEIND: 'Fast Moving Consumer Goods',
  BRITANNIA: 'Fast Moving Consumer Goods',
  TATACONSUM: 'Fast Moving Consumer Goods',
  GODREJCP: 'Fast Moving Consumer Goods',
  DABUR: 'Fast Moving Consumer Goods',
  MARICO: 'Fast Moving Consumer Goods',
  COLPAL: 'Fast Moving Consumer Goods',
  EMAMILTD: 'Fast Moving Consumer Goods',
  UBL: 'Fast Moving Consumer Goods',
  RADICO: 'Fast Moving Consumer Goods',
  VBL: 'Fast Moving Consumer Goods',
  PGHH: 'Fast Moving Consumer Goods',
  GILLETTE: 'Fast Moving Consumer Goods',

  // Consumer Durables
  TITAN: 'Consumer Durables',
  ASIANPAINT: 'Consumer Durables',
  BERGEPAINT: 'Consumer Durables',
  HAVELLS: 'Consumer Durables',
  CROMPTON: 'Consumer Durables',
  WHIRLPOOL: 'Consumer Durables',
  VOLTAS: 'Consumer Durables',
  BLUESTARCO: 'Consumer Durables',
  DIXON: 'Consumer Durables',
  KAJARIACER: 'Consumer Durables',
  RAJESHEXPO: 'Consumer Durables',

  // Metals & Mining
  TATASTEEL: 'Metals & Mining',
  JSWSTEEL: 'Metals & Mining',
  HINDALCO: 'Metals & Mining',
  VEDL: 'Metals & Mining',
  JINDALSTEL: 'Metals & Mining',
  SAIL: 'Metals & Mining',
  HINDCOPPER: 'Metals & Mining',
  NATIONALUM: 'Metals & Mining',
  NMDC: 'Metals & Mining',
  APLAPOLLO: 'Metals & Mining',
  JSL: 'Metals & Mining',

  // Cement
  ULTRACEMCO: 'Construction Materials',
  SHREECEM: 'Construction Materials',
  GRASIM: 'Construction Materials',
  AMBUJACEM: 'Construction Materials',
  ACC: 'Construction Materials',
  DALBHARAT: 'Construction Materials',
  RAMCOCEM: 'Construction Materials',
  JKCEMENT: 'Construction Materials',
  HEIDELBERG: 'Construction Materials',

  // Telecom
  BHARTIARTL: 'Telecommunication',
  IDEA: 'Telecommunication',
  TATACOMM: 'Telecommunication',
  INDUSTOWER: 'Telecommunication',
  HFCL: 'Telecommunication',

  // Realty
  DLF: 'Realty',
  GODREJPROP: 'Realty',
  OBEROIRLTY: 'Realty',
  PRESTIGE: 'Realty',
  PHOENIXLTD: 'Realty',
  BRIGADE: 'Realty',
  SOBHA: 'Realty',
  LODHA: 'Realty',

  // Capital Goods / Engineering
  LT: 'Capital Goods',
  SIEMENS: 'Capital Goods',
  ABB: 'Capital Goods',
  HAVELLS_DUP: 'Capital Goods',
  BHEL: 'Capital Goods',
  CUMMINSIND: 'Capital Goods',
  THERMAX: 'Capital Goods',
  AIAENG: 'Capital Goods',
  BEL: 'Capital Goods',
  HAL: 'Capital Goods',
  BDL: 'Capital Goods',
  MAZDOCK: 'Capital Goods',
  COCHINSHIP: 'Capital Goods',
  GRSE: 'Capital Goods',

  // Construction
  ADANIPORTS: 'Services',
  IRCTC: 'Services',
  CONCOR: 'Services',
  GUJ: 'Services',

  // Conglomerates / Diversified
  ADANIENT: 'Services',
  RELIANCE_DUP: 'Services',

  // Aviation / Logistics
  INDIGO: 'Services',
  SPICEJET: 'Services',

  // Chemicals
  PIDILITIND: 'Chemicals',
  SRF: 'Chemicals',
  UPL: 'Chemicals',
  AARTI: 'Chemicals',
  AARTIIND: 'Chemicals',
  NAVINFLUOR: 'Chemicals',
  ATUL: 'Chemicals',
  GUJALKALI: 'Chemicals',
  DEEPAKNTR: 'Chemicals',
  TATACHEM: 'Chemicals',
  CLEAN: 'Chemicals',
  LINDEINDIA: 'Chemicals',

  // Textiles
  PAGEIND: 'Textiles',
  TRENT: 'Consumer Discretionary',
  ABFRL: 'Consumer Discretionary',
  RAYMOND: 'Consumer Discretionary',
  VBL_DUP: 'Consumer Discretionary',
  ZOMATO: 'Consumer Discretionary',
  NYKAA: 'Consumer Discretionary',
  FSNECOM: 'Consumer Discretionary',
  PAYTM: 'Financial Services',
  ONE97: 'Financial Services',

  // Services / Internet
  IRCT: 'Services',
};

/** Lookup helper — accepts symbol with or without exchange suffix. */
export function sectorFor(symbol: string | null | undefined): string | null {
  if (!symbol) return null;
  const bare = symbol.trim().toUpperCase().replace(/\.(NS|BO)$/i, '');
  return NSE_SECTOR_MAP[bare] ?? null;
}
