/**
 * Dependency-free load driver (no k6). Simulates users opening the app: a dashboard load (a parallel burst
 * of calls), then a few page views with think time. Each virtual user has its own token and its own
 * X-Forwarded-For address (the API keys its rate limit by IP behind `trust proxy`).
 *
 *   LOAD_TOKENS_FILE=tokens.json LOAD_BASE=http://localhost:4900 \
 *   LOAD_STAGES=50:30,200:60,500:60 node scripts/loadTest.mjs
 *
 * LOAD_STAGES = comma list of "virtualUsers:seconds". Local targets only.
 */
import http from 'node:http';
import { readFileSync } from 'node:fs';

const BASE = new URL(process.env.LOAD_BASE ?? 'http://localhost:4900');
if (!['localhost', '127.0.0.1'].includes(BASE.hostname)) {
  console.error('Refusing: load test targets localhost only.');
  process.exit(1);
}
const allUsers = JSON.parse(readFileSync(process.env.LOAD_TOKENS_FILE ?? 'load-tokens.json', 'utf8')).users;
const users = process.env.LOAD_TIER ? allUsers.filter((u) => u.tier === process.env.LOAD_TIER) : allUsers;
const STAGES = (process.env.LOAD_STAGES ?? '50:30,200:60,500:60').split(',').map((s) => {
  const [vus, secs] = s.split(':').map(Number);
  return { vus, secs };
});
const agent = new http.Agent({ keepAlive: true, maxSockets: 2000 });

function call(path, u, vuIdx) {
  return new Promise((resolve) => {
    const t = process.hrtime.bigint();
    const req = http.request(
      {
        host: BASE.hostname,
        port: BASE.port,
        path,
        agent,
        headers: {
          authorization: `Bearer ${u.token}`,
          'x-forwarded-for': `10.${(vuIdx >> 16) & 255}.${(vuIdx >> 8) & 255}.${vuIdx & 255}`,
          'accept-encoding': 'gzip',
        },
        timeout: 30000,
      },
      (res) => {
        let bytes = 0;
        res.on('data', (c) => (bytes += c.length));
        res.on('end', () => resolve({ status: res.statusCode, ms: Number(process.hrtime.bigint() - t) / 1e6, bytes }));
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ status: e.message === 'timeout' ? 'timeout' : 'error', ms: Number(process.hrtime.bigint() - t) / 1e6, bytes: 0 }));
    req.end();
  });
}

const stats = new Map(); // `${stage}|${name}` -> { ms: [], codes: {} }
let stageIdx = 0;
function record(name, r) {
  const k = `${stageIdx}|${name}`;
  let s = stats.get(k);
  if (!s) stats.set(k, (s = { ms: [], codes: {}, bytes: 0 }));
  s.ms.push(r.ms);
  s.bytes += r.bytes;
  s.codes[r.status] = (s.codes[r.status] ?? 0) + 1;
}
async function timed(name, path, u, idx) {
  const r = await call(path, u, idx);
  record(name, r);
  return r;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

async function session(u, idx) {
  const p = u.portfolioId;
  // Dashboard load: parallel burst, like the SPA.
  await Promise.all([
    timed('net-worth', '/api/dashboard/net-worth', u, idx),
    timed('analytics-snapshot', '/api/analytics/snapshot', u, idx),
    timed('portfolios', '/api/portfolios', u, idx),
    timed('summary', `/api/portfolios/${p}/summary`, u, idx),
    timed('holdings', `/api/portfolios/${p}/holdings`, u, idx),
    timed('alerts-unread', '/api/alerts/unread-count', u, idx),
  ]);
  const views = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < views; i++) {
    await sleep(1000 + Math.random() * 3000); // think time
    const choice = pick(['txns', 'txns', 'txns2', 'xirr', 'alerts', 'risk', 'allocation']);
    if (choice === 'txns') await timed('transactions', '/api/transactions?page=1&pageSize=50', u, idx);
    else if (choice === 'txns2') await timed('transactions-p2', '/api/transactions?page=2&pageSize=50&sort=date&dir=desc', u, idx);
    else if (choice === 'xirr') await timed('reports-xirr', '/api/reports/xirr/user', u, idx);
    else if (choice === 'alerts') await timed('alerts', '/api/alerts?page=1&limit=20', u, idx);
    else if (choice === 'risk') await timed('analytics-risk', '/api/analytics/risk', u, idx);
    else await timed('allocation', `/api/portfolios/${p}/asset-allocation`, u, idx);
  }
}

let running = 0;
let stop = false;
async function vu(idx, endAt) {
  running++;
  const u = users[idx % users.length];
  await sleep(Math.random() * 2000); // spread starts
  while (!stop && Date.now() < endAt) await session(u, idx);
  running--;
}

const pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] : 0);

for (let s = 0; s < STAGES.length; s++) {
  stageIdx = s;
  const { vus, secs } = STAGES[s];
  const endAt = Date.now() + secs * 1000;
  console.log(`\n=== stage ${s + 1}: ${vus} virtual users for ${secs}s ===`);
  const t0 = Date.now();
  const start = running; // let leftovers from the previous stage drain
  void start;
  const base = s * 10000;
  await Promise.all(Array.from({ length: vus }, (_, i) => vu(base + i, endAt)));
  const elapsed = (Date.now() - t0) / 1000;
  const rows = [];
  let total = 0;
  let bad = 0;
  let all = [];
  for (const [k, v] of stats) {
    if (!k.startsWith(`${s}|`)) continue;
    const ms = v.ms.slice().sort((a, b) => a - b);
    const ok = Object.entries(v.codes).filter(([c]) => /^2/.test(c)).reduce((n, [, c]) => n + c, 0);
    total += ms.length;
    bad += ms.length - ok;
    all = all.concat(ms);
    rows.push({
      endpoint: k.split('|')[1],
      n: ms.length,
      p50: Math.round(pct(ms, 50)),
      p95: Math.round(pct(ms, 95)),
      p99: Math.round(pct(ms, 99)),
      max: Math.round(ms[ms.length - 1] ?? 0),
      avgKB: Math.round(v.bytes / ms.length / 1024),
      errors: ms.length - ok,
      codes: JSON.stringify(v.codes),
    });
  }
  all.sort((a, b) => a - b);
  console.table(rows.sort((a, b) => b.p95 - a.p95));
  console.log(
    `stage ${s + 1}: ${total} requests, ${(total / elapsed).toFixed(1)} req/s, errors ${bad} (${((100 * bad) / Math.max(1, total)).toFixed(2)}%), ` +
      `overall p50 ${Math.round(pct(all, 50))} ms, p95 ${Math.round(pct(all, 95))} ms, p99 ${Math.round(pct(all, 99))} ms`,
  );
}
stop = true;
agent.destroy();
process.exit(0);
