import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyWillSection, willSectionData,
  type WillDraftWire, type WillPayload, type WillSection, type WillSectionData,
} from '@everypaisa/shared';
import { apiErrorMessage } from '@/api/client';
import { isWillRevisionConflict, willApi } from '@/api/will.api';

export const SAVE_FAILED = 'Could not save your changes. Check your connection and try again.';

export type WillDraftApi = Pick<typeof willApi, 'getDraft' | 'saveSection' | 'refreshEstate'>;

export interface UseWillDraft {
  status: 'loading' | 'ready' | 'error';
  draft: WillDraftWire | null;
  payload: WillPayload | null;
  saving: boolean;
  conflict: boolean;
  error: string | null;
  update: <S extends WillSection>(section: S, data: WillSectionData[S]) => void;
  flush: (currentStep?: number) => Promise<boolean>;
  /** Resolves false when the refresh did not complete. */
  refreshEstate: () => Promise<boolean>;
  reload: () => Promise<void>;
  getRevision: () => number;
}

/**
 * Server-side draft with autosave. Edits apply locally at once; touched
 * sections are saved after `debounceMs`, one request at a time, each naming
 * the revision it builds on. A revision conflict freezes saving until reload,
 * so a second tab can never be overwritten silently.
 */
export function useWillDraft(id: string, opts: { debounceMs?: number; api?: WillDraftApi } = {}): UseWillDraft {
  const client = opts.api ?? willApi;
  const debounceMs = opts.debounceMs ?? 800;
  const [status, setStatus] = useState<UseWillDraft['status']>('loading');
  const [draft, setDraft] = useState<WillDraftWire | null>(null);
  const [payload, setPayload] = useState<WillPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payloadRef = useRef<WillPayload | null>(null);
  const revisionRef = useRef(0);
  const stepRef = useRef(2);
  const dirty = useRef(new Set<WillSection>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));
  const frozen = useRef(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const d = await client.getDraft(id);
      payloadRef.current = d.payload;
      revisionRef.current = d.revision;
      stepRef.current = d.currentStep;
      dirty.current.clear();
      frozen.current = false;
      setDraft(d);
      setPayload(d.payload);
      setConflict(false);
      setError(null);
      setStatus('ready');
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load your will"));
      setStatus('error');
    }
  }, [client, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveDirty = useCallback(async (): Promise<boolean> => {
    while (dirty.current.size > 0 && !frozen.current) {
      const section = dirty.current.values().next().value as WillSection;
      dirty.current.delete(section);
      const current = payloadRef.current;
      if (!current) return false;
      setSaving(true);
      try {
        const res = await client.saveSection(id, section, {
          revision: revisionRef.current,
          currentStep: stepRef.current,
          data: willSectionData(current, section),
        });
        revisionRef.current = res.revision;
        setError(null);
      } catch (err) {
        if (isWillRevisionConflict(err)) {
          frozen.current = true;
          dirty.current.clear();
          setConflict(true);
        } else {
          dirty.current.add(section);
          setError(SAVE_FAILED);
        }
        setSaving(false);
        return false;
      }
      setSaving(false);
    }
    return !frozen.current;
  }, [client, id]);

  const enqueue = useCallback((): Promise<boolean> => {
    chain.current = chain.current.then(saveDirty, saveDirty);
    return chain.current;
  }, [saveDirty]);

  // Edits still waiting out the debounce are saved when the page goes away
  // (route change or tab close), not dropped.
  useEffect(() => {
    const flushPending = () => {
      if (dirty.current.size === 0 || frozen.current) return;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      void enqueue();
    };
    window.addEventListener('pagehide', flushPending);
    return () => {
      window.removeEventListener('pagehide', flushPending);
      flushPending();
    };
  }, [enqueue]);

  const update = useCallback(
    <S extends WillSection>(section: S, data: WillSectionData[S]) => {
      const current = payloadRef.current;
      if (!current || frozen.current) return;
      const next = applyWillSection(current, section, data);
      payloadRef.current = next;
      setPayload(next);
      dirty.current.add(section);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void enqueue();
      }, debounceMs);
    },
    [debounceMs, enqueue],
  );

  const flush = useCallback(
    async (currentStep?: number) => {
      if (currentStep) stepRef.current = currentStep;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      return enqueue();
    },
    [enqueue],
  );

  const refreshEstate = useCallback(async (): Promise<boolean> => {
    if (!(await flush())) return false;
    setSaving(true);
    try {
      const res = await client.refreshEstate(id, revisionRef.current);
      revisionRef.current = res.revision;
      const next = applyWillSection(payloadRef.current!, 'estate', res.estate);
      payloadRef.current = next;
      setPayload(next);
      setError(null);
      return true;
    } catch (err) {
      if (isWillRevisionConflict(err)) {
        frozen.current = true;
        setConflict(true);
      } else {
        setError(apiErrorMessage(err, "Couldn't refresh your assets"));
      }
      return false;
    } finally {
      setSaving(false);
    }
  }, [client, flush, id]);

  const getRevision = useCallback(() => revisionRef.current, []);

  return { status, draft, payload, saving, conflict, error, update, flush, refreshEstate, reload: load, getRevision };
}
