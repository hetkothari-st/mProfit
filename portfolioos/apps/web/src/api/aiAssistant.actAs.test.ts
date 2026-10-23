import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { aiAssistantApi } from './aiAssistant.api';
import { useActingAsStore } from '@/stores/actingAs.store';

// The streaming chat uses raw fetch, so it has to copy the axios interceptor's
// headers by hand. It copied auth and family but not X-Act-As: while managing
// a family member the session was created as them (axios) and then looked up
// as you (fetch) — "Chat session not found".
describe('aiAssistantApi.streamChat while acting for a managed profile', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: 'stop' }), { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    useActingAsStore.getState().leave();
  });

  const sentHeaders = () => (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;

  it('sends X-Act-As like every other data request', async () => {
    useActingAsStore.getState().enter({ id: 'profile-1', name: 'Dadaji', managerId: 'me' });
    await aiAssistantApi.streamChat('hi', 's1', () => undefined);
    expect(sentHeaders()['X-Act-As']).toBe('profile-1');
  });

  it('sends no X-Act-As on your own account', async () => {
    await aiAssistantApi.streamChat('hi', 's1', () => undefined);
    expect(sentHeaders()['X-Act-As']).toBeUndefined();
  });
});
