import { Link } from 'react-router-dom';
import { Sparkles, Lock } from 'lucide-react';
import { PortfolioDataCard } from './PortfolioDataCard';
import type { UiMessage } from '@/hooks/useAIAssistant';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Chat bubble. Assistant messages get an avatar column on the left
 * (financial-planner look); user messages sit on the right with a
 * filled accent pill + the user's initials.
 *
 * Renders a hand-rolled Markdown subset tuned for financial answers:
 *   - Paragraphs (blank-line separated)
 *   - Bullet lists (consecutive `- ` lines → single <ul>)
 *   - Numbered lists (consecutive `1. ` lines → single <ol>)
 *   - Bold via **text**
 *   - Auto-highlights for numeric tokens (percentages, ₹ amounts,
 *     "p.a.") so the reader can scan without hunting for the numbers.
 */

// ─── Inline pass ─────────────────────────────────────────────────────

type InlineNode = { kind: 'text' | 'bold' | 'num'; text: string };

const NUM_RE = /(₹\s?[\d,]+(?:\.\d+)?\s*(?:lakh|crore|cr|k)?|-?\d+(?:\.\d+)?\s*%(?:\s*p\.?a\.?)?)/gi;

function tokenizeInline(text: string): InlineNode[] {
  // First split on **bold**; then within each non-bold segment run the
  // number highlighter. Order matters because auto-highlighting inside
  // bold would double-tint the token.
  const out: InlineNode[] = [];
  const boldRe = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = boldRe.exec(text)) !== null) {
    if (m.index > last) {
      pushWithNumbers(out, text.slice(last, m.index));
    }
    out.push({ kind: 'bold', text: m[1]! });
    last = m.index + m[0].length;
  }
  if (last < text.length) pushWithNumbers(out, text.slice(last));
  return out;
}

function pushWithNumbers(out: InlineNode[], chunk: string): void {
  let last = 0;
  let m: RegExpExecArray | null;
  NUM_RE.lastIndex = 0;
  while ((m = NUM_RE.exec(chunk)) !== null) {
    if (m.index > last) out.push({ kind: 'text', text: chunk.slice(last, m.index) });
    out.push({ kind: 'num', text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < chunk.length) out.push({ kind: 'text', text: chunk.slice(last) });
}

function renderInline(text: string, keyBase = 0): JSX.Element[] {
  return tokenizeInline(text).map((n, i) => {
    if (n.kind === 'bold') {
      return (
        <strong
          key={`${keyBase}-b-${i}`}
          className="font-semibold text-foreground"
        >
          {n.text}
        </strong>
      );
    }
    if (n.kind === 'num') {
      return (
        <span
          key={`${keyBase}-n-${i}`}
          className="tabular-nums font-medium text-accent-ink"
        >
          {n.text}
        </span>
      );
    }
    return <span key={`${keyBase}-t-${i}`}>{n.text}</span>;
  });
}

// ─── Block pass ──────────────────────────────────────────────────────

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] };

function parseBlocks(input: string): Block[] {
  const lines = input.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paraBuf: string[] = [];
  let ulBuf: string[] = [];
  let olBuf: string[] = [];

  const flushPara = () => {
    if (paraBuf.length > 0) {
      blocks.push({ kind: 'p', text: paraBuf.join(' ').trim() });
      paraBuf = [];
    }
  };
  const flushUl = () => {
    if (ulBuf.length > 0) {
      blocks.push({ kind: 'ul', items: ulBuf });
      ulBuf = [];
    }
  };
  const flushOl = () => {
    if (olBuf.length > 0) {
      blocks.push({ kind: 'ol', items: olBuf });
      olBuf = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '') {
      flushPara();
      flushUl();
      flushOl();
      continue;
    }
    const bullet = line.match(/^[-•]\s+(.+)$/);
    const numbered = line.match(/^(\d+)\.\s+(.+)$/);
    if (bullet) {
      flushPara();
      flushOl();
      ulBuf.push(bullet[1]!);
      continue;
    }
    if (numbered) {
      flushPara();
      flushUl();
      olBuf.push(numbered[2]!);
      continue;
    }
    flushUl();
    flushOl();
    paraBuf.push(line);
  }
  flushPara();
  flushUl();
  flushOl();
  return blocks;
}

function renderBlocks(text: string): JSX.Element[] {
  const blocks = parseBlocks(text);
  return blocks.map((b, i) => {
    if (b.kind === 'p') {
      return (
        <p key={i} className={i > 0 ? 'mt-2.5' : ''}>
          {renderInline(b.text, i)}
        </p>
      );
    }
    if (b.kind === 'ul') {
      return (
        <ul key={i} className={`space-y-1 ${i > 0 ? 'mt-2.5' : ''}`}>
          {b.items.map((item, j) => (
            <li key={j} className="flex gap-2 pl-0.5">
              <span
                aria-hidden
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
              />
              <span className="flex-1">{renderInline(item, i * 100 + j)}</span>
            </li>
          ))}
        </ul>
      );
    }
    return (
      <ol
        key={i}
        className={`list-decimal list-outside pl-5 space-y-1 marker:text-muted-foreground ${
          i > 0 ? 'mt-2.5' : ''
        }`}
      >
        {b.items.map((item, j) => (
          <li key={j} className="pl-1">
            {renderInline(item, i * 100 + j)}
          </li>
        ))}
      </ol>
    );
  });
}

// ─── Bubble ──────────────────────────────────────────────────────────

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
      locked={message.locked ?? false}
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
            {/* User messages are plain text — no markdown parsing. */}
            {content.split(/\n\n+/).map((p, i) => (
              <p key={i} className={i > 0 ? 'mt-1.5' : ''}>
                {p}
              </p>
            ))}
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
  locked,
}: {
  content: string;
  time: string;
  isStreaming: boolean;
  card: UiMessage['card'];
  locked: boolean;
}) {
  return (
    <div className="flex justify-start mb-4 group">
      <div className="flex items-start gap-2 max-w-[88%]">
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-accent via-accent/85 to-accent/60 flex items-center justify-center shrink-0 ring-1 ring-background shadow-sm mt-0.5">
          <Sparkles className="h-3.5 w-3.5 text-accent-foreground" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex flex-col gap-1">
          <div className="rounded-2xl rounded-tl-md px-4 py-3 text-[14px] leading-[1.6] bg-card border border-border/70 shadow-sm">
            {locked ? (
              <LockedAnswer />
            ) : content ? (
              renderBlocks(content)
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
          {!locked && card && <PortfolioDataCard card={card} />}
          <div className="text-[10px] text-muted-foreground/70 opacity-0 group-hover:opacity-100 transition-opacity">
            {time}
          </div>
        </div>
      </div>
    </div>
  );
}

// FREE-tier: the assistant "answered", but the content is a blurred
// skeleton, not real text — the response was never generated (see
// useAIAssistant's sendMessage). Blurring real text can still be partly
// legible at low blur, so this uses solid placeholder bars instead.
function LockedAnswer() {
  // Fixed pixel widths, not percentages — the bars are the only normal-flow
  // content sizing this box, so a percentage width has nothing real to
  // resolve against and the box collapses to near-zero, letting the
  // absolutely-positioned CTA pill overflow past its own container.
  return (
    <div className="relative w-56 sm:w-64">
      <div aria-hidden className="space-y-2 blur-[3px] select-none opacity-70">
        <div className="h-3 w-full rounded-full bg-muted-foreground/25" />
        <div className="h-3 w-[80%] rounded-full bg-muted-foreground/25" />
        <div className="h-3 w-[88%] rounded-full bg-muted-foreground/25" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <Link
          to="/pricing"
          className="inline-flex items-center gap-1.5 rounded-full bg-accent text-accent-foreground text-[11px] font-medium px-3 py-1.5 shadow-md hover:opacity-90 transition-opacity whitespace-nowrap"
        >
          <Lock className="h-3 w-3" strokeWidth={2} /> Upgrade to unlock
        </Link>
      </div>
    </div>
  );
}
