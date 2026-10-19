/**
 * IFSC → branch details via Razorpay's public IFSC API (https://ifsc.razorpay.com,
 * open dataset at github.com/razorpay/ifsc). Chosen because it's free, keyless
 * and tracks RBI's IFSC list; only the IFSC code leaves the server — never a
 * name or account number.
 *
 * Upstream ADDRESS text is messy (words run together, " ," spacing, state often
 * missing), so callers save the result into an editable field rather than
 * trusting it verbatim. Results are cached in-process: IFSC data barely changes
 * and the same few codes repeat per user.
 */

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const API_BASE = 'https://ifsc.razorpay.com';
const CACHE_MAX = 1000;

export interface IfscDetails {
  ifsc: string;
  bank: string | null;
  branch: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
}

const cache = new Map<string, IfscDetails | null>();

/** Upper-cased 11-char IFSC, or null when the input isn't one. */
export function normaliseIfsc(code: string): string | null {
  const ifsc = code.trim().toUpperCase();
  return IFSC_RE.test(ifsc) ? ifsc : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function tidyAddress(raw: string | null, state: string | null): string | null {
  if (!raw) return null;
  const address = raw
    .replace(/\s+,/g, ',')
    .replace(/,(?=\S)/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
  if (state && !address.toUpperCase().includes(state.toUpperCase())) {
    return `${address}, ${state}`;
  }
  return address;
}

function remember(ifsc: string, value: IfscDetails | null): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(ifsc, value);
}

/**
 * Null for malformed or unknown codes (misses are cached). Throws on network
 * or upstream failure — not cached, so the next call retries.
 */
export async function lookupIfsc(code: string): Promise<IfscDetails | null> {
  const ifsc = normaliseIfsc(code);
  if (!ifsc) return null;
  if (cache.has(ifsc)) return cache.get(ifsc) ?? null;

  const res = await fetch(`${API_BASE}/${ifsc}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5_000),
  });
  if (res.status === 404) {
    remember(ifsc, null);
    return null;
  }
  if (!res.ok) throw new Error(`IFSC lookup failed: HTTP ${res.status}`);

  const body = (await res.json()) as Record<string, unknown>;
  const state = str(body['STATE']);
  const details: IfscDetails = {
    ifsc,
    bank: str(body['BANK']),
    branch: str(body['BRANCH']),
    address: tidyAddress(str(body['ADDRESS']), state),
    city: str(body['CITY']),
    state,
  };
  remember(ifsc, details);
  return details;
}

/** Test hook. */
export function clearIfscCache(): void {
  cache.clear();
}
