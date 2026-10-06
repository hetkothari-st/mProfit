/**
 * Guard for outbound requests whose URL arrives from outside the code: a
 * webhook body, a third-party service's response. Without it the server
 * fetches whatever it is told to, which lets a caller point it at internal
 * services (Railway's private network, cloud metadata, the OnlyOffice admin
 * API) and, where the response is stored and served back, read them.
 *
 * Only http(s) URLs on an explicitly allowed origin pass.
 */
export function isAllowedOutboundUrl(raw: string, allowedOrigins: readonly string[]): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  const allowed = new Set(
    allowedOrigins.flatMap((o) => {
      try {
        return [new URL(o).origin];
      } catch {
        return [];
      }
    }),
  );
  return allowed.has(url.origin);
}
