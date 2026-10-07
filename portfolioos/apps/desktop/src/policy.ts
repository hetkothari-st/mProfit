/**
 * Where the desktop window may go. Pure functions so they can be tested
 * without Electron.
 *
 * The app is a window onto the hosted web app. Pages of the app itself stay in
 * the window; sign-in providers the app sends you to (Google for Gmail
 * connect) stay too, because they redirect back to the app. Everything else —
 * a WhatsApp link, a fund house's website — opens in the user's browser, so
 * no other site ever runs inside the app's window and session.
 */

/** Hosts a same-window sign-in redirect may pass through. */
const SIGN_IN_HOSTS = ['accounts.google.com'];

/** Schemes handed to the operating system rather than ever loaded here. */
const EXTERNAL_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:', 'whatsapp:']);

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function isAppUrl(url: string, appOrigin: string): boolean {
  const u = parse(url);
  return !!u && u.origin === appOrigin;
}

function isSignInHost(u: URL): boolean {
  return u.protocol === 'https:' && SIGN_IN_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
}

export type NavigationDecision = 'allow' | 'external' | 'block';

/** A navigation of the main window (link click, location.href = …). */
export function decideNavigation(url: string, appOrigin: string): NavigationDecision {
  const u = parse(url);
  if (!u) return 'block';
  if (u.origin === appOrigin) return 'allow';
  if (isSignInHost(u)) return 'allow';
  return EXTERNAL_SCHEMES.has(u.protocol) ? 'external' : 'block';
}

export type WindowOpenDecision = 'child' | 'external' | 'block';

/**
 * A window.open from the app.
 *
 * - The app's own pages and its blob: documents (receipt PDFs) open in an app
 *   window: a blob URL only exists inside this session.
 * - A sized popup (`width=…`) is a sign-in or consent flow — broker login,
 *   Finvu consent, Google — that reports back through window.opener, so it
 *   must be a child of the app window.
 * - Anything else is an ordinary link: the user's browser.
 */
export function decideWindowOpen(url: string, features: string, appOrigin: string): WindowOpenDecision {
  const u = parse(url);
  if (!u) return 'block';
  if (u.protocol === 'blob:') return u.origin === appOrigin || url.startsWith(`blob:${appOrigin}/`) ? 'child' : 'block';
  if (u.origin === appOrigin) return 'child';
  const isPopup = /(^|,)\s*(width|height|popup)\s*=/i.test(features);
  if (isPopup && u.protocol === 'https:') return 'child';
  return EXTERNAL_SCHEMES.has(u.protocol) ? 'external' : 'block';
}

/** Chrome's user agent without the Electron and app tokens. Google refuses
 * sign-in from user agents it identifies as embedded browsers. */
export function browserUserAgent(ua: string): string {
  return ua
    .replace(/\sElectron\/\S+/i, '')
    .replace(/\sEveryPaisa\/\S+/i, '')
    .replace(/\s@everypaisa\/desktop\/\S+/i, '');
}

/** Compare dotted versions ("1.2.10" > "1.2.9"); a leading "v" is ignored. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const nums = (v: string) => v.replace(/^v/i, '').split(/[.+-]/).slice(0, 3).map((n) => parseInt(n, 10) || 0);
  const a = nums(candidate);
  const b = nums(current);
  for (let i = 0; i < 3; i++) {
    if (a[i]! !== b[i]!) return a[i]! > b[i]!;
  }
  return false;
}
