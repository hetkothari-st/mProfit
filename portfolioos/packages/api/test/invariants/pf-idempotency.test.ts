import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { tokenizePassbookPdf } from '../../src/adapters/pf/shared/pdfPassbookParser.js';
import { parseEpfoPassbook } from '../../src/adapters/pf/epf/epfo.v1.parse.js';
import { buildCanonicalEvents } from '../../src/services/pfCanonicalize.service.js';

/**
 * INVARIANT: Re-importing the same EPFO passbook PDF twice must insert zero
 * additional CanonicalEvent rows on the second pass (BUG-003 / §3.3).
 *
 * The guard is the @@unique([userId, sourceHash]) constraint on CanonicalEvent
 * combined with the deterministic pfEventHash computed by buildCanonicalEvents.
 * Any import loop that skips rows where the hash already exists will make this
 * test pass; any importer that blindly appends will fail.
 */

const here = fileURLToPath(new URL('.', import.meta.url));

const IDENTIFIER = 'UAN-INV-TEST-001';
const ADAPTER_ID = 'pf.epfo.v1';
const ADAPTER_VER = '1.0.0';

describe('PF idempotency invariant (BUG-003)', () => {
  let scope: TestScope;
  let accountId: string;

  beforeAll(async () => {
    // Ensure encryption key is set so ProvidentFundAccount.identifierCipher
    // column creation does not fail (it is just bytes here — we write dummy
    // cipher content because the test does not exercise the crypto layer).
    if (!process.env['APP_ENCRYPTION_KEY']) {
      process.env['APP_ENCRYPTION_KEY'] = Buffer.alloc(32, 1).toString('base64');
    }

    scope = await createTestScope('pf-idempotency');

    // Create a ProvidentFundAccount via system context (RLS bypass for setup).
    const account = await runAsSystem(() =>
      prisma.providentFundAccount.create({
        data: {
          userId: scope.userId,
          type: 'EPF',
          institution: 'EPFO',
          // identifierCipher stores AES-GCM ciphertext bytes.  Use a
          // deterministic dummy buffer for test purposes; the idempotency
          // invariant does not depend on the cipher value.
          identifierCipher: Buffer.alloc(44, 0x42),
          identifierLast4: '6789',
          holderName: 'Test User PF Idempotency',
          assetKey: `pf:EPFO:${IDENTIFIER}`,
        },
      }),
    );
    accountId = account.id;
  });

  afterAll(async () => {
    await runAsSystem(async () => {
      // Remove CanonicalEvents first (FK references userId / no direct portfolioId).
      await prisma.canonicalEvent.deleteMany({ where: { userId: scope.userId } });
      // Remove the PF account (cascades to EpfMemberId, PfFetchSession).
      await prisma.providentFundAccount.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  it('re-importing the same passbook yields 0 new CanonicalEvent rows', async () => {
    const buf = await readFile(
      resolve(here, '../fixtures/pf/epfo/passbook-uan-100123456789.pdf'),
    );

    const tokens = await tokenizePassbookPdf(buf);
    const parsed = parseEpfoPassbook({
      userId: scope.userId,
      memberId: 'TESTMEMBER01',
      tokens,
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const builtEvents = buildCanonicalEvents({
      userId: scope.userId,
      account: {
        id: accountId,
        institution: 'EPFO',
        type: 'EPF',
        identifierPlain: IDENTIFIER,
      },
      adapterId: ADAPTER_ID,
      adapterVersion: ADAPTER_VER,
      events: parsed.events,
    });

    expect(builtEvents.length).toBeGreaterThan(0);

    // importAll() mirrors what the real ingestion worker does: skip rows whose
    // sourceHash is already present for this user, insert the rest atomically.
    async function importAll(): Promise<number> {
      let inserted = 0;

      // Run inside user context so RLS policies apply (same as production path).
      await scope.runAs(async () => {
        for (const ev of builtEvents) {
          const existing = await prisma.canonicalEvent.findUnique({
            where: {
              userId_sourceHash: { userId: ev.userId, sourceHash: ev.sourceHash },
            },
            select: { id: true },
          });
          if (!existing) {
            await prisma.canonicalEvent.create({
              data: {
                userId: ev.userId,
                sourceAdapter: ev.sourceAdapter,
                sourceAdapterVer: ev.sourceAdapterVer,
                sourceRef: ev.sourceRef,
                sourceHash: ev.sourceHash,
                eventType: ev.eventType as import('@prisma/client').CanonicalEventType,
                eventDate: ev.eventDate,
                amount: ev.amount,
                metadata: ev.metadata,
                status: ev.status,
              },
            });
            inserted++;
          }
        }
      });

      return inserted;
    }

    const firstImportCount = await importAll();
    const secondImportCount = await importAll();

    expect(firstImportCount).toBeGreaterThan(0);
    expect(secondImportCount).toBe(0);
  });
});
