import { Decimal } from './decimal.js';

const SILVER_GRADES: Record<string, string> = { '999': '1', '925': '0.925', '800': '0.8' };

/**
 * What one gram of a physical holding is worth, given the base metal price.
 *
 * The commodity feed quotes 24K gold and 999 silver per gram. The Gold form
 * stores the purity as a prefix on the asset name ("22K Gold bracelet",
 * "925 Silver coin"), so the server (dashboard, reports, net worth) and the
 * Gold & Silver page both read it from there with this one function — two
 * copies of the rule is how the page and the dashboard came to disagree.
 *
 * Gold: × karat / 24 (a karat 6–24 written as "22K" anywhere in the name).
 * Silver: × its grade (999 → 1, 925 → 0.925, 800 → 0.8) as a leading token.
 * No recognisable purity → the base price (24K / 999), the form's default.
 * Other asset classes → the base price unchanged.
 */
export function priceAtPurity(
  basePerGram: Decimal.Value,
  assetClass: string,
  assetName: string | null | undefined,
): Decimal {
  const base = new Decimal(basePerGram);
  if (assetClass === 'PHYSICAL_GOLD') {
    const m = assetName?.match(/\b(\d+)\s*[kK]\b/);
    const k = m ? Number.parseInt(m[1]!, 10) : 24;
    // Multiply before dividing: rounding 22/24 first would leave the server
    // and the page a paisa apart.
    return k >= 6 && k <= 24 ? base.times(k).div(24) : base;
  }
  if (assetClass === 'PHYSICAL_SILVER') {
    const m = assetName?.match(/^(999|925|800)\b/);
    // 999 is the feed's own grade, so it is × 1, not × 0.999.
    return base.times(SILVER_GRADES[m?.[1] ?? '999'] ?? '1');
  }
  return base;
}
