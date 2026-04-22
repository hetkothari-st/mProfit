import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Trash2, Plus, RefreshCw } from 'lucide-react';
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

const TYPE_COLORS: Record<AlertType, string> = {
  FD_MATURITY: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  BOND_MATURITY: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  MF_LOCK_IN_EXPIRY: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  SIP_DUE: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  INSURANCE_PREMIUM: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  DIVIDEND_RECEIVED: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  CORPORATE_ACTION: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  PRICE_TARGET: 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
  CUSTOM: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const ALL_TYPES: AlertType[] = [
  'FD_MATURITY', 'BOND_MATURITY', 'MF_LOCK_IN_EXPIRY', 'SIP_DUE',
  'INSURANCE_PREMIUM', 'DIVIDEND_RECEIVED', 'CORPORATE_ACTION', 'PRICE_TARGET', 'CUSTOM',
];

function AlertRow({ alert, onMarkRead, onDelete }: {
  alert: AlertDTO;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const isUrgent = !alert.isRead && new Date(alert.triggerDate) <= new Date();
  return (
    <div
      className={cn(
        'flex items-start gap-4 px-4 py-3.5 border-b last:border-0 transition-colors',
        alert.isRead ? 'bg-transparent' : 'bg-primary/[0.03]',
        isUrgent && !alert.isRead && 'bg-orange-50/60 dark:bg-orange-950/20',
      )}
    >
      <div className="mt-0.5 flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', TYPE_COLORS[alert.type])}>
            {TYPE_LABELS[alert.type]}
          </span>
          {!alert.isRead && (
            <span className="h-2 w-2 rounded-full bg-primary shrink-0" aria-label="Unread" />
          )}
        </div>
        <p className={cn('text-sm mt-1', alert.isRead ? 'text-muted-foreground' : 'font-medium')}>{alert.title}</p>
        {alert.description && <p className="text-xs text-muted-foreground mt-0.5">{alert.description}</p>}
        <p className="text-xs text-muted-foreground mt-1">{alert.triggerDate}</p>
      </div>
      <div className="flex gap-1 shrink-0 mt-1">
        {!alert.isRead && (
          <button
            type="button"
            onClick={() => onMarkRead(alert.id)}
            title="Mark as read"
            className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
          >
            <CheckCheck className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(alert.id)}
          title="Dismiss"
          className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
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

  return (
    <div>
      <PageHeader
        title="Alerts & Reminders"
        description="Upcoming maturities, premium due dates, expiry reminders, and custom alerts"
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

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Select value={filterType} onChange={(e) => { setFilterType(e.target.value as AlertType | ''); setPage(1); }} className="w-44">
          <option value="">All types</option>
          {ALL_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => { setUnreadOnly(e.target.checked); setPage(1); }}
            className="rounded"
          />
          Unread only
          {unreadCount > 0 && (
            <span className="bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5 font-medium">
              {unreadCount}
            </span>
          )}
        </label>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => markAllMut.mutate()} disabled={markAllMut.isPending}>
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Card key={i} className="h-16 animate-pulse bg-muted/60" />)}
        </div>
      ) : (data?.alerts.length ?? 0) === 0 ? (
        <EmptyState
          icon={Bell}
          title="No alerts"
          description="You're all caught up. Alerts appear here for maturities, premium due dates, vehicle expiries, and rent reminders."
          action={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Create a reminder</Button>}
        />
      ) : (
        <Card>
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
        <div className="flex justify-center gap-2 mt-4">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground py-2">{page} / {Math.ceil((data?.total ?? 1) / 30)}</span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil((data?.total ?? 1) / 30)} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      <CreateAlertDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
