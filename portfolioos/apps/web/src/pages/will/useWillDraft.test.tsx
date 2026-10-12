// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { useWillDraft, type WillDraftApi } from './useWillDraft';
import { draftWire, fullPayload } from './willTestData';

afterEach(cleanup);

function conflict(): AxiosError {
  return new AxiosError('conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 409,
    data: { details: { reason: 'WILL_REVISION_CONFLICT', revision: 5 } },
  } as unknown as AxiosResponse);
}

function fakeApi(): WillDraftApi & { saves: Array<{ section: string; revision: number; currentStep: number }> } {
  let revision = 0;
  const saves: Array<{ section: string; revision: number; currentStep: number }> = [];
  return {
    saves,
    getDraft: vi.fn(async () => draftWire({ revision: 0, currentStep: 2 })),
    saveSection: vi.fn(async (_id: string, section: string, body: { revision: number; currentStep: number }) => {
      saves.push({ section, revision: body.revision, currentStep: body.currentStep });
      revision = body.revision + 1;
      return { revision, updatedAt: '2026-10-12T05:00:00.000Z' };
    }) as WillDraftApi['saveSection'],
    refreshEstate: vi.fn(async (_id: string, rev: number) => ({ revision: rev + 1, estate: { ...fullPayload().estate, asOf: '2026-10-13' } })),
  };
}

describe('useWillDraft', () => {
  it('debounces edits into one save with the latest data, then uses the new revision', async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useWillDraft('w1', { api, debounceMs: 20 }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.update('instructions', { text: 'a' }));
    act(() => result.current.update('instructions', { text: 'ab' }));
    expect(result.current.payload?.instructions.text).toBe('ab');
    await waitFor(() => expect(api.saves).toHaveLength(1));
    expect(api.saveSection).toHaveBeenCalledWith('w1', 'instructions', { revision: 0, currentStep: 2, data: { text: 'ab' } });
    act(() => result.current.update('instructions', { text: 'abc' }));
    await act(async () => { expect(await result.current.flush(6)).toBe(true); });
    expect(api.saves[1]).toEqual({ section: 'instructions', revision: 1, currentStep: 6 });
    expect(result.current.getRevision()).toBe(2);
  });

  it('a 409 stops autosave and raises the conflict banner', async () => {
    const api = fakeApi();
    vi.mocked(api.saveSection).mockRejectedValueOnce(conflict());
    const { result } = renderHook(() => useWillDraft('w1', { api, debounceMs: 20 }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.update('instructions', { text: 'x' }));
    await act(async () => { expect(await result.current.flush()).toBe(false); });
    expect(result.current.conflict).toBe(true);
    act(() => result.current.update('instructions', { text: 'y' }));
    await act(async () => { await result.current.flush(); });
    expect(api.saveSection).toHaveBeenCalledTimes(1);
    await act(async () => { await result.current.reload(); });
    expect(result.current.conflict).toBe(false);
  });

  it('keeps a failed section dirty and retries on the next flush', async () => {
    const api = fakeApi();
    vi.mocked(api.saveSection).mockRejectedValueOnce(new Error('Network Error'));
    const { result } = renderHook(() => useWillDraft('w1', { api, debounceMs: 20 }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.update('details', { ...fullPayload().details, legalName: 'New Name' }));
    await act(async () => { expect(await result.current.flush()).toBe(false); });
    expect(result.current.error).toContain('Network Error');
    await act(async () => { expect(await result.current.flush()).toBe(true); });
    expect(api.saveSection).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
  });

  it('refreshEstate saves pending edits first, then applies the server estate', async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useWillDraft('w1', { api, debounceMs: 1000 }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.update('instructions', { text: 'before refresh' }));
    await act(async () => { await result.current.refreshEstate(); });
    expect(api.saves).toHaveLength(1);
    expect(api.refreshEstate).toHaveBeenCalledWith('w1', 1);
    expect(result.current.payload?.estate.asOf).toBe('2026-10-13');
    expect(result.current.getRevision()).toBe(2);
  });
});
