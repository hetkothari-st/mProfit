import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type Request, type RequestHandler } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { uploadImportFile } from '../../src/middleware/upload.js';
import { uploadDocumentFile, uploadSorterFiles } from '../../src/middleware/documentUpload.js';
import { AppError } from '../../src/lib/errors.js';
import { env } from '../../src/config/env.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';

// Data import / email ingestion defects (fix/data-in).

// The reprocess handler runs the parser inline; swap it for a no-op so the
// job row keeps whatever status the test seeded (a wrong password leaves a
// locked file NEEDS_PASSWORD).
vi.mock('../../src/services/imports/import.service.js', async (orig) => {
  const actual = await orig<typeof import('../../src/services/imports/import.service.js')>();
  return { ...actual, processImportJob: vi.fn(async () => ({ ok: true })) };
});

// exchangeGmailCode talks to Google; fake a token response with no
// refresh_token (what Google sends when the user had already granted access).
vi.mock('googleapis', async (orig) => {
  const actual = await orig<typeof import('googleapis')>();
  class FakeOAuth2 {
    async getToken() {
      return { tokens: { access_token: 'a' } };
    }
    setCredentials() {}
    on() {}
  }
  return {
    ...actual,
    google: { ...actual.google, auth: { ...actual.google.auth, OAuth2: FakeOAuth2 } },
  };
});

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

// ── 3. A wrong password must not look accepted ──────────────────────────────

describe('reprocess with a password that does not unlock the file', () => {
  let scope: TestScope;
  beforeAll(async () => {
    scope = await createTestScope('datain-reprocess');
  });
  afterAll(async () => {
    await prisma.importJob.deleteMany({ where: { userId: scope.userId } });
    await scope.cleanup();
  });

  it('answers 422 FILE_LOCKED (not 200) while the job is still NEEDS_PASSWORD', async () => {
    const { reprocess } = await import('../../src/controllers/imports.controller.js');
    const job = await scope.runAs(() =>
      prisma.importJob.create({
        data: {
          userId: scope.userId,
          type: 'MF_CAS_PDF',
          status: 'NEEDS_PASSWORD',
          fileName: 'cas.pdf',
          filePath: '/nonexistent/cas.pdf',
        },
      }),
    );
    const req = {
      user: { id: scope.userId },
      params: { id: job.id },
      body: { password: 'definitely-wrong', save: true },
    } as unknown as Request;
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };

    const err = await scope
      .runAs(() => reprocess(req, res as never))
      .then(() => null, (e: unknown) => e);

    expect(res.json).not.toHaveBeenCalled();
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(422);
    expect((err as AppError).code).toBe('FILE_LOCKED');

    // And the wrong password was not remembered.
    const user = await scope.runAs(() =>
      prisma.user.findUniqueOrThrow({ where: { id: scope.userId }, select: { savedFilePasswordsEnc: true } }),
    );
    expect(user.savedFilePasswordsEnc ?? null).toBeNull();
  });
});

// ── 5. Plain Errors became 500 "Internal server error" ──────────────────────

describe('unsupported upload types are a 400 that names the accepted types', () => {
  let server: Server;
  let base: string;

  beforeAll(() => {
    const fakeUser: RequestHandler = (req, _res, next) => {
      (req as unknown as { user: { id: string } }).user = { id: 'u1' };
      next();
    };
    const app = express();
    app.post('/import', fakeUser, uploadImportFile, (_req, res) => {
      res.json({ ok: true });
    });
    app.post('/documents', fakeUser, uploadDocumentFile, (_req, res) => {
      res.json({ ok: true });
    });
    app.post('/sorter', fakeUser, uploadSorterFiles, (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server.close();
  });

  async function send(path: string, field: string) {
    const fd = new FormData();
    fd.append(field, new Blob([Buffer.from('MZ')]), 'setup.exe');
    const r = await fetch(`${base}${path}`, { method: 'POST', body: fd });
    return { status: r.status, body: (await r.json()) as { error: string; code?: string } };
  }

  it('Import page', async () => {
    const { status, body } = await send('/import', 'file');
    expect(status).toBe(400);
    expect(body.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(body.error).toMatch(/\.exe/);
    expect(body.error).toMatch(/PDF/);
  });

  it('Documents vault', async () => {
    const { status, body } = await send('/documents', 'file');
    expect(status).toBe(400);
    expect(body.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(body.error).toMatch(/\.docx/);
  });

  it('Documents sorter', async () => {
    const { status, body } = await send('/sorter', 'files');
    expect(status).toBe(400);
    expect(body.code).toBe('UNSUPPORTED_FILE_TYPE');
  });
});

describe('Gmail without a refresh token asks the user to reconnect (4xx, not 500)', () => {
  let scope: TestScope;
  const saved = {
    id: env.GOOGLE_OAUTH_CLIENT_ID,
    secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirect: env.GOOGLE_OAUTH_REDIRECT_URL,
  };
  beforeAll(async () => {
    scope = await createTestScope('datain-gmail');
    Object.assign(env, {
      GOOGLE_OAUTH_CLIENT_ID: 'cid',
      GOOGLE_OAUTH_CLIENT_SECRET: 'csecret',
      GOOGLE_OAUTH_REDIRECT_URL: 'http://localhost/cb',
    });
  });
  afterAll(async () => {
    Object.assign(env, {
      GOOGLE_OAUTH_CLIENT_ID: saved.id,
      GOOGLE_OAUTH_CLIENT_SECRET: saved.secret,
      GOOGLE_OAUTH_REDIRECT_URL: saved.redirect,
    });
    await prisma.mailboxAccount.deleteMany({ where: { userId: scope.userId } });
    await scope.cleanup();
  });

  it('a stored account with no refresh token', async () => {
    const { getAuthorizedClientFor } = await import('../../src/ingestion/gmail/gmail.connector.js');
    const acc = await scope.runAs(() =>
      prisma.mailboxAccount.create({
        data: { userId: scope.userId, provider: 'GMAIL_OAUTH', googleEmail: 'x@gmail.com', isActive: true },
      }),
    );
    const err = await scope.runAs(() => getAuthorizedClientFor(acc.id)).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBeGreaterThanOrEqual(400);
    expect((err as AppError).statusCode).toBeLessThan(500);
    expect((err as AppError).message).toMatch(/reconnect/i);
  });

  it('Google returning no refresh token on connect', async () => {
    const { exchangeGmailCode } = await import('../../src/ingestion/gmail/gmail.connector.js');
    const err = await scope.runAs(() => exchangeGmailCode(scope.userId, 'code')).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBeGreaterThanOrEqual(400);
    expect((err as AppError).statusCode).toBeLessThan(500);
    expect((err as AppError).message).toMatch(/reconnect|connect Gmail again/i);
  });
});

// ── 6. Copy that contradicted the code ───────────────────────────────────────

describe('server-provided copy matches what the app does', () => {
  function fakeRes() {
    return { json: vi.fn(), status: vi.fn().mockReturnThis() };
  }

  it('Gmail config exposes the real poll interval', async () => {
    const { getGmailConfig } = await import('../../src/controllers/gmail.controller.js');
    const res = fakeRes();
    await getGmailConfig({} as Request, res as never);
    const body = res.json.mock.calls[0]![0] as { data: { pollIntervalMin: number } };
    expect(body.data.pollIntervalMin).toBe(env.MAILBOX_POLL_INTERVAL_MIN);
  });

  it('CAS next steps mention neither IMAP nor a non-existent "Imports → CAS PDF" screen', async () => {
    const { buildCasRequest } = await import('../../src/controllers/cas.controller.js');
    const res = fakeRes();
    await buildCasRequest(
      { user: { id: 'u1' }, body: { provider: 'CAMS', email: 'a@b.com', statementType: 'DETAILED' } } as unknown as Request,
      res as never,
    );
    const body = res.json.mock.calls[0]![0] as { data: { nextSteps: string[] } };
    const text = body.data.nextSteps.join('\n');
    expect(text).not.toMatch(/IMAP/);
    expect(text).not.toMatch(/Imports → CAS PDF/);
    expect(text).toMatch(/Gmail/);
  });
});
