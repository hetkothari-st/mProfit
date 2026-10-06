import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mountFinfactorRoutes } from './finfactor.routes.js';
import { errorHandler } from '../middleware/errorHandler.js';

/**
 * Finvu's webhook callbacks carry an HMAC signature, not a user session. They
 * must reach the webhook handler (which verifies the signature) rather than be
 * stopped by the authenticated router mounted on the parent path.
 */
describe('Finfactor route mounting', () => {
  let server: http.Server;
  let base: string;

  beforeAll(async () => {
    const app = express();
    app.use(
      express.json({
        verify: (req, _res, buf) => {
          (req as http.IncomingMessage & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
        },
      }),
    );
    mountFinfactorRoutes(app);
    app.use(errorHandler);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((r) => server.once('listening', () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('a webhook reaches its signature check, not the login check', async () => {
    const res = await fetch(`${base}/api/integrations/finfactor/webhook/consent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-signature': 'bad' },
      body: JSON.stringify({ consentHandle: 'h1', status: 'ACTIVE' }),
    });
    const body = await res.text();
    expect(body).toContain('invalid_signature');
  });

  it('the rest of the integration still requires a signed-in user', async () => {
    const res = await fetch(`${base}/api/integrations/finfactor/consent`);
    expect(res.status).toBe(401);
  });
});
