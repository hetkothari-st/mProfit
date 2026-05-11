import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  CreditCard,
  Plus,
  ArrowUpRight,
  AlertTriangle,
  Loader2,
  Trash2,
  Pencil,
} from 'lucide-react';
import { Decimal, formatINR } from '@portfolioos/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { DownloadReportButton } from '@/components/reports/DownloadReportButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  creditCardsApi,
  type CreditCardDTO,
  type CreateCardInput,
} from '@/api/creditCards.api';
import { CreditCardVisual } from '@/components/creditCards/CreditCardVisual';

// ── Helpers ───────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'text-positive',
  BLOCKED: 'text-amber-600',
  CLOSED: 'text-muted-foreground',
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysUntil(isoDate: string): number {
  const due = new Date(isoDate).getTime();
  return Math.ceil((due - Date.now()) / (1000 * 60 * 60 * 24));
}

function utilizationClass(pct: number): string {
  if (pct >= 90) return 'bg-negative';
  if (pct >= 80) return 'bg-amber-500';
  if (pct >= 50) return 'bg-yellow-400';
  return 'bg-positive';
}

// ── Summary strip ─────────────────────────────────────────────────────

function SummaryStrip({ cards }: { cards: CreditCardDTO[] }) {
  const active = cards.filter((c) => c.status === 'ACTIVE');

  const totalLimit = active.reduce(
    (s, c) => s.plus(new Decimal(c.creditLimit)),
    new Decimal(0),
  );
  const totalOutstanding = active.reduce(
    (s, c) => s.plus(new Decimal(c.outstandingBalance ?? '0')),
    new Decimal(0),
  );
  const avgUtilization = totalLimit.isZero()
    ? 0
    : totalOutstanding.div(totalLimit).mul(100).toNumber();

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      {[
        { label: 'Total credit limit', value: formatINR(totalLimit.toString()), sub: `across ${active.length} active cards` },
        { label: 'Total outstanding', value: formatINR(totalOutstanding.toString()), sub: 'combined across active cards' },
        {
          label: 'Avg utilization',
          value: `${avgUtilization.toFixed(1)}%`,
          sub: avgUtilization > 80 ? 'High — consider paying down' : 'within healthy range',
          className: avgUtilization > 80 ? 'text-negative' : avgUtilization > 50 ? 'text-amber-600' : 'text-positive',
        },
      ].map((m) => (
        <Card key={m.label}>
          <CardContent className="px-4 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{m.label}</p>
            <p className={`text-xl font-semibold tabular-nums mt-1 ${m.className ?? ''}`}>{m.value}</p>
            <p className="text-xs text-muted-foreground">{m.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Card tile (credit-card visual + stats) ────────────────────────────

function CardCard({
  card,
  onEdit,
  onDelete,
  isDeleting,
}: {
  card: CreditCardDTO;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const outstanding = new Decimal(card.outstandingBalance ?? '0');
  const limit = new Decimal(card.creditLimit);
  const utilizationPct = limit.isZero() ? 0 : outstanding.div(limit).mul(100).toNumber();
  const isHighUtilization = utilizationPct >= 80;

  const pendingStatements = card.statements
    .filter((s) => s.status === 'PENDING' || s.status === 'OVERDUE' || s.status === 'PARTIAL')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const nextDue = pendingStatements[0] ?? null;
  const nextDueDays = nextDue ? daysUntil(nextDue.dueDate) : null;

  return (
    <div className="group relative">
      {/* Action overlay (top-right, hover-reveal) */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 bg-black/30 backdrop-blur text-white hover:bg-black/50 hover:text-white"
          onClick={onEdit}
          title="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 bg-black/30 backdrop-blur text-white hover:bg-negative/80 hover:text-white"
          onClick={onDelete}
          disabled={isDeleting}
          title="Delete"
        >
          {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 bg-black/30 backdrop-blur text-white hover:bg-black/50 hover:text-white"
          title="Open"
        >
          <Link to={`/credit-cards/${card.id}`}>
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* The credit-card visual itself */}
      <Link to={`/credit-cards/${card.id}`} className="block hover:-translate-y-0.5 transition-transform">
        <CreditCardVisual card={card} />
      </Link>

      {/* Stats panel below */}
      <div className="mt-3 px-1 space-y-2">
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Outstanding</span>
            <span className={`font-medium tabular-nums ${isHighUtilization ? 'text-negative' : ''}`}>
              {formatINR(outstanding.toString())} <span className="text-muted-foreground">({utilizationPct.toFixed(0)}%)</span>
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${utilizationClass(utilizationPct)}`}
              style={{ width: `${Math.min(100, utilizationPct)}%` }}
            />
          </div>
        </div>

        {nextDue && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Next due</span>
            <div className="flex items-center gap-1.5">
              <span className="tabular-nums">{formatINR(nextDue.statementAmount)}</span>
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                nextDueDays !== null && nextDueDays < 0
                  ? 'bg-negative/10 text-negative'
                  : nextDueDays !== null && nextDueDays <= 5
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {nextDueDays !== null && nextDueDays < 0 ? 'Overdue' :
                 nextDueDays === 0 ? 'Today' :
                 nextDueDays !== null ? `${nextDueDays}d` : formatDate(nextDue.dueDate)}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Status</span>
          <span className={`font-medium capitalize ${STATUS_COLORS[card.status] ?? ''}`}>
            {card.status.toLowerCase()}
          </span>
        </div>

        {isHighUtilization && card.status === 'ACTIVE' && (
          <div className="mt-1 rounded-md bg-negative/10 px-3 py-1.5 text-xs text-negative font-medium flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            High utilization — may impact credit score
          </div>
        )}
      </div>
    </div>
  );
}

// ── Create / Edit dialog ──────────────────────────────────────────────

function CreateCardDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: CreditCardDTO | null;
}) {
  const qc = useQueryClient();
  const isEdit = !!initial;

  const [form, setForm] = useState<CreateCardInput>({
    issuerBank: initial?.issuerBank ?? '',
    cardName: initial?.cardName ?? '',
    last4: initial?.last4 ?? '',
    network: initial?.network ?? null,
    creditLimit: initial?.creditLimit ?? '',
    statementDay: initial?.statementDay ?? 1,
    dueDay: initial?.dueDay ?? 20,
    interestRate: initial?.interestRate ?? null,
    annualFee: initial?.annualFee ?? null,
    status: initial?.status ?? 'ACTIVE',
  });

  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  // Re-sync form when dialog opens with a different initial card
  useEffect(() => {
    if (open) {
      setForm({
        issuerBank: initial?.issuerBank ?? '',
        cardName: initial?.cardName ?? '',
        last4: initial?.last4 ?? '',
        network: initial?.network ?? null,
        creditLimit: initial?.creditLimit ?? '',
        statementDay: initial?.statementDay ?? 1,
        dueDay: initial?.dueDay ?? 20,
        interestRate: initial?.interestRate ?? null,
        annualFee: initial?.annualFee ?? null,
        status: initial?.status ?? 'ACTIVE',
      });
      setErrors({});
    }
  }, [open, initial]);

  const mutation = useMutation({
    mutationFn: (input: CreateCardInput) =>
      isEdit ? creditCardsApi.update(initial!.id, input) : creditCardsApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-cards'] });
      toast.success(isEdit ? 'Card updated' : 'Card added');
      onOpenChange(false);
    },
    onError: () => toast.error(isEdit ? 'Failed to update card' : 'Failed to add card'),
  });

  function set<K extends keyof CreateCardInput>(key: K, value: CreateCardInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.issuerBank.trim()) errs['issuerBank'] = 'Required';
    if (!form.cardName.trim()) errs['cardName'] = 'Required';
    if (!form.last4.trim() || form.last4.length !== 4 || !/^\d{4}$/.test(form.last4)) errs['last4'] = 'Must be 4 digits';
    if (!form.creditLimit || isNaN(Number(form.creditLimit))) errs['creditLimit'] = 'Required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    mutation.mutate({
      ...form,
      issuerBank: form.issuerBank.trim(),
      cardName: form.cardName.trim(),
      last4: form.last4.trim(),
      interestRate: form.interestRate?.trim() || null,
      annualFee: form.annualFee?.trim() || null,
      network: form.network || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit credit card' : 'Add credit card'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Issuer bank *</Label>
              <Input placeholder="HDFC, ICICI, Axis…" value={form.issuerBank}
                onChange={(e) => set('issuerBank', e.target.value)}
                className={errors['issuerBank'] ? 'border-negative' : ''} />
              {errors['issuerBank'] && <p className="text-xs text-negative mt-1">{errors['issuerBank']}</p>}
            </div>
            <div>
              <Label>Card name *</Label>
              <Input placeholder="Regalia, Millennia…" value={form.cardName}
                onChange={(e) => set('cardName', e.target.value)}
                className={errors['cardName'] ? 'border-negative' : ''} />
              {errors['cardName'] && <p className="text-xs text-negative mt-1">{errors['cardName']}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Last 4 digits *</Label>
              <Input placeholder="1234" maxLength={4} value={form.last4}
                onChange={(e) => set('last4', e.target.value)}
                className={errors['last4'] ? 'border-negative' : ''} />
              {errors['last4'] && <p className="text-xs text-negative mt-1">{errors['last4']}</p>}
            </div>
            <div>
              <Label>Network</Label>
              <select
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.network ?? ''}
                onChange={(e) => set('network', e.target.value || null)}
              >
                <option value="">— select —</option>
                {['VISA', 'MASTERCARD', 'AMEX', 'RUPAY'].map((n) => (
                  <option key={n} value={n}>{n.charAt(0) + n.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label>Credit limit (₹) *</Label>
            <Input placeholder="500000" value={form.creditLimit}
              onChange={(e) => set('creditLimit', e.target.value)}
              className={errors['creditLimit'] ? 'border-negative' : ''} />
            {errors['creditLimit'] && <p className="text-xs text-negative mt-1">{errors['creditLimit']}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Statement day</Label>
              <Input type="number" min="1" max="31" value={form.statementDay}
                onChange={(e) => set('statementDay', Number(e.target.value))} />
            </div>
            <div>
              <Label>Due day</Label>
              <Input type="number" min="1" max="31" value={form.dueDay}
                onChange={(e) => set('dueDay', Number(e.target.value))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Interest rate (% p.a.)</Label>
              <Input placeholder="42.00" value={form.interestRate ?? ''}
                onChange={(e) => set('interestRate', e.target.value || null)} />
            </div>
            <div>
              <Label>Annual fee (₹)</Label>
              <Input placeholder="1000" value={form.annualFee ?? ''}
                onChange={(e) => set('annualFee', e.target.value || null)} />
            </div>
          </div>

          <div>
            <Label>Status</Label>
            <select
              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
            >
              {['ACTIVE', 'BLOCKED', 'CLOSED'].map((s) => (
                <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </div>
        </div>

        {mutation.isError && (
          <p className="text-sm text-negative">
            {mutation.error instanceof Error ? mutation.error.message : 'Failed to save card'}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────

export function CreditCardListPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editCard, setEditCard] = useState<CreditCardDTO | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: cards, isLoading } = useQuery({
    queryKey: ['credit-cards'],
    queryFn: () => creditCardsApi.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => creditCardsApi.remove(id),
    onSuccess: () => {
      toast.success('Card deleted');
      setConfirmDeleteId(null);
      qc.invalidateQueries({ queryKey: ['credit-cards'] });
    },
    onError: () => toast.error('Failed to delete card'),
  });

  const list = cards ?? [];
  const active = list.filter((c) => c.status === 'ACTIVE');
  const inactive = list.filter((c) => c.status !== 'ACTIVE');

  return (
    <div>
      <PageHeader
        title="Credit Cards"
        description="Track credit cards, statements, and payment history"
        actions={
          <div className="flex gap-2">
            <DownloadReportButton type="credit-cards" />
            <Button onClick={() => { setEditCard(null); setCreateOpen(true); }}>
              <Plus className="h-4 w-4" /> Add card
            </Button>
          </div>
        }
      />

      {!isLoading && list.length > 0 && <SummaryStrip cards={list} />}

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-44 animate-pulse bg-muted/60" />
          ))}
        </div>
      )}

      {!isLoading && list.length === 0 && (
        <EmptyState
          icon={CreditCard}
          title="No credit cards yet"
          description="Add your credit cards to track statements, payments, and utilization."
          action={
            <Button onClick={() => { setEditCard(null); setCreateOpen(true); }}>
              <Plus className="h-4 w-4" /> Add first card
            </Button>
          }
        />
      )}

      {!isLoading && active.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {active.map((card) =>
            confirmDeleteId === card.id ? (
              <Card key={card.id} className="border-destructive">
                <CardContent className="p-5 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium truncate">Delete "{card.issuerBank} ●●●● {card.last4}"?</p>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(card.id)}
                    >
                      {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>No</Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <CardCard
                key={card.id}
                card={card}
                onEdit={() => { setEditCard(card); setCreateOpen(true); }}
                onDelete={() => setConfirmDeleteId(card.id)}
                isDeleting={deleteMutation.isPending && confirmDeleteId === card.id}
              />
            )
          )}
        </div>
      )}

      {!isLoading && inactive.length > 0 && (
        <>
          <h2 className="text-sm font-medium text-muted-foreground mt-8 mb-3">Blocked / Closed</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
            {inactive.map((card) =>
              confirmDeleteId === card.id ? (
                <Card key={card.id} className="border-destructive">
                  <CardContent className="p-5 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium truncate">Delete "{card.issuerBank} ●●●● {card.last4}"?</p>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(card.id)}
                      >
                        {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>No</Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <CardCard
                  key={card.id}
                  card={card}
                  onEdit={() => { setEditCard(card); setCreateOpen(true); }}
                  onDelete={() => setConfirmDeleteId(card.id)}
                  isDeleting={deleteMutation.isPending && confirmDeleteId === card.id}
                />
              )
            )}
          </div>
        </>
      )}

      <CreateCardDialog
        open={createOpen}
        onOpenChange={(v) => { setCreateOpen(v); if (!v) setEditCard(null); }}
        initial={editCard}
      />
    </div>
  );
}
