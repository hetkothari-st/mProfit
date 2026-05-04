/// <reference lib="dom" />
import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger.js';

// Parallel to playwrightSessions.ts, scoped to MFCentral. Session key = jobId
// (so service layer doesn't manage two ids). TTL = 5 min (OTPs expire fast).
// PAN lives in process memory only — never persisted, never logged.

interface MFCentralSession {
  id: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  pan: string;
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000;
const CLEANUP_MS = 60 * 1000;

class MFCentralSessionManager {
  private sessions = new Map<string, MFCentralSession>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), CLEANUP_MS);
  }

  async createSession(jobId: string, pan: string): Promise<MFCentralSession> {
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
      extraHTTPHeaders: { 'Accept-Language': 'en-IN,en;q=0.9' },
    });
    // Remove webdriver flag
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      (window as unknown as Record<string, unknown>).chrome = { runtime: {} };
    });
    const page = await context.newPage();

    const session: MFCentralSession = {
      id: jobId,
      browser,
      context,
      page,
      pan,
      expiresAt: Date.now() + TTL_MS,
    };

    this.sessions.set(jobId, session);
    return session;
  }

  getSession(jobId: string): MFCentralSession | undefined {
    const s = this.sessions.get(jobId);
    if (!s) return undefined;
    if (s.expiresAt <= Date.now()) {
      void this.closeSession(jobId);
      return undefined;
    }
    return s;
  }

  async closeSession(jobId: string): Promise<void> {
    const s = this.sessions.get(jobId);
    if (!s) return;
    this.sessions.delete(jobId);
    try {
      await s.browser.close();
    } catch (err) {
      logger.warn({ err, jobId }, '[mfcentral-session] browser close failed');
    }
  }

  private async cleanup(): Promise<void> {
    const now = Date.now();
    for (const [id, s] of this.sessions.entries()) {
      if (s.expiresAt <= now) {
        await this.closeSession(id);
      }
    }
  }
}

export const mfCentralSessionManager = new MFCentralSessionManager();
