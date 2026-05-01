import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { logger } from './logger.js';

// Two-leg captcha-relay session map for CAMS / KFintech mailback flows.
// Leg 1 — backend opens portal, captures captcha image, returns base64 to UI.
// Leg 2 — user types captcha, frontend posts solution; backend reuses the same
// page to fill the rest of the form and click submit.
//
// Key = jobId (cuid). TTL = 5 min. PAN+email never persisted.

interface MailbackSession {
  id: string;
  provider: 'CAMS' | 'KFINTECH';
  browser: Browser;
  context: BrowserContext;
  page: Page;
  pan: string;
  email: string;
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000;
const CLEANUP_MS = 60 * 1000;

class MailbackSessionManager {
  private sessions = new Map<string, MailbackSession>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), CLEANUP_MS);
  }

  async createSession(
    key: string,
    provider: 'CAMS' | 'KFINTECH',
    pan: string,
    email: string,
  ): Promise<MailbackSession> {
    const browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    const session: MailbackSession = {
      id: key,
      provider,
      browser,
      context,
      page,
      pan,
      email,
      expiresAt: Date.now() + TTL_MS,
    };
    this.sessions.set(key, session);
    return session;
  }

  getSession(key: string): MailbackSession | undefined {
    const s = this.sessions.get(key);
    if (!s) return undefined;
    if (s.expiresAt <= Date.now()) {
      void this.closeSession(key);
      return undefined;
    }
    return s;
  }

  async closeSession(key: string): Promise<void> {
    const s = this.sessions.get(key);
    if (!s) return;
    this.sessions.delete(key);
    try {
      await s.browser.close();
    } catch (err) {
      logger.warn({ err, key }, '[mailback-session] browser close failed');
    }
  }

  private async cleanup(): Promise<void> {
    const now = Date.now();
    for (const [k, s] of this.sessions.entries()) {
      if (s.expiresAt <= now) await this.closeSession(k);
    }
  }
}

export const mailbackSessionManager = new MailbackSessionManager();
