import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

const mail = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock('../../src/services/notifications/email.service.js', () => mail);

const { createTestScope, prisma } = await import('../helpers/db.js');
const { runAsSystem } = await import('../../src/lib/requestContext.js');
const alerts = await import('../../src/services/securityAlerts.service.js');
const { auditDownloads } = await import('../../src/lib/auditDownloads.js');

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36';
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

const flush = () => new Promise((r) => setTimeout(r, 300));
const req = (ua: string, ip = '203.0.113.7') => ({ header: (h: string) => (h === 'user-agent' ? ua : undefined), ip }) as never;

describe('security alerts', () => {
  let scope: Awaited<ReturnType<typeof createTestScope>>;
  let email: string;

  beforeAll(async () => {
    scope = await createTestScope('sec-alerts');
    email = (await runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id: scope.userId } }))).email.toLowerCase();
  });
  afterAll(async () => {
    await runAsSystem(() =>
      prisma.auditLog.deleteMany({
        where: {
          OR: [
            { userId: scope.userId },
            { action: 'login_failed', ip: { in: ['203.0.113.7', '198.51.100.9'] } },
            { action: 'security_alert', resource: { startsWith: 'stuffing:198.51.100.9' } },
          ],
        },
      }),
    );
    await scope.cleanup();
  });
  beforeEach(() => mail.sendEmail.mockReset().mockResolvedValue({ sent: true, messageId: 'm' }));

  const login = (ua: string) =>
    runAsSystem(() => prisma.auditLog.create({ data: { userId: scope.userId, action: 'login', userAgent: ua } }));

  it('no email on the very first sign-in', async () => {
    await login(CHROME_WIN);
    alerts.notifyIfNewDevice(scope.userId, req(CHROME_WIN));
    await flush();
    expect(mail.sendEmail).not.toHaveBeenCalled();
  });

  it('no email from a device already used on the account', async () => {
    await login(CHROME_WIN);
    alerts.notifyIfNewDevice(scope.userId, req(CHROME_WIN));
    await flush();
    expect(mail.sendEmail).not.toHaveBeenCalled();
  });

  it('emails the owner on a sign-in from a new device', async () => {
    await login(SAFARI_IOS);
    alerts.notifyIfNewDevice(scope.userId, req(SAFARI_IOS));
    await flush();
    expect(mail.sendEmail).toHaveBeenCalledTimes(1);
    const sent = mail.sendEmail.mock.calls[0]![0] as { to: string; text: string };
    expect(sent.to.toLowerCase()).toBe(email);
    expect(sent.text).toContain('Safari on iOS');
  });

  it('emails once, on the 5th failed sign-in in the window', async () => {
    for (let i = 1; i <= 6; i++) {
      await runAsSystem(() =>
        prisma.auditLog.create({ data: { action: 'login_failed', ip: '203.0.113.7', metadata: { email } } }),
      );
      alerts.notifyIfLoginBurst(email);
      await flush();
    }
    expect(mail.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('flags one IP failing against many accounts, and alerts once per hour', async () => {
    for (let i = 0; i < alerts.STUFFING_ACCOUNTS_THRESHOLD; i++) {
      await runAsSystem(() =>
        prisma.auditLog.create({
          data: { action: 'login_failed', ip: '198.51.100.9', metadata: { email: `victim${i}@example.com` } },
        }),
      );
    }
    process.env.SECURITY_ALERT_EMAIL = 'ops@example.com';
    try {
      const first = await runAsSystem(() => alerts.runSecurityScan());
      expect(first.alerted).toBeGreaterThanOrEqual(1);
      expect(mail.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ops@example.com' }));
      mail.sendEmail.mockClear();
      const second = await runAsSystem(() => alerts.runSecurityScan());
      const stuffing = second.findings > 0 && mail.sendEmail.mock.calls.some((c) => String((c[0] as { subject: string }).subject).includes('198.51.100.9'));
      expect(stuffing).toBe(false);
    } finally {
      delete process.env.SECURITY_ALERT_EMAIL;
    }
  });

  it('records a data_export audit row when a signed-in user downloads a file', async () => {
    const handlers: Record<string, () => void> = {};
    const headers: Record<string, string> = { 'content-disposition': 'attachment; filename="cg.xlsx"' };
    const res = {
      statusCode: 200,
      on: (ev: string, fn: () => void) => (handlers[ev] = fn),
      getHeader: (h: string) => headers[h],
    };
    const r = {
      user: { id: scope.userId },
      baseUrl: '/api/reports',
      path: '/holdings-export',
      method: 'GET',
      ip: '203.0.113.7',
      header: () => undefined,
    };
    auditDownloads(r as never, res as never, () => undefined);
    handlers.finish!();
    await flush();
    const row = await runAsSystem(() =>
      prisma.auditLog.findFirst({ where: { userId: scope.userId, action: 'data_export' } }),
    );
    expect(row?.resource).toBe('/api/reports/holdings-export');
  });
});
