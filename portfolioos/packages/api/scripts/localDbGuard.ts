/**
 * Dev scripts that write to a database refuse anything that is not on this machine. Pure (no imports that
 * open connections), so a script can run it before loading the DB client.
 */
const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * True only when the URL's hostname is exactly localhost, 127.0.0.1 or ::1 and no `host` / `hostaddr` query
 * parameter (which libpq-style clients honour over the hostname) names anything else.
 * 'db.example.com/?x=localhost', 'localhost.evil.com' and 'localhost/db?host=prod.example.com' are refused.
 */
export function isLocalDatabaseUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (!LOCAL_HOSTS.has(url.hostname)) return false;
  for (const [key, value] of url.searchParams) {
    if (/^(host|hostaddr)$/i.test(key) && !value.split(',').every((h) => LOCAL_HOSTS.has(h.trim()))) return false;
  }
  return true;
}
