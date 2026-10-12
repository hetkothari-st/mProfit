/**
 * LenderAlias (spec s6.1): a code constant, not a table. Maps the free-text `Loan.lenderName` to a lender of
 * the live-rates source list (Plan 2, `LoanRateSource.lender`). Exact match after normalisation, so a
 * look-alike ("PNB Housing Finance", "ICICI Home Finance") never borrows a bank's MCLR. Unmatched loans get
 * repo-only benchmark display and no MCLR alerts.
 */

const ALIASES: Readonly<Record<string, readonly string[]>> = {
  SBI: ['sbi', 'state bank of india', 'state bank', 'sbi bank'],
  'HDFC Bank': ['hdfc', 'hdfc bank', 'hdfc home loan', 'hdfc home loans'],
  'ICICI Bank': ['icici', 'icici bank'],
  'Axis Bank': ['axis', 'axis bank', 'uti bank'],
  Kotak: ['kotak', 'kotak bank', 'kotak mahindra', 'kotak mahindra bank'],
  PNB: ['pnb', 'punjab national bank'],
  'Bank of Baroda': ['bob', 'bank of baroda', 'baroda bank'],
  'Canara Bank': ['canara', 'canara bank'],
  'Union Bank': ['union bank', 'union bank of india', 'ubi'],
  'LIC Housing Finance': ['lic housing finance', 'lic housing', 'lic hfl', 'lichfl', 'lic home loans'],
};

const BY_ALIAS: ReadonlyMap<string, string> = new Map(
  Object.entries(ALIASES).flatMap(([lender, aliases]) => aliases.map((alias) => [alias, lender] as const)),
);

export const MATCHED_LENDERS: readonly string[] = Object.keys(ALIASES);

/** Lowercase, "&" -> "and", punctuation to spaces, single spaces, no leading "the", no trailing ltd/limited. */
export function normaliseLenderName(name: string): string {
  let s = name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  s = s.replace(/^the\s+/, '');
  for (;;) {
    const next = s.replace(/\s+(ltd|limited)$/, '');
    if (next === s) break;
    s = next;
  }
  return s;
}

export function canonicalLender(name: string | null | undefined): string | null {
  if (name === null || name === undefined) return null;
  const key = normaliseLenderName(name);
  return key === '' ? null : (BY_ALIAS.get(key) ?? null);
}
