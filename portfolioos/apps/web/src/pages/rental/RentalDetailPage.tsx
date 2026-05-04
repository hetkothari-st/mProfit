import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  SkipForward,
  Undo2,
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
  Calendar,
  Receipt,
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
  rentalApi,
  type TenancyDTO,
  type RentReceiptDTO,
  type CreateTenancyInput,
  type MarkReceivedInput,
  type CreateExpenseInput,
} from '@/api/rental.api';
import { DocumentVault } from '@/components/documents/DocumentVault';

// ── Status badge ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  RentReceiptDTO['status'],
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  EXPECTED: {
    label: 'Expected',
    className: 'bg-muted text-muted-foreground',
    icon: Clock,
  },
  RECEIVED: {
    label: 'Received',
    className: 'bg-positive/10 text-positive',
    icon: CheckCircle2,
  },
  PARTIAL: {
    label: 'Partial',
    className: 'bg-amber-500/10 text-amber-600',
    icon: CheckCircle2,
  },
  OVERDUE: {
    label: 'Overdue',
    className: 'bg-negative/10 text-negative',
    icon: AlertTriangle,
  },
  SKIPPED: {
    label: 'Skipped',
    className: 'bg-muted/60 text-muted-foreground/60',
    icon: XCircle,
  },
};

function ReceiptStatusBadge({ status }: { status: RentReceiptDTO['status'] }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.className}`}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

// ── Mark received dialog ──────────────────────────────────────────────

function MarkReceivedDialog({
  receipt,
  open,
  onOpenChange,
}: {
  receipt: RentReceiptDTO;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState<MarkReceivedInput>({
    receivedAmount: new Decimal(receipt.expectedAmount).toFixed(2),
    receivedOn: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  const mutation = useMutation({
    mutationFn: (input: MarkReceivedInput) =>
      rentalApi.markReceived(receipt.id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rental-property', id] });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark as received — {receipt.forMonth}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Amount received (₹)</Label>
            <Input
              value={form.receivedAmount}
              onChange={(e) => setForm((f) => ({ ...f, receivedAmount: e.target.value }))}
            />
          </div>
          <div>
            <Label>Date received</Label>
            <Input
              type="date"
              value={form.receivedOn}
              onChange={(e) => setForm((f) => ({ ...f, receivedOn: e.target.value }))}
            />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Input
              value={form.notes ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>
        {mutation.isError && (
          <p className="text-sm text-negative">
            {mutation.error instanceof Error ? mutation.error.message : 'Error'}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Mark received'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Receipt row ───────────────────────────────────────────────────────

function ReceiptRow({ receipt }: { receipt: RentReceiptDTO }) {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [markOpen, setMarkOpen] = useState(false);

  const skipMutation = useMutation({
    mutationFn: () => rentalApi.skipReceipt(receipt.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rental-property', id] }),
  });
  const undoMutation = useMutation({
    mutationFn: () => rentalApi.undoAutoMatch(receipt.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rental-property', id] }),
  });

  const isActionable =
    receipt.status === 'EXPECTED' || receipt.status === 'OVERDUE';

  const expectedAmt = new Decimal(receipt.expectedAmount);
  const receivedAmt = receipt.receivedAmount
    ? new Decimal(receipt.receivedAmount)
    : null;

  return (
    <>
      <tr className="hover:bg-muted/30 transition-colors group">
        <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground whitespace-nowrap">
          {receipt.forMonth}
        </td>
        <td className="px-4 py-3 text-sm tabular-nums text-right">
          {formatINR(expectedAmt.toString())}
        </td>
        <td className="px-4 py-3 text-sm tabular-nums text-right">
          {receivedAmt ? (
            <span
              className={
                receivedAmt.lt(expectedAmt) ? 'text-amber-600' : 'text-positive'
              }
            >
              {formatINR(receivedAmt.toString())}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground whitespace-nowrap">
          {new Date(receipt.dueDate).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
          })}
        </td>
        <td className="px-4 py-3">
          <ReceiptStatusBadge status={receipt.status} />
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {isActionable && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setMarkOpen(true)}
                >
                  <CheckCircle2 className="h-3 w-3" /> Received
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => skipMutation.mutate()}
                  disabled={skipMutation.isPending}
                >
                  <SkipForward className="h-3 w-3" /> Skip
                </Button>
              </>
            )}
            {receipt.autoMatchedFromEventId && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => undoMutation.mutate()}
                disabled={undoMutation.isPending}
                title="Undo auto-match"
              >
                <Undo2 className="h-3 w-3" /> Undo
              </Button>
            )}
          </div>
        </td>
      </tr>
      {markOpen && (
        <MarkReceivedDialog
          receipt={receipt}
          open={markOpen}
          onOpenChange={setMarkOpen}
        />
      )}
    </>
  );
}

// ── Tenancy card ──────────────────────────────────────────────────────

function TenancyCard({ tenancy }: { tenancy: TenancyDTO }) {
  const [expanded, setExpanded] = useState(tenancy.isActive);
  const receipts = tenancy.rentReceipts ?? [];
  const overdueCount = receipts.filter((r) => r.status === 'OVERDUE').length;
  const totalReceived = receipts
    .filter((r) => r.status === 'RECEIVED' || r.status === 'PARTIAL')
    .reduce(
      (sum, r) => sum.plus(new Decimal(r.receivedAmount ?? '0')),
      new Decimal(0),
    );

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{tenancy.tenantName}</span>
              {tenancy.isActive ? (
                <span className="text-xs bg-positive/10 text-positive px-1.5 py-0.5 rounded font-medium">
                  Active
                </span>
              ) : (
                <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                  Ended
                </span>
              )}
              {overdueCount > 0 && (
                <span className="text-xs bg-negative/10 text-negative px-1.5 py-0.5 rounded font-medium">
                  {overdueCount} overdue
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
              <span className="tabular-nums">
                {formatINR(tenancy.monthlyRent)}/mo
              </span>
              <span>·</span>
              <span>
                {new Date(tenancy.startDate).toLocaleDateString('en-IN', {
                  month: 'short',
                  year: 'numeric',
                })}
                {tenancy.endDate &&
                  ` → ${new Date(tenancy.endDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-right shrink-0">
          {totalReceived.gt(0) && (
            <div>
              <p className="text-xs text-muted-foreground">Total received</p>
              <p className="text-sm font-semibold text-positive tabular-nums">
                {formatINR(totalReceived.toString())}
              </p>
            </div>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && receipts.length > 0 && (
        <div className="border-t overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium">Month</th>
                <th className="text-right px-4 py-2 font-medium">Expected</th>
                <th className="text-right px-4 py-2 font-medium">Received</th>
                <th className="text-left px-4 py-2 font-medium">Due</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {receipts.map((r) => (
                <ReceiptRow key={r.id} receipt={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {expanded && receipts.length === 0 && (
        <div className="border-t px-4 py-6 text-center text-sm text-muted-foreground">
          No receipts generated yet
        </div>
      )}
    </div>
  );
}

// ── Add tenancy dialog ────────────────────────────────────────────────

function AddTenancyDialog({
  propertyId,
  open,
  onOpenChange,
}: {
  propertyId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateTenancyInput>({
    tenantName: '',
    startDate: '',
    monthlyRent: '',
    rentDueDay: 1,
    tenantContact: '',
    securityDeposit: '',
  });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  const mutation = useMutation({
    mutationFn: (input: CreateTenancyInput) =>
      rentalApi.createTenancy(propertyId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rental-property', propertyId] });
      onOpenChange(false);
      setForm({ tenantName: '', startDate: '', monthlyRent: '', rentDueDay: 1 });
    },
  });

  function handleSubmit() {
    const errs: typeof errors = {};
    if (!form.tenantName.trim()) errs.tenantName = 'Required';
    if (!form.startDate) errs.startDate = 'Required';
    if (!form.monthlyRent) errs.monthlyRent = 'Required';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    mutation.mutate({
      ...form,
      tenantName: form.tenantName.trim(),
      tenantContact: form.tenantContact || null,
      securityDeposit: form.securityDeposit || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add tenancy</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Tenant name *</Label>
            <Input
              value={form.tenantName}
              onChange={(e) => setForm((f) => ({ ...f, tenantName: e.target.value }))}
              className={errors.tenantName ? 'border-negative' : ''}
            />
            {errors.tenantName && (
              <p className="text-xs text-negative mt-1">{errors.tenantName}</p>
            )}
          </div>
          <div>
            <Label>Contact</Label>
            <Input
              value={form.tenantContact ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, tenantContact: e.target.value }))}
              placeholder="Phone or email"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start date *</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                className={errors.startDate ? 'border-negative' : ''}
              />
            </div>
            <div>
              <Label>End date</Label>
              <Input
                type="date"
                value={(form.endDate ?? '') as string}
                onChange={(e) =>
                  setForm((f) => ({ ...f, endDate: e.target.value || undefined }))
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Monthly rent (₹) *</Label>
              <Input
                value={form.monthlyRent}
                onChange={(e) => setForm((f) => ({ ...f, monthlyRent: e.target.value }))}
                className={errors.monthlyRent ? 'border-negative' : ''}
              />
            </div>
            <div>
              <Label>Due day of month</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={form.rentDueDay ?? 1}
                onChange={(e) =>
                  setForm((f) => ({ ...f, rentDueDay: Number(e.target.value) }))
                }
              />
            </div>
          </div>
          <div>
            <Label>Security deposit (₹)</Label>
            <Input
              value={form.securityDeposit ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, securityDeposit: e.target.value }))}
            />
          </div>
        </div>
        {mutation.isError && (
          <p className="text-sm text-negative">
            {mutation.error instanceof Error ? mutation.error.message : 'Error'}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Add tenancy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add expense dialog ────────────────────────────────────────────────

const EXPENSE_TYPES: CreateExpenseInput['expenseType'][] = [
  'PROPERTY_TAX',
  'MAINTENANCE',
  'REPAIRS',
  'UTILITIES',
  'AGENT_FEE',
  'LEGAL',
  'OTHER',
];
const EXPENSE_LABELS: Record<string, string> = {
  PROPERTY_TAX: 'Property Tax',
  MAINTENANCE: 'Maintenance',
  REPAIRS: 'Repairs',
  UTILITIES: 'Utilities',
  AGENT_FEE: 'Agent Fee',
  LEGAL: 'Legal',
  OTHER: 'Other',
};

function AddExpenseDialog({
  propertyId,
  open,
  onOpenChange,
}: {
  propertyId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateExpenseInput>({
    expenseType: 'MAINTENANCE',
    amount: '',
    paidOn: new Date().toISOString().slice(0, 10),
    description: '',
  });

  const mutation = useMutation({
    mutationFn: (input: CreateExpenseInput) =>
      rentalApi.addExpense(propertyId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rental-property', propertyId] });
      onOpenChange(false);
      setForm({ expenseType: 'MAINTENANCE', amount: '', paidOn: new Date().toISOString().slice(0, 10) });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add expense</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Type</Label>
            <select
              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.expenseType}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  expenseType: e.target.value as CreateExpenseInput['expenseType'],
                }))
              }
            >
              {EXPENSE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EXPENSE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Amount (₹)</Label>
            <Input
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </div>
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={form.paidOn}
              onChange={(e) => setForm((f) => ({ ...f, paidOn: e.target.value }))}
            />
          </div>
          <div>
            <Label>Description</Label>
            <Input
              value={form.description ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
        </div>
        {mutation.isError && (
          <p className="text-sm text-negative">
            {mutation.error instanceof Error ? mutation.error.message : 'Error'}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Add expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── P&L panel ─────────────────────────────────────────────────────────

function PnLPanel({ propertyId }: { propertyId: string }) {
  const now = new Date();
  const fy =
    now.getMonth() >= 3
      ? now.getFullYear()
      : now.getFullYear() - 1;
  const from = `${fy}-04-01`;
  const to = `${fy + 1}-03-31`;

  const { data } = useQuery({
    queryKey: ['rental-pnl', propertyId, from, to],
    queryFn: () => rentalApi.getPropertyPnL(propertyId, from, to),
  });

  if (!data) return null;

  const pnl = new Decimal(data.netPnL);

  return (
    <div className="grid grid-cols-3 gap-3 text-sm">
      <div className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">
          FY {fy}–{String(fy + 1).slice(2)}
        </p>
        <p className="text-muted-foreground text-xs mb-2">Rent received</p>
        <p className="text-lg font-semibold text-positive tabular-nums">
          {formatINR(data.rentReceived)}
        </p>
        <p className="text-xs text-muted-foreground">{data.receiptCount} receipts</p>
      </div>
      <div className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">
          Expenses
        </p>
        <p className="text-muted-foreground text-xs mb-2">Total paid</p>
        <p className="text-lg font-semibold text-negative tabular-nums">
          {formatINR(data.expensesTotal)}
        </p>
        <p className="text-xs text-muted-foreground">{data.expenseCount} items</p>
      </div>
      <div className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">
          Net P&amp;L
        </p>
        <p className="text-muted-foreground text-xs mb-2">Rent − expenses</p>
        <div className="flex items-center gap-1">
          {pnl.gte(0) ? (
            <TrendingUp className="h-4 w-4 text-positive shrink-0" />
          ) : (
            <TrendingDown className="h-4 w-4 text-negative shrink-0" />
          )}
          <p
            className={`text-lg font-semibold tabular-nums ${
              pnl.gte(0) ? 'text-positive' : 'text-negative'
            }`}
          >
            {formatINR(data.netPnL)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────

export function RentalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [addTenancyOpen, setAddTenancyOpen] = useState(false);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);

  const { data: property, isLoading } = useQuery({
    queryKey: ['rental-property', id],
    queryFn: () => rentalApi.getProperty(id!),
    enabled: !!id,
  });

  const deleteExpense = useMutation({
    mutationFn: (expenseId: string) => rentalApi.removeExpense(expenseId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rental-property', id] }),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-44 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="text-muted-foreground text-sm">
        Property not found.{' '}
        <Link to="/rental" className="underline">
          Go back
        </Link>
      </div>
    );
  }

  const typeLabel: Record<string, string> = {
    RESIDENTIAL: 'Residential',
    COMMERCIAL: 'Commercial',
    LAND: 'Land',
    PARKING: 'Parking',
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="-ml-2">
              <Link to="/rental">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            {property.name}
          </div>
        }
        description={[
          typeLabel[property.propertyType] ?? property.propertyType,
          property.address,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAddExpenseOpen(true)}>
              <TrendingDown className="h-4 w-4" /> Add expense
            </Button>
            <Button onClick={() => setAddTenancyOpen(true)}>
              <Plus className="h-4 w-4" /> Add tenancy
            </Button>
          </div>
        }
      />

      {/* P&L */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          This financial year
        </h2>
        <PnLPanel propertyId={property.id} />
      </section>

      {/* Tenancies */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Users className="h-4 w-4" /> Tenancies
          </h2>
        </div>
        {(property.tenancies ?? []).length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground text-sm">
              No tenancies yet.{' '}
              <button
                type="button"
                className="underline hover:text-foreground"
                onClick={() => setAddTenancyOpen(true)}
              >
                Add one
              </button>{' '}
              to start tracking rent receipts.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {(property.tenancies ?? []).map((t) => (
              <TenancyCard key={t.id} tenancy={t} />
            ))}
          </div>
        )}
      </section>

      {/* Expenses */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Receipt className="h-4 w-4" /> Expenses
          </h2>
        </div>
        <Card>
          {(property.expenses ?? []).length === 0 ? (
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              No expenses recorded.
            </CardContent>
          ) : (
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left px-4 py-2 font-medium w-[110px]">Date</th>
                    <th className="text-left px-4 py-2 font-medium">Type</th>
                    <th className="text-left px-4 py-2 font-medium hidden md:table-cell">
                      Description
                    </th>
                    <th className="text-right px-4 py-2 font-medium w-[130px]">Amount</th>
                    <th className="px-4 py-2 w-[48px]" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(property.expenses ?? []).map((e) => (
                    <tr key={e.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-4 py-3 tabular-nums text-muted-foreground whitespace-nowrap">
                        {new Date(e.paidOn).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3">{EXPENSE_LABELS[e.expenseType] ?? e.expenseType}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                        {e.description ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-negative font-medium">
                        −{formatINR(e.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => deleteExpense.mutate(e.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          )}
        </Card>
      </section>

      {/* Documents */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Documents
          </h2>
        </div>
        <DocumentVault
          ownerType="RENTAL_PROPERTY"
          ownerId={property.id}
          title="Agreements & receipts"
          defaultCategory="agreement"
        />
      </section>

      {/* Dialogs */}
      <AddTenancyDialog
        propertyId={property.id}
        open={addTenancyOpen}
        onOpenChange={setAddTenancyOpen}
      />
      <AddExpenseDialog
        propertyId={property.id}
        open={addExpenseOpen}
        onOpenChange={setAddExpenseOpen}
      />
    </div>
  );
}
