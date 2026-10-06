import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { request } from 'undici';
import { followRedirects } from './httpDispatcher.js';

/**
 * On Node 22+ the first fetch() installs Node's bundled undici v7 as the
 * global dispatcher, which rejects `maxRedirections`; every price feed using
 * it then failed. The shared dispatcher must follow redirects regardless.
 */
describe('followRedirects dispatcher', () => {
  let server: http.Server;
  let base: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/old') {
        res.writeHead(302, { location: '/new' }).end();
      } else {
        res.writeHead(200, { 'content-type': 'text/plain' }).end('landed');
      }
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('follows a redirect even after native fetch has installed its dispatcher', async () => {
    await fetch(`${base}/new`).then((r) => r.text());
    const res = await request(`${base}/old`, { dispatcher: followRedirects });
    expect(res.statusCode).toBe(200);
    expect(await res.body.text()).toBe('landed');
  });
});
