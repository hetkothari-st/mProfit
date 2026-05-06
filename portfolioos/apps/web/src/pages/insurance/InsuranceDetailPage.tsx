import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Car,
  CheckCircle2,
  Clock,
  AlertTriangle,
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
  insuranceApi,
  type InsurancePolicyDTO,
  type InsuranceClaimDTO,
  type PremiumPaymentDTO,
  type AddPremiumInput,
  type AddClaimInput,
} from '@/api/insurance.api';
import { DocumentVault } from '@/components/documents/DocumentVault';
import { CatalogBrief, inferCatalogId } from '@/components/insurance/InsuranceCatalogPicker';
import { findCatalogProduct } from '@/data/insuranceCatalog';

// ── Helpers ───────────────────────────────────────────────────────────

const CLAIM_STATUS_COLORS: Record<string, string> = {
  SUBMITTED: 'text-blue-500',
  UNDER_REVIEW: 'text-amber-500',
  APPROVED: 'text-positive',
  REJECTED: 'text-negative',
  SETTLED: 'text-positive',
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Add premium dialog ────────────────────────────────────────────────

function AddPremiumDialog({
  policyId,
  open,
  onOpenChange,
  initial,
}: {
  policyId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Partial<AddPremiumInput> | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<AddPremiumInput>({
    paidOn: initial?.paidOn ?? '',
    amount: initial?.amount ?? '',
    periodFrom: initial?.periodFrom ?? '',
    periodTo: initial?.periodTo ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  useEffect(() => {
    if (open) {
      setForm({
        paidOn: initial?.paidOn ?? new Date().toISOString().slice(0, 10),
        amount: initial?.amount ?? '',
        periodFrom: initial?.periodFrom ?? '',
        periodTo: initial?.periodTo ?? '',
      });
      setErrors({});
    }
  }, [open, initial]);

  const mutation = useMutation({
    mutationFn: (input: AddPremiumInput) => insuranceApi.addPremium(policyId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insurance-policy', policyId] });
      onOpenChange(false);
      setForm({ paidOn: '', amount: '', periodFrom: '', periodTo: '' });
    },
  });

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.paidOn) errs['paidOn'] = 'Required';
    if (!form.amount || isNaN(Number(form.amount))) errs['amount'] = 'Required';
    if (!form.periodFrom) errs['periodFrom'] = 'Required';
    if (!form.periodTo) errs['periodTo'] = 'Required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Record premium payment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Paid on *</Label>
            <Input type="date" value={form.paidOn}
              onChange={(e) => setForm((f) => ({ ...f, paidOn: e.target.value }))}
              className={errors['paidOn'] ? 'border-negative' : ''} />
          </div>
          <div>
            <Label>Amount (₹) *</Label>
            <Input placeholder="25000" value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className={errors['amount'] ? 'border-negative' : ''} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Period from *</Label>
              <Input type="date" value={form.periodFrom}
                onChange={(e) => setForm((f) => ({ ...f, periodFrom: e.target.value }))}
                className={errors['periodFrom'] ? 'border-negative' : ''} />
            </div>
            <div>
              <Label>Period to *</Label>
              <Input type="date" value={form.periodTo}
                onChange={(e) => setForm((f) => ({ ...f, periodTo: e.target.value }))}
                className={errors['periodTo'] ? 'border-negative' : ''} />
            </div>
          </div>
        </div>
        {mutation.isError && (
          <p className="text-sm text-negative">
            {mutation.error instanceof Error ? mutation.error.message : 'Error recording payment'}
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

// ── Add claim dialog ──────────────────────────────────────────────────

function AddClaimDialog({
  policyId,
  open,
  onOpenChange,
}: {
  policyId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<AddClaimInput>({
    claimDate: '',
    claimType: '',
    claimedAmount: '',
    status: 'SUBMITTED',
  });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  const mutation = useMutation({
    mutationFn: (input: AddClaimInput) => insuranceApi.addClaim(policyId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insurance-policy', policyId] });
      onOpenChange(false);
      setForm({ claimDate: '', claimType: '', claimedAmount: '', status: 'SUBMITTED' });
    },
  });

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.claimDate) errs['claimDate'] = 'Required';
    if (!form.claimType.trim()) errs['claimType'] = 'Required';
    if (!form.claimedAmount || isNaN(Number(form.claimedAmount))) errs['claimedAmount'] = 'Required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Add claim</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Claim date *</Label>
              <Input type="date" value={form.claimDate}
                onChange={(e) => setForm((f) => ({ ...f, claimDate: e.target.value }))}
                className={errors['claimDate'] ? 'border-negative' : ''} />
            </div>
            <div>
              <Label>Status</Label>
              <select
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as AddClaimInput['status'] }))}
              >
                {['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SETTLED'].map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ').toLowerCase()}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label>Claim type *</Label>
            <Input placeholder="Hospitalisation, Accident…" value={form.claimType}
              onChange={(e) => setForm((f) => ({ ...f, claimType: e.target.value }))}
              className={errors['claimType'] ? 'border-negative' : ''} />
          </div>
          <div>
            <Label>Claimed amount (₹) *</Label>
            <Input placeholder="100000" value={form.claimedAmount}
              onChange={(e) => setForm((f) => ({ ...f, claimedAmount: e.target.value }))}
              className={errors['claimedAmount'] ? 'border-negative' : ''} />
          </div>
          <div>
            <Label>Claim number</Label>
            <Input placeholder="Optional" value={form.claimNumber ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, claimNumber: e.target.value || null }))} />
          </div>
        </div>
        {mutation.isError && (
          <p className="text-sm text-negative">
            {mutation.error instanceof Error ? mutation.error.message : 'Error adding claim'}
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

// ── Health coverage panel (§9.3) ──────────────────────────────────────

function HealthCoverPanel({ policy }: { policy: InsurancePolicyDTO }) {
  const hc = policy.healthCoverDetails;
  if (!hc) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-2xl">Health coverage details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {hc.members && hc.members.length > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Members</span>
            <span>{hc.members.join(', ')}</span>
          </div>
        )}
        {hc.roomRent && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Room rent limit</span>
            <span>{hc.roomRent}</span>
          </div>
        )}
        {hc.coPay != null && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Co-pay</span>
            <span>{hc.coPay}%</span>
          </div>
        )}
        {hc.preExistingWait != null && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pre-existing wait</span>
            <span>{hc.preExistingWait} months</span>
          </div>
        )}
        {hc.subLimits && Object.keys(hc.subLimits).length > 0 && (
          <div>
            <p className="text-muted-foreground mb-1">Sub-limits</p>
            <div className="space-y-1 pl-2">
              {Object.entries(hc.subLimits).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-muted-foreground capitalize">{k.replace(/_/g, ' ')}</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Claims table ──────────────────────────────────────────────────────

function ClaimsTable({
  claims,
  policyId,
  onAdd,
}: {
  claims: InsuranceClaimDTO[];
  policyId: string;
  onAdd: () => void;
}) {
  const qc = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => insuranceApi.removeClaim(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insurance-policy', policyId] }),
  });

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-2xl">Claims</CardTitle>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </CardHeader>
      <CardContent>
        {claims.length === 0 ? (
          <p className="text-xs text-muted-foreground">No claims recorded</p>
        ) : (
          <div className="space-y-2">
            {claims.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-2 border rounded-md px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{c.claimType}</span>
                    <span className={`text-xs font-medium ${CLAIM_STATUS_COLORS[c.status] ?? ''}`}>
                      {c.status.replace('_', ' ').toLowerCase()}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
                    <span>{formatDate(c.claimDate)}</span>
                    <span>Claimed: {formatINR(c.claimedAmount)}</span>
                    {c.settledAmount && <span>Settled: {formatINR(c.settledAmount)}</span>}
                    {c.claimNumber && <span>#{c.claimNumber}</span>}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-muted-foreground hover:text-negative"
                  onClick={() => deleteMutation.mutate(c.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Premium history ───────────────────────────────────────────────────

const FREQUENCY_MONTHS: Record<string, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  ANNUAL: 12,
};

interface ScheduleRow {
  index: number;
  periodFrom: Date;
  periodTo: Date;
  dueDate: Date;
  payment: PremiumPaymentDTO | null;
  status: 'PAID' | 'OVERDUE' | 'UPCOMING';
}

function addMonths(d: Date, months: number): Date {
  const next = new Date(d);
  next.setMonth(next.getMonth() + months);
  return next;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildSchedule(policy: InsurancePolicyDTO): ScheduleRow[] {
  const freq = FREQUENCY_MONTHS[policy.premiumFrequency];
  const history = policy.premiumHistory ?? [];

  // SINGLE premium → no schedule, just show what's recorded.
  if (!freq) {
    return history.map((p, i) => ({
      index: i + 1,
      periodFrom: new Date(p.periodFrom),
      periodTo: new Date(p.periodTo),
      dueDate: new Date(p.periodFrom),
      payment: p,
      status: 'PAID' as const,
    }));
  }

  const start = new Date(policy.startDate);
  const today = new Date();
  const maturity = policy.maturityDate ? new Date(policy.maturityDate) : null;
  // Show schedule up to 12 periods past today, capped at maturity.
  const horizon = addMonths(today, freq * 12);
  const end = maturity && maturity < horizon ? maturity : horizon;

  const rows: ScheduleRow[] = [];
  let cursor = new Date(start);
  let i = 1;
  while (cursor <= end && i <= 240) {
    const next = addMonths(cursor, freq);
    const periodFromStr = isoDate(cursor);
    // Match payment whose periodFrom falls in same calendar month.
    const matched = history.find((p) => p.periodFrom.slice(0, 7) === periodFromStr.slice(0, 7));
    const status: ScheduleRow['status'] = matched
      ? 'PAID'
      : cursor <= today
        ? 'OVERDUE'
        : 'UPCOMING';
    rows.push({
      index: i,
      periodFrom: new Date(cursor),
      periodTo: new Date(next),
      dueDate: new Date(cursor),
      payment: matched ?? null,
      status,
    });
    cursor = next;
    i += 1;
  }
  return rows;
}

function PremiumHistory({
  policy,
  onMarkPaid,
}: {
  policy: InsurancePolicyDTO;
  onMarkPaid: (initial: Partial<AddPremiumInput>) => void;
}) {
  const qc = useQueryClient();
  const schedule = buildSchedule(policy);
  const paidRows = schedule.filter((r) => r.status === 'PAID');
  const overdueRows = schedule.filter((r) => r.status === 'OVERDUE');

  const deleteMutation = useMutation({
    mutationFn: (id: string) => insuranceApi.removePremium(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insurance-policy', policy.id] }),
  });

  const totalPaid = paidRows.reduce(
    (s, r) => (r.payment ? s.plus(new Decimal(r.payment.amount)) : s),
    new Decimal(0),
  );

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-2xl">
          Premium history
          {paidRows.length > 0 && (
            <span className="ml-3 text-xs font-normal text-muted-foreground">
              Total paid: {formatINR(totalPaid.toString())}
            </span>
          )}
          {overdueRows.length > 0 && (
            <span className="ml-3 text-xs font-medium text-negative">
              {overdueRows.length} overdue
            </span>
          )}
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => onMarkPaid({})}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Record
        </Button>
      </CardHeader>
      <CardContent>
        {schedule.length === 0 ? (
          <p className="text-xs text-muted-foreground">No premium schedule (single-premium or no start date).</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left font-medium py-2 px-2 w-8">#</th>
                  <th className="text-left font-medium py-2 px-2">Period</th>
                  <th className="text-left font-medium py-2 px-2">Due date</th>
                  <th className="text-right font-medium py-2 px-2">Amount</th>
                  <th className="text-left font-medium py-2 px-2">Status</th>
                  <th className="text-right font-medium py-2 px-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((row) => {
                  const periodFromIso = isoDate(row.periodFrom);
                  const periodToIso = isoDate(row.periodTo);
                  return (
                    <tr key={row.index} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 px-2 text-muted-foreground tabular-nums">{row.index}</td>
                      <td className="py-2 px-2">
                        {formatDate(periodFromIso)} → {formatDate(periodToIso)}
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">
                        {formatDate(periodFromIso)}
                      </td>
                      <td className="py-2 px-2 text-right font-medium tabular-nums">
                        {row.payment
                          ? formatINR(row.payment.amount)
                          : <span className="text-muted-foreground">{formatINR(policy.premiumAmount)}</span>}
                      </td>
                      <td className="py-2 px-2">
                        {row.status === 'PAID' && (
                          <span className="inline-flex items-center gap-1 text-positive">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Paid {row.payment ? formatDate(row.payment.paidOn) : ''}
                          </span>
                        )}
                        {row.status === 'OVERDUE' && (
                          <span className="inline-flex items-center gap-1 text-negative">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Overdue
                          </span>
                        )}
                        {row.status === 'UPCOMING' && (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            Upcoming
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {row.payment ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-muted-foreground hover:text-negative"
                            onClick={() => deleteMutation.mutate(row.payment!.id)}
                            disabled={deleteMutation.isPending}
                            title="Remove payment"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant={row.status === 'OVERDUE' ? 'default' : 'outline'}
                            className="h-7 px-3 text-xs"
                            onClick={() =>
                              onMarkPaid({
                                paidOn: isoDate(new Date()),
                                amount: policy.premiumAmount,
                                periodFrom: periodFromIso,
                                periodTo: periodToIso,
                              })
                            }
                          >
                            Mark paid
                          </Button>
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
  );
}

// ── Page ──────────────────────────────────────────────────────────────

export function InsuranceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [premiumInitial, setPremiumInitial] = useState<Partial<AddPremiumInput> | null>(null);
  const [claimOpen, setClaimOpen] = useState(false);

  const { data: policy, isLoading } = useQuery({
    queryKey: ['insurance-policy', id],
    queryFn: () => insuranceApi.getPolicy(id!),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => insuranceApi.deletePolicy(id!),
    onSuccess: () => { window.location.href = '/insurance'; },
  });

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Loading…" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-32 animate-pulse bg-muted/60" />
          ))}
        </div>
      </div>
    );
  }

  if (!policy) return <div className="p-8 text-muted-foreground">Policy not found.</div>;

  const statusColor =
    policy.status === 'ACTIVE' ? 'text-positive' :
    policy.status === 'LAPSED' ? 'text-negative' : 'text-muted-foreground';

  return (
    <div>
      <PageHeader
        title={`${policy.insurer} — ${policy.planName ?? policy.type}`}
        description={`${policy.policyHolder} · ${policy.policyNumber}`}
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/insurance"><ArrowLeft className="h-4 w-4" /> Back</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-negative hover:bg-negative/10"
              onClick={() => {
                if (confirm('Delete this policy and all its data?')) deleteMutation.mutate();
              }}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {/* Catalog brief — shown when policy maps to a known product */}
      {(() => {
        const catalogId = inferCatalogId(policy.insurer, policy.planName);
        const product = findCatalogProduct(catalogId);
        return product ? (
          <div className="mb-6">
            <CatalogBrief product={product} />
          </div>
        ) : null;
      })()}

      {/* Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Status', value: policy.status.toLowerCase(), className: statusColor },
          { label: 'Sum assured', value: formatINR(policy.sumAssured) },
          { label: 'Premium', value: `${formatINR(policy.premiumAmount)} / ${policy.premiumFrequency.toLowerCase()}` },
          { label: 'Next due', value: policy.nextPremiumDue ? formatDate(policy.nextPremiumDue) : '—' },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent className="px-4 py-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{m.label}</p>
              <p className={`text-sm font-semibold mt-1 tabular-nums capitalize ${m.className ?? ''}`}>
                {m.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Dates row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <Card><CardContent className="px-4 py-3">
          <p className="text-xs text-muted-foreground">Start date</p>
          <p className="text-sm font-medium mt-1">{formatDate(policy.startDate)}</p>
        </CardContent></Card>
        {policy.maturityDate && (
          <Card><CardContent className="px-4 py-3">
            <p className="text-xs text-muted-foreground">Maturity date</p>
            <p className="text-sm font-medium mt-1">{formatDate(policy.maturityDate)}</p>
          </CardContent></Card>
        )}
        {policy.vehicle && (
          <Card><CardContent className="px-4 py-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Car className="h-3 w-3" /> Linked vehicle
            </p>
            <Link
              to={`/vehicles/${policy.vehicle.id}`}
              className="text-sm font-medium mt-1 text-accent hover:underline block"
            >
              {policy.vehicle.make} {policy.vehicle.model} · {policy.vehicle.registrationNo}
            </Link>
          </CardContent></Card>
        )}
      </div>

      {/* Health cover panel */}
      {policy.type === 'HEALTH' && <div className="mb-4"><HealthCoverPanel policy={policy} /></div>}

      {/* Premium history */}
      <div className="mb-4">
        <PremiumHistory
          policy={policy}
          onMarkPaid={(initial) => {
            setPremiumInitial(initial);
            setPremiumOpen(true);
          }}
        />
      </div>

      {/* Claims */}
      <ClaimsTable
        claims={policy.claims ?? []}
        policyId={policy.id}
        onAdd={() => setClaimOpen(true)}
      />

      {/* Document vault — uploaded brochures & supporting documents */}
      <div className="mt-6">
        <DocumentVault
          ownerType="INSURANCE_POLICY"
          ownerId={policy.id}
          title="Policy documents"
          defaultCategory="policy_document"
        />
      </div>

      <AddPremiumDialog
        policyId={policy.id}
        open={premiumOpen}
        onOpenChange={(v) => {
          setPremiumOpen(v);
          if (!v) setPremiumInitial(null);
        }}
        initial={premiumInitial}
      />
      <AddClaimDialog policyId={policy.id} open={claimOpen} onOpenChange={setClaimOpen} />
    </div>
  );
}
