/**
 * Mutual-funds defects 2–4: the CAS-by-email dialogs.
 *
 * 2. The CASParser dialog collected a Portfolio and a Nickname and dropped
 *    both: the server did not accept them, and the statement that arrives
 *    later by Gmail was always imported into the default portfolio.
 * 3. Every user was shown the operator's casparser.in credit balance.
 * 4. While managing a family member's account, the CAMS/KFintech dialog
 *    pre-filled the MANAGER's PAN (from an account route) while the PDF
 *    password came from the member's profile. The PAN shown — and used — is
 *    now the effective profile's, read on a data route.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const generated: Array<Record<string, unknown>> = [];
vi.mock('../../src/ingestion/casparser/casparserClient.js', async (orig) => {
  const real = await orig<typeof import('../../src/ingestion/casparser/casparserClient.js')>();
  return {
    ...real,
    kfintechGenerate: async (input: Record<string, unknown>) => {
      generated.push(input);
      return { message: 'queued', request_id: 'REQ-1' };
    },
    getCredits: async () => ({ credits_remaining: 42, plan: 'operator-plan' }),
  };
});

const camsInitiated: Array<{ pan: string }> = [];
vi.mock('../../src/ingestion/mfMailback/camsMailback.js', async (orig) => {
  const real = await orig<typeof import('../../src/ingestion/mfMailback/camsMailback.js')>();
  return {
    ...real,
    initiateCamsMailback: async (input: { pan: string }) => {
      camsInitiated.push({ pan: input.pan });
      return { captchaImageBase64: null };
    },
  };
});

import { mfCasparserRouter } from '../../src/routes/mfCasparser.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/auth/jwt.service.js';
import { kfintechMailbackRequest } from '../../src/services/mf/mfCasparser/mfCasparser.service.js';
import {
  casMailbackTarget,
  getMailbackPan,
  initiateMailbackJob,
} from '../../src/services/mf/mfCasMailback/mfCasMailback.service.js';
import { isAccountRoute } from '../../src/services/family/managedProfile.service.js';
import { panColumns } from '../../src/services/security/piiAtRest.service.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let server: Server;
let base: string;
const scopes: TestScope[] = [];

async function scope(label: string): Promise<TestScope> {
  const s = await createTestScope(label);
  scopes.push(s);
  return s;
}

beforeAll(() => {
  const app = express();
  app.use(express.json());
  app.use('/api/mf-casparser', mfCasparserRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.close();
  for (const s of scopes) {
    await runAsSystem(async () => {
      await prisma.mFCasMailbackJob.deleteMany({ where: { userId: s.userId } });
      await prisma.monitoredSender.deleteMany({ where: { userId: s.userId } });
    });
    await s.cleanup();
  }
});

describe('3. the casparser.in credit balance is the operator\'s, not the user\'s', () => {
  it('refuses it to a regular user and serves it to an admin', async () => {
    const s = await scope('cp-credits');
    const user = signAccessToken({ sub: s.userId, email: 'u@test.local', role: 'INVESTOR', plan: 'FREE' }).token;
    const r1 = await fetch(`${base}/api/mf-casparser/credits`, { headers: { authorization: `Bearer ${user}` } });
    expect(r1.status).toBe(403);

    await runAsSystem(() => prisma.user.update({ where: { id: s.userId }, data: { role: 'ADMIN' } }));
    const admin = signAccessToken({ sub: s.userId, email: 'u@test.local', role: 'ADMIN', plan: 'FREE' }).token;
    const r2 = await fetch(`${base}/api/mf-casparser/credits`, { headers: { authorization: `Bearer ${admin}` } });
    expect(r2.status).toBe(200);
  });
});

describe('2. the CASParser mailback honours Portfolio and Nickname', () => {
  it('records the choice and routes the emailed CAS to the chosen portfolio', async () => {
    const s = await scope('cp-target');
    const second = await runAsSystem(() =>
      prisma.portfolio.create({
        data: { userId: s.userId, name: 'Mum MFs', isDefault: false, currency: 'INR', type: 'INVESTMENT' },
      }),
    );

    const before = new Date();
    await s.runAs(() =>
      kfintechMailbackRequest({
        userId: s.userId,
        pan: 'ABCDE1234F',
        email: 'someone@example.com',
        portfolioId: second.id,
        nickname: 'Mum folios',
      }),
    );

    const jobs = await runAsSystem(() => prisma.mFCasMailbackJob.findMany({ where: { userId: s.userId } }));
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      portfolioId: second.id,
      nickname: 'Mum folios',
      status: 'SUBMITTED',
      kfintechStatus: 'SUBMITTED',
      kfintechRequestRef: 'REQ-1',
      panLast4: '234F',
    });

    const arrived = new Date(before.getTime() + 30 * 60 * 1000);
    await s.runAs(async () => {
      expect(await casMailbackTarget(s.userId, 'KFintech <donotreply@kfintech.com>', arrived)).toBe(second.id);
      expect(await casMailbackTarget(s.userId, 'CAMS <donotreply@camsonline.com>', arrived)).toBe(second.id);
      // A depository eCAS arrives monthly whether asked for or not.
      expect(await casMailbackTarget(s.userId, 'CDSL <ecas@cdslstatement.com>', arrived)).toBeNull();
      // A statement that arrived before the request is not its delivery.
      expect(
        await casMailbackTarget(s.userId, 'donotreply@kfintech.com', new Date(before.getTime() - 3 * 3600 * 1000)),
      ).toBeNull();
      // Nor is one a month later.
      expect(
        await casMailbackTarget(s.userId, 'donotreply@kfintech.com', new Date(before.getTime() + 30 * 86400 * 1000)),
      ).toBeNull();
    });
  });

  it('rejects a portfolio that is not the user\'s before spending a credit', async () => {
    const s = await scope('cp-foreign');
    const other = await scope('cp-foreign-owner');
    const n = generated.length;
    await expect(
      s.runAs(() =>
        kfintechMailbackRequest({
          userId: s.userId,
          pan: 'ABCDE1234F',
          email: 'someone@example.com',
          portfolioId: other.portfolioId,
        }),
      ),
    ).rejects.toThrow();
    expect(generated.length).toBe(n);
  });

  it('"Default" stays default — no portfolio is pinned', async () => {
    const s = await scope('cp-default');
    await s.runAs(() =>
      kfintechMailbackRequest({ userId: s.userId, pan: 'ABCDE1234F', email: 'someone@example.com' }),
    );
    const job = await runAsSystem(() => prisma.mFCasMailbackJob.findFirstOrThrow({ where: { userId: s.userId } }));
    expect(job.portfolioId).toBeNull();
    expect(await s.runAs(() => casMailbackTarget(s.userId, 'donotreply@kfintech.com', new Date()))).toBeNull();
  });
});

describe('4. the mailback uses — and shows — the effective profile\'s PAN', () => {
  it('reads the PAN on a data route, so X-Act-As applies to it', () => {
    expect(isAccountRoute('/api/mf-cas-mailback/pan')).toBe(false);
  });

  it('shows the masked PAN of the profile the request is for, and initiates with it', async () => {
    const member = await scope('mb-member');
    await runAsSystem(async () =>
      prisma.user.update({ where: { id: member.userId }, data: await panColumns('PQRST6789K') }),
    );

    expect(await member.runAs(() => getMailbackPan(member.userId))).toEqual({ panMasked: 'XXXXX6789K' });

    await member.runAs(() =>
      initiateMailbackJob({ userId: member.userId, email: 'member@example.com', providers: ['CAMS'] }),
    );
    expect(camsInitiated.at(-1)).toEqual({ pan: 'PQRST6789K' });
  });

  it('says plainly when the profile has no PAN, rather than borrowing someone else\'s', async () => {
    const member = await scope('mb-nopan');
    expect(await member.runAs(() => getMailbackPan(member.userId))).toEqual({ panMasked: null });
    await expect(
      member.runAs(() => initiateMailbackJob({ userId: member.userId, email: 'm@example.com', providers: ['CAMS'] })),
    ).rejects.toThrow(/PAN not set/);
  });
});
