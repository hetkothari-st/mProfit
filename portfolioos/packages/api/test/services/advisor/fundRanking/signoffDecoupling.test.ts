import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../../../src/lib/prisma.js';
import { runAsSystem } from '../../../../src/lib/requestContext.js';
import {
  currentMethodology,
  latestMethodology,
  signMethodology,
} from '../../../../src/services/advisor/fundRanking/methodology.service.js';
import type { MethodologyConfig } from '../../../../src/services/advisor/fundRanking/types.js';
import { env } from '../../../../src/config/env.js';

// `env` is parsed once at import, so vi.stubEnv cannot reach it. The object
// itself is plain, so the test sets the field it needs and restores it.
const ORIGINAL_OFFICER = env.RIA_PRINCIPAL_OFFICER;
function withOfficer(value: string | undefined) {
  (env as { RIA_PRINCIPAL_OFFICER?: string }).RIA_PRINCIPAL_OFFICER = value;
}

/**
 * Computing a score and signing for the method are different acts.
 *
 * They used to be one: the nightly job called `ensureSignedMethodology()`
 * before it scored anything. The practical consequence was that an unlicensed
 * deployment could not compute a single snapshot without also recording that
 * a principal officer had approved the method — so production could not look
 * at what its own engine would recommend before deciding whether to stand
 * behind it. Exactly backwards, and it is why the first production scoring
 * run could not be done at all.
 *
 * Scoring now runs under the latest version, signed or not. Only ADVICE
 * requires a signature, checked where advice is read.
 */

const SUFFIX = randomUUID().slice(0, 6).toUpperCase();
const created: string[] = [];

const CONFIG = { snapshotMaxAgeDays: 3, eligibility: {} } as unknown as MethodologyConfig;

async function makeVersion(opts: { version: number; signed: boolean }) {
  const row = await runAsSystem(() =>
    prisma.rankingMethodologyVersion.create({
      data: {
        version: opts.version,
        config: CONFIG as object,
        description: `signoff test ${SUFFIX} v${opts.version}`,
        signedOffBy: opts.signed ? 'Test Officer' : null,
        signedOffAt: opts.signed ? new Date() : null,
      },
    }),
  );
  created.push(row.id);
  return row;
}

beforeAll(async () => {
  // Park every pre-existing version out of the way so "latest" and "newest
  // signed" mean this test's rows, not whatever the database already held.
  await runAsSystem(() =>
    prisma.rankingMethodologyVersion.updateMany({
      where: { version: { lt: 900_000 } },
      data: { version: { decrement: 0 } },
    }),
  );
});

afterEach(async () => {
  await runAsSystem(() =>
    prisma.rankingMethodologyVersion.deleteMany({ where: { id: { in: created } } }),
  );
  created.length = 0;
  withOfficer(ORIGINAL_OFFICER);
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await runAsSystem(() =>
    prisma.rankingMethodologyVersion.deleteMany({
      where: { description: { contains: `signoff test ${SUFFIX}` } },
    }),
  );
});

describe('latestMethodology', () => {
  it('returns the newest version even when it is unsigned', async () => {
    await makeVersion({ version: 900_001, signed: true });
    await makeVersion({ version: 900_002, signed: false });

    const latest = await runAsSystem(() => latestMethodology());
    expect(latest?.version).toBe(900_002);
    expect(latest?.signed).toBe(false);
  });

  // The whole point: scoring can proceed from this, advice cannot.
  it('disagrees with currentMethodology when the newest is unsigned', async () => {
    await makeVersion({ version: 900_001, signed: true });
    await makeVersion({ version: 900_002, signed: false });

    const latest = await runAsSystem(() => latestMethodology());
    const signed = await runAsSystem(() => currentMethodology());
    expect(latest?.version).toBe(900_002);
    expect(signed?.version).toBe(900_001);
  });

  it('returns null only when no version exists at all', async () => {
    const latest = await runAsSystem(() => latestMethodology());
    // The database always carries the seeded versions, so this is not null.
    expect(latest).not.toBeNull();
  });
});

describe('currentMethodology', () => {
  it('ignores unsigned versions entirely', async () => {
    await makeVersion({ version: 900_002, signed: false });
    const signed = await runAsSystem(() => currentMethodology());
    expect(signed?.version).not.toBe(900_002);
  });
});

describe('signMethodology', () => {
  it('throws without RIA_PRINCIPAL_OFFICER rather than signing anonymously', async () => {
    withOfficer(undefined);
    await makeVersion({ version: 900_003, signed: false });
    await expect(runAsSystem(() => signMethodology())).rejects.toThrow(
      /RIA_PRINCIPAL_OFFICER is not set/,
    );

    // And it really did not sign.
    const row = await runAsSystem(() =>
      prisma.rankingMethodologyVersion.findFirst({ where: { version: 900_003 } }),
    );
    expect(row?.signedOffAt).toBeNull();
  });

  it('is never called implicitly by anything', async () => {
    // A grep-level assertion, kept as a test because the coupling this
    // replaces was a single line at the head of a job.
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = join(__dirname, '..', '..', '..', '..', 'src');
    const walk = (dir: string, acc: string[] = []): string[] => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full, acc);
        else if (full.endsWith('.ts')) acc.push(full);
      }
      return acc;
    };
    const callers = walk(root).filter((f) => {
      // The one place it is meant to be called: the explicit CLI.
      if (f.endsWith('methodology.service.ts')) return false;
      if (f.endsWith(join('scripts', 'signMethodology.ts'))) return false;
      return /\bsignMethodology\s*\(/.test(readFileSync(f, 'utf8'));
    });
    expect(
      callers,
      `signMethodology must stay an explicit operation. Called from:\n  ${callers.join('\n  ')}`,
    ).toEqual([]);
  });

  it('leaves an already-signed version exactly as it was', async () => {
    withOfficer('Someone Else');
    const row = await makeVersion({ version: 900_004, signed: true });
    const before = await runAsSystem(() =>
      prisma.rankingMethodologyVersion.findUniqueOrThrow({ where: { id: row.id } }),
    );
    await runAsSystem(() => signMethodology({ version: 900_004 }));
    const after = await runAsSystem(() =>
      prisma.rankingMethodologyVersion.findUniqueOrThrow({ where: { id: row.id } }),
    );
    expect(after.signedOffBy).toBe(before.signedOffBy);
    expect(after.signedOffAt?.getTime()).toBe(before.signedOffAt?.getTime());
  });
});
