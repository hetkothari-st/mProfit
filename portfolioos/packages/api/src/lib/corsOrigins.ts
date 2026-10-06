/**
 * Which browser origins may call this API with CORS.
 *
 * Exact origins from CORS_ORIGIN only, plus the EPFO/SBI browser extension.
 * There used to be a `*.railway.app` wildcard: Railway gives every customer a
 * `*.up.railway.app` host, so it let any Railway-hosted page call this API
 * from a victim's browser with `credentials: true`. Auth is Bearer-only today,
 * so that was not a live session-theft path, but it left nothing between an
 * arbitrary site and the API the moment a cookie-based flow lands. A new
 * frontend host (preview, custom domain) is added to CORS_ORIGIN, not matched
 * by pattern.
 */
export function makeOriginCheck(corsOrigin: string): (origin: string) => boolean {
  const allowList = corsOrigin
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return (origin: string) => {
    if (allowList.includes(origin)) return true;
    // The EPFO/SBI browser extension calls this API from its service worker
    // with a chrome-extension:// origin and no host permission for the API, so
    // it relies on CORS. Every endpoint authenticates with a Bearer header —
    // there is no cookie session for a hostile extension to ride — so allowing
    // the scheme adds no access; refusing it only breaks extension sync.
    return /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
  };
}
