/**
 * The account holder answers a CA's document request over real HTTP: multer,
 * the context rebind after it, RLS on the request row, the byte sniff and the
 * stored type. Calling the service directly would skip every one of those.
 */
import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import { professionalAccessRouter } from '../../src/routes/ca.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/auth/jwt.service.js';
import { inviteProfessional, acceptProfessionalInvitation } from '../../src/services/ca/caAccess.service.js';
import { requestDocument } from '../../src/services/ca/caDocumentRequests.service.js';

if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '')) {
  throw new Error('Refusing to run: DATABASE_URL must point at a local database.');
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

let server: Server;
let base: string;
beforeAll(() => {
  const app = express();
  app.use(express.json());
  app.use('/api/me/professional-access', professionalAccessRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

async function person(label: string): Promise<TestScope & { email: string }> {
  const scope = await createTestScope(label);
  cleanups.push(scope.cleanup);
  const user = await runAsSystem(() =>
    prisma.user.findUniqueOrThrow({ where: { id: scope.userId }, select: { email: true } }),
  );
  return { ...scope, email: user.email };
}

const tokenFor = (p: TestScope & { email: string }) =>
  signAccessToken({ sub: p.userId, email: p.email, role: 'INVESTOR', plan: 'FREE' }).token;

async function upload(token: string, requestId: string, bytes: Buffer, name: string) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'text/html' }), name);
  return fetch(`${base}/api/me/professional-access/document-requests/${requestId}/upload`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
}

describe('POST /api/me/professional-access/document-requests/:id/upload', () => {
  it('stores the file in the account holder’s vault, typed by its bytes', async () => {
    const ca = await person('dru-ca');
    const asha = await person('dru-asha');
    const { client, token } = await runAsUser(asha.userId, () =>
      inviteProfessional(asha.userId, { name: 'Our CA', email: ca.email }),
    );
    cleanups.push(async () => {
      await runAsSystem(async () => {
        await prisma.documentRequest.deleteMany({ where: { clientId: client.id } });
        await prisma.caAuditLog.deleteMany({ where: { clientId: client.id } });
        await prisma.client.deleteMany({ where: { id: client.id } });
      });
    });
    await runAsUser(ca.userId, () => acceptProfessionalInvitation(ca.userId, ca.email, token));
    const req = await runAsUser(ca.userId, () => requestDocument(ca.userId, client.id, { title: 'Form 16' }));

    // The CA cannot answer their own request.
    const byCa = await upload(tokenFor(ca), req.id, Buffer.from('%PDF-1.4\n%%EOF\n'), 'f.pdf');
    expect(byCa.status).toBe(404);

    // The browser claims text/html; the bytes say PDF, and PDF is what is stored.
    const res = await upload(tokenFor(asha), req.id, Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n'), 'form16.pdf');
    expect(res.status).toBe(204);
    const row = await runAsSystem(() => prisma.documentRequest.findUniqueOrThrow({ where: { id: req.id } }));
    expect(row.status).toBe('UPLOADED');
    const doc = await runAsSystem(() => prisma.document.findUniqueOrThrow({ where: { id: row.documentId! } }));
    expect(doc.userId).toBe(asha.userId);
    expect(doc.mimeType).toBe('application/pdf');
  });
});
