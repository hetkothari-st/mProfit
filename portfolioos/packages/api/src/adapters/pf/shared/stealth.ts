import type { Browser, BrowserContext } from 'playwright';

// Pool of recent real Chrome desktop user agents. Refresh quarterly.
const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
] as const;

const VIEWPORT_POOL = [
  { width: 1920, height: 1080 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1680, height: 1050 },
] as const;

const TIMEZONE_POOL = ['Asia/Kolkata'] as const;

const LOCALE_POOL = ['en-IN', 'en-US'] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

export interface StealthContextOpts {
  /** Override UA. If omitted, a random one is picked from UA_POOL. */
  userAgent?: string;
  /** Override viewport. If omitted, picked from VIEWPORT_POOL. */
  viewport?: { width: number; height: number };
}

/**
 * Create a Playwright BrowserContext with realistic UA, viewport, locale, and
 * timezone. Pin per-session for consistency (don't rotate within a session —
 * fingerprint stability matters more than per-request randomness once a session
 * starts).
 */
export async function newStealthContext(
  browser: Browser,
  opts: StealthContextOpts = {},
): Promise<BrowserContext> {
  return browser.newContext({
    userAgent: opts.userAgent ?? pick(UA_POOL),
    viewport: opts.viewport ?? pick(VIEWPORT_POOL),
    locale: pick(LOCALE_POOL),
    timezoneId: pick(TIMEZONE_POOL),
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
    javaScriptEnabled: true,
  });
}

/** Random delay between min and max ms. */
export function jitter(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Click delay parameters for `page.click({ delay })`. Picks a per-call delay
 * in the human-typical 50–200 ms range.
 */
export function clickDelay(): { delay: number } {
  return { delay: 50 + Math.random() * 150 };
}

/**
 * Type delay in ms for `page.type()` (per-character timing).
 * Picks a per-call value in the human-typical 30–100 ms range.
 *
 * Usage: `await page.type(selector, value, typeDelay())`
 * Note: use `page.type()` (not `page.fill()`) when per-char delay is needed.
 */
export function typeDelay(): { delay: number } {
  return { delay: 30 + Math.random() * 70 };
}

/**
 * Move the mouse along a Bezier-ish curve from (0,0) to (toX, toY) in N steps.
 * Most stealth plugins miss curved-trajectory mouse movement; this defeats
 * basic "mouse always moves linearly" heuristics.
 */
export async function humanMouseMoveTo(
  page: import('playwright').Page,
  toX: number,
  toY: number,
  steps = 25,
): Promise<void> {
  // Random control point
  const ctrlX = Math.random() * Math.max(toX, 800);
  const ctrlY = Math.random() * Math.max(toY, 600);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = (1 - t) * (1 - t) * 0 + 2 * (1 - t) * t * ctrlX + t * t * toX;
    const y = (1 - t) * (1 - t) * 0 + 2 * (1 - t) * t * ctrlY + t * t * toY;
    await page.mouse.move(x, y);
    await jitter(8, 18);
  }
}
