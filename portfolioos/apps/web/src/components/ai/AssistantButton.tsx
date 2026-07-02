import { useEffect, useMemo, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { AIAssistant } from './AIAssistant';
import { aiAssistantApi } from '@/api/aiAssistant.api';

/**
 * Floating AI-assistant launcher.
 *
 * Bottom-right on desktop, above the mobile tab bar. To catch the
 * user's eye the button is paired with:
 *   - A soft accent ping ring that pulses every 3s (subtle, not
 *     spammy).
 *   - A first-time welcome bubble ("Meet your Portfolio Assistant…")
 *     shown once per session, dismissible.
 *   - Rotating teaser prompts sourced from the same
 *     /api/assistant/suggested endpoint the panel uses. Tapping the
 *     bubble opens the assistant and pre-sends that question, so the
 *     first interaction is a real answer, not a blank prompt.
 *
 * All hints suppress themselves once the user has opened the panel
 * even once (sessionStorage flag), so seasoned users don't get nagged
 * on every page load.
 */

// v2 — the v1 key persisted a dismissal on every teaser click, which
// wiped the bubble for the rest of the session even for engaged users.
// Renaming resets existing dismissals so they see the teaser again.
const DISMISS_KEY = 'portfolioos.ai-teaser-seen.v2';
const ROTATE_MS = 12_000;
const FIRST_VISIT_HOLD_MS = 6_000;

// Fallback questions if the API is slow / rate-limited / user has no
// data yet. Keeps the bubble useful for demo-mode accounts.
const FALLBACK_QUESTIONS = [
  { question: 'How am I doing overall?', intent: 'portfolio_health' },
  { question: "What's my portfolio XIRR?", intent: 'xirr_query' },
  { question: 'Am I overweight in IT?', intent: 'allocation_check' },
  { question: 'Should I sell any holding for LTCG?', intent: 'tax_drag' },
];

interface PendingPrompt {
  question: string;
}

export function AssistantButton() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem(DISMISS_KEY) === '1';
  });
  const [pending, setPending] = useState<PendingPrompt | null>(null);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<'welcome' | 'suggested'>('welcome');

  const suggestedQuery = useQuery({
    queryKey: ['assistant', 'suggested-teaser'],
    queryFn: () => aiAssistantApi.suggested(),
    staleTime: 5 * 60 * 1000,
    enabled: !open && !dismissed,
    retry: 0,
  });

  const teaserQuestions = useMemo(() => {
    const fromApi = suggestedQuery.data ?? [];
    return fromApi.length > 0 ? fromApi : FALLBACK_QUESTIONS;
  }, [suggestedQuery.data]);

  // Move welcome → suggested rotation after a short hold.
  useEffect(() => {
    if (dismissed || open) return;
    const t = setTimeout(() => setPhase('suggested'), FIRST_VISIT_HOLD_MS);
    return () => clearTimeout(t);
  }, [dismissed, open]);

  // Rotate teaser question every ROTATE_MS while visible.
  useEffect(() => {
    if (open || dismissed || phase !== 'suggested') return;
    const t = setInterval(() => setIdx((i) => i + 1), ROTATE_MS);
    return () => clearInterval(t);
  }, [open, dismissed, phase]);

  const dismiss = () => {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    }
  };

  const currentQuestion =
    teaserQuestions[idx % teaserQuestions.length] ?? teaserQuestions[0]!;

  const openWithPrompt = (q: string) => {
    setPending({ question: q });
    setOpen(true);
    // NOTE: intentionally do not dismiss. Only the explicit × on the
    // bubble persists dismissal. Otherwise the teaser vanishes for
    // the whole session after a single click, and never comes back
    // when the user closes the panel.
  };

  return (
    <>
      {!open && !dismissed && (
        <div className="fixed z-30 bottom-[7.5rem] md:bottom-[5rem] right-6 flex flex-col items-end gap-2 pointer-events-none">
          <TeaserBubble
            phase={phase}
            question={currentQuestion.question}
            onOpen={() => openWithPrompt(currentQuestion.question)}
            onDismiss={dismiss}
          />
        </div>
      )}

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-24 md:bottom-6 right-6 z-30 h-12 w-12 rounded-full bg-accent text-accent-foreground shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center group"
          aria-label="Open AI Assistant"
          title="Ask the AI Assistant"
        >
          {/* Pulsing attention ring — only when user hasn't dismissed. */}
          {!dismissed && (
            <span
              aria-hidden
              className="absolute inset-0 rounded-full bg-accent/40 animate-ping pointer-events-none"
            />
          )}
          <Sparkles
            className="relative h-5 w-5 group-hover:scale-110 transition-transform"
            strokeWidth={1.9}
          />
        </button>
      )}

      <AIAssistant
        open={open}
        onClose={() => {
          setOpen(false);
          setPending(null);
        }}
        pendingPrompt={pending?.question ?? null}
      />
    </>
  );
}

function TeaserBubble({
  phase,
  question,
  onOpen,
  onDismiss,
}: {
  phase: 'welcome' | 'suggested';
  question: string;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="pointer-events-auto max-w-[260px] animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="relative rounded-2xl rounded-br-md border border-border bg-card shadow-lg px-3.5 py-2.5 text-[13px] leading-snug">
        <button
          type="button"
          onClick={onDismiss}
          className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-background border border-border flex items-center justify-center text-muted-foreground hover:text-foreground shadow"
          aria-label="Dismiss"
        >
          <X className="h-3 w-3" strokeWidth={2} />
        </button>

        {phase === 'welcome' ? (
          <button
            type="button"
            onClick={onOpen}
            className="text-left block"
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <Sparkles className="h-3 w-3 text-accent" strokeWidth={2} />
              <span className="text-[10px] uppercase tracking-kerned text-accent-ink">
                New
              </span>
            </div>
            <div className="font-medium">Meet your Portfolio Assistant.</div>
            <div className="text-[11.5px] text-muted-foreground mt-0.5">
              Tap to ask anything about your portfolio.
            </div>
          </button>
        ) : (
          <button type="button" onClick={onOpen} className="text-left block group">
            <div className="text-[10px] uppercase tracking-kerned text-muted-foreground mb-0.5">
              Try asking
            </div>
            <div className="font-medium group-hover:text-accent-ink transition-colors">
              "{question}"
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
