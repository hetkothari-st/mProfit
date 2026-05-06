import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';

/**
 * SECURITY: Postgres Row-Level Security isolates ProvidentFundAccount rows
 * across users (BUG-008 / §3.6 / §5.1 task 11).
 *
 * User A creates a PF account. User B must not be able to:
 *   1. Read it via findFirst (returns null under B's RLS context).
 *   2. Update it via update (throws PrismaClientKnownRequestError P2025
 *      "Record to update not found" because the WHERE clause returns no rows
 *      after RLS filtering).
 *
 * Both assertions use `runAsUser(userBId, ...)` which sets
 * `app.current_user_id` to B's id, exercising the same policy path as a
 * real authenticated request.
 */
describe('PF RLS cross-user isolation (BUG-008)', () => {
  let scopeA: TestScope;
  let scopeB: TestScope;
  let pfAccountId: string;

  beforeAll(async () => {
    if (!process.env['APP_ENCRYPTION_KEY']) {
      process.env['APP_ENCRYPTION_KEY'] = Buffer.alloc(32, 1).toString('base64');
    }

    scopeA = await createTestScope('pf-rls-a');
    scopeB = await createTestScope('pf-rls-b');

    // Create the PF account under user A using system context so we are sure
    // the row exists regardless of what RLS does in the test assertions.
    const account = await runAsSystem(() =>
      prisma.providentFundAccount.create({
        data: {
          userId: scopeA.userId,
          type: 'EPF',
          institution: 'EPFO',
          identifierCipher: Buffer.alloc(44, 0xab),
          identifierLast4: '1234',
          holderName: 'User A PF Account',
          assetKey: `pf:EPFO:UAN-RLS-TEST-A`,
        },
      }),
    );
    pfAccountId = account.id;
  });

  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.providentFundAccount.deleteMany({ where: { userId: scopeA.userId } });
      await prisma.providentFundAccount.deleteMany({ where: { userId: scopeB.userId } });
    });
    await scopeA.cleanup();
    await scopeB.cleanup();
  });

  it("user B cannot see user A's PF account via findFirst", async () => {
    const result = await runAsUser(scopeB.userId, () =>
      prisma.providentFundAccount.findFirst({ where: { id: pfAccountId } }),
    );
    expect(result).toBeNull();
  });

  it("user B cannot read user A's PF account via findUnique", async () => {
    const result = await runAsUser(scopeB.userId, () =>
      prisma.providentFundAccount.findUnique({ where: { id: pfAccountId } }),
    );
    expect(result).toBeNull();
  });

  it("user B cannot update user A's PF account (RLS blocks the row)", async () => {
    // Prisma's `update` throws P2025 when the record is not found (which is what
    // happens after RLS filters user A's row out of user B's view).
    await expect(
      runAsUser(scopeB.userId, () =>
        prisma.providentFundAccount.update({
          where: { id: pfAccountId },
          data: { holderName: 'hijacked' },
        }),
      ),
    ).rejects.toBeTruthy();

    // Confirm from system context that the row was NOT mutated.
    const unchanged = await runAsSystem(() =>
      prisma.providentFundAccount.findUnique({
        where: { id: pfAccountId },
        select: { holderName: true },
      }),
    );
    expect(unchanged?.holderName).toBe('User A PF Account');
  });

  it("user B cannot delete user A's PF account (deleteMany returns count 0)", async () => {
    const result = await runAsUser(scopeB.userId, () =>
      prisma.providentFundAccount.deleteMany({ where: { id: pfAccountId } }),
    );
    expect(result.count).toBe(0);

    // Row must still exist from user A's perspective.
    const stillThere = await runAsSystem(() =>
      prisma.providentFundAccount.findUnique({ where: { id: pfAccountId } }),
    );
    expect(stillThere).not.toBeNull();
  });

  it("user A can still read their own PF account", async () => {
    const result = await runAsUser(scopeA.userId, () =>
      prisma.providentFundAccount.findUnique({ where: { id: pfAccountId } }),
    );
    expect(result).not.toBeNull();
    expect(result?.id).toBe(pfAccountId);
  });
});
