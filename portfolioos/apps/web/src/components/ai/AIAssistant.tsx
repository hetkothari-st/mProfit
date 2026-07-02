import { useEffect, useRef, useState } from 'react';
import {
  UserRound,
  X,
  Send,
  Trash2,
  Loader2,
  Lock,
  MoreHorizontal,
  Zap,
} from 'lucide-react';
import { useAIAssistant } from '@/hooks/useAIAssistant';
import { MessageBubble } from './MessageBubble';
import { SuggestedQuestions } from './SuggestedQuestions';
import { useAuthStore } from '@/stores/auth.store';

/**
 * PortfolioOS Assistant panel — designed as a financial planner agent,
 * not a chatbot. Right-side drawer on desktop, full-sheet on mobile.
 *
 * Layout:
 *   Header    — gradient background, sparkle-in-orb avatar, status dot,
 *               "Portfolio Assistant" title + live quota / streaming
 *               subtext, kebab menu, close button.
 *   Empty     — centered agent illustration + welcome text + 2x2 grid
 *               of suggested question tiles (not tiny pills).
 *   Messages  — MessageBubble stream; assistant carries avatar column,
 *               user bubbles are filled accent on the right.
 *   Composer  — pill input with integrated send button + tiny quota
 *               readout + "not investment advice" disclaimer.
 *   Locked    — well-designed upgrade prompt with 3 sample questions.
 */

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AIAssistant({ open, onClose }: Props) {
  const [input, setInput] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const {
    messages,
    isStreaming,
    error,
    suggestedQuestions,
    quota,
    loadingHistory,
    sendMessage,
    clearConversation,
  } = useAIAssistant(open);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages.length, isStreaming, messages]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isStreaming) return;
    void sendMessage(input);
    setInput('');
  };

  const locked = quota?.reason === 'tier_locked';
  const capped = quota?.reason === 'daily_cap';
  const firstName = user?.name?.split(/\s+/)[0] ?? 'there';

  return (
    <>
      <div
        aria-hidden
        className="fixed inset-0 bg-background/60 backdrop-blur-md z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-label="PortfolioOS Assistant"
        className="fixed inset-y-0 right-0 z-50 w-full sm:w-[460px] md:w-[500px] bg-background border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-300"
      >
        <AgentHeader
          onClose={onClose}
          onOpenMenu={() => setMenuOpen((o) => !o)}
          menuOpen={menuOpen}
          onClear={() => {
            if (confirm('Start a fresh conversation?')) void clearConversation();
            setMenuOpen(false);
          }}
          messageCount={messages.length}
          quota={quota}
          isStreaming={isStreaming}
        />

        <div ref={scrollRef} className="flex-1 overflow-y-auto flex flex-col scroll-smooth">
          {locked ? (
            <UpgradePrompt />
          ) : loadingHistory ? (
            <div className="m-auto text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Loading conversation…
            </div>
          ) : messages.length === 0 ? (
            <EmptyState
              firstName={firstName}
              suggestedQuestions={suggestedQuestions}
              disabled={isStreaming || capped}
              onSelect={(q) => {
                void sendMessage(q);
              }}
            />
          ) : (
            <div className="px-4 py-5">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {!isStreaming && suggestedQuestions.length > 0 && (
                <div className="mt-4">
                  <div className="text-[10px] uppercase tracking-kerned text-muted-foreground mb-2">
                    Try next
                  </div>
                  <SuggestedQuestions
                    questions={suggestedQuestions}
                    onSelect={(q) => {
                      void sendMessage(q);
                    }}
                    disabled={isStreaming}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {!locked && (
          <Composer
            input={input}
            setInput={setInput}
            onSubmit={handleSubmit}
            isStreaming={isStreaming}
            capped={Boolean(capped)}
            quota={quota}
            inputRef={inputRef}
          />
        )}
        {error && (
          <div className="px-4 py-2 text-[11px] text-negative border-t border-border/50 bg-negative/5">
            {error}
          </div>
        )}
      </aside>
    </>
  );
}

function AgentHeader({
  onClose,
  onOpenMenu,
  menuOpen,
  onClear,
  messageCount,
  quota,
  isStreaming,
}: {
  onClose: () => void;
  onOpenMenu: () => void;
  menuOpen: boolean;
  onClear: () => void;
  messageCount: number;
  quota: { used: number; limit: number } | null;
  isStreaming: boolean;
}) {
  const remaining = quota ? Math.max(0, quota.limit - quota.used) : null;
  return (
    <div className="relative overflow-hidden border-b border-border">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 0% 0%, hsl(var(--accent) / 0.25) 0px, transparent 55%), radial-gradient(100% 80% at 100% 20%, hsl(var(--primary) / 0.15) 0px, transparent 55%), linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--card) / 0.95) 100%)',
        }}
      />
      <div className="relative flex items-center gap-3 px-4 py-4">
        <div className="relative">
          <div className="h-11 w-11 rounded-full bg-gradient-to-br from-accent via-accent/85 to-accent/60 flex items-center justify-center shadow-md ring-2 ring-background">
            <UserRound className="h-5 w-5 text-accent-foreground" strokeWidth={2} />
          </div>
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-background ${
              isStreaming ? 'bg-amber-500 animate-pulse' : 'bg-positive'
            }`}
            aria-hidden
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold leading-tight">Portfolio Assistant</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {isStreaming
              ? 'Thinking through your numbers…'
              : remaining !== null
              ? `${remaining} question${remaining === 1 ? '' : 's'} left today`
              : 'Your personal financial planner'}
          </div>
        </div>

        {messageCount > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={onOpenMenu}
              className="p-1.5 rounded hover:bg-muted/70 text-muted-foreground hover:text-foreground"
              title="More"
            >
              <MoreHorizontal className="h-4 w-4" strokeWidth={1.9} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 rounded-md border border-border bg-popover shadow-xl z-[60] py-1">
                <button
                  type="button"
                  onClick={onClear}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted/60 text-negative"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.7} />
                  Clear conversation
                </button>
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded hover:bg-muted/70 text-muted-foreground"
          title="Close (Esc)"
        >
          <X className="h-4 w-4" strokeWidth={1.7} />
        </button>
      </div>
    </div>
  );
}

function EmptyState({
  firstName,
  suggestedQuestions,
  disabled,
  onSelect,
}: {
  firstName: string;
  suggestedQuestions: Array<{ question: string; intent: string }>;
  disabled: boolean;
  onSelect: (q: string) => void;
}) {
  return (
    <div className="flex-1 flex flex-col justify-center px-5 py-8 gap-6">
      <div className="text-center space-y-2">
        <div className="mx-auto h-16 w-16 rounded-full bg-gradient-to-br from-accent/25 to-accent/10 flex items-center justify-center ring-1 ring-accent/20">
          <UserRound className="h-7 w-7 text-accent" strokeWidth={1.7} />
        </div>
        <div className="text-lg font-semibold">Hi {firstName}. Ask me anything.</div>
        <div className="text-[13px] text-muted-foreground max-w-[340px] mx-auto leading-relaxed">
          I know your holdings, XIRR, tax position, goals, and loans — everything on your dashboard, always up-to-date.
        </div>
      </div>

      {suggestedQuestions.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-kerned text-muted-foreground mb-2 text-center">
            Try one of these
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {suggestedQuestions.slice(0, 4).map((q) => (
              <button
                key={q.question}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(q.question)}
                className={`group text-left p-3 rounded-lg border border-border/70 bg-card/40 hover:border-accent/50 hover:bg-accent/5 transition-colors ${
                  disabled ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  <Zap
                    className="h-3.5 w-3.5 text-accent mt-0.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
                    strokeWidth={2}
                  />
                  <span className="text-[13px] leading-snug">{q.question}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Composer({
  input,
  setInput,
  onSubmit,
  isStreaming,
  capped,
  quota,
  inputRef,
}: {
  input: string;
  setInput: (v: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
  isStreaming: boolean;
  capped: boolean;
  quota: { used: number; limit: number } | null;
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="border-t border-border bg-card/40 backdrop-blur">
      <form onSubmit={onSubmit} className="p-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                capped
                  ? 'Daily limit reached — resets tomorrow'
                  : isStreaming
                  ? 'Assistant is answering…'
                  : 'Ask about your XIRR, tax, holdings, goals…'
              }
              disabled={isStreaming || capped}
              maxLength={2000}
              className="w-full h-11 rounded-full border border-border bg-background pl-4 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60 transition-shadow"
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming || capped}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-accent text-accent-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
              title="Send (Enter)"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" strokeWidth={2.2} />
              )}
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground/70 px-1">
          <span>Based on your live portfolio data. Not investment advice.</span>
          {quota && (
            <span className="tabular-nums">
              {quota.used}/{quota.limit}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

function UpgradePrompt() {
  return (
    <div className="flex-1 flex flex-col justify-center items-center px-6 py-8 space-y-6">
      <div className="mx-auto h-16 w-16 rounded-full bg-accent/10 flex items-center justify-center">
        <Lock className="h-7 w-7 text-accent" strokeWidth={1.7} />
      </div>
      <div className="text-center space-y-2 max-w-sm">
        <div className="text-lg font-semibold">Unlock your Portfolio Assistant</div>
        <div className="text-[13px] text-muted-foreground leading-relaxed">
          A conversational financial planner that knows your full portfolio, available on the Wealth plan.
        </div>
      </div>
      <div className="w-full max-w-sm space-y-2">
        <div className="text-[10px] uppercase tracking-kerned text-muted-foreground text-center">
          It answers questions like
        </div>
        {[
          'Am I overweight in IT stocks?',
          "What's my XIRR on SBI Bluechip SIP?",
          'Should I sell HDFC Bank now?',
        ].map((q) => (
          <div
            key={q}
            className="rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-[13px]"
          >
            "{q}"
          </div>
        ))}
      </div>
      <button
        type="button"
        className="px-6 py-2.5 rounded-full bg-accent text-accent-foreground font-medium text-sm hover:opacity-90"
      >
        See plans
      </button>
    </div>
  );
}
