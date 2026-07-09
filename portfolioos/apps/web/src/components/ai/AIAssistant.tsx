import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  X,
  Send,
  Trash2,
  Loader2,
  History,
  SquarePen,
  ArrowLeft,
  Zap,
  Pencil,
  Check,
} from 'lucide-react';
import { useAIAssistant } from '@/hooks/useAIAssistant';
import { MessageBubble } from './MessageBubble';
import { SuggestedQuestions } from './SuggestedQuestions';
import { useAuthStore } from '@/stores/auth.store';

/**
 * PortfolioOS Assistant panel — designed as a financial planner agent,
 * not a chatbot, but with the multi-session mechanics every other AI
 * chat product has: many independent chat threads per user, switchable,
 * deletable, a "new chat" that starts fresh without losing the others.
 *
 * Layout:
 *   Header    — gradient background, sparkle-in-orb avatar, status dot,
 *               "Portfolio Assistant" title + live quota / streaming
 *               subtext, session-list toggle, new-chat button, close.
 *   Sessions  — (toggled via the history icon) list of this user's chat
 *               threads, newest first, click to switch, trash icon to
 *               delete. Replaces the message area, not the whole panel.
 *   Empty     — centered agent illustration + welcome text + 2x2 grid
 *               of suggested question tiles (not tiny pills).
 *   Messages  — MessageBubble stream; assistant carries avatar column,
 *               user bubbles are filled accent on the right.
 *   Composer  — pill input with integrated send button + tiny quota
 *               readout + "not investment advice" disclaimer.
 *
 * FREE tier sees the identical panel — same floating button, same
 * empty state, same suggested prompts, same composer, same session
 * list. Sending a message still shows the real "thinking" dots
 * (useAIAssistant.sendMessage never calls the billed /chat endpoint for
 * a locked user), but the revealed answer is a blurred placeholder with
 * an upgrade CTA instead of real content (see MessageBubble's
 * LockedAnswer).
 *
 * That preview is a ONE-TIME thing per user — across every chat, not
 * per-chat — not a loophole to keep asking free (fake) questions by
 * starting new threads: once a locked answer has been shown anywhere,
 * the composer, every suggested-prompt tile, AND the "new chat" button
 * disable and stay disabled. `quota.previewUsed` comes straight from
 * the server (derived from whether any of the user's messages, in any
 * session, is marked `locked` — see conversationStore's
 * hasUsedLockedPreview), not a client flag, so it survives a reload, a
 * relogin, or switching devices, not just the current browser session.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * When set, the panel opens with this question pre-sent (as if the
   * user had typed and hit send). Cleared by the parent once the
   * conversation state has picked it up.
   */
  pendingPrompt?: string | null;
}

export function AIAssistant({ open, onClose, pendingPrompt }: Props) {
  const [input, setInput] = useState('');
  const [view, setView] = useState<'chat' | 'sessions'>('chat');
  const user = useAuthStore((s) => s.user);
  const {
    sessions,
    activeSessionId,
    messages,
    isStreaming,
    error,
    suggestedQuestions,
    quota,
    loadingHistory,
    historyLoaded,
    sendMessage,
    switchSession,
    newChat,
    removeSession,
    renameChat,
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

  // When opened via a teaser bubble the parent passes a question to
  // pre-send. Wait for `historyLoaded` — otherwise the pending send
  // races the history-fetch reducer and the optimistic user + streaming
  // placeholder get wiped by the history replace.
  const pendingFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      pendingFiredRef.current = null;
      return;
    }
    if (!pendingPrompt || !historyLoaded) return;
    if (pendingFiredRef.current === pendingPrompt) return;
    pendingFiredRef.current = pendingPrompt;
    void sendMessage(pendingPrompt);
  }, [open, pendingPrompt, historyLoaded, sendMessage]);
  void loadingHistory;

  if (!open) return null;

  const locked = quota?.reason === 'tier_locked';
  const capped = quota?.reason === 'daily_cap';
  const firstName = user?.name?.split(/\s+/)[0] ?? 'there';
  const previewLocked = locked && Boolean(quota?.previewUsed);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isStreaming || previewLocked) return;
    void sendMessage(input);
    setInput('');
  };

  const handleNewChat = () => {
    if (previewLocked) return;
    void newChat();
    setView('chat');
    setInput('');
  };

  return (
    <>
      <aside
        role="dialog"
        aria-label="PortfolioOS Assistant"
        className="fixed inset-0 sm:inset-auto sm:bottom-24 sm:right-6 z-40 w-full sm:w-[420px] md:w-[460px] h-full sm:h-[min(680px,calc(100vh-7.5rem))] bg-background border border-border sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
      >
        <AgentHeader
          onClose={onClose}
          view={view}
          onToggleSessions={() => setView((v) => (v === 'sessions' ? 'chat' : 'sessions'))}
          onNewChat={handleNewChat}
          newChatDisabled={previewLocked}
          quota={quota}
          isStreaming={isStreaming}
          locked={locked}
        />

        {view === 'sessions' ? (
          <SessionListView
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelect={(id) => {
              void switchSession(id);
              setView('chat');
            }}
            onDelete={(id) => void removeSession(id)}
            onRename={(id, title) => void renameChat(id, title)}
            onNewChat={handleNewChat}
            newChatDisabled={previewLocked}
          />
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto flex flex-col scroll-smooth">
              {loadingHistory ? (
                <div className="m-auto text-center text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                  Loading conversation…
                </div>
              ) : messages.length === 0 ? (
                <EmptyState
                  firstName={firstName}
                  suggestedQuestions={suggestedQuestions}
                  disabled={isStreaming || capped || previewLocked}
                  onSelect={(q) => {
                    void sendMessage(q);
                  }}
                />
              ) : (
                <div className="px-4 py-5">
                  {messages.map((m) => (
                    <MessageBubble key={m.id} message={m} />
                  ))}
                  {!isStreaming && suggestedQuestions.length > 0 && !previewLocked && (
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

            <Composer
              input={input}
              setInput={setInput}
              onSubmit={handleSubmit}
              isStreaming={isStreaming}
              capped={Boolean(capped)}
              locked={locked}
              previewLocked={previewLocked}
              quota={quota}
              inputRef={inputRef}
            />
          </>
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
  view,
  onToggleSessions,
  onNewChat,
  newChatDisabled,
  quota,
  isStreaming,
  locked,
}: {
  onClose: () => void;
  view: 'chat' | 'sessions';
  onToggleSessions: () => void;
  onNewChat: () => void;
  newChatDisabled: boolean;
  quota: { used: number; limit: number } | null;
  isStreaming: boolean;
  locked: boolean;
}) {
  const remaining = quota && !locked ? Math.max(0, quota.limit - quota.used) : null;
  return (
    <div className="relative border-b border-border">
      <div
        className="absolute inset-0 pointer-events-none rounded-none"
        style={{
          background:
            'radial-gradient(120% 90% at 0% 0%, hsl(var(--accent) / 0.25) 0px, transparent 55%), radial-gradient(100% 80% at 100% 20%, hsl(var(--primary) / 0.15) 0px, transparent 55%), linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--card) / 0.95) 100%)',
        }}
      />
      <div className="relative flex items-center gap-3 px-4 py-4">
        {view === 'sessions' ? (
          <button
            type="button"
            onClick={onToggleSessions}
            className="p-1.5 -ml-1.5 rounded hover:bg-muted/70 text-muted-foreground hover:text-foreground shrink-0"
            title="Back to chat"
          >
            <ArrowLeft className="h-4.5 w-4.5" strokeWidth={1.9} />
          </button>
        ) : (
          <div className="relative shrink-0">
            <div className="h-11 w-11 rounded-full bg-gradient-to-br from-accent via-accent/85 to-accent/60 flex items-center justify-center shadow-md ring-2 ring-background">
              <Sparkles className="h-5 w-5 text-accent-foreground" strokeWidth={2} />
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-background ${
                isStreaming ? 'bg-amber-500 animate-pulse' : 'bg-positive'
              }`}
              aria-hidden
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold leading-tight">
            {view === 'sessions' ? 'Your chats' : 'Portfolio Assistant'}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {view === 'sessions'
              ? 'Switch between conversations'
              : isStreaming
              ? 'Thinking through your numbers…'
              : locked
              ? 'Free plan — upgrade to unlock full answers'
              : remaining !== null
              ? `${remaining} question${remaining === 1 ? '' : 's'} left today`
              : 'Your personal financial planner'}
          </div>
        </div>

        {view === 'chat' && (
          <>
            <button
              type="button"
              onClick={onToggleSessions}
              className="p-1.5 rounded hover:bg-muted/70 text-muted-foreground hover:text-foreground"
              title="Chat history"
            >
              <History className="h-4 w-4" strokeWidth={1.9} />
            </button>
            <button
              type="button"
              onClick={onNewChat}
              disabled={newChatDisabled}
              className="p-1.5 rounded hover:bg-muted/70 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              title={newChatDisabled ? 'Upgrade to start a new chat' : 'New chat'}
            >
              <SquarePen className="h-4 w-4" strokeWidth={1.9} />
            </button>
          </>
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

function SessionListView({
  sessions,
  activeSessionId,
  onSelect,
  onDelete,
  onRename,
  onNewChat,
  newChatDisabled,
}: {
  sessions: Array<{ id: string; title: string; lastMessageAt: string }>;
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onNewChat: () => void;
  newChatDisabled: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      <div className="p-3 border-b border-border/60">
        <button
          type="button"
          onClick={onNewChat}
          disabled={newChatDisabled}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-accent/40 bg-accent/5 hover:bg-accent/10 text-accent-ink text-[13px] font-medium py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-accent/5"
        >
          <SquarePen className="h-3.5 w-3.5" strokeWidth={2} />
          New chat
        </button>
      </div>
      {sessions.length === 0 ? (
        <div className="m-auto text-center text-sm text-muted-foreground px-6">
          No chats yet.
        </div>
      ) : (
        <ul className="p-2 space-y-0.5">
          {sessions.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              active={s.id === activeSessionId}
              editing={editingId === s.id}
              onSelect={() => onSelect(s.id)}
              onStartRename={() => setEditingId(s.id)}
              onCommitRename={(title) => {
                setEditingId(null);
                if (title.trim() && title.trim() !== s.title) onRename(s.id, title);
              }}
              onCancelRename={() => setEditingId(null)}
              onDelete={() => onDelete(s.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SessionRow({
  session,
  active,
  editing,
  onSelect,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDelete,
}: {
  session: { id: string; title: string };
  active: boolean;
  editing: boolean;
  onSelect: () => void;
  onStartRename: () => void;
  onCommitRename: (title: string) => void;
  onCancelRename: () => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(session.title);
  const editInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      setDraft(session.title);
      setTimeout(() => editInputRef.current?.select(), 0);
    }
  }, [editing, session.title]);

  if (editing) {
    return (
      <li>
        <div className="flex items-center gap-1 rounded-lg px-2 py-1.5 bg-accent/10">
          <input
            ref={editInputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitRename(draft);
              if (e.key === 'Escape') onCancelRename();
            }}
            maxLength={200}
            className="flex-1 min-w-0 bg-transparent text-[13px] px-1 py-1 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => onCommitRename(draft)}
            className="shrink-0 p-1 rounded hover:bg-accent/20 text-accent-ink"
            title="Save"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`w-full group flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[13px] transition-colors ${
          active ? 'bg-accent/10 text-accent-ink font-medium' : 'hover:bg-muted/60 text-foreground'
        }`}
      >
        <span className="flex-1 min-w-0 truncate">{session.title}</span>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onStartRename();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              e.preventDefault();
              onStartRename();
            }
          }}
          className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground hover:text-foreground transition-opacity"
          title="Rename chat"
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
        </span>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              e.preventDefault();
              onDelete();
            }
          }}
          className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-negative/10 hover:text-negative transition-opacity"
          title="Delete chat"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
        </span>
      </button>
    </li>
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
          <Sparkles className="h-7 w-7 text-accent" strokeWidth={1.7} />
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
  locked,
  previewLocked,
  quota,
  inputRef,
}: {
  input: string;
  setInput: (v: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
  isStreaming: boolean;
  capped: boolean;
  locked: boolean;
  previewLocked: boolean;
  quota: { used: number; limit: number } | null;
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
}) {
  const disabled = isStreaming || capped || previewLocked;
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
                previewLocked
                  ? 'Upgrade to keep chatting'
                  : capped
                  ? 'Daily limit reached — resets tomorrow'
                  : isStreaming
                  ? 'Assistant is answering…'
                  : 'Ask about your XIRR, tax, holdings, goals…'
              }
              disabled={disabled}
              maxLength={2000}
              className="w-full h-11 rounded-full border border-border bg-background pl-4 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60 transition-shadow"
            />
            <button
              type="submit"
              disabled={!input.trim() || disabled}
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
          {previewLocked ? (
            <Link to="/pricing" className="text-accent-ink hover:underline font-medium">
              You've used your free preview — upgrade to ask unlimited questions →
            </Link>
          ) : (
            <span>
              {locked
                ? 'Answers are locked on the Free plan.'
                : 'Based on your live portfolio data. Not investment advice.'}
            </span>
          )}
          {quota && !locked && (
            <span className="tabular-nums">
              {quota.used}/{quota.limit}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
