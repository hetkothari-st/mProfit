import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { prisma } from '../../src/lib/prisma.js';
import { getCurrentUserId, runAsSystem } from '../../src/lib/requestContext.js';
import { deleteAlert } from '../../src/services/alerts.service.js';
import {
  dueWillReviewUserIds, markWillReviewed, syncWillReviewAlerts, willReviewKey,
} from '../../src/services/will/willReview.service.js';
import { runWillReviewChecks } from '../../src/jobs/willReviewJob.js';
import { makeGeneratedWill, markExecuted, wipeWills } from './willExecuteFixtures.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

const TODAY = '2026-10-12';
const reviewAlerts = (userId: string) =>
  runAsSystem(() => prisma.alert.findMany({ where: { userId, type: 'WILL_REVIEW_DUE' }, orderBy: { createdAt: 'asc' } }));
const willRow = (id: string) => runAsSystem(() => prisma.will.findUniqueOrThrow({ where: { id } }));

let a: TestScope;
let b: TestScope;
let c: TestScope;
let d: TestScope;

beforeAll(async () => {
  a = await createTestScope('will-review-a');
  b = await createTestScope('will-review-b');
  c = await createTestScope('will-review-c');
  d = await createTestScope('will-review-d');
});
afterAll(async () => {
  for (const s of [a, b, c, d]) {
    await wipeWills(s.userId);
    await s.cleanup();
  }
});

describe('review alerts for one user', () => {
  let willId = '';

  it('raises one alert when the review is due, and only once', async () => {
    ({ willId } = await makeGeneratedWill(a));
    await markExecuted(willId, '2024-10-01', '2026-10-01');
    expect(await a.runAs(() => syncWillReviewAlerts(a.userId, TODAY))).toEqual({ created: 1, resolved: 0 });
    const [alert] = await reviewAlerts(a.userId);
    expect(alert).toMatchObject({ title: 'Time to review your will', isActive: true });
    expect(alert?.triggerDate.toISOString().slice(0, 10)).toBe('2026-10-01');
    expect(alert?.metadata).toEqual({ key: willReviewKey(willId, '2026-10-01'), willId, version: 1, dueOn: '2026-10-01' });
    expect(alert?.description).toContain('01/10/2024');
    expect(alert?.description).not.toContain('Ramesh');
    expect(await a.runAs(() => syncWillReviewAlerts(a.userId, TODAY))).toEqual({ created: 0, resolved: 0 });
    expect(await reviewAlerts(a.userId)).toHaveLength(1);
  });

  it('marking it reviewed moves the date two years on and closes the reminder', async () => {
    const r = await a.runAs(() => markWillReviewed(a.userId, willId, { today: () => TODAY }));
    expect(r).toEqual({ nextReviewAt: '2028-10-12' });
    expect((await willRow(willId)).nextReviewAt?.toISOString().slice(0, 10)).toBe('2028-10-12');
    expect((await reviewAlerts(a.userId)).every((x) => !x.isActive)).toBe(true);
    expect(await a.runAs(() => syncWillReviewAlerts(a.userId, TODAY))).toEqual({ created: 0, resolved: 0 });
  });

  it('a dismissed reminder is not raised again', async () => {
    await markExecuted(willId, '2024-10-05', '2026-10-05');
    expect(await a.runAs(() => syncWillReviewAlerts(a.userId, TODAY))).toEqual({ created: 1, resolved: 0 });
    const open = (await reviewAlerts(a.userId)).find((x) => x.isActive);
    await a.runAs(() => deleteAlert(a.userId, open?.id ?? ''));
    expect(await a.runAs(() => syncWillReviewAlerts(a.userId, TODAY))).toEqual({ created: 0, resolved: 0 });
    expect((await reviewAlerts(a.userId)).filter((x) => x.isActive)).toHaveLength(0);
  });

  it('nothing while the review date is ahead', async () => {
    const { willId: id } = await makeGeneratedWill(b);
    await markExecuted(id, '2026-10-12', '2028-10-12');
    expect(await b.runAs(() => syncWillReviewAlerts(b.userId, TODAY))).toEqual({ created: 0, resolved: 0 });
  });

  it('closes the reminder of a replaced will', async () => {
    const { willId: id } = await makeGeneratedWill(b);
    await markExecuted(id, '2024-09-01', '2026-09-01');
    expect(await b.runAs(() => syncWillReviewAlerts(b.userId, TODAY))).toEqual({ created: 1, resolved: 0 });
    await makeGeneratedWill(b);
    expect(await b.runAs(() => syncWillReviewAlerts(b.userId, TODAY))).toEqual({ created: 0, resolved: 1 });
    expect((await reviewAlerts(b.userId)).every((x) => !x.isActive)).toBe(true);
  });

  it('only a signed will can be marked reviewed', async () => {
    const { willId: id } = await makeGeneratedWill(b);
    await expect(b.runAs(() => markWillReviewed(b.userId, id, { today: () => TODAY }))).rejects.toMatchObject({
      statusCode: 409, details: { reason: 'WILL_NOT_EXECUTED' },
    });
    await expect(a.runAs(() => markWillReviewed(a.userId, id, { today: () => TODAY }))).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('the daily job', () => {
  it('finds users with a due will or an open reminder', async () => {
    const { willId } = await makeGeneratedWill(c);
    await markExecuted(willId, '2024-01-01', '2026-01-01');
    const { willId: dId } = await makeGeneratedWill(d);
    await markExecuted(dId, '2024-02-01', '2026-02-01');
    // b has a live will that is only GENERATED and its old reminder is closed, so b is not listed.
    const ids = await runAsSystem(() => dueWillReviewUserIds(TODAY, [b.userId, c.userId, d.userId]));
    expect(ids).toEqual([c.userId, d.userId].sort());
  });

  it('runs each user in their own context; one failure does not stop the rest', async () => {
    const seen: Array<[string, string | null]> = [];
    const result = await runWillReviewChecks({
      today: TODAY,
      userIds: [c.userId, d.userId],
      sync: async (userId, today) => {
        seen.push([userId, getCurrentUserId()]);
        if (userId === c.userId) throw new Error('boom');
        return syncWillReviewAlerts(userId, today);
      },
    });
    expect(result).toEqual({ users: 2, created: 1, resolved: 0, failedUsers: 1 });
    expect(seen.every(([u, ctx]) => u === ctx)).toBe(true);
    expect(await reviewAlerts(d.userId)).toHaveLength(1);
    expect(await reviewAlerts(c.userId)).toHaveLength(0);
  });

  it('does not run twice at once', async () => {
    const opts = { today: TODAY, userIds: [c.userId] };
    const [x, y] = await Promise.all([runWillReviewChecks(opts), runWillReviewChecks(opts)]);
    expect([x, y].filter((r) => r === null)).toHaveLength(1);
    expect(await reviewAlerts(c.userId)).toHaveLength(1);
  });
});
