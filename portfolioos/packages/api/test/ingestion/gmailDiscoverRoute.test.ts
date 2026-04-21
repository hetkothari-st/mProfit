import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { getGmailDiscover } from '../../src/controllers/gmail.controller.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';

/**
 * Access-control contract for `GET /gmail/:id/discover`.
 *
 * The discovery function itself is covered by discovery.test.ts via
 * `_runDiscovery` — we only exercise the controller-level checks
 * that stop user-A from scanning user-B's mailbox.
 */

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response & typeof res;
}

function makeReq(userId: string, id: string, query: Record<string, string> = {}): Request {
  return {
    user: { id: userId },
    params: { id },
    query,
  } as unknown as Request;
}

describe('GET /gmail/:id/discover access control', () => {
  let scopeA: TestScope;
  let scopeB: TestScope;
  const createdMailboxIds: string[] = [];

  beforeEach(async () => {
    scopeA = await createTestScope('discoverA');
    scopeB = await createTestScope('discoverB');
  });

  afterEach(async () => {
    await runAsSystem(async () => {
      for (const id of createdMailboxIds) {
        await prisma.mailboxAccount.delete({ where: { id } }).catch(() => {});
      }
      createdMailboxIds.length = 0;
    });
    await scopeA.cleanup();
    await scopeB.cleanup();
  });

  it('404s when the mailbox belongs to a different user', async () => {
    const otherMailbox = await runAsSystem(() =>
      prisma.mailboxAccount.create({
        data: {
          userId: scopeB.userId,
          provider: 'GMAIL_OAUTH',
          label: 'other user gmail',
          googleEmail: 'other@test.local',
          isActive: true,
        },
      }),
    );
    createdMailboxIds.push(otherMailbox.id);

    const req = makeReq(scopeA.userId, otherMailbox.id);
    const res = makeRes();

    await expect(getGmailDiscover(req, res)).rejects.toThrow(/not found/i);
  });

  it('404s when the mailbox does not exist', async () => {
    const req = makeReq(scopeA.userId, 'does-not-exist');
    const res = makeRes();

    await expect(getGmailDiscover(req, res)).rejects.toThrow(/not found/i);
  });

  it('400s when the id is missing', async () => {
    const req = {
      user: { id: scopeA.userId },
      params: {},
      query: {},
    } as unknown as Request;
    const res = makeRes();

    await expect(getGmailDiscover(req, res)).rejects.toThrow(/id required/i);
  });
});
