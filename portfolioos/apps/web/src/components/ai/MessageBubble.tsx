import { Sparkles } from 'lucide-react';
import { PortfolioDataCard } from './PortfolioDataCard';
import type { UiMessage } from '@/hooks/useAIAssistant';

/**
 * Minimal markdown-lite renderer: bold (**text**), line breaks
 * (double newline → paragraph), and single-line bullets. Avoids
 * pulling react-markdown for the tiny subset we actually need.
 */
function renderInline(text: string): JSX.Element[] {
  const parts: JSX.Element[] = [];
  const boldRe = /\*\*(.+?)\*\*/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = boldRe.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(<span key={key++}>{text.slice(last, m.index)}</span>);
    }
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

export function MessageBubble({ message }: { message: UiMessage }) {
  const isUser = message.role === 'user';
  const time = new Date(message.createdAt).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        {!isUser && (
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-kerned text-muted-foreground">
            <Sparkles className="h-3 w-3 text-accent" strokeWidth={1.9} />
            Assistant
          </div>
        )}
        <div
          className={`rounded-xl px-3.5 py-2.5 text-[14px] leading-relaxed ${
            isUser
              ? 'bg-accent text-accent-foreground'
              : 'bg-card border border-border/70'
          }`}
        >
          {message.content ? (
            renderContent(message.content)
          ) : message.isStreaming ? (
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse" />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse [animation-delay:240ms]" />
            </span>
          ) : (
            <span className="text-muted-foreground italic">(no response)</span>
          )}
        </div>
        {!isUser && message.card && <PortfolioDataCard card={message.card} />}
        <div className="text-[10px] text-muted-foreground/70">{time}</div>
      </div>
    </div>
  );
}
