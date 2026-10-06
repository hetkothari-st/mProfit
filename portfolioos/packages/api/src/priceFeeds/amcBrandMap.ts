/**
 * AMC registered name → the brand tokens AMFI writes on that AMC's schemes.
 *
 * GENERATED, THEN COMMITTED, THEN REVIEWED. Do not hand-edit a value without
 * saying why in the comment above it.
 *
 * ── Why this is a file and not a computation ─────────────────────
 * The TER workbook carries no AMC column, so the AMC half of the join has to
 * be read off the front of the scheme name. The first version derived those
 * brands at runtime from whatever happened to be in `MutualFundMaster` that
 * night. That works until it doesn't, and when it doesn't it fails silently:
 * the derivation is a longest-common-prefix over the AMC's own schemes, so
 * one badly-named new scheme shortens its AMC's brand, and funds that matched
 * yesterday stop matching today with nothing in the diff to explain it. The
 * input to a cost-weighted ranking should not change because a fund house
 * launched something.
 *
 * So the derivation runs once, its output is committed here, and it is
 * reviewed like any other code. `scripts/generateAmcBrandMap.ts` regenerates
 * it; the accompanying test fails when an AMC in the master is missing from
 * this map, so a new fund house shows up in CI rather than as a silent drop
 * in TER coverage.
 *
 * ── The rule ─────────────────────────────────────────────────────
 * An AMC absent from this map is a MISS, recorded as `ter_unmapped_amc`.
 * Never a runtime guess: guessing is what this file exists to stop.
 *
 * Keys are `amcKey(MutualFundMaster.amcName)` — lower-cased, punctuation
 * stripped, trailing "mutual fund" removed. Values are every prefix AMFI has
 * been seen to use, longest match wins.
 *
 * Generated 2026-09-21 from 54 AMCs in MutualFundMaster. The scheme counts in the comments are direct-growth schemes, which is the only population the join reads.
 */

/** Brand tokens by `amcKey`. See `amcKey()` in terJoin.ts. */
export const AMC_BRANDS: Readonly<Record<string, readonly string[]>> = {
  // 360 ONE Mutual Fund — 12 direct-growth schemes
  '360 one': ['360 one'],
  // Abakkus Mutual Fund — 4 direct-growth schemes
  'abakkus': ['abakkus'],
  // Aditya Birla Sun Life Mutual Fund — 87 direct-growth schemes
  'aditya birla sun life': ['aditya birla sun', 'aditya birla sun life'],
  // AlphaGrep Mutual Fund — 3 direct-growth schemes
  'alphagrep': ['alphagrep'],
  // Angel One Mutual Fund — 6 direct-growth schemes
  'angel one': ['angel one'],
  // ASK MUTUAL FUND — 1 direct-growth scheme
  'ask': ['ask'],
  // Axis Mutual Fund — 81 direct-growth schemes
  'axis': ['axis'],
  // Bajaj Finserv Mutual Fund — 21 direct-growth schemes
  'bajaj finserv': ['bajaj finserv'],
  // Bandhan Mutual Fund — 75 direct-growth schemes
  'bandhan': ['bandhan'],
  // Bank of India Mutual Fund — 24 direct-growth schemes
  'bank of india': ['bank of india'],
  // Baroda BNP Paribas Mutual Fund — 47 direct-growth schemes
  'baroda bnp paribas': ['baroda bnp paribas'],
  // Canara Robeco Mutual Fund — 28 direct-growth schemes
  'canara robeco': ['canara robeco'],
  // Capitalmind Mutual Fund — 4 direct-growth schemes
  'capitalmind': ['capitalmind'],
  // Choice Mutual Fund — 4 direct-growth schemes
  'choice': ['choice'],
  // DSP Mutual Fund — 64 direct-growth schemes
  'dsp': ['dsp'],
  // Edelweiss Mutual Fund — 62 direct-growth schemes
  'edelweiss': ['edelweiss'],
  // Franklin Templeton Mutual Fund — 41 direct-growth schemes
  'franklin templeton': ['franklin templeton'],
  // Groww Mutual Fund — 37 direct-growth schemes
  'groww': ['groww'],
  // HDFC Mutual Fund — 89 direct-growth schemes
  'hdfc': ['hdfc'],
  // Helios Mutual Fund — 8 direct-growth schemes
  'helios': ['helios'],
  // HSBC Mutual Fund — 41 direct-growth schemes
  'hsbc': ['hsbc'],
  // ICICI Prudential Mutual Fund — 100 direct-growth schemes
  'icici prudential': ['icici prudential'],
  // IL&FS Mutual Fund (IDF) — 0 direct-growth schemes
  'il fs mutual fund idf': ['il fs infrastructure', 'il fs mutual fund idf'],
  // Invesco Mutual Fund — 48 direct-growth schemes
  'invesco': ['invesco', 'invesco india'],
  // ITI Mutual Fund — 21 direct-growth schemes
  'iti': ['iti'],
  // Jio BlackRock Mutual Fund — 14 direct-growth schemes
  'jio blackrock': ['jio blackrock', 'jioblackrock'],
  // JM Financial Mutual Fund — 23 direct-growth schemes
  'jm financial': ['jm', 'jm financial'],
  // Kotak Mahindra Mutual Fund — 99 direct-growth schemes
  'kotak mahindra': ['kotak', 'kotak mahindra'],
  // LIC Mutual Fund — 36 direct-growth schemes
  'lic': ['lic', 'lic mf'],
  // Mahindra Manulife Mutual Fund — 27 direct-growth schemes
  'mahindra manulife': ['mahindra manulife'],
  // Mirae Asset Mutual Fund — 57 direct-growth schemes
  'mirae asset': ['mirae asset'],
  // Monarch Mutual Fund — 1 direct-growth scheme
  'monarch': ['monarch'],
  // Motilal Oswal Mutual Fund — 39 direct-growth schemes
  'motilal oswal': ['motilal oswal'],
  // Navi Mutual Fund — 14 direct-growth schemes
  'navi': ['navi'],
  // Nippon India Mutual Fund — 118 direct-growth schemes
  'nippon india': ['nippon india'],
  // NJ Mutual Fund — 7 direct-growth schemes
  'nj': ['nj'],
  // Old Bridge Mutual Fund — 3 direct-growth schemes
  'old bridge': ['old bridge'],
  // PGIM India Mutual Fund — 25 direct-growth schemes
  'pgim india': ['pgim india'],
  // PPFAS Mutual Fund — 7 direct-growth schemes
  'ppfas': ['parag parikh', 'ppfas'],
  // quant Mutual Fund — 33 direct-growth schemes
  'quant': ['quant'],
  // Quantum Mutual Fund — 13 direct-growth schemes
  'quantum': ['quantum'],
  // Samco Mutual Fund — 13 direct-growth schemes
  'samco': ['samco'],
  // SBI Mutual Fund — 100 direct-growth schemes
  'sbi': ['sbi'],
  // Shriram Mutual Fund — 10 direct-growth schemes
  'shriram': ['shriram'],
  // Sundaram Mutual Fund — 36 direct-growth schemes
  'sundaram': ['sundaram'],
  // Tata Mutual Fund — 65 direct-growth schemes
  'tata': ['tata'],
  // Taurus Mutual Fund — 8 direct-growth schemes
  'taurus': ['taurus'],
  // The Wealth Company Mutual Fund — 10 direct-growth schemes
  'the wealth company': ['the wealth company'],
  // Trust Mutual Fund — 12 direct-growth schemes
  'trust': ['trust', 'trustmf'],
  // Unifi Mutual Fund — 3 direct-growth schemes
  'unifi': ['unifi'],
  // Union Mutual Fund — 32 direct-growth schemes
  'union': ['union'],
  // UTI Mutual Fund — 78 direct-growth schemes
  'uti': ['uti'],
  // WhiteOak Capital Mutual Fund — 22 direct-growth schemes
  'whiteoak capital': ['whiteoak capital'],
  // Zerodha Mutual Fund — 16 direct-growth schemes
  'zerodha': ['zerodha'],
};

/**
 * Brand → amcKey, the direction the join actually reads.
 *
 * A brand two AMCs both claim is dropped rather than resolved: that is the
 * exact collision the AMC check exists for, and picking one would be the
 * guess this map replaced.
 */
export const BRAND_TO_AMC: ReadonlyMap<string, string> = (() => {
  const claims = new Map<string, Set<string>>();
  for (const [amc, brands] of Object.entries(AMC_BRANDS)) {
    for (const brand of brands) {
      const set = claims.get(brand);
      if (set) set.add(amc);
      else claims.set(brand, new Set([amc]));
    }
  }
  const out = new Map<string, string>();
  for (const [brand, amcs] of claims) {
    if (amcs.size === 1) out.set(brand, [...amcs][0]!);
  }
  return out;
})();

/** True when we hold brand tokens for this AMC. */
export function isMappedAmc(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(AMC_BRANDS, key);
}
