import { useCallback, useEffect, useState } from 'react';
import { AI_USE_DISCLOSURE } from '@everypaisa/shared';
import { aiAssistantApi } from '@/api/aiAssistant.api';

/**
 * The AI-use notice gate for the assistant panel. 'needed' only once the
 * server confirms the current version has not been accepted; if the check
 * fails the panel renders normally and the server's /chat gate is the backstop.
 */
export type AiDisclosureState = 'loading' | 'needed' | 'ok';

export function useAiDisclosure(active: boolean): { status: AiDisclosureState; accept: () => Promise<void> } {
  const [status, setStatus] = useState<AiDisclosureState>('loading');

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    aiAssistantApi
      .disclosure()
      .then((d) => {
        if (!cancelled) setStatus(d.acknowledged ? 'ok' : 'needed');
      })
      .catch(() => {
        if (!cancelled) setStatus('ok');
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  const accept = useCallback(async () => {
    await aiAssistantApi.acknowledgeDisclosure(AI_USE_DISCLOSURE.version);
    setStatus('ok');
  }, []);

  return { status, accept };
}
