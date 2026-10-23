/**
 * Small, pure helpers shared by the Reports, Tax and Analytics pages.
 */

/**
 * The portfolios a Reports/Analytics picker may offer.
 *
 * In a family view `/api/portfolios` also returns other members' books (and
 * family-shared ones they created), but the on-screen report and analytics
 * endpoints serve only portfolios the signed-in user owns — and "All
 * portfolios" on those pages means the caller's own books. Offering the rest
 * produced a 403 and an empty tab. Another member's figures are reached
 * through "Report for", which applies the family's permission checks.
 *
 * `userId` is the user the API sees: the managed profile while acting for one,
 * otherwise the signed-in user.
 */
export function reportablePortfolios<T extends { userId: string }>(
  portfolios: T[] | undefined,
  userId: string | null | undefined,
): T[] {
  if (!portfolios || !userId) return [];
  return portfolios.filter((p) => p.userId === userId);
}

/**
 * An Error carrying the server's message for a failed raw-`fetch` download.
 *
 * Downloads bypass axios (they need the body as a blob), so the error body
 * arrives as text. Throwing that text straight into `alert()` showed users
 * `{"success":false,"error":"…"}`. Pair with `apiErrorMessage` + a toast.
 */
export async function errorFromResponse(r: Response, fallback = 'Download failed'): Promise<Error> {
  const body = await r.text().catch(() => '');
  const parsed = parseJson(body);
  const msg = typeof parsed?.error === 'string' ? parsed.error : parsed?.error?.message ?? parsed?.message;
  // Anything that is not the server's JSON envelope — a proxy's HTML error
  // page, say — is never shown; the status is.
  return new Error(msg || `${fallback} (HTTP ${r.status})`);
}

type ErrorBody = { error?: { message?: string } | string; message?: string };

function parseJson(body: string): ErrorBody | null {
  try {
    const v: unknown = JSON.parse(body);
    return v && typeof v === 'object' ? (v as ErrorBody) : null;
  } catch {
    return null;
  }
}

/** Share of the portfolio above which the top holdings are flagged. */
export const CONCENTRATION_FLAG_PCT = 60;
/** How many of the largest holdings the flag looks at. */
export const CONCENTRATION_TOP_N = 3;

/**
 * Whether the largest holdings carry too much of the portfolio: the top three
 * (or as many as there are) together above 60%. Rows arrive largest first
 * with a running `cumulativePct`.
 */
export function isConcentrated(rows: Array<{ pct: number; cumulativePct: number }>): boolean {
  if (rows.length === 0) return false;
  const top = rows[Math.min(CONCENTRATION_TOP_N, rows.length) - 1]!;
  return top.cumulativePct > CONCENTRATION_FLAG_PCT;
}
