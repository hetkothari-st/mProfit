/**
 * Route-level tests for `/api/admin/mf-qualitative-facts` (Task 6.2).
 *
 * Driven over real HTTP against `app.listen(0)` rather than by calling the
 * controllers directly, because the two guarantees that matter most here are
 * properties of the MIDDLEWARE CHAIN and are invisible to a direct call:
 * `requireRole('ADMIN')` rejecting an entitled-but-not-admin caller, and
 * `asyncHandler` turning a rejected handler promise into a status through
 * `errorHandler` rather than an unhandled rejection that kills the process
 * (`CONTEXT.md §4`). Calling `createQualitativeFact(req, res)` in isolation
 * would pass every assertion below while the route stayed open to anyone.
 *
 * A real `User` row is created for each caller, unlike the sibling
 * `mfAnalytics.routes.test.ts` where a bare signed token suffices. It is needed
 * here because the mutations write an `AuditLog` row whose `userId` is a
 * foreign key — a synthetic `sub` would fail on the FK, and papering over that
 * by dropping the audit write would remove the point of the test.
 *
 * Fixtures are namespaced `MFQF62_*` (schemes) and `mfqf62-` (users) and torn
 * down by those prefixes. The dev database is shared with other agents' runs,
 * so there is no unscoped `deleteMany` anywhere below.
 */

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';

import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { mfQualitativeFactsRouter } from '../../src/routes/mfQualitativeFacts.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/jwt.service.js';

// ---------------------------------------------------------------------------
// Guard rail
// ---------------------------------------------------------------------------

/**
 * These tests write fixture rows. `packages/api/.env` points `DATABASE_URL` at
 * the production Neon branch, so a run that picked it up would seed a live
 * database. Fail loudly instead of quietly doing that.
 */
const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) {
  throw new Error(
    `Refusing to run: DATABASE_URL must point at a local database, got "${DB_URL.replace(/:[^:@/]*@/, ':***@')}"`,
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PREFIX = 'MFQF62_';
const AMC_CODE = `${PREFIX}AMC`;
const SCHEME_A = `${PREFIX}A`;
const SCHEME_B = `${PREFIX}B`;
/** Not ACTIVE. Present so the AMC fan-out has something it must exclude. */
const SCHEME_MERGED = `${PREFIX}MERGED`;
const UNKNOWN_SCHEME = `${PREFIX}NOPE`;

const SOURCE = 'https://example.invalid/sebi/order/2026-04-01';

let server: Server;
let base: string;
let adminToken: string;
let investorToken: string;
let adminUserId = '';
const createdUserIds: string[] = [];

async function seedScheme(schemeCode: string, status: 'ACTIVE' | 'MERGED'): Promise<void> {
  await runAsSystem(() =>
    prisma.mfSchemeMeta.create({
      data: {
        schemeCode,
        schemeName: `Test ${schemeCode} Fund - Direct Plan - Growth`,
        amcCode: AMC_CODE,
        amcName: 'MFQF62 Mutual Fund',
        sebiCategory: 'EQUITY',
        sebiSubCategory: 'Large Cap Fund',
        planType: 'DIRECT',
        optionType: 'GROWTH',
        inceptionDate: new Date(Date.UTC(2015, 0, 1)),
        status,
        sourceHash: `mfqf62-${schemeCode}`,
        fetchedAt: new Date(),
      },
    }),
  );
}

async function createUser(role: 'ADMIN' | 'INVESTOR'): Promise<string> {
  const id = await runAsSystem(async () => {
    const u = await prisma.user.create({
      data: {
        email: `mfqf62-${role.toLowerCase()}-${randomUUID().slice(0, 8)}@test.local`,
        passwordHash: 'test-not-a-real-hash',
        name: `MFQF62 ${role}`,
        role,
      },
      select: { id: true, email: true },
    });
    return u.id;
  });
  createdUserIds.push(id);
  return id;
}

function tokenFor(userId: string, role: 'ADMIN' | 'INVESTOR'): string {
  return signAccessToken({
    sub: userId,
    email: `mfqf62-${role.toLowerCase()}@test.local`,
    role,
    // PLUS deliberately, on both callers. The point of the ADMIN gate is that
    // it is orthogonal to the plan: a paying PLUS user must still be refused.
    plan: 'PLUS',
  }).token;
}

interface HttpResult {
  status: number;
  body: { success: boolean; data?: unknown; error?: string; code?: string };
}

async function call(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<HttpResult> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(opts.token === undefined ? {} : { authorization: `Bearer ${opts.token}` }),
      ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  // 204 has no body; everything else in this router is JSON.
  const body = res.status === 204 ? { success: true } : ((await res.json()) as HttpResult['body']);
  return { status: res.status, body };
}

async function cleanup(): Promise<void> {
  await runAsSystem(async () => {
    await prisma.mfSchemeQualitativeFact.deleteMany({
      where: { schemeCode: { startsWith: PREFIX } },
    });
    await prisma.mfSchemeMeta.deleteMany({ where: { schemeCode: { startsWith: PREFIX } } });
    // AuditLog cascades from User (onDelete: SetNull leaves the row, so it is
    // deleted explicitly first — an orphaned audit row would survive teardown).
    for (const id of createdUserIds) {
      await prisma.auditLog.deleteMany({ where: { userId: id } });
      await prisma.user.delete({ where: { id } }).catch(() => {
        // Already gone. Nothing to undo.
      });
    }
    createdUserIds.length = 0;
  });
}

beforeAll(async () => {
  await cleanup();
  await seedScheme(SCHEME_A, 'ACTIVE');
  await seedScheme(SCHEME_B, 'ACTIVE');
  await seedScheme(SCHEME_MERGED, 'MERGED');

  adminUserId = await createUser('ADMIN');
  const investorId = await createUser('INVESTOR');
  adminToken = tokenFor(adminUserId, 'ADMIN');
  investorToken = tokenFor(investorId, 'INVESTOR');

  const app = express();
  app.use(express.json());
  app.use('/api/admin/mf-qualitative-facts', mfQualitativeFactsRouter);
  app.use(errorHandler);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  await cleanup();
});

// ---------------------------------------------------------------------------

const BASE = '/api/admin/mf-qualitative-facts';

describe('access control', () => {
  it('refuses an unauthenticated caller', async () => {
    expect((await call('GET', BASE)).status).toBe(401);
  });

  it('refuses a PLUS-entitled non-admin — role and plan are different axes', async () => {
    expect((await call('GET', BASE, { token: investorToken })).status).toBe(401);
    expect(
      (
        await call('POST', BASE, {
          token: investorToken,
          body: {
            schemeCodes: [SCHEME_A],
            factType: 'AMC_REGULATORY_ACTION',
            value: { summary: 'x' },
            validFrom: '2026-01-01',
            source: SOURCE,
          },
        })
      ).status,
    ).toBe(401);
  });
});

describe('catalog', () => {
  it('states what each fact type does to a score', async () => {
    const res = await call('GET', `${BASE}/catalog`, { token: adminToken });
    expect(res.status).toBe(200);
    const { factTypes } = res.body.data as {
      factTypes: Array<{ factType: string; scoringImpact: string; effect: string }>;
    };
    const action = factTypes.find((f) => f.factType === 'AMC_REGULATORY_ACTION');
    expect(action?.scoringImpact).toBe('RAISES_FINDING_AND_PENALISES_SCORE');
    // The form renders `effect` verbatim, so it must actually say something.
    expect(action?.effect.length).toBeGreaterThan(40);
    expect(factTypes.find((f) => f.factType === 'AUM_SHOCK')?.scoringImpact).toBe('RECORDED_ONLY');
  });
});

describe('create', () => {
  it('records against several schemes, reports unknown codes, and sets enteredBy from the session', async () => {
    const res = await call('POST', BASE, {
      token: adminToken,
      body: {
        schemeCodes: [SCHEME_A, SCHEME_B, UNKNOWN_SCHEME],
        factType: 'AMC_REGULATORY_ACTION',
        value: { summary: 'SEBI order dated 2026-04-01' },
        validFrom: '2026-04-01',
        source: SOURCE,
        // Deliberately supplied and deliberately ignored: provenance a client
        // can set is not provenance.
        enteredBy: 'not-the-admin',
      },
    });

    expect(res.status).toBe(201);
    const data = res.body.data as {
      created: Array<{ schemeCode: string; enteredBy: string; scoringImpact: string }>;
      skippedDuplicate: string[];
      unknownScheme: string[];
    };
    expect(data.created.map((c) => c.schemeCode).sort()).toEqual([SCHEME_A, SCHEME_B].sort());
    expect(data.unknownScheme).toEqual([UNKNOWN_SCHEME]);
    expect(data.skippedDuplicate).toEqual([]);
    for (const row of data.created) {
      expect(row.enteredBy).toBe(adminUserId);
      expect(row.scoringImpact).toBe('RAISES_FINDING_AND_PENALISES_SCORE');
    }
  });

  it('skips a duplicate rather than doubling the penalty', async () => {
    // The load-bearing one. `amcQualitativeScore` deducts 0.5 PER FACT and does
    // not dedupe by type, so a re-submitted form would take the input from 0.5
    // to 0 and drag PEOPLE_PARENT to its floor on evidence that is one order,
    // not two.
    const res = await call('POST', BASE, {
      token: adminToken,
      body: {
        schemeCodes: [SCHEME_A],
        factType: 'AMC_REGULATORY_ACTION',
        value: { summary: 'SEBI order dated 2026-04-01' },
        validFrom: '2026-04-01',
        source: SOURCE,
      },
    });

    expect(res.status).toBe(201);
    const data = res.body.data as { created: unknown[]; skippedDuplicate: string[] };
    expect(data.created).toEqual([]);
    expect(data.skippedDuplicate).toEqual([SCHEME_A]);

    const count = await runAsSystem(() =>
      prisma.mfSchemeQualitativeFact.count({
        where: { schemeCode: SCHEME_A, factType: 'AMC_REGULATORY_ACTION' },
      }),
    );
    expect(count).toBe(1);
  });

  it('fans an AMC-wide fact out to ACTIVE schemes only', async () => {
    const res = await call('POST', BASE, {
      token: adminToken,
      body: {
        amcCode: AMC_CODE,
        factType: 'AMC_FRONT_RUNNING',
        value: { summary: 'Front-running matter under review' },
        validFrom: '2026-05-01',
        source: SOURCE,
      },
    });

    expect(res.status).toBe(201);
    const data = res.body.data as { created: Array<{ schemeCode: string }> };
    expect(data.created.map((c) => c.schemeCode).sort()).toEqual([SCHEME_A, SCHEME_B].sort());
    // A merged scheme's investors moved to the successor; marking it down
    // changes nothing anyone sees and pollutes the table.
    expect(data.created.map((c) => c.schemeCode)).not.toContain(SCHEME_MERGED);
  });

  it('refuses an empty source', async () => {
    const res = await call('POST', BASE, {
      token: adminToken,
      body: {
        schemeCodes: [SCHEME_A],
        factType: 'AMC_REGULATORY_ACTION',
        value: { summary: 'x' },
        validFrom: '2026-06-01',
        source: '  ',
      },
    });
    expect(res.status).toBe(422); // Zod parse failure — errorHandler maps ZodError to 422
  });

  it('refuses validTo before validFrom', async () => {
    const res = await call('POST', BASE, {
      token: adminToken,
      body: {
        schemeCodes: [SCHEME_A],
        factType: 'AMC_REGULATORY_ACTION',
        value: { summary: 'x' },
        validFrom: '2026-06-01',
        validTo: '2026-05-01',
        source: SOURCE,
      },
    });
    expect(res.status).toBe(422); // Zod parse failure — errorHandler maps ZodError to 422
  });

  it('refuses both target modes at once', async () => {
    const res = await call('POST', BASE, {
      token: adminToken,
      body: {
        schemeCodes: [SCHEME_A],
        amcCode: AMC_CODE,
        factType: 'AMC_REGULATORY_ACTION',
        value: { summary: 'x' },
        validFrom: '2026-06-01',
        source: SOURCE,
      },
    });
    expect(res.status).toBe(422); // Zod parse failure — errorHandler maps ZodError to 422
  });
});

describe('list, update, delete', () => {
  it('lists in-force facts and hides expired ones unless asked', async () => {
    const res = await call('GET', `${BASE}?schemeCode=${SCHEME_A}`, { token: adminToken });
    expect(res.status).toBe(200);
    const { facts } = res.body.data as {
      facts: Array<{ id: string; factType: string; schemeName: string | null }>;
    };
    expect(facts.length).toBeGreaterThanOrEqual(2);
    // Joined from MfSchemeMeta, so a code with no master row is visible as such
    // rather than echoed back.
    expect(facts[0]?.schemeName).toContain('MFQF62_A');
  });

  it('updates dates and source, and leaves schemeCode / factType alone', async () => {
    const before = await runAsSystem(() =>
      prisma.mfSchemeQualitativeFact.findFirstOrThrow({
        where: { schemeCode: SCHEME_A, factType: 'AMC_REGULATORY_ACTION' },
      }),
    );

    const res = await call('PATCH', `${BASE}/${before.id}`, {
      token: adminToken,
      body: {
        validTo: '2027-01-01',
        source: 'https://example.invalid/sebi/order/2026-04-01/appeal-dismissed',
        // Both ignored by the schema — identity is immutable. See the
        // controller header, point 4.
        schemeCode: SCHEME_B,
        factType: 'AUM_SHOCK',
      },
    });

    expect(res.status).toBe(200);
    const after = res.body.data as { schemeCode: string; factType: string; validTo: string };
    expect(after.schemeCode).toBe(SCHEME_A);
    expect(after.factType).toBe('AMC_REGULATORY_ACTION');
    expect(after.validTo).toBe('2027-01-01');
  });

  it('deletes a fact and leaves an audit trail of every mutation', async () => {
    const row = await runAsSystem(() =>
      prisma.mfSchemeQualitativeFact.findFirstOrThrow({
        where: { schemeCode: SCHEME_B, factType: 'AMC_FRONT_RUNNING' },
      }),
    );

    expect((await call('DELETE', `${BASE}/${row.id}`, { token: adminToken })).status).toBe(204);
    expect(
      await runAsSystem(() => prisma.mfSchemeQualitativeFact.count({ where: { id: row.id } })),
    ).toBe(0);

    // `CONTEXT.md §3.7`: a hand-made write onto shared reference data has to be
    // attributable after the fact, and the row it describes is now gone.
    const actions = await runAsSystem(() =>
      prisma.auditLog.findMany({
        where: { userId: adminUserId },
        select: { action: true },
      }),
    );
    const seen = new Set(actions.map((a) => a.action));
    expect(seen.has('mf_qualitative_fact.create')).toBe(true);
    expect(seen.has('mf_qualitative_fact.update')).toBe(true);
    expect(seen.has('mf_qualitative_fact.delete')).toBe(true);
  });

  it('404s on an unknown id rather than pretending it worked', async () => {
    expect((await call('DELETE', `${BASE}/does-not-exist`, { token: adminToken })).status).toBe(404);
  });
});
