import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';

/**
 * The OnlyOffice save callback fetches `body.url` and stores the bytes as the
 * user's document, which the user can then download. The callback URL's token
 * is handed to the browser inside the editor config, so a user could call it
 * themselves: an unverified body, or an unchecked URL, made the API fetch and
 * hand back any internal address (SSRF with read-back).
 */

const svc = vi.hoisted(() => ({ replaceDocumentBytes: vi.fn() }));
vi.mock('../services/document.service.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  replaceDocumentBytes: svc.replaceDocumentBytes,
}));
vi.mock('../lib/prisma.js', () => ({ prisma: {} }));

const { onlyofficeCallback } = await import('./document.controller.js');
const { env } = await import('../config/env.js');

const SECRET = env.ONLYOFFICE_JWT_SECRET;
const DOC = 'doc1';
const callbackToken = jwt.sign({ sub: 'oo-doc-callback', documentId: DOC, userId: 'u1' }, SECRET, {
  algorithm: 'HS256',
});

function call(body: unknown, headers: Record<string, string> = {}) {
  const req = {
    params: { id: DOC },
    query: { token: callbackToken },
    headers,
    header: (n: string) => headers[n.toLowerCase()],
    body,
  };
  const res = {
    statusCode: 200,
    payload: undefined as unknown,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(p: unknown) {
      this.payload = p;
      return this;
    },
  };
  return onlyofficeCallback(req as never, res as never).then(() => res);
}

const ooSigned = (payload: object) => jwt.sign(payload, SECRET, { algorithm: 'HS256' });

describe('OnlyOffice save callback', () => {
  const fetchSpy = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy.mockResolvedValue(new Response('saved-bytes'));
    vi.stubGlobal('fetch', fetchSpy);
    env.ONLYOFFICE_JWT_ENABLED = 'true';
  });
  afterEach(() => vi.unstubAllGlobals());

  it('refuses an unsigned body instead of trusting it', async () => {
    const res = await call({ status: 2, url: 'http://postgres.railway.internal:5432/' });
    expect(res.statusCode).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses a signed body whose URL is not on the DocumentServer', async () => {
    const token = ooSigned({ payload: { status: 2, url: 'http://169.254.169.254/latest/meta-data/' } });
    const res = await call({ token });
    expect(res.payload).toEqual({ error: 1 });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(svc.replaceDocumentBytes).not.toHaveBeenCalled();
  });

  it('saves a signed callback from the DocumentServer (header token, OnlyOffice default)', async () => {
    const url = `${new URL(env.ONLYOFFICE_INTERNAL_URL).origin}/cache/files/doc1/output.docx`;
    const res = await call(
      { status: 2, url },
      { authorization: `Bearer ${ooSigned({ payload: { status: 2, url } })}` },
    );
    expect(res.payload).toEqual({ error: 0 });
    expect(fetchSpy).toHaveBeenCalledWith(url, expect.objectContaining({ redirect: 'error' }));
    expect(svc.replaceDocumentBytes).toHaveBeenCalledWith('u1', DOC, expect.any(Buffer));
  });
});
