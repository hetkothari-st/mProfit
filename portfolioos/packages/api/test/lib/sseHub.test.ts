import { describe, it, expect } from 'vitest';
import { sseHub } from '../../src/lib/sseHub.js';

describe('sseHub', () => {
  it('delivers events to subscribers, not others', () => {
    const got: unknown[] = [];
    const unsub = sseHub.subscribe('sess-A', (e) => got.push(e));
    sseHub.publish('sess-A', { type: 'status', data: { msg: 'hello' } });
    sseHub.publish('sess-B', { type: 'status', data: { msg: 'other' } });
    expect(got).toEqual([{ type: 'status', data: { msg: 'hello' } }]);
    unsub();
  });

  it('answers prompts via request/response', async () => {
    sseHub.subscribe('sess-C', () => undefined);
    setTimeout(() => sseHub.respond('sess-C', 'p1', 'ANSWER'), 10);
    const ans = await sseHub.ask('sess-C', {
      type: 'captcha_required',
      data: { promptId: 'p1' },
    });
    expect(ans).toBe('ANSWER');
  });

  it('times out an unanswered prompt', async () => {
    sseHub.subscribe('sess-D', () => undefined);
    await expect(
      sseHub.ask(
        'sess-D',
        { type: 'otp_required', data: { promptId: 'p-timeout' } },
        { timeoutMs: 50 },
      ),
    ).rejects.toThrow(/timeout/i);
  });
});
