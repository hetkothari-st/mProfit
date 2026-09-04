import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell, CheckCheck, Trash2, Plus, RefreshCw, Filter, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/common/EmptyState';
import { alertsApi, type AlertType, type AlertDTO } from '@/api/alerts.api';
import { cn } from '@/lib/cn';

/**
 * Alerts, set as a ledger grouped by when they land.
 *
 * The only question this page answers is "what must I do, and by when". So
 * time is the structure rather than a field inside each row: overdue first,
 * then this week, this month, later — each a labelled band you can stop
 * reading once it stops being urgent. Within a band every row shares one
 * column grid, so the dates line up and the eye runs down a single edge
 * instead of hunting for them.
 *
 * Deliberately dropped from the previous design:
 *
 *   - Nine hand-picked HSL hues, one per alert type. This theme is monochrome
 *     with a single accent; here colour means urgency and nothing else, so the
 *     type became a quiet label in its own column instead of a coloured pill.
 *   - A four-tile KPI strip sitting above a filter bar that restated it. The
 *     counts now live ON the filters, which makes them actionable rather than
 *     decorative and removes the third place "unread" was being announced.
 *   - The day count printed twice in every row (badge, then footer).
 *   - Actions held at opacity-50 until hover — invisible on a touch screen.
 *
 * Read/unread is carried by ONE signal (accent rail + title weight), not by a
 * rail AND a dot AND a background tint all saying the same bit.
 */

const TYPE_LABELS: Record<AlertType, string> = {
  FD_MATURITY: 'FD maturity',
  BOND_MATURITY: 'Bond maturity',
  MF_LOCK_IN_EXPIRY: 'MF lock-in',
  SIP_DUE: 'SIP due',
  INSURANCE_PREMIUM: 'Insurance premium',
  DIVIDEND_RECEIVED: 'Dividend',
  CORPORATE_ACTION: 'Corporate action',
  PRICE_TARGET: 'Price target',
  CUSTOM: 'Custom',
};

const ALL_TYPES: AlertType[] = [
  'FD_MATURITY', 'BOND_MATURITY', 'MF_LOCK_IN_EXPIRY', 'SIP_DUE',
  'INSURANCE_PREMIUM', 'DIVIDEND_RECEIVED', 'CORPORATE_ACTION', 'PRICE_TARGET', 'CUSTOM',
];

const PAGE_SIZE = 30;
const DAY_MS = 86_400_000;

function daysUntil(iso: string): number {
  const t = new Date(iso).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((t - today.getTime()) / DAY_MS);
}

function exactDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

/** Short relative form for the left column — same idiom as the family feed. */
function relativeDay(days: number): string {
  if (days < 0) return `${Math.abs(days)}d late`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days}d`;
}

// ─── Time bands ──────────────────────────────────────────────────────

type BandKey = 'overdue' | 'week' | 'month' | 'later';

const BANDS: { key: BandKey; label: string; caption: string }[] = [
  { key: 'overdue', label: 'Overdue',    caption: 'past their date' },
  { key: 'week',    label: 'This week',  caption: 'next 7 days' },
  { key: 'month',   label: 'This month', caption: 'next 30 days' },
  { key: 'later',   label: 'Later',      caption: 'beyond 30 days' },
];

function bandOf(days: number): BandKey {
  if (days < 0) return 'overdue';
  if (days <= 7) return 'week';
  if (days <= 30) return 'month';
  return 'later';
}

// ─── Row ─────────────────────────────────────────────────────────────

/**
 * `[when] [what] [actions]`. The `when` column is a fixed width so every date
 * in every band sits on the same axis — that alignment is the whole reason
 * this reads as a ledger and not as a stack of cards.
 */
const ROW_GRID = 'grid grid-cols-[76px_minmax(0,1fr)_auto] sm:grid-cols-[104px_minmax(0,1fr)_auto]';

function AlertRow({ alert, onMarkRead, onDelete }: {
  alert: AlertDTO;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const days = daysUntil(alert.triggerDate);
  const overdue = days < 0;
  const unread = !alert.isRead;
  const typeLabel = TYPE_LABELS[alert.type as AlertType] ?? alert.type.replace(/_/g, ' ').toLowerCase();

  return (
    <div className={cn(
      ROW_GRID,
      'group relative items-start gap-3 sm:gap-5 py-3 sm:py-3.5 pl-3 pr-2 sm:pl-5 sm:pr-3',
      'border-b border-border/50 last:border-0 transition-colors hover:bg-muted/25',
    )}>
      {/* Unread rail. One signal, not three. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute bottom-0 left-0 top-0 w-[2px] transition-colors',
          unread ? (overdue ? 'bg-negative' : 'bg-accent') : 'bg-transparent',
        )}
      />

      {/* When */}
      <div className="pt-px">
        <p className={cn(
          'numeric tabular-nums text-[12px] leading-tight tracking-tight sm:text-[12.5px]',
          overdue ? 'font-medium text-negative' : unread ? 'text-foreground' : 'text-muted-foreground',
        )}>
          {relativeDay(days)}
        </p>
        <p className="numeric tabular-nums mt-0.5 text-[10.5px] leading-tight text-muted-foreground/70">
          {exactDate(alert.triggerDate)}
        </p>
      </div>

      {/* What */}
      <div className="min-w-0">
        <p className="text-[9.5px] uppercase tracking-kerned text-muted-foreground/80">
          {typeLabel}
        </p>
        <p className={cn(
          'mt-1 text-[13.5px] leading-snug tracking-[-0.011em] text-pretty sm:text-[14px]',
          unread ? 'font-medium text-foreground' : 'text-muted-foreground',
        )}>
          {alert.title}
        </p>
        {alert.description && (
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground/85 text-pretty">
            {alert.description}
          </p>
        )}
      </div>

      {/* Actions — always visible; hover only strengthens them. */}
      <div className="flex items-center gap-0.5 pt-0.5">
        {unread && (
          <button
            type="button"
            onClick={() => onMarkRead(alert.id)}
            title="Mark as read"
            aria-label={`Mark "${alert.title}" as read`}
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground/60 transition-colors hover:bg-positive/10 hover:text-positive focus-ring"
          >
            <CheckCheck className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(alert.id)}
          title="Dismiss"
          aria-label={`Dismiss "${alert.title}"`}
          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground/60 transition-colors hover:bg-negative/10 hover:text-negative focus-ring"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.7} />
        </button>
      </div>
    </div>
  );
}

// ─── Band header ─────────────────────────────────────────────────────

function BandHeader({ label, caption, count, tone }: {
  label: string;
  caption: string;
  count: number;
  tone: 'negative' | 'default';
}) {
  return (
    <div className={cn(
      ROW_GRID,
      'items-baseline gap-3 border-b border-border/60 bg-muted/40 py-2 pl-3 pr-3 sm:gap-5 sm:pl-5',
    )}>
      <p className={cn(
        'text-[10px] font-medium uppercase tracking-kerned',
        tone === 'negative' ? 'text-negative' : 'text-foreground/70',
      )}>
        {label}
      </p>
      <p className="text-[10.5px] text-muted-foreground/70">{caption}</p>
      <p className="numeric tabular-nums text-[11px] text-muted-foreground">{count}</p>
    </div>
  );
}

// ─── Filter chip ─────────────────────────────────────────────────────

function FilterChip({ label, count, active, onClick, tone = 'default' }: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone?: 'default' | 'negative';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-md border px-3 text-[12.5px] transition-colors focus-ring',
        active
          ? 'border-accent/45 bg-accent/10 text-foreground'
          : 'border-border/70 bg-card/50 text-muted-foreground hover:border-border hover:text-foreground',
      )}
    >
      <span className={cn(tone === 'negative' && count > 0 && !active && 'text-negative')}>
        {label}
      </span>
      <span className={cn(
        'numeric tabular-nums text-[11px]',
        active
          ? 'text-foreground/70'
          : tone === 'negative' && count > 0
            ? 'text-negative'
            : 'text-muted-foreground/70',
      )}>
        {count}
      </span>
    </button>
  );
}

// ─── Create dialog ───────────────────────────────────────────────────

function CreateAlertDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [triggerDate, setTriggerDate] = useState(new Date().toISOString().slice(0, 10));

  const createMut = useMutation({
    mutationFn: () => alertsApi.createCustom({ title, description: description || undefined, triggerDate }),
    onSuccess: () => {
      toast.success('Alert created');
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['alerts-unread'] });
      onOpenChange(false);
      setTitle(''); setDescription(''); setTriggerDate(new Date().toISOString().slice(0, 10));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New reminder</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. FD maturity at SBI" />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Additional details" />
          </div>
          <div>
            <Label>Reminder date</Label>
            <Input type="date" value={triggerDate} onChange={(e) => setTriggerDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => createMut.mutate()} disabled={!title || createMut.isPending}>
            {createMut.isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ────────────────────────────────────────────────────────────

type Lens = 'all' | 'overdue' | 'soon' | 'unread';

export function AlertsPage() {
  const qc = useQueryClient();
  const [filterType, setFilterType] = useState<AlertType | ''>('');
  const [lens, setLens] = useState<Lens>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', filterType, page],
    queryFn: () => alertsApi.list({ type: filterType || undefined, page, limit: PAGE_SIZE }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['alerts'] });
    qc.invalidateQueries({ queryKey: ['alerts-unread'] });
  };

  const markReadMut = useMutation({
    mutationFn: (id: string) => alertsApi.markRead(id),
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => alertsApi.delete(id),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const markAllMut = useMutation({
    mutationFn: () => alertsApi.markAllRead(),
    onSuccess: () => { toast.success('All alerts marked as read'); invalidate(); },
  });

  const scanMut = useMutation({
    mutationFn: () => alertsApi.triggerScan(),
    onSuccess: (r) => { toast.success(`Scan complete — ${r.vehicle + r.rent} new alerts`); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const alerts = useMemo(() => data?.alerts ?? [], [data]);
  const total = data?.total ?? 0;
  const unreadCount = data?.unreadCount ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /**
   * Lens counts describe the LOADED page, not the whole ledger — the API
   * paginates, and only `total` / `unreadCount` are ledger-wide. The footer
   * states the scope so the two kinds of number are never read as one.
   */
  const counts = useMemo(() => {
    let overdue = 0, soon = 0, unread = 0;
    for (const a of alerts) {
      const d = daysUntil(a.triggerDate);
      if (d < 0) overdue += 1;
      else if (d <= 7) soon += 1;
      if (!a.isRead) unread += 1;
    }
    return { all: alerts.length, overdue, soon, unread };
  }, [alerts]);

  const visible = useMemo(() => alerts.filter((a) => {
    const d = daysUntil(a.triggerDate);
    if (lens === 'overdue') return d < 0;
    if (lens === 'soon') return d >= 0 && d <= 7;
    if (lens === 'unread') return !a.isRead;
    return true;
  }), [alerts, lens]);

  /** Bucket into time bands, each internally sorted soonest-first. */
  const banded = useMemo(() => {
    const map: Record<BandKey, AlertDTO[]> = { overdue: [], week: [], month: [], later: [] };
    for (const a of visible) map[bandOf(daysUntil(a.triggerDate))].push(a);
    for (const key of Object.keys(map) as BandKey[]) {
      map[key].sort((x, y) => daysUntil(x.triggerDate) - daysUntil(y.triggerDate));
    }
    return map;
  }, [visible]);

  const nothingLoaded = !isLoading && alerts.length === 0;
  const filteredToNothing = !isLoading && alerts.length > 0 && visible.length === 0;

  return (
    <div>
      <PageHeader
        eyebrow="Inbox"
        title="Alerts & Reminders"
        description="Maturities, premium due dates, expiries and your own reminders — grouped by when they land."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => scanMut.mutate()} disabled={scanMut.isPending}>
              <RefreshCw className={cn('h-4 w-4', scanMut.isPending && 'animate-spin')} />
              Scan now
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New reminder
            </Button>
          </div>
        }
      />

      {/* One control row: counts live on the filters that act on them. */}
      <div className="reveal mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip label="All"      count={counts.all}     active={lens === 'all'}     onClick={() => setLens('all')} />
          <FilterChip label="Overdue"  count={counts.overdue} active={lens === 'overdue'} onClick={() => setLens('overdue')} tone="negative" />
          <FilterChip label="Due ≤ 7d" count={counts.soon}    active={lens === 'soon'}    onClick={() => setLens('soon')} />
          <FilterChip label="Unread"   count={counts.unread}  active={lens === 'unread'}  onClick={() => setLens('unread')} />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative inline-flex items-center">
            <Filter className="pointer-events-none absolute left-3 z-10 h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.7} />
            <Select
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value as AlertType | ''); setPage(1); }}
              className="h-9 w-40 border-border/70 bg-card/50 pl-9 pr-9 text-[12.5px] sm:w-48"
            >
              <option value="">All types</option>
              {ALL_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </Select>
          </div>

          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllMut.mutate()}
              disabled={markAllMut.isPending}
              className="h-9 text-accent-ink hover:text-accent"
            >
              <CheckCheck className="h-4 w-4" /> Mark all read
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border/50">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-[76px] animate-pulse bg-muted/30" />
            ))}
          </div>
        </Card>
      ) : nothingLoaded ? (
        <EmptyState
          icon={Bell}
          title="All clear"
          description="Nothing is due. Alerts appear here for maturities, premium due dates, vehicle expiries and rent reminders."
          action={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Create a reminder</Button>}
        />
      ) : filteredToNothing ? (
        /* Distinct from "all clear": alerts DO exist, this lens just hides them. */
        <Card className="overflow-hidden">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <AlertTriangle className="h-5 w-5 text-muted-foreground/60" strokeWidth={1.6} />
            <p className="text-[13.5px] text-foreground">Nothing in this view</p>
            <p className="max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
              {counts.all} alert{counts.all === 1 ? '' : 's'} loaded, but none match this filter.
            </p>
            <Button variant="outline" size="sm" onClick={() => setLens('all')}>Show all</Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {BANDS.map(({ key, label, caption }) => {
              const rows = banded[key];
              if (rows.length === 0) return null;
              return (
                <div key={key}>
                  <BandHeader
                    label={label}
                    caption={caption}
                    count={rows.length}
                    tone={key === 'overdue' ? 'negative' : 'default'}
                  />
                  {rows.map((a) => (
                    <AlertRow
                      key={a.id}
                      alert={a}
                      onMarkRead={(id) => markReadMut.mutate(id)}
                      onDelete={(id) => deleteMut.mutate(id)}
                    />
                  ))}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Scope line — separates page-local chip counts from ledger-wide totals. */}
      {!isLoading && total > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[11.5px] text-muted-foreground">
          <p className="numeric tabular-nums">
            Showing {alerts.length} of {total}
            {unreadCount > 0 && <> · {unreadCount} unread in total</>}
          </p>
          {pageCount > 1 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="numeric tabular-nums">Page {page} of {pageCount}</span>
              <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      <CreateAlertDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
