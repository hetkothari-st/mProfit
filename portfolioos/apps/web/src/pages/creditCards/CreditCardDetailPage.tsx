import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Plus,
  Trash2,
  CheckCircle2,
  Loader2,
  CreditCard,
} from 'lucide-react';
import { Decimal, formatINR } from '@portfolioos/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  type CreditCardStatementDTO,
  type AddStatementInput,
  type MarkStatementPaidInput,
} from '@/api/creditCards.api';
import { CreditCardVisual } from '@/components/creditCards/CreditCardVisual';

// ── Helpers ───────────────────────────────────────────────────────────

const STATEMENT_STATUS_COLORS: Record<string, string> = {
  PENDING: 'text-amber-600',
  PAID: 'text-positive',
  PARTIAL: 'text-blue-500',
  OVERDUE: 'text-negative',
};

const STATEMENT_STATUS_BG: Record<string, string> = {
  PENDING: 'bg-amber-50 border-amber-100',
  PAID: 'bg-positive/5 border-positive/10',
  PARTIAL: 'bg-blue-50 border-blue-100',
  OVERDUE: 'bg-negative/5 border-negative/10',
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatMonth(ym: string) {
  // "2025-01" → "Jan 2025"
  try {
    const [y, m] = ym.split('-');
    const date = new Date(Number(y), Number(m) - 1, 1);
    return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  } catch {
    return ym;
  }
}

function daysUntil(isoDate: string): number {
  const due = new Date(isoDate).getTime();
  return Math.ceil((due - Date.now()) / (1000 * 60 * 60 * 24));
}

function utilizationBarClass(pct: number): string {
  if (pct >= 90) return 'bg-negative';
  if (pct >= 80) return 'bg-amber-500';
  if (pct >= 50) return 'bg-yellow-400';
  return 'bg-positive';
}

// ── Summary metric card ───────────────────────────────────────────────

function MetricCard({ label, value, sub, className = '' }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <Card>
      <CardContent className="px-4 py-3">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
        <p className={`text-xl font-semibold tabular-nums mt-1 ${className}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ── Add statement dialog ──────────────────────────────────────────────

function AddStatementDialog({
  cardId,
  open,
  onOpenChange,
}: {
  cardId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<AddStatementInput>({
    forMonth: '',
    statementAmount: '',
    minimumDue: null,
    dueDate: '',
  });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  const mutation = useMutation({
    mutationFn: (input: AddStatementInput) => creditCardsApi.addStatement(cardId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-card', cardId] });
      qc.invalidateQueries({ queryKey: ['credit-card-summary', cardId] });
      toast.success('Statement added');
      onOpenChange(false);
      setForm({ forMonth: '', statementAmount: '', minimumDue: null, dueDate: '' });
    },
    onError: () => toast.error('Failed to add statement'),
  });

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.forMonth.trim() || !/^\d{4}-\d{2}$/.test(form.forMonth)) errs['forMonth'] = 'Format: YYYY-MM';
    if (!form.statementAmount || isNaN(Number(form.statementAmount))) errs['statementAmount'] = 'Required';
    if (!form.dueDate) errs['dueDate'] = 'Required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add statement</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>For month * (YYYY-MM)</Label>
            <Input placeholder="2025-01" value={form.forMonth}
              onChange={(e) => setForm((f) => ({ ...f, forMonth: e.target.value }))}
              className={errors['forMonth'] ? 'border-negative' : ''} />
            {errors['forMonth'] && <p className="text-xs text-negative mt-1">{errors['forMonth']}</p>}
          </div>
          <div>
            <Label>Statement amount (₹) *</Label>
            <Input placeholder="25000" value={form.statementAmount}
              onChange={(e) => setForm((f) => ({ ...f, statementAmount: e.target.value }))}
              className={errors['statementAmount'] ? 'border-negative' : ''} />
            {errors['statementAmount'] && <p className="text-xs text-negative mt-1">{errors['statementAmount']}</p>}
          </div>
          <div>
            <Label>Minimum due (₹)</Label>
            <Input placeholder="Optional" value={form.minimumDue ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, minimumDue: e.target.value || null }))} />
          </div>
          <div>
            <Label>Due date *</Label>
            <Input type="date" value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              className={errors['dueDate'] ? 'border-negative' : ''} />
            {errors['dueDate'] && <p className="text-xs text-negative mt-1">{errors['dueDate']}</p>}
          </div>
        </div>
        {mutation.isError && (
          <p className="text-sm text-negative">
            {mutation.error instanceof Error ? mutation.error.message : 'Failed to add statement'}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { if (validate()) mutation.mutate(form); }} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Mark paid dialog ──────────────────────────────────────────────────

function MarkPaidDialog({
  statementId,
  statementAmount,
  open,
  onOpenChange,
  cardId,
}: {
  statementId: string;
  statementAmount: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cardId: string;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<MarkStatementPaidInput>({
    paidAmount: statementAmount,
    paidOn: new Date().toISOString().slice(0, 10),
  });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  const mutation = useMutation({
    mutationFn: (input: MarkStatementPaidInput) => creditCardsApi.markStatementPaid(statementId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-card', cardId] });
      qc.invalidateQueries({ queryKey: ['credit-card-summary', cardId] });
      toast.success('Statement marked as paid');
      onOpenChange(false);
    },
    onError: () => toast.error('Failed to mark as paid'),
  });

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.paidAmount || isNaN(Number(form.paidAmount))) errs['paidAmount'] = 'Required';
    if (!form.paidOn) errs['paidOn'] = 'Required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Mark statement paid</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Paid amount (₹) *</Label>
            <Input placeholder={statementAmount} value={form.paidAmount}
              onChange={(e) => setForm((f) => ({ ...f, paidAmount: e.target.value }))}
              className={errors['paidAmount'] ? 'border-negative' : ''} />
            {errors['paidAmount'] && <p className="text-xs text-negative mt-1">{errors['paidAmount']}</p>}
          </div>
          <div>
            <Label>Paid on *</Label>
            <Input type="date" value={form.paidOn}
              onChange={(e) => setForm((f) => ({ ...f, paidOn: e.target.value }))}
              className={errors['paidOn'] ? 'border-negative' : ''} />
            {errors['paidOn'] && <p className="text-xs text-negative mt-1">{errors['paidOn']}</p>}
          </div>
        </div>
        {mutation.isError && (
          <p className="text-sm text-negative">
            {mutation.error instanceof Error ? mutation.error.message : 'Failed to update'}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { if (validate()) mutation.mutate(form); }} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Statement table ───────────────────────────────────────────────────

function StatementTable({ card }: { card: CreditCardDTO }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [markPaidId, setMarkPaidId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => creditCardsApi.deleteStatement(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-card', card.id] });
      qc.invalidateQueries({ queryKey: ['credit-card-summary', card.id] });
      toast.success('Statement deleted');
      setConfirmDeleteId(null);
    },
    onError: () => toast.error('Failed to delete statement'),
  });

  const statements = [...card.statements].sort((a, b) => b.forMonth.localeCompare(a.forMonth));
  const markPaidStatement = markPaidId ? statements.find((s) => s.id === markPaidId) : null;

  return (
    <>
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">
            Statement history
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {statements.length} records
            </span>
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add statement
          </Button>
        </CardHeader>
        <CardContent>
          {statements.length === 0 ? (
            <p className="text-xs text-muted-foreground">No statements recorded yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Month</th>
                    <th className="text-right py-2 pr-4 text-muted-foreground font-medium">Statement</th>
                    <th className="text-right py-2 pr-4 text-muted-foreground font-medium">Min due</th>
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Due date</th>
                    <th className="text-right py-2 pr-4 text-muted-foreground font-medium">Paid</th>
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Paid on</th>
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Status</th>
                    <th className="w-20 text-right py-2 text-muted-foreground font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {statements.map((s) => {
                    const today = new Date().toISOString().slice(0, 10);
                    const isOverdue = s.dueDate < today && s.status !== 'PAID';
                    const dueDays = daysUntil(s.dueDate);
                    return (
                      <tr key={s.id}
                        className={`border-b last:border-0 ${isOverdue ? 'bg-negative/5' : s.status === 'PAID' ? 'bg-positive/5' : ''}`}>
                        <td className="py-2 pr-4 font-medium">{formatMonth(s.forMonth)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums font-medium">{formatINR(s.statementAmount)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                          {s.minimumDue ? formatINR(s.minimumDue) : '—'}
                        </td>
                        <td className="py-2 pr-4">
                          <span>{formatDate(s.dueDate)}</span>
                          {s.status !== 'PAID' && (
                            <span className={`ml-1.5 text-xs ${
                              dueDays < 0 ? 'text-negative' : dueDays <= 5 ? 'text-amber-600' : 'text-muted-foreground'
                            }`}>
                              {dueDays < 0 ? `${Math.abs(dueDays)}d ago` : dueDays === 0 ? 'today' : `in ${dueDays}d`}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                          {s.paidAmount ? formatINR(s.paidAmount) : '—'}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">{formatDate(s.paidOn)}</td>
                        <td className="py-2 pr-4">
                          <span className={`font-medium capitalize ${STATEMENT_STATUS_COLORS[s.status] ?? ''}`}>
                            {s.status.toLowerCase()}
                          </span>
                        </td>
                        <td className="py-2">
                          {confirmDeleteId === s.id ? (
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="destructive" className="h-5 px-1.5 text-xs"
                                disabled={deleteMutation.isPending}
                                onClick={() => deleteMutation.mutate(s.id)}>
                                {deleteMutation.isPending ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : 'Del'}
                              </Button>
                              <Button size="sm" variant="ghost" className="h-5 px-1.5 text-xs"
                                onClick={() => setConfirmDeleteId(null)}>No</Button>
                            </div>
                          ) : (
                            <div className="flex gap-1 justify-end">
                              {s.status !== 'PAID' && (
                                <Button size="sm" variant="ghost"
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-positive"
                                  title="Mark paid"
                                  onClick={() => setMarkPaidId(s.id)}>
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button size="sm" variant="ghost"
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-negative"
                                title="Delete"
                                onClick={() => setConfirmDeleteId(s.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AddStatementDialog cardId={card.id} open={addOpen} onOpenChange={setAddOpen} />

      {markPaidStatement && (
        <MarkPaidDialog
          statementId={markPaidStatement.id}
          statementAmount={markPaidStatement.statementAmount}
          open={!!markPaidId}
          onOpenChange={(v) => { if (!v) setMarkPaidId(null); }}
          cardId={card.id}
        />
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────

export function CreditCardDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: card, isLoading } = useQuery({
    queryKey: ['credit-card', id],
    queryFn: () => creditCardsApi.get(id!),
    enabled: !!id,
  });

  const { data: summary } = useQuery({
    queryKey: ['credit-card-summary', id],
    queryFn: () => creditCardsApi.getSummary(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Loading…" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-24 animate-pulse bg-muted/60" />
          ))}
        </div>
      </div>
    );
  }

  if (!card) return <div className="p-8 text-muted-foreground">Card not found.</div>;

  const outstanding = new Decimal(card.outstandingBalance ?? '0');
  const limit = new Decimal(card.creditLimit);
  const utilizationPct = limit.isZero() ? 0 : outstanding.div(limit).mul(100).toNumber();

  const overdueCount = card.statements.filter((s) => s.status === 'OVERDUE').length;

  return (
    <div>
      <PageHeader
        title={`${card.issuerBank} — ${card.cardName}`}
        description={`${card.network ? `${card.network} · ` : ''}${card.status.toLowerCase()}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/credit-cards"><ArrowLeft className="h-4 w-4" /> Back</Link>
          </Button>
        }
      />

      {/* Card visual */}
      <div className="mb-4 max-w-md">
        <CreditCardVisual card={card} size="lg" />
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <MetricCard
          label="Credit limit"
          value={formatINR(card.creditLimit)}
          sub={`Statement day: ${card.statementDay}, due day: ${card.dueDay}`}
        />
        <MetricCard
          label="Outstanding"
          value={formatINR(outstanding.toString())}
          sub={summary ? `${summary.overdueStatements > 0 ? `${summary.overdueStatements} overdue` : 'all current'}` : undefined}
          className={overdueCount > 0 ? 'text-negative' : ''}
        />
        <MetricCard
          label="Utilization"
          value={`${utilizationPct.toFixed(1)}%`}
          sub={utilizationPct > 80 ? 'High — may impact credit score' : 'Within healthy range'}
          className={utilizationPct > 80 ? 'text-negative' : utilizationPct > 50 ? 'text-amber-600' : 'text-positive'}
        />
        <MetricCard
          label="Next due"
          value={summary?.nextDueAmount ? formatINR(summary.nextDueAmount) : '—'}
          sub={summary?.nextDueDate ? `Due ${formatDate(summary.nextDueDate)}` : 'No pending dues'}
        />
      </div>

      {/* Utilization bar */}
      <Card className="mb-4">
        <CardContent className="px-4 py-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-muted-foreground">Credit utilization</span>
            <span className="font-medium">
              {formatINR(outstanding.toString())} of {formatINR(card.creditLimit)} ({utilizationPct.toFixed(1)}%)
            </span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${utilizationBarClass(utilizationPct)}`}
              style={{ width: `${Math.min(100, utilizationPct)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>0%</span>
            <span className="text-positive">30% (ideal)</span>
            <span className="text-amber-600">80%</span>
            <span className="text-negative">100%</span>
          </div>
          {card.annualFee && (
            <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">
              Annual fee: {formatINR(card.annualFee)}
              {card.interestRate && ` · Interest rate: ${card.interestRate}% p.a.`}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Statement table */}
      <StatementTable card={card} />
    </div>
  );
}
