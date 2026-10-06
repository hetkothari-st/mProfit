/**
 * Account deletion against a real database.
 *
 * The purge has to get past every foreign key between User and the rest of
 * the schema — including RESTRICT ones buried a level down (voucher entries,
 * Gmail scan jobs) that only a real Postgres enforces. It must also leave
 * every other user's data alone, and refuse to strand a family that other
 * people belong to.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { mkdtemp, mkdir, writeFile, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const uploadDir = await mkdtemp(join(tmpdir(), 'ep-delete-'));
process.env.UPLOAD_DIR = uploadDir;

const { prisma } = await import('../../src/lib/prisma.js');
const { runAsSystem } = await import('../../src/lib/requestContext.js');
const { hashPassword } = await import('../../src/services/password.service.js');
const deletion = await import('../../src/services/accountDeletion.service.js');
const { loginUser } = await import('../../src/services/auth.service.js');

const PASSWORD = 'Delete-me-Test-1!';
const tag = crypto.randomUUID().slice(0, 8);
const sys = <T>(fn: () => Promise<T>) => runAsSystem(fn);

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

async function makeUser(label: string, extra: Record<string, unknown> = {}) {
  return sys(() =>
    prisma.user.create({
      data: {
        email: `del-${label}-${tag}@example.com`,
        name: `Del ${label}`,
        passwordHash: seedPasswordHash,
        ...extra,
      },
    }),
  );
}
let seedPasswordHash = '';

/** Rows in every table the purge has to get past. */
async function seedEverything(userId: string) {
  return sys(async () => {
    const portfolio = await prisma.portfolio.create({ data: { userId, name: 'P' } });
    const txn = await prisma.transaction.create({
      data: {
        portfolioId: portfolio.id,
        assetClass: 'EQUITY',
        transactionType: 'BUY',
        tradeDate: new Date(),
        quantity: '1',
        price: '100',
        grossAmount: '100',
        netAmount: '100',
        assetKey: `name:${tag}-${userId}`,
      } as never,
    });
    const photoPath = join(uploadDir, 'transaction_photos', `${userId}.jpg`);
    await mkdir(join(uploadDir, 'transaction_photos'), { recursive: true });
    await writeFile(photoPath, 'x');
    await prisma.transactionPhoto.create({
      data: {
        transactionId: txn.id,
        fileName: 'a.jpg',
        filePath: photoPath,
        mimeType: 'image/jpeg',
        sizeBytes: 1,
      },
    });

    const cash = await prisma.account.create({
      data: { userId, code: `C${tag}`, name: 'Cash', type: 'ASSET' },
    });
    const equity = await prisma.account.create({
      data: { userId, code: `E${tag}`, name: 'Equity', type: 'ASSET' },
    });
    const voucher = await prisma.voucher.create({
      data: { userId, type: 'JOURNAL', voucherNo: `V${tag}`, date: new Date() },
    });
    await prisma.voucherEntry.create({
      data: {
        voucherId: voucher.id,
        debitAccountId: cash.id,
        creditAccountId: equity.id,
        amount: '10',
      },
    });

    const mailbox = await prisma.mailboxAccount.create({ data: { userId } as never });
    await prisma.gmailScanJob.create({
      data: { userId, mailboxId: mailbox.id, lookbackFrom: new Date(0), lookbackTo: new Date() },
    });

    await prisma.providentFundAccount.create({
      data: {
        userId,
        type: 'EPF',
        institution: 'EPFO',
        identifierCipher: Buffer.from('x'),
        identifierLast4: '1234',
        holderName: 'X',
        assetKey: `pf:${tag}:${userId}`,
      },
    });

    const family = await prisma.family.create({
      data: { name: `Fam ${tag}`, createdById: userId },
    });
    await prisma.familyMember.create({ data: { familyId: family.id, userId } as never });
    await prisma.familyInvitation.create({
      data: {
        familyId: family.id,
        invitedEmail: 'x@example.com',
        invitedById: userId,
        token: `tok-${crypto.randomUUID()}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await prisma.pendingFamilyInvite.create({
      data: {
        familyId: family.id,
        invitedEmail: 'y@example.com',
        createdById: userId,
        razorpayOrderId: `order-${crypto.randomUUID()}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    await prisma.loan.create({
      data: {
        userId,
        lenderName: 'SBI',
        loanType: 'HOME',
        borrowerName: 'X',
        principalAmount: '100000',
        interestRate: '8',
        tenureMonths: 12,
        emiAmount: '9000',
        disbursementDate: new Date(),
        firstEmiDate: new Date(),
      },
    });

    await mkdir(join(uploadDir, 'documents', `user_${userId}`), { recursive: true });
    await writeFile(join(uploadDir, 'documents', `user_${userId}`, 'doc.pdf'), 'x');
    return { portfolioId: portfolio.id, familyId: family.id };
  });
}

let target: { id: string };
let shadow: { id: string };
let bystander: { id: string };
let blockedOwner: { id: string };

beforeAll(async () => {
  seedPasswordHash = await hashPassword(PASSWORD);
  target = await makeUser('target');
  bystander = await makeUser('bystander');
  shadow = await makeUser('shadow', { isShadowClient: true });
  blockedOwner = await makeUser('owner');

  await seedEverything(target.id);
  await seedEverything(bystander.id);
  await sys(async () => {
    // A CA's shadow client, with books of its own.
    await prisma.client.create({
      data: {
        advisorId: target.id,
        name: 'Shadow client',
        kind: 'SHADOW',
        userId: shadow.id,
      } as never,
    });
    await prisma.portfolio.create({ data: { userId: shadow.id, name: 'Client books' } });
    // The target also belongs to the bystander's family, which must survive
    // the target's purge.
    const bystanderFamily = await prisma.family.findFirstOrThrow({
      where: { createdById: bystander.id },
    });
    await prisma.familyMember.create({
      data: { familyId: bystanderFamily.id, userId: target.id } as never,
    });

    // An owner whose family has another member — deletion must be refused.
    const fam = await prisma.family.create({
      data: { name: `Busy ${tag}`, createdById: blockedOwner.id },
    });
    await prisma.familyMember.create({
      data: { familyId: fam.id, userId: blockedOwner.id } as never,
    });
    await prisma.familyMember.create({ data: { familyId: fam.id, userId: bystander.id } as never });
  });
}, 120_000);

afterAll(async () => {
  await sys(async () => {
    for (const u of [bystander, blockedOwner, target, shadow]) {
      if (!u) continue;
      if (await prisma.user.findUnique({ where: { id: u.id } }))
        await deletion.purgeUser(u.id).catch(() => undefined);
    }
  });
  await rm(uploadDir, { recursive: true, force: true });
}, 120_000);

describe('account deletion', () => {
  it('requires the typed confirmation and the right password', async () => {
    await expect(
      sys(() =>
        deletion.requestAccountDeletion(target.id, { confirmText: 'delete', password: PASSWORD }),
      ),
    ).rejects.toThrow(/type DELETE/i);
    await expect(
      sys(() =>
        deletion.requestAccountDeletion(target.id, { confirmText: 'DELETE', password: 'wrong' }),
      ),
    ).rejects.toThrow(/incorrect password/i);
  });

  it('refuses while the user owns a family with other members', async () => {
    await expect(
      sys(() =>
        deletion.requestAccountDeletion(blockedOwner.id, {
          confirmText: 'DELETE',
          password: PASSWORD,
        }),
      ),
    ).rejects.toThrow(/other members/i);
  });

  it('schedules deletion, then blocks sign-in until restore is asked for', async () => {
    const { scheduledFor } = await sys(() =>
      deletion.requestAccountDeletion(target.id, { confirmText: 'DELETE', password: PASSWORD }),
    );
    const days = (Date.parse(scheduledFor) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);

    const email = `del-target-${tag}@example.com`;
    await expect(sys(() => loginUser(email, PASSWORD))).rejects.toMatchObject({
      code: 'ACCOUNT_PENDING_DELETION',
    });
    // A wrong password must not reveal the pending state.
    await expect(sys(() => loginUser(email, 'wrong'))).rejects.toThrow(/invalid credentials/i);

    await sys(() => loginUser(email, PASSWORD, { restore: true }));
    const restored = await sys(() => prisma.user.findUniqueOrThrow({ where: { id: target.id } }));
    expect(restored.deletionScheduledFor).toBeNull();
  });

  it('purges a due account completely and leaves everyone else untouched', async () => {
    await sys(() =>
      deletion.requestAccountDeletion(target.id, { confirmText: 'DELETE', password: PASSWORD }),
    );
    // Not yet due: nothing happens.
    const early = await deletion.purgeDueAccounts(new Date());
    expect(await sys(() => prisma.user.findUnique({ where: { id: target.id } }))).not.toBeNull();
    expect(early.failed).toBe(0);

    const outcome = await deletion.purgeDueAccounts(new Date(Date.now() + 31 * 86_400_000));
    expect(outcome.failed).toBe(0);

    await sys(async () => {
      expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
      expect(await prisma.user.findUnique({ where: { id: shadow.id } })).toBeNull();
      expect(
        await prisma.portfolio.count({ where: { userId: { in: [target.id, shadow.id] } } }),
      ).toBe(0);
      expect(await prisma.voucherEntry.count({ where: { voucher: { userId: target.id } } })).toBe(
        0,
      );
      expect(await prisma.family.count({ where: { createdById: target.id } })).toBe(0);

      // The bystander keeps everything, including their family.
      expect(await prisma.user.findUnique({ where: { id: bystander.id } })).not.toBeNull();
      expect(await prisma.portfolio.count({ where: { userId: bystander.id } })).toBe(1);
      expect(
        await prisma.voucherEntry.count({ where: { voucher: { userId: bystander.id } } }),
      ).toBe(1);
      expect(await prisma.family.count({ where: { createdById: bystander.id } })).toBe(1);
      expect(await prisma.providentFundAccount.count({ where: { userId: bystander.id } })).toBe(1);
    });

    expect(await exists(join(uploadDir, 'documents', `user_${target.id}`))).toBe(false);
    expect(await exists(join(uploadDir, 'transaction_photos', `${target.id}.jpg`))).toBe(false);
    expect(await exists(join(uploadDir, 'documents', `user_${bystander.id}`, 'doc.pdf'))).toBe(
      true,
    );
    expect(await exists(join(uploadDir, 'transaction_photos', `${bystander.id}.jpg`))).toBe(true);
  }, 120_000);
});
