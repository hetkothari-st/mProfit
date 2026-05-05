import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  ArrowLeft,
  Plus,
  Trash2,
  Car,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Edit2,
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
  type AddPremiumInput,
  type AddClaimInput,
  type UpdateClaimInput,
  type UpdatePolicyInput,
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
}: {
  policyId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<AddPremiumInput>({
    paidOn: '',
    amount: '',
    periodFrom: '',
    periodTo: '',
  });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

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
        <CardTitle className="text-sm">Health coverage details</CardTitle>
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
        <CardTitle className="text-sm">Claims</CardTitle>
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

function PremiumHistory({
  policy,
  onAdd,
}: {
  policy: InsurancePolicyDTO;
  onAdd: () => void;
}) {
  const qc = useQueryClient();
  const history = policy.premiumHistory ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => insuranceApi.removePremium(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insurance-policy', policy.id] }),
  });

  const totalPaid = history.reduce(
    (s, p) => s.plus(new Decimal(p.amount)),
    new Decimal(0),
  );

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">
          Premium history
          {history.length > 0 && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              Total paid: {formatINR(totalPaid.toString())}
            </span>
          )}
        </CardTitle>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Record
        </Button>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-xs text-muted-foreground">No premiums recorded</p>
        ) : (
          <div className="space-y-1.5">
            {history.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-xs group">
                <div className="flex gap-4 text-muted-foreground">
                  <span>{formatDate(p.paidOn)}</span>
                  <span>{formatDate(p.periodFrom)} → {formatDate(p.periodTo)}</span>
                  {p.canonicalEventId && (
                    <span className="text-positive">auto-matched</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium tabular-nums">{formatINR(p.amount)}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-negative"
                    onClick={() => deleteMutation.mutate(p.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
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
        <PremiumHistory policy={policy} onAdd={() => setPremiumOpen(true)} />
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

      <AddPremiumDialog policyId={policy.id} open={premiumOpen} onOpenChange={setPremiumOpen} />
      <AddClaimDialog policyId={policy.id} open={claimOpen} onOpenChange={setClaimOpen} />
    </div>
  );
}
