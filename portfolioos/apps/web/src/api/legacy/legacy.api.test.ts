// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('../client', async (orig) => {
  const actual = await orig<typeof import('../client')>();
  return { ...actual, api: { post: vi.fn(), get: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

describe('legacyApi step-up grant', () => {
  it('has no grant until verifyStepUp, then sends X-Legacy-Grant on mutations', async () => {
    const { api } = await import('../client');
    const { legacyApi } = await import('./legacy.api');
    const post = vi.mocked(api.post);
    expect(legacyApi.hasGrant()).toBe(false);
    post.mockResolvedValueOnce({ data: { success: true, data: { grant: 'g1' } } } as never);
    await legacyApi.verifyStepUp('123456');
    expect(legacyApi.hasGrant()).toBe(true);
    post.mockResolvedValueOnce({ data: { success: true, data: { ok: true } } } as never);
    await legacyApi.activate();
    expect(post.mock.calls[1]![0]).toBe('/api/legacy/activate');
    expect(post.mock.calls[1]![2]).toEqual({ headers: { 'X-Legacy-Grant': 'g1' } });
  });
});
