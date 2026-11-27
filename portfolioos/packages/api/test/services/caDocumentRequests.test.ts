import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import { inviteProfessional, acceptProfessionalInvitation } from '../../src/services/ca/caAccess.service.js';
import {
  requestDocument,
  listClientRequests,
  closeRequest,
  listMyDocumentRequests,
  answerWithUpload,
  answerNotApplicable,
} from '../../src/services/ca/caDocumentRequests.service.js';

/**
 * The CA asks a client for a document; the client uploads it into their own
 * vault or says it does not apply; the CA accepts or cancels.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function person(label: string): Promise<TestScope & { email: string }> {
  const scope = await createTestScope(label);
  cleanups.push(scope.cleanup);
  const user = await runAsSystem(() =>
    prisma.user.findUniqueOrThrow({ where: { id: scope.userId }, select: { email: true } }),
  );
  return { ...scope, email: user.email };
}

async function grant(client: TestScope, ca: TestScope & { email: string }): Promise<string> {
  const { client: row, token } = await runAsUser(client.userId, () =>
    inviteProfessional(client.userId, { name: 'Our CA', email: ca.email }),
  );
  cleanups.push(async () => {
    await runAsSystem(async () => {
      await prisma.documentRequest.deleteMany({ where: { clientId: row.id } });
      await prisma.caAuditLog.deleteMany({ where: { clientId: row.id } });
      await prisma.client.deleteMany({ where: { id: row.id } });
    });
  });
  await runAsUser(ca.userId, () => acceptProfessionalInvitation(ca.userId, ca.email, token));
  return row.id;
}

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

describe('document requests', () => {
  it('CA asks, client is told, uploads into their vault, CA accepts', async () => {
    const ca = await person('cdr-ca');
    const asha = await person('cdr-asha');
    const clientId = await grant(asha, ca);

    const req = await runAsUser(ca.userId, () =>
      requestDocument(ca.userId, clientId, { title: 'Form 16', financialYear: '2025-26', dueDate: '2026-06-15' }),
    );

    // The client sees it, with an alert in their inbox.
    const mine = await runAsUser(asha.userId, () => listMyDocumentRequests(asha.userId));
    expect(mine.map((r) => [r.title, r.status])).toEqual([['Form 16', 'OPEN']]);
    const alert = await runAsSystem(() =>
      prisma.alert.findFirst({ where: { userId: asha.userId, metadata: { path: ['documentRequestId'], equals: req.id } } }),
    );
    expect(alert?.isActive).toBe(true);

    await runAsUser(asha.userId, () =>
      answerWithUpload(asha.userId, req.id, { buffer: PDF, fileName: 'form16.pdf', mimeType: 'application/pdf' }),
    );
    const afterUpload = await runAsUser(ca.userId, () => listClientRequests(ca.userId, clientId));
    expect(afterUpload[0]).toMatchObject({ status: 'UPLOADED' });
    const docId = afterUpload[0]!.documentId!;
    const doc = await runAsSystem(() => prisma.document.findUniqueOrThrow({ where: { id: docId } }));
    expect(doc.userId).toBe(asha.userId); // the client's own vault
    expect(
      (await runAsSystem(() => prisma.alert.findUniqueOrThrow({ where: { id: alert!.id } }))).isActive,
    ).toBe(false);

    await runAsUser(ca.userId, () => closeRequest(ca.userId, clientId, req.id, 'ACCEPTED'));
    const closed = await runAsUser(ca.userId, () => listClientRequests(ca.userId, clientId));
    expect(closed[0]).toMatchObject({ status: 'ACCEPTED' });

    const trail = await runAsSystem(() =>
      prisma.caAuditLog.findMany({ where: { clientId, action: { in: ['DOCUMENT_REQUESTED', 'DOCUMENT_REQUEST_CLOSED'] } } }),
    );
    expect(trail).toHaveLength(2);
  });

  it('the client can say it does not apply, with a reason', async () => {
    const ca = await person('cdr-na-ca');
    const asha = await person('cdr-na-asha');
    const clientId = await grant(asha, ca);
    const req = await runAsUser(ca.userId, () => requestDocument(ca.userId, clientId, { title: 'Rent receipts' }));
    await runAsUser(asha.userId, () => answerNotApplicable(asha.userId, req.id, 'I do not pay rent.'));
    const rows = await runAsUser(ca.userId, () => listClientRequests(ca.userId, clientId));
    expect(rows[0]).toMatchObject({ status: 'NOT_APPLICABLE', clientNote: 'I do not pay rent.' });
  });

  it('only the client answers and only the CA asks or closes', async () => {
    const ca = await person('cdr-who-ca');
    const other = await person('cdr-who-other');
    const asha = await person('cdr-who-asha');
    const clientId = await grant(asha, ca);
    const req = await runAsUser(ca.userId, () => requestDocument(ca.userId, clientId, { title: 'Form 16' }));

    await expect(runAsUser(ca.userId, () => answerNotApplicable(ca.userId, req.id, 'x'))).rejects.toThrow();
    await expect(runAsUser(asha.userId, () => closeRequest(asha.userId, clientId, req.id, 'ACCEPTED'))).rejects.toThrow();
    await expect(runAsUser(asha.userId, () => requestDocument(asha.userId, clientId, { title: 'x' }))).rejects.toThrow();
    await expect(runAsUser(other.userId, () => listClientRequests(other.userId, clientId))).rejects.toThrow();
    expect(await runAsUser(other.userId, () => listMyDocumentRequests(other.userId))).toHaveLength(0);
  });

  it('a cancelled request can no longer be answered', async () => {
    const ca = await person('cdr-cancel-ca');
    const asha = await person('cdr-cancel-asha');
    const clientId = await grant(asha, ca);
    const req = await runAsUser(ca.userId, () => requestDocument(ca.userId, clientId, { title: 'Form 16' }));
    await runAsUser(ca.userId, () => closeRequest(ca.userId, clientId, req.id, 'CANCELLED'));
    await expect(
      runAsUser(asha.userId, () =>
        answerWithUpload(asha.userId, req.id, { buffer: PDF, fileName: 'f.pdf', mimeType: 'application/pdf' }),
      ),
    ).rejects.toThrow();
    expect(await runAsUser(asha.userId, () => listMyDocumentRequests(asha.userId))).toHaveLength(0);
  });
});
