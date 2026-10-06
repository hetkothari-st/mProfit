import { Browser, Page, chromium } from 'playwright';
import { v4 as uuidv4 } from 'uuid';

interface ScrapeSession {
  id: string;
  browser: Browser;
  page: Page;
  expiresAt: number;
  regNo: string;
  /**
   * The user who started this scrape.
   *
   * Sessions used to carry no owner at all, so getSession(id) resolved for
   * any caller holding the id and verifyCarInfoOtp would write the resulting
   * vehicle to whoever submitted the OTP. The MFCentral and CAMS mailback
   * flows both check `job.userId` before resuming; this one had nothing to
   * check against.
   */
  userId: string;
  [key: string]: unknown;
}

class PlaywrightSessionManager {
  private sessions: Map<string, ScrapeSession> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired sessions every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  async createSession(regNo: string, userId: string): Promise<ScrapeSession> {
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
      userId,
      expiresAt: Date.now() + 10 * 60000, // 10 minutes expiry
    };

    this.sessions.set(id, session);
    return session;
  }

  /**
   * Resolve a session, but only for the user who created it. `userId` is
   * required: an unowned lookup is how another user's session could be
   * resumed by id.
   */
  getSession(id: string, userId: string): ScrapeSession | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (session.expiresAt <= Date.now()) return undefined;
    if (session.userId !== userId) return undefined;
    return session;
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
