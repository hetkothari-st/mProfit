// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { legacyPublic } from './legacyPublic.api';

describe('legacyPublic', () => {
  it('sends X-Legacy-Session and never Authorization', async () => {
    const spy = vi.spyOn(legacyPublic.http, 'get').mockResolvedValue({ data: { success: true, data: { sections: [] } } } as never);
    await legacyPublic.view('sess1');
    const cfg = spy.mock.calls[0]![1] as { headers: Record<string, string> };
    expect(cfg.headers['X-Legacy-Session']).toBe('sess1');
    expect(cfg.headers.Authorization).toBeUndefined();
  });

  it('uses its own axios instance with no request interceptors', () => {
    const handlers = (legacyPublic.http.interceptors.request as unknown as { handlers: unknown[] }).handlers;
    expect(handlers.filter(Boolean)).toHaveLength(0);
  });
});
