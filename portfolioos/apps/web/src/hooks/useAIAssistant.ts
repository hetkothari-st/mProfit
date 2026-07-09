import { useCallback, useEffect, useRef, useState } from 'react';
import { aiAssistantApi, type AiCard, type AiMessage, type AiSuggestion, type AiQuota } from '@/api/aiAssistant.api';

/**
 * State + actions for the AI Assistant panel.
 *
 * Maintains the message array with optimistic user updates and a
 * streaming assistant placeholder that accumulates tokens as SSE
 * events arrive. Fetches history + suggested questions on mount, and
 * re-fetches suggestions after every completed response so the pills
 * stay contextual.
 */
export interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  card: AiCard | null;
  createdAt: string;
  isStreaming?: boolean;
  /** FREE-tier simulated response — rendered blurred with an upgrade CTA. */
  locked?: boolean;
}

interface State {
  messages: UiMessage[];
  isStreaming: boolean;
  error: string | null;
  suggestedQuestions: AiSuggestion[];
  quota: AiQuota | null;
  loadingHistory: boolean;
  /**
   * Latches true after `loadHistory` completes at least once for the
   * current open session. Callers (like the teaser pending-prompt
   * autosend) must wait for this before sending — otherwise the
   * history replace races with the optimistic user message and wipes
   * it. Reset to false whenever `active` flips false.
   */
  historyLoaded: boolean;
}

let idCounter = 0;
const genId = () => `local_${Date.now()}_${++idCounter}`;

function toUiMessage(m: AiMessage): UiMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    card: m.cardData,
    createdAt: m.createdAt,
  };
}

export function useAIAssistant(active: boolean) {
  const [state, setState] = useState<State>({
    messages: [],
    isStreaming: false,
    error: null,
    suggestedQuestions: [],
    quota: null,
    loadingHistory: false,
    historyLoaded: false,
  });
  const abortRef = useRef<AbortController | null>(null);
  // sendMessage needs the latest quota synchronously (to decide whether to
  // simulate a locked response) without adding `quota` to its own useCallback
  // deps, which would tear down/rebuild the closure — and stream handlers
  // inside it — on every quota refresh.
  const quotaRef = useRef<AiQuota | null>(null);
  useEffect(() => {
    quotaRef.current = state.quota;
  }, [state.quota]);

  const loadHistory = useCallback(async () => {
    setState((s) => ({ ...s, loadingHistory: true, error: null }));
    try {
      const [history, suggested, quota] = await Promise.all([
        aiAssistantApi.history(),
        aiAssistantApi.suggested().catch(() => [] as AiSuggestion[]),
        aiAssistantApi.quota().catch(() => null),
      ]);
      setState((s) => ({
        ...s,
        messages: history.map(toUiMessage),
        suggestedQuestions: suggested,
        quota,
        loadingHistory: false,
        historyLoaded: true,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        loadingHistory: false,
        historyLoaded: true,
        error: err instanceof Error ? err.message : 'Failed to load conversation.',
      }));
    }
  }, []);

  useEffect(() => {
    if (!active) {
      // Reset ready flag so a later re-open forces a fresh wait.
      setState((s) => (s.historyLoaded ? { ...s, historyLoaded: false } : s));
      return;
    }
    void loadHistory();
    return () => {
      abortRef.current?.abort();
    };
  }, [active, loadHistory]);

  const refreshSuggested = useCallback(async () => {
    try {
      const q = await aiAssistantApi.suggested();
      setState((s) => ({ ...s, suggestedQuestions: q }));
    } catch {
      /* ignore */
    }
  }, []);

  const refreshQuota = useCallback(async () => {
    try {
      const q = await aiAssistantApi.quota();
      setState((s) => ({ ...s, quota: q }));
    } catch {
      /* ignore */
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const userMsg: UiMessage = {
        id: genId(),
        role: 'user',
        content: trimmed,
        card: null,
        createdAt: new Date().toISOString(),
      };
      const assistantId = genId();
      const assistantPlaceholder: UiMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        card: null,
        createdAt: new Date().toISOString(),
        isStreaming: true,
      };
      setState((s) => ({
        ...s,
        messages: [...s.messages, userMsg, assistantPlaceholder],
        isStreaming: true,
        error: null,
      }));

      if (quotaRef.current?.reason === 'tier_locked') {
        // FREE tier — the panel looks and behaves identically to a paid
        // user's up to this point (real send, real "thinking" dots), but
        // never calls the actual (billed) /chat endpoint. After a short
        // delay that mirrors real response latency, reveal the assistant
        // bubble as locked/blurred instead of streaming real content.
        await new Promise((resolve) => setTimeout(resolve, 1100));
        setState((s) => ({
          ...s,
          isStreaming: false,
          messages: s.messages.map((m) =>
            m.id === assistantId ? { ...m, isStreaming: false, locked: true } : m,
          ),
        }));
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      await aiAssistantApi.streamChat(
        trimmed,
        (event) => {
          if (event.type === 'token') {
            setState((s) => ({
              ...s,
              messages: s.messages.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + event.content } : m,
              ),
            }));
          } else if (event.type === 'card') {
            setState((s) => ({
              ...s,
              messages: s.messages.map((m) =>
                m.id === assistantId ? { ...m, card: event.data } : m,
              ),
            }));
          } else if (event.type === 'error') {
            setState((s) => ({
              ...s,
              isStreaming: false,
              error: event.message,
              messages: s.messages.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: m.content || `_(${event.message})_`,
                      isStreaming: false,
                    }
                  : m,
              ),
            }));
          } else if (event.type === 'done') {
            setState((s) => ({
              ...s,
              isStreaming: false,
              messages: s.messages.map((m) =>
                m.id === assistantId ? { ...m, isStreaming: false } : m,
              ),
            }));
          }
        },
        controller.signal,
      );
      void refreshSuggested();
      void refreshQuota();
    },
    [refreshSuggested, refreshQuota],
  );

  const clearConversation = useCallback(async () => {
    try {
      await aiAssistantApi.clearHistory();
      setState((s) => ({ ...s, messages: [], error: null }));
      await refreshSuggested();
    } catch (err) {
      setState((s) => ({
        ...s,
        error: err instanceof Error ? err.message : 'Failed to clear conversation.',
      }));
    }
  }, [refreshSuggested]);

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    ...state,
    sendMessage,
    clearConversation,
    cancelStream,
    reload: loadHistory,
  };
}
