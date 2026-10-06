/**
 * Signup is gated on an emailed code: no User row may exist for an address
 * until its owner has typed back the code sent to it.
 *
 * Prisma is replaced with an in-memory fake so this runs without the
 * PendingRegistration migration applied to whatever DATABASE_URL points at.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

interface Row {
  [k: string]: unknown;
}

const db = vi.hoisted(() => ({
  users: [] as Row[],
  pending: [] as Row[],
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
  const byEmail = (rows: Row[], email: unknown) => rows.find((r) => r.email === email) ?? null;
  const client = {
    user: {
      findUnique: async ({ where }: { where: { email: string } }) => byEmail(db.users, where.email),
      create: async ({ data }: { data: Row }) => {
        if (byEmail(db.users, data.email)) throw new Error('unique violation');
        const row = {
          id: `u${++seq}`,
          role: 'INVESTOR',
          plan: 'FREE',
          isActive: true,
          isShadowClient: false,
          pan: null,
          dob: null,
          planExpiresAt: null,
          createdAt: new Date(),
          ...data,
        };
        db.users.push(row);
        return row;
      },
    },
    pendingRegistration: {
      // A copy, like the real client — later writes must not show through.
      findUnique: async ({ where }: { where: { email: string } }) => {
        const row = byEmail(db.pending, where.email);
        return row ? { ...row } : null;
      },
      upsert: async ({ where, create, update }: { where: { email: string }; create: Row; update: Row }) => {
        const existing = byEmail(db.pending, where.email);
        if (existing) return Object.assign(existing, update);
        const row = { id: `p${++seq}`, attempts: 0, createdAt: new Date(), ...create };
        db.pending.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = db.pending.find((r) => r.id === where.id)!;
        for (const [k, v] of Object.entries(data)) {
          row[k] =
            v && typeof v === 'object' && 'increment' in v
              ? (row[k] as number) + (v as { increment: number }).increment
              : v;
        }
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        db.pending = db.pending.filter((r) => r.id !== where.id);
      },
      deleteMany: async ({ where }: { where: { email: string } }) => {
        db.pending = db.pending.filter((r) => r.email !== where.email);
      },
    },
    refreshToken: { create: async ({ data }: { data: Row }) => data },
  };
  return {
    prisma: client,
    runInTransaction: async (fn: (tx: typeof client) => Promise<unknown>) => fn(client),
  };
});

const {
  startRegistration,
  verifyRegistration,
  resendRegistrationCode,
} = await import('../../src/services/auth.service.js');

const EMAIL = 'new.person@example.com';
const input = { email: EMAIL, password: 'correct-horse-battery', name: 'New Person' };

function lastCode(): string {
  const { html, subject } = db.sent.at(-1)!;
  // The code must never reach the (logged) subject line.
  expect(subject).not.toMatch(/\d{6}/);
  return html.match(/>(\d{6})</)![1]!;
}

function wrongCode(code: string): string {
  return code === '000000' ? '111111' : '000000';
}

beforeEach(() => {
  db.users = [];
  db.pending = [];
  db.sent = [];
  db.sendOk = true;
});

describe('signup email verification', () => {
  it('emails a code and creates no account until it is verified', async () => {
    const result = await startRegistration(input);

    expect(result.email).toBe(EMAIL);
    expect(db.sent).toHaveLength(1);
    expect(db.sent[0]!.to).toBe(EMAIL);
    expect(db.users).toHaveLength(0);
    // Neither the code nor the password is stored in the clear.
    const row = db.pending[0]!;
    expect(row.codeHash).not.toContain(lastCode());
    expect(row.passwordHash).not.toBe(input.password);
  });

  it('creates the account and a session on the right code', async () => {
    await startRegistration(input);
    const session = await verifyRegistration(EMAIL, lastCode());

    expect(session.user.email).toBe(EMAIL);
    expect(session.tokens.accessToken).toBeTruthy();
    expect(db.users).toHaveLength(1);
    expect(db.pending).toHaveLength(0);
  });

  it('rejects a wrong code without creating an account', async () => {
    await startRegistration(input);
    await expect(verifyRegistration(EMAIL, wrongCode(lastCode()))).rejects.toThrow(
      /incorrect code\. 4 attempts left/i,
    );
    expect(db.users).toHaveLength(0);
  });

  it('locks the code after 5 wrong attempts, even if the 6th is right', async () => {
    await startRegistration(input);
    const code = lastCode();
    for (let i = 0; i < 5; i++) {
      await expect(verifyRegistration(EMAIL, wrongCode(code))).rejects.toThrow();
    }
    await expect(verifyRegistration(EMAIL, code)).rejects.toThrow(/too many incorrect attempts/i);
    expect(db.users).toHaveLength(0);
  });

  it('rejects an expired code', async () => {
    await startRegistration(input);
    db.pending[0]!.expiresAt = new Date(Date.now() - 1000);
    await expect(verifyRegistration(EMAIL, lastCode())).rejects.toThrow(/expired/i);
  });

  it('refuses to start signup for an address that already has an account', async () => {
    db.users.push({ id: 'existing', email: EMAIL });
    await expect(startRegistration(input)).rejects.toThrow(/already registered/i);
    expect(db.sent).toHaveLength(0);
  });

  it('enforces the resend cooldown, and a resent code replaces the old one', async () => {
    await startRegistration(input);
    const first = lastCode();

    await expect(resendRegistrationCode(EMAIL)).rejects.toThrow(/please wait/i);

    db.pending[0]!.lastSentAt = new Date(Date.now() - 61_000);
    await resendRegistrationCode(EMAIL);
    const second = lastCode();

    if (first !== second) {
      await expect(verifyRegistration(EMAIL, first)).rejects.toThrow(/incorrect code/i);
    }
    await expect(verifyRegistration(EMAIL, second)).resolves.toMatchObject({
      user: { email: EMAIL },
    });
  });

  it('refuses to verify a code minted for a different address', async () => {
    await startRegistration(input);
    const code = lastCode();
    db.sent = [];
    await startRegistration({ ...input, email: 'other@example.com' });
    // Same code value typed against the other signup must not match unless
    // that signup happened to be sent the same digits.
    if (lastCode() !== code) {
      await expect(verifyRegistration('other@example.com', code)).rejects.toThrow(
        /incorrect code/i,
      );
    }
  });
});
