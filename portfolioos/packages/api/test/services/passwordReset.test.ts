/**
 * Forgot password emails a 6-digit code; the code plus a new password resets
 * it. Before this, the reset token was only written to the server log and the
 * web app had no page to use it, so nobody could reset a password.
 *
 * Prisma is an in-memory fake so this runs without the attempts migration
 * applied to whatever DATABASE_URL points at.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

interface Row {
  [k: string]: unknown;
}

const db = vi.hoisted(() => ({
  users: [] as Row[],
  tokens: [] as Row[],
  refreshTokens: [] as Row[],
  sent: [] as { to: string; subject: string; html: string }[],
  sendOk: true,
}));

vi.mock('../../src/services/notifications/email.service.js', () => ({
  sendEmail: vi.fn(async (input: { to: string; subject: string; html: string }) => {
    db.sent.push(input);
    return db.sendOk ? { sent: true, messageId: 'test' } : { sent: false, reason: 'smtp down' };
  }),
}));

vi.mock('../../src/lib/prisma.js', () => {
  let seq = 0;
  type Where = Record<string, unknown>;
  const matches = (row: Row, where: Where) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && !(v instanceof Date) && 'gt' in v) {
        return (row[k] as Date) > (v as { gt: Date }).gt;
      }
      return row[k] === v;
    });
  const apply = (row: Row, data: Row) => {
    for (const [k, v] of Object.entries(data)) {
      row[k] =
        v && typeof v === 'object' && 'increment' in v
          ? (row[k] as number) + (v as { increment: number }).increment
          : v;
    }
  };
  const client = {
    user: {
      findUnique: async ({ where }: { where: Where }) => {
        const row = db.users.find((r) => matches(r, where));
        return row ? { ...row } : null;
      },
      update: async ({ where, data }: { where: Where; data: Row }) => {
        const row = db.users.find((r) => matches(r, where))!;
        apply(row, data);
        return row;
      },
    },
    passwordResetToken: {
      findFirst: async ({ where }: { where: Where }) => {
        const rows = db.tokens
          .filter((r) => matches(r, where))
          .sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime());
        return rows[0] ? { ...rows[0] } : null;
      },
      create: async ({ data }: { data: Row }) => {
        const row = { id: `t${++seq}`, usedAt: null, attempts: 0, createdAt: new Date(), ...data };
        db.tokens.push(row);
        return row;
      },
      update: async ({ where, data }: { where: Where; data: Row }) => {
        const row = db.tokens.find((r) => matches(r, where))!;
        apply(row, data);
        return row;
      },
      updateMany: async ({ where, data }: { where: Where; data: Row }) => {
        const rows = db.tokens.filter((r) => matches(r, where));
        rows.forEach((r) => apply(r, data));
        return { count: rows.length };
      },
    },
    refreshToken: {
      updateMany: async ({ where, data }: { where: Where; data: Row }) => {
        const rows = db.refreshTokens.filter((r) => matches(r, where));
        rows.forEach((r) => apply(r, data));
        return { count: rows.length };
      },
    },
  };
  return {
    prisma: client,
    runInTransaction: async (fn: (tx: typeof client) => Promise<unknown>) => fn(client),
  };
});

const { requestPasswordReset, resetPassword } = await import(
  '../../src/services/auth.service.js'
);
const { verifyPassword } = await import('../../src/services/password.service.js');

const EMAIL = 'forgetful@example.com';
const NEW_PASSWORD = 'brand-new-password';

function lastCode(): string {
  const { html, subject } = db.sent.at(-1)!;
  // The code must never reach the (logged) subject line.
  expect(subject).not.toMatch(/\d{6}/);
  return html.match(/>(\d{6})</)![1]!;
}

function wrongCode(code: string): string {
  return code === '000000' ? '111111' : '000000';
}

/** Pretend the last code was sent long enough ago to request another. */
function ageTokens(): void {
  db.tokens.forEach((t) => (t.createdAt = new Date(Date.now() - 61_000)));
}

beforeEach(() => {
  db.users = [
    {
      id: 'u1',
      email: EMAIL,
      name: 'Forgetful',
      passwordHash: 'old-hash',
      isActive: true,
      isShadowClient: false,
    },
  ];
  db.tokens = [];
  db.refreshTokens = [{ id: 'r1', userId: 'u1', revokedAt: null }];
  db.sent = [];
  db.sendOk = true;
});

describe('forgot password', () => {
  it('emails a code and stores only its hash', async () => {
    await expect(requestPasswordReset(EMAIL)).resolves.toEqual({ codeSent: true });
    expect(db.sent).toHaveLength(1);
    expect(db.sent[0]!.to).toBe(EMAIL);
    expect(db.tokens[0]!.token).not.toContain(lastCode());
  });

  it('sends nothing for an unknown address, and says so to nobody', async () => {
    await expect(requestPasswordReset('nobody@example.com')).resolves.toBeNull();
    expect(db.sent).toHaveLength(0);
  });

  it('resets the password and signs out every session on the right code', async () => {
    await requestPasswordReset(EMAIL);
    await resetPassword(EMAIL, lastCode(), NEW_PASSWORD);

    const user = db.users[0]!;
    expect(await verifyPassword(NEW_PASSWORD, user.passwordHash as string)).toBe(true);
    expect(db.refreshTokens[0]!.revokedAt).toBeInstanceOf(Date);
    expect(db.tokens[0]!.usedAt).toBeInstanceOf(Date);
  });

  it('will not accept the same code twice', async () => {
    await requestPasswordReset(EMAIL);
    const code = lastCode();
    await resetPassword(EMAIL, code, NEW_PASSWORD);
    await expect(resetPassword(EMAIL, code, 'another-password')).rejects.toThrow(/incorrect or has expired/i);
  });

  it('gives the same error for a wrong code, an unknown email and an expired code', async () => {
    await requestPasswordReset(EMAIL);
    const code = lastCode();

    await expect(resetPassword(EMAIL, wrongCode(code), NEW_PASSWORD)).rejects.toThrow(
      /incorrect or has expired/i,
    );
    await expect(resetPassword('nobody@example.com', code, NEW_PASSWORD)).rejects.toThrow(
      /incorrect or has expired/i,
    );
    db.tokens[0]!.expiresAt = new Date(Date.now() - 1000);
    await expect(resetPassword(EMAIL, code, NEW_PASSWORD)).rejects.toThrow(
      /incorrect or has expired/i,
    );
    expect(db.users[0]!.passwordHash).toBe('old-hash');
  });

  it('locks the code after 5 wrong attempts, even if the 6th is right', async () => {
    await requestPasswordReset(EMAIL);
    const code = lastCode();
    for (let i = 0; i < 5; i++) {
      await expect(resetPassword(EMAIL, wrongCode(code), NEW_PASSWORD)).rejects.toThrow();
    }
    await expect(resetPassword(EMAIL, code, NEW_PASSWORD)).rejects.toThrow(
      /incorrect or has expired/i,
    );
    expect(db.users[0]!.passwordHash).toBe('old-hash');
  });

  it('ignores a repeat request inside the cooldown, then a new code kills the old one', async () => {
    await requestPasswordReset(EMAIL);
    const first = lastCode();

    await expect(requestPasswordReset(EMAIL)).resolves.toBeNull();
    expect(db.sent).toHaveLength(1);

    ageTokens();
    await requestPasswordReset(EMAIL);
    const second = lastCode();
    expect(db.sent).toHaveLength(2);

    if (first !== second) {
      await expect(resetPassword(EMAIL, first, NEW_PASSWORD)).rejects.toThrow(
        /incorrect or has expired/i,
      );
    }
    await expect(resetPassword(EMAIL, second, NEW_PASSWORD)).resolves.toBeUndefined();
  });

  it('never emails a deactivated account or a shadow client', async () => {
    db.users[0]!.isActive = false;
    await expect(requestPasswordReset(EMAIL)).resolves.toBeNull();
    db.users[0]!.isActive = true;
    db.users[0]!.isShadowClient = true;
    await expect(requestPasswordReset(EMAIL)).resolves.toBeNull();
    expect(db.sent).toHaveLength(0);
  });
});
