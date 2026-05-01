import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell, CheckCheck, Trash2, Plus, RefreshCw, CalendarDays, Filter,
  AlertTriangle, Inbox, Clock,
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

const TYPE_LABELS: Record<AlertType, string> = {
  FD_MATURITY: 'FD Maturity',
  BOND_MATURITY: 'Bond Maturity',
  MF_LOCK_IN_EXPIRY: 'MF Lock-in',
  SIP_DUE: 'SIP Due',
  INSURANCE_PREMIUM: 'Insurance Premium',
  DIVIDEND_RECEIVED: 'Dividend',
  CORPORATE_ACTION: 'Corporate Action',
  PRICE_TARGET: 'Price Target',
  CUSTOM: 'Custom',
};

// Editorial palette tones — refined HSL chips, not raw tailwind
const TYPE_TONES: Record<AlertType, { dot: string; text: string; ring: string; bg: string }> = {
  FD_MATURITY:        { dot: 'hsl(213 53% 32%)',  text: 'text-foreground/85', ring: 'border-[hsl(213_53%_32%/0.25)]', bg: 'bg-[hsl(213_53%_32%/0.06)]' },
  BOND_MATURITY:      { dot: 'hsl(260 28% 42%)',  text: 'text-foreground/85', ring: 'border-[hsl(260_28%_42%/0.25)]', bg: 'bg-[hsl(260_28%_42%/0.06)]' },
  MF_LOCK_IN_EXPIRY:  { dot: 'hsl(195 40% 34%)',  text: 'text-foreground/85', ring: 'border-[hsl(195_40%_34%/0.25)]', bg: 'bg-[hsl(195_40%_34%/0.06)]' },
  SIP_DUE:            { dot: 'hsl(36 60% 48%)',   text: 'text-foreground/85', ring: 'border-[hsl(36_60%_48%/0.30)]',  bg: 'bg-[hsl(36_60%_48%/0.08)]'  },
  INSURANCE_PREMIUM:  { dot: 'hsl(12 50% 44%)',   text: 'text-foreground/85', ring: 'border-[hsl(12_50%_44%/0.25)]',  bg: 'bg-[hsl(12_50%_44%/0.06)]'  },
  DIVIDEND_RECEIVED:  { dot: 'hsl(130 35% 32%)',  text: 'text-foreground/85', ring: 'border-[hsl(130_35%_32%/0.25)]', bg: 'bg-[hsl(130_35%_32%/0.06)]' },
  CORPORATE_ACTION:   { dot: 'hsl(28 70% 52%)',   text: 'text-foreground/85', ring: 'border-[hsl(28_70%_52%/0.30)]',  bg: 'bg-[hsl(28_70%_52%/0.08)]'  },
  PRICE_TARGET:       { dot: 'hsl(340 35% 38%)',  text: 'text-foreground/85', ring: 'border-[hsl(340_35%_38%/0.25)]', bg: 'bg-[hsl(340_35%_38%/0.06)]' },
  CUSTOM:             { dot: 'hsl(215 14% 38%)',  text: 'text-foreground/85', ring: 'border-border',                  bg: 'bg-muted/40'                },
};

const ALL_TYPES: AlertType[] = [
  'FD_MATURITY', 'BOND_MATURITY', 'MF_LOCK_IN_EXPIRY', 'SIP_DUE',
  'INSURANCE_PREMIUM', 'DIVIDEND_RECEIVED', 'CORPORATE_ACTION', 'PRICE_TARGET', 'CUSTOM',
];

function daysUntil(iso: string): number {
  const t = new Date(iso).getTime();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((t - today.getTime()) / 86_400_000);
}

function formatTriggerDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function AlertRow({ alert, onMarkRead, onDelete }: {
  alert: AlertDTO;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const tone = TYPE_TONES[alert.type];
  const days = daysUntil(alert.triggerDate);
  const isOverdue = days < 0;
  const isUrgent = days >= 0 && days <= 7;
  const railColor = !alert.isRead
    ? (isOverdue ? 'hsl(var(--negative))' : isUrgent ? 'hsl(var(--accent))' : 'hsl(var(--accent))')
    : 'transparent';

  return (
    <div
      className={cn(
        'group relative flex items-stretch gap-0 border-b border-border/60 last:border-0 transition-colors',
        alert.isRead ? 'bg-transparent hover:bg-muted/20' : 'bg-card hover:bg-muted/15',
      )}
    >
      {/* Urgency rail */}
      <span
        aria-hidden="true"
        className="w-[3px] shrink-0 transition-colors"
        style={{ background: railColor }}
      />

      <div className="flex flex-1 items-start gap-4 px-5 py-4">
        {/* Tone marker */}
        <div className="mt-0.5 flex flex-col items-center gap-1.5 pt-1">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-[1px] rotate-45 shrink-0"
            style={{ background: tone.dot }}
          />
          {!alert.isRead && (
            <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_0_3px_hsl(var(--accent)/0.18)]" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-kerned',
              tone.ring, tone.bg, tone.text,
            )}>
              {TYPE_LABELS[alert.type]}
            </span>
            {isOverdue && !alert.isRead && (
              <span className="inline-flex items-center gap-1 rounded-full border border-negative/30 bg-negative/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-kerned text-negative">
                <AlertTriangle className="h-3 w-3" strokeWidth={2.2} />
                Overdue
              </span>
            )}
            {isUrgent && !alert.isRead && !isOverdue && (
              <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-kerned text-accent-ink">
                <Clock className="h-3 w-3" strokeWidth={2.2} />
                {days === 0 ? 'Today' : `${days}d`}
              </span>
            )}
          </div>

          <p className={cn(
            'mt-2 text-[15px] font-medium leading-tight tracking-[-0.012em] text-balance',
            alert.isRead ? 'text-muted-foreground' : 'text-foreground',
          )}>
            {alert.title}
          </p>
          {alert.description && (
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              {alert.description}
            </p>
          )}
          <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CalendarDays className="h-3 w-3 text-muted-foreground/70" strokeWidth={1.7} />
            <span className="numeric tabular-nums">{formatTriggerDate(alert.triggerDate)}</span>
            {!isOverdue && !isUrgent && (
              <>
                <span className="h-1 w-1 rounded-full bg-border" />
                <span className="numeric tabular-nums">in {days}d</span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-1 shrink-0 mt-1 opacity-50 group-hover:opacity-100 transition-opacity">
          {!alert.isRead && (
            <button
              type="button"
              onClick={() => onMarkRead(alert.id)}
              title="Mark as read"
              className="p-1.5 rounded-md text-muted-foreground hover:text-positive hover:bg-positive/10 transition-colors focus-ring"
            >
              <CheckCheck className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete(alert.id)}
            title="Dismiss"
            className="p-1.5 rounded-md text-muted-foreground hover:text-negative hover:bg-negative/10 transition-colors focus-ring"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.7} />
          </button>
        </div>
      </div>
    </div>
  );
}

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
        <DialogHeader><DialogTitle>New Custom Alert</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. FD maturity at SBI" /></div>
          <div><Label>Description (optional)</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Additional details" /></div>
          <div><Label>Reminder date</Label><Input type="date" value={triggerDate} onChange={(e) => setTriggerDate(e.target.value)} /></div>
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

export function AlertsPage() {
  const qc = useQueryClient();
  const [filterType, setFilterType] = useState<AlertType | ''>('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', filterType, unreadOnly, page],
    queryFn: () => alertsApi.list({ type: filterType || undefined, unreadOnly, page, limit: 30 }),
  });

  const markReadMut = useMutation({
    mutationFn: (id: string) => alertsApi.markRead(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alerts'] }); qc.invalidateQueries({ queryKey: ['alerts-unread'] }); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => alertsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alerts'] }); qc.invalidateQueries({ queryKey: ['alerts-unread'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const markAllMut = useMutation({
    mutationFn: () => alertsApi.markAllRead(),
    onSuccess: () => {
      toast.success('All alerts marked as read');
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['alerts-unread'] });
    },
  });

  const scanMut = useMutation({
    mutationFn: () => alertsApi.triggerScan(),
    onSuccess: (r) => {
      toast.success(`Scan complete — ${r.vehicle + r.rent} new alerts`);
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['alerts-unread'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unreadCount = data?.unreadCount ?? 0;
  const totalCount = data?.total ?? 0;
  const overdueCount = (data?.alerts ?? []).filter(a => !a.isRead && daysUntil(a.triggerDate) < 0).length;
  const urgentCount = (data?.alerts ?? []).filter(a => !a.isRead && daysUntil(a.triggerDate) >= 0 && daysUntil(a.triggerDate) <= 7).length;

  return (
    <div>
      <PageHeader
        eyebrow="Inbox"
        title="Alerts & Reminders"
        description="Upcoming maturities, premium due dates, expiry reminders, and custom alerts — all curated in one ledger."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => scanMut.mutate()} disabled={scanMut.isPending}>
              <RefreshCw className={cn('h-4 w-4', scanMut.isPending && 'animate-spin')} />
              Scan now
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New alert
            </Button>
          </div>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 reveal">
        <KpiTile icon={Inbox}        label="Total"   value={totalCount}   tone="default" />
        <KpiTile icon={Bell}         label="Unread"  value={unreadCount}  tone={unreadCount > 0 ? 'accent' : 'default'} />
        <KpiTile icon={Clock}        label="Due ≤ 7d" value={urgentCount} tone={urgentCount > 0 ? 'accent' : 'default'} />
        <KpiTile icon={AlertTriangle} label="Overdue" value={overdueCount} tone={overdueCount > 0 ? 'negative' : 'positive'} />
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative inline-flex items-center">
          <Filter className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-muted-foreground z-10" strokeWidth={1.7} />
          <Select
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value as AlertType | ''); setPage(1); }}
            className="h-9 w-52 pl-9 pr-9 text-[13px] border-border/70 bg-card/50"
          >
            <option value="">All types</option>
            {ALL_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </Select>
        </div>

        <label className="inline-flex items-center gap-2 cursor-pointer rounded-md border border-border/70 bg-card/50 px-3.5 h-9 text-[13px] hover:border-accent/40 transition-colors">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => { setUnreadOnly(e.target.checked); setPage(1); }}
            className="h-3.5 w-3.5 rounded border-border accent-accent"
          />
          Unread only
          {unreadCount > 0 && (
            <span className="numeric tabular-nums text-[10.5px] font-medium rounded-full bg-accent text-accent-foreground px-1.5 py-0.5 ml-0.5">
              {unreadCount}
            </span>
          )}
        </label>

        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => markAllMut.mutate()} disabled={markAllMut.isPending} className="text-accent-ink hover:text-accent h-9">
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
        )}
      </div>

      {isLoading ? (
        <Card>
          <div className="divide-y divide-border/60">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[110px] animate-pulse bg-muted/30" />
            ))}
          </div>
        </Card>
      ) : (data?.alerts.length ?? 0) === 0 ? (
        <EmptyState
          icon={Bell}
          title="All clear"
          description="You're caught up. Alerts appear here for maturities, premium due dates, vehicle expiries, and rent reminders."
          action={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Create a reminder</Button>}
        />
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {data!.alerts.map((a) => (
              <AlertRow
                key={a.id}
                alert={a}
                onMarkRead={(id) => markReadMut.mutate(id)}
                onDelete={(id) => deleteMut.mutate(id)}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {(data?.total ?? 0) > 30 && (
        <div className="flex items-center justify-center gap-3 mt-6 text-[13px]">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-muted-foreground numeric tabular-nums">
            Page {page} of {Math.ceil((data?.total ?? 1) / 30)}
          </span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil((data?.total ?? 1) / 30)} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      <CreateAlertDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function KpiTile({ icon: Icon, label, value, tone }: {
  icon: typeof Bell;
  label: string;
  value: number;
  tone: 'default' | 'accent' | 'negative' | 'positive';
}) {
  const toneText =
    tone === 'accent' ? 'text-accent' :
    tone === 'negative' ? 'text-negative' :
    tone === 'positive' ? 'text-positive' :
    'text-muted-foreground';
  const toneRing =
    tone === 'accent' ? 'border-accent/25' :
    tone === 'negative' ? 'border-negative/25' :
    tone === 'positive' ? 'border-positive/25' :
    'border-border/70';

  return (
    <Card className={cn('p-4 transition-shadow hover:shadow-elev-lg', toneRing)}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-kerned text-muted-foreground">{label}</p>
          <p className="numeric numeric-display mt-1.5 text-[24px] tracking-tight text-foreground money-digits">
            {value}
          </p>
        </div>
        <div className={cn('grid h-9 w-9 place-items-center rounded-md border', toneRing)}>
          <Icon className={cn('h-4 w-4', toneText)} strokeWidth={1.6} />
        </div>
      </div>
    </Card>
  );
}
