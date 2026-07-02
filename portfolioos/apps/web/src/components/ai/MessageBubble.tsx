import { UserRound } from 'lucide-react';
import { PortfolioDataCard } from './PortfolioDataCard';
import type { UiMessage } from '@/hooks/useAIAssistant';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Chat bubble. Assistant messages get an avatar column on the left
 * (financial-planner look); user messages sit on the right with a
 * filled accent pill + the user's initials.
 *
 * Tiny markdown subset (bold + paragraphs) — enough for
 * conversational output without pulling react-markdown.
 */

function renderInline(text: string): JSX.Element[] {
  const parts: JSX.Element[] = [];
  const boldRe = /\*\*(.+?)\*\*/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = boldRe.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={key++}>{text.slice(last, m.index)}</span>);
    parts.push(
      <strong key={key++} className="font-semibold">
        {m[1]}
      </strong>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<span key={key++}>{text.slice(last)}</span>);
  return parts;
}

function renderContent(text: string): JSX.Element[] {
  const paras = text.split(/\n\n+/);
  return paras.map((p, i) => (
    <p key={i} className={i > 0 ? 'mt-2' : ''}>
      {renderInline(p)}
    </p>
  ));
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function MessageBubble({ message }: { message: UiMessage }) {
  const isUser = message.role === 'user';
  const time = new Date(message.createdAt).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return isUser ? (
    <UserBubble content={message.content} time={time} />
  ) : (
    <AssistantBubble
      content={message.content}
      time={time}
      isStreaming={message.isStreaming ?? false}
      card={message.card}
    />
  );
}

function UserBubble({ content, time }: { content: string; time: string }) {
  const user = useAuthStore((s) => s.user);
  const initialsLabel = user?.name ? initials(user.name) : 'U';
  return (
    <div className="flex justify-end mb-4 group">
      <div className="flex items-end gap-2 max-w-[85%]">
        <div className="flex flex-col items-end gap-1 min-w-0">
          <div className="rounded-2xl rounded-br-md px-3.5 py-2.5 text-[14px] leading-relaxed bg-accent text-accent-foreground shadow-sm">
            {renderContent(content)}
          </div>
          <div className="text-[10px] text-muted-foreground/70 opacity-0 group-hover:opacity-100 transition-opacity">
            {time}
          </div>
        </div>
        <div className="h-7 w-7 rounded-full bg-muted text-[10px] font-semibold text-muted-foreground flex items-center justify-center shrink-0">
          {initialsLabel}
        </div>
      </div>
    </div>
  );
}

function AssistantBubble({
  content,
  time,
  isStreaming,
  card,
}: {
  content: string;
  time: string;
  isStreaming: boolean;
  card: UiMessage['card'];
}) {
  return (
    <div className="flex justify-start mb-4 group">
      <div className="flex items-start gap-2 max-w-[85%]">
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-accent via-accent/85 to-accent/60 flex items-center justify-center shrink-0 ring-1 ring-background shadow-sm mt-0.5">
          <UserRound className="h-3.5 w-3.5 text-accent-foreground" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex flex-col gap-1">
          <div className="rounded-2xl rounded-tl-md px-3.5 py-2.5 text-[14px] leading-relaxed bg-card border border-border/70 shadow-sm">
            {content ? (
              renderContent(content)
            ) : isStreaming ? (
              <span
                className="inline-flex items-center gap-1.5"
                aria-label="Assistant is thinking"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-pulse" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:300ms]" />
              </span>
            ) : (
              <span className="text-muted-foreground italic">(no response)</span>
            )}
          </div>
          {card && <PortfolioDataCard card={card} />}
          <div className="text-[10px] text-muted-foreground/70 opacity-0 group-hover:opacity-100 transition-opacity">
            {time}
          </div>
        </div>
      </div>
    </div>
  );
}
