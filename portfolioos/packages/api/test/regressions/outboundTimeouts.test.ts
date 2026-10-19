import { describe, it, expect, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'undici';
import { createBoundedAgent } from '../../src/lib/httpDispatcher.js';
import { SMTP_TIMEOUTS } from '../../src/services/notifications/email.service.js';

// R-07 / R-08: outbound calls ran on undici's 300 s defaults, the Anthropic
// SDK's 10 min default, and nodemailer's 2 min connect / 10 min socket defaults.

const SRC = fileURLToPath(new URL('../../src', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'scripts' ? [] : sourceFiles(p);
    return p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
  });
}

/** Text of each `name(...)` call, matched by paren depth. */
function calls(src: string, name: RegExp): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(name)) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')' && --depth === 0) break;
    }
    out.push(src.slice(m.index, i + 1));
  }
  return out;
}

describe('bounded undici agent', () => {
  let server: Server;
  afterAll(() => server?.close());

  it('gives up on an upstream that never sends headers', async () => {
    server = createServer(() => {
      /* never respond */
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as { port: number };
    const agent = createBoundedAgent({ headersTimeout: 200 });
    const t0 = Date.now();
    await expect(request(`http://127.0.0.1:${port}/`, { dispatcher: agent })).rejects.toThrow(/timeout/i);
    expect(Date.now() - t0).toBeLessThan(5_000);
    await agent.close();
  });
});

describe('every outbound call is bounded', () => {
  const files = sourceFiles(SRC).map((p) => ({ p, src: readFileSync(p, 'utf8') }));

  // Bounded = an explicit dispatcher (boundedAgent / followRedirects carry
  // OUTBOUND_TIMEOUTS) or a per-call headersTimeout. The options are inspected
  // by window rather than paren-matching: user-agent strings contain parens.
  it('undici request() is always bounded', () => {
    const missing = files
      .filter(({ src }) => /import \{[^}]*\brequest\b[^}]*\} from 'undici'/.test(src))
      .flatMap(({ p, src }) =>
        [...src.matchAll(/(?<![\w.])request\(/g)]
          .map((m) => src.slice(m.index, m.index + 800))
          .filter((w) => !/dispatcher:|headersTimeout:/.test(w))
          .map((w) => `${p}: ${w.slice(0, 80)}`),
      );
    expect(missing).toEqual([]);
  });

  // undici v7 (Node 24's bundled fetch) rejects `maxRedirections`; redirects go
  // through the interceptor on `followRedirects`.
  it('no request passes maxRedirections', () => {
    const offenders = files
      .filter(({ p, src }) => !p.endsWith('httpDispatcher.ts') && /maxRedirections\s*:/.test(src))
      .map(({ p }) => p);
    expect(offenders).toEqual([]);
  });

  it('every Anthropic client uses the shared timeout options', () => {
    const missing = files.flatMap(({ p, src }) =>
      calls(src, /new Anthropic\(/g).filter((c) => !c.includes('ANTHROPIC_CLIENT_OPTIONS')).map(() => p),
    );
    expect(missing).toEqual([]);
  });

  it('SMTP has finite connect / greeting / socket timeouts', () => {
    expect(SMTP_TIMEOUTS.connectionTimeout).toBeLessThanOrEqual(15_000);
    expect(SMTP_TIMEOUTS.greetingTimeout).toBeLessThanOrEqual(15_000);
    expect(SMTP_TIMEOUTS.socketTimeout).toBeLessThanOrEqual(30_000);
  });
});
