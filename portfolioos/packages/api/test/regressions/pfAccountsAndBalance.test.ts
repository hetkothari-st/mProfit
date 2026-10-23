import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Request } from 'express';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { fakeResponse } from '../helpers/fakeResponse.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createPfAccount } from '../../src/services/pf/pfAccounts.service.js';
import { listAccountsHandler, createAccountHandler } from '../../src/controllers/pf.controller.js';
import { buildCanonicalEvents } from '../../src/services/pf/pfCanonicalize.service.js';
import { parseEpfoPassbook } from '../../src/ingestion/pf/epf/epfo.v1.parse.js';
import { parseSbiPpfPassbook } from '../../src/ingestion/pf/ppf/sbi.v1.parse.js';
import {
  closingBalanceFromEvents,
  refreshPfAccountBalance,
} from '../../src/services/pf/pfBalance.service.js';

let scope: TestScope;

beforeAll(async () => {
  scope = await createTestScope('pf-money-misc');
});

afterAll(async () => {
  await runAsSystem(async () => {
    await prisma.canonicalEvent.deleteMany({ where: { userId: scope.userId } });
    await prisma.providentFundAccount.deleteMany({ where: { userId: scope.userId } });
  });
  await scope.cleanup();
});

const FORBIDDEN = ['identifierCipher', 'storedCredentials', 'credentialsKeyId', 'memberIdCipher'];

function leakedKeys(value: unknown): string[] {
  const json = JSON.stringify(value);
  return FORBIDDEN.filter((k) => json.includes(`"${k}"`));
}

describe('GET/POST /epfppf/accounts never send ciphertext or credential blobs', () => {
  it('list returns display fields only', async () => {
    await scope.runAs(async () => {
      const a = await createPfAccount({
        userId: scope.userId,
        type: 'EPF',
        institution: 'EPFO',
        identifier: '100123456789',
        holderName: 'TEST USER',
      });
      await prisma.providentFundAccount.update({
        where: { id: a.id },
        data: { storedCredentials: { blob: 'ciphertext-here' }, credentialsKeyId: 'k1' },
      });

      const cap = fakeResponse();
      await listAccountsHandler({ user: { id: scope.userId } } as unknown as Request, cap.res);
      const body = cap.json() as { data: Array<Record<string, unknown>> };
      expect(leakedKeys(body)).toEqual([]);
      const row = body.data.find((r) => r['id'] === a.id)!;
      expect(row['identifierLast4']).toBe('6789');
      expect(row['hasStoredCredentials']).toBe(true);
    });
  });

  it('create returns display fields only', async () => {
    await scope.runAs(async () => {
      const cap = fakeResponse();
      await createAccountHandler(
        {
          user: { id: scope.userId },
          body: { type: 'PPF', institution: 'SBI', identifier: '12345678901', holderName: 'TEST USER' },
        } as unknown as Request,
        cap.res,
      );
      expect(leakedKeys(cap.json())).toEqual([]);
    });
  });
});

describe('passbooks set the PF account balance', () => {
  const EPFO_LINES = [
    'Apr-2024 01-04-2024 OB INT. UPDATED OPENING BALANCE 100000.00 100000.00',
    'Apr-2024 15-04-2024 CR EMPLOYEE SHARE 5000.00 105000.00',
    'Apr-2024 15-04-2024 CR EMPLOYER SHARE 1500.00 106500.00',
  ];

  it('parsers carry the running balance of each passbook row', () => {
    const epf = parseEpfoPassbook({
      userId: 'u',
      memberId: 'MEMBER0001',
      tokens: { pageCount: 1, rawText: EPFO_LINES.join('\n'), lines: EPFO_LINES },
    });
    expect(epf.ok && epf.events.map((e) => e.balance)).toEqual(['100000.00', '105000.00', '106500.00']);

    const ppfLines = ['01-04-2024 PPF DEPOSIT 50000.00 250000.00'];
    const ppf = parseSbiPpfPassbook({
      userId: 'u',
      accountIdentifier: '12345678901',
      tokens: { pageCount: 1, rawText: ppfLines[0]!, lines: ppfLines },
    });
    expect(ppf.ok && ppf.events[0]!.balance).toBe('250000.00');
  });

  it('canonical events keep the balance without changing the idempotency hash', () => {
    const base = {
      userId: 'u1',
      account: { id: 'a1', institution: 'EPFO', type: 'EPF', identifierPlain: 'UAN1' },
      adapterId: 'pf.epfo.v1',
      adapterVersion: '1.0.0',
    };
    const ev = { type: 'PF_EMPLOYEE_CONTRIBUTION', eventDate: '2024-04-15', amount: '5000.00', sequence: 0 };
    const [withBal] = buildCanonicalEvents({ ...base, events: [{ ...ev, balance: '105000.00' }] });
    const [without] = buildCanonicalEvents({ ...base, events: [ev] });
    expect(withBal!.metadata['balance']).toBe('105000.00');
    expect(withBal!.sourceHash).toBe(without!.sourceHash);
  });

  it('closing balance is the latest row per member, summed — not a sum of amounts', () => {
    const t = new Date('2026-01-01T00:00:00Z');
    const ev = (date: string, member: string, balance: string | null, position: number) => ({
      eventDate: new Date(`${date}T00:00:00Z`),
      createdAt: t,
      metadata: { memberIdLast4: member, balance, position },
    });
    const total = closingBalanceFromEvents([
      ev('2023-04-01', '0001', '80000.00', 0), // a prior year's opening balance row
      ev('2024-04-01', '0001', '100000.00', 1),
      ev('2024-04-15', '0001', '105000.00', 2),
      ev('2024-04-15', '0001', '106500.00', 3),
      ev('2022-06-01', '0002', '20000.00', 0), // an older employer's member ID
    ]);
    expect(total?.toFixed(2)).toBe('126500.00');
    expect(closingBalanceFromEvents([ev('2024-04-15', '0001', null, 0)])).toBeNull();
  });

  it('an ingested passbook writes ProvidentFundAccount.currentBalance', async () => {
    await scope.runAs(async () => {
      const account = await createPfAccount({
        userId: scope.userId,
        type: 'EPF',
        institution: 'EPFO',
        identifier: '100999888777',
        holderName: 'TEST USER',
      });
      const parsed = parseEpfoPassbook({
        userId: scope.userId,
        memberId: 'MEMBER0001',
        tokens: { pageCount: 1, rawText: EPFO_LINES.join('\n'), lines: EPFO_LINES },
      });
      if (!parsed.ok) throw new Error(parsed.error);
      const built = buildCanonicalEvents({
        userId: scope.userId,
        account: { id: account.id, institution: 'EPFO', type: 'EPF', identifierPlain: '100999888777' },
        adapterId: 'pf.epfo.manual.v1',
        adapterVersion: '1.0.0',
        events: parsed.events,
      });
      for (const e of built) {
        await prisma.canonicalEvent.create({ data: { ...e, metadata: e.metadata as object } });
      }
      await refreshPfAccountBalance(scope.userId, account.id);
      const after = await prisma.providentFundAccount.findUniqueOrThrow({ where: { id: account.id } });
      expect(after.currentBalance?.toFixed(2)).toBe('106500.00');
    });
  });
});
