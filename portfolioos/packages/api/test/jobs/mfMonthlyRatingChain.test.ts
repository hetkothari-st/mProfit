import { describe, it, expect, vi, beforeEach } from 'vitest';

// The monthly rating run fired on the 15th with asOf = that day. A mid-month
// asOf leaves the 3-year window one monthly return short, nulls the
// PERFORMANCE pillar and rates nothing (see mfAsOfGuard). The scheduled run
// must compute metrics, peer ranks and scores for the month that ended.
const calls: Array<[string, string]> = [];
let peerRankResult = { universes: 150 };
vi.mock('../../src/jobs/mfMetricsJob.js', () => ({
  runMfMetricsJob: vi.fn(async (o: { asOf: Date }) => { calls.push(['metrics', o.asOf.toISOString().slice(0, 10)]); }),
}));
vi.mock('../../src/jobs/mfPeerRankJob.js', () => ({
  runMfPeerRankJob: vi.fn(async (asOf: Date) => {
    calls.push(['peerRank', asOf.toISOString().slice(0, 10)]);
    return peerRankResult;
  }),
}));
vi.mock('../../src/jobs/mfScoreJob.js', () => ({
  runMfScoreJob: vi.fn(async (asOf: Date) => { calls.push(['score', asOf.toISOString().slice(0, 10)]); }),
}));

const { previousMonthEnd, runMonthlyRatingChain } = await import('../../src/jobs/mfMonthlyRatingChain.js');

beforeEach(() => {
  calls.length = 0;
  peerRankResult = { universes: 150 };
});

describe('previousMonthEnd', () => {
  it('is the last day of the month before', () => {
    expect(previousMonthEnd(new Date('2026-10-15T02:00:00Z')).toISOString().slice(0, 10)).toBe('2026-09-30');
    expect(previousMonthEnd(new Date('2026-03-15T00:00:00Z')).toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(previousMonthEnd(new Date('2026-01-15T00:00:00Z')).toISOString().slice(0, 10)).toBe('2025-12-31');
  });
});

describe('runMonthlyRatingChain', () => {
  it('runs metrics, then peer ranks, then scores, all for the month that ended', async () => {
    await runMonthlyRatingChain(new Date('2026-10-15T02:00:00Z'));
    expect(calls).toEqual([
      ['metrics', '2026-09-30'],
      ['peerRank', '2026-09-30'],
      ['score', '2026-09-30'],
    ]);
  });

  it('does not score when the peer-rank step was skipped (another run held its lock)', async () => {
    peerRankResult = { universes: 0 };
    await runMonthlyRatingChain(new Date('2026-10-15T02:00:00Z'));
    expect(calls.map((c) => c[0])).toEqual(['metrics', 'peerRank']);
  });
});
