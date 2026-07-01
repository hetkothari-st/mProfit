import { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Send, Trash2, Loader2, Lock } from 'lucide-react';
import { useAIAssistant } from '@/hooks/useAIAssistant';
import { MessageBubble } from './MessageBubble';
import { SuggestedQuestions } from './SuggestedQuestions';

/**
 * Full assistant panel — slides in as a right-side drawer on desktop
 * (>= md) and a full-screen sheet on mobile. Auto-scrolls to bottom
 * on new messages, disables input while streaming, and shows an
 * upgrade block when the caller's plan doesn't include the assistant.
 */

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AIAssistant({ open, onClose }: Props) {
  const [input, setInput] = useState('');
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
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, isStreaming, messages]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
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

  return (
    <>
      <div
        aria-hidden
        className="fixed inset-0 bg-background/40 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-label="PortfolioOS Assistant"
        className="fixed inset-y-0 right-0 z-50 w-full sm:w-[440px] md:w-[480px] bg-background border-l border-border shadow-xl flex flex-col"
      >
        <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Sparkles className="h-4 w-4 text-accent" strokeWidth={1.9} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">PortfolioOS Assistant</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {quota && quota.allowed
                ? `${quota.used}/${quota.limit} questions today`
                : quota?.reason === 'daily_cap'
                ? 'Daily limit reached'
                : locked
                ? 'Upgrade to unlock'
                : 'Ask anything about your portfolio'}
            </div>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (confirm('Clear conversation?')) void clearConversation();
              }}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Clear conversation"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.7} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground"
            title="Close"
          >
            <X className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </header>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4 flex flex-col"
        >
          {locked ? (
            <UpgradePrompt />
          ) : loadingHistory ? (
            <div className="m-auto text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Loading conversation…
            </div>
          ) : messages.length === 0 ? (
            <div className="m-auto max-w-sm text-center space-y-4">
              <div className="mx-auto h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-accent" strokeWidth={1.9} />
              </div>
              <div>
                <div className="text-base font-medium">Ask me anything about your money.</div>
                <div className="text-[12px] text-muted-foreground mt-1">
                  I know your holdings, XIRR, tax position, goals — everything on your dashboard, in one conversation.
                </div>
              </div>
              <SuggestedQuestions
                questions={suggestedQuestions}
                onSelect={(q) => {
                  setInput(q);
                  void sendMessage(q);
                  setInput('');
                }}
                disabled={isStreaming}
              />
            </div>
          ) : (
            <>
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {!isStreaming && suggestedQuestions.length > 0 && (
                <div className="mt-2">
                  <SuggestedQuestions
                    questions={suggestedQuestions}
                    onSelect={(q) => {
                      setInput(q);
                      void sendMessage(q);
                      setInput('');
                    }}
                    disabled={isStreaming}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {!locked && (
          <form
            onSubmit={handleSubmit}
            className="border-t border-border p-3 flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={capped ? 'Daily limit reached — comes back tomorrow' : 'Type your question…'}
              disabled={isStreaming || capped}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming || capped}
              className="h-9 w-9 rounded-md bg-accent text-accent-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-40"
              title="Send"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" strokeWidth={2} />
              )}
            </button>
          </form>
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

function UpgradePrompt() {
  return (
    <div className="m-auto max-w-sm text-center space-y-4">
      <div className="mx-auto h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center">
        <Lock className="h-5 w-5 text-accent" strokeWidth={1.9} />
      </div>
      <div>
        <div className="text-base font-medium">AI Assistant is a paid feature.</div>
        <div className="text-[12px] text-muted-foreground mt-1">
          Upgrade your plan to talk to your portfolio directly.
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card/50 p-3 text-left space-y-2">
        <div className="text-[10px] uppercase tracking-kerned text-muted-foreground">Examples</div>
        <div className="text-[13px]">"Am I overweight in IT stocks?"</div>
        <div className="text-[13px]">"What's my XIRR on SBI Bluechip?"</div>
        <div className="text-[13px]">"Should I sell HDFC Bank now?"</div>
      </div>
    </div>
  );
}
