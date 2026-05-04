import { Browser, Page, chromium } from 'playwright';
import { v4 as uuidv4 } from 'uuid';

interface ScrapeSession {
  id: string;
  browser: Browser;
  page: Page;
  expiresAt: number;
  regNo: string;
  [key: string]: unknown;
}

class PlaywrightSessionManager {
  private sessions: Map<string, ScrapeSession> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired sessions every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  async createSession(regNo: string): Promise<ScrapeSession> {
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      locale: 'en-IN',
    });
    // Hide webdriver fingerprint
    await context.addInitScript(
      'Object.defineProperty(navigator, "webdriver", { get: () => undefined })',
    );
    const page = await context.newPage();
    const id = uuidv4();
    
    const session: ScrapeSession = {
      id,
      browser,
      page,
      regNo,
      expiresAt: Date.now() + 10 * 60000, // 10 minutes expiry
    };

    this.sessions.set(id, session);
    return session;
  }

  getSession(id: string): ScrapeSession | undefined {
    const session = this.sessions.get(id);
    if (session && session.expiresAt > Date.now()) {
      return session;
    }
    return undefined;
  }

  async closeSession(id: string) {
    const session = this.sessions.get(id);
    if (session) {
      await session.browser.close();
      this.sessions.delete(id);
    }
  }

  private async cleanup() {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (session.expiresAt < now) {
        await this.closeSession(id);
      }
    }
  }
}

export const playwrightSessionManager = new PlaywrightSessionManager();
