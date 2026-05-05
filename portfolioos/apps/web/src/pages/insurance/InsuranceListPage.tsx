import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Shield,
  Plus,
  ArrowUpRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Car,
  Heart,
  Home,
  Plane,
  FileText,
  Pencil,
  Trash2,
  Loader2,
  Upload as UploadIcon,
  Download,
  ExternalLink,
} from 'lucide-react';
import { Decimal, formatINR } from '@portfolioos/shared';
import { PageHeader } from '@/components/layout/PageHeader';
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
  insuranceApi,
  type InsurancePolicyDTO,
  type CreatePolicyInput,
} from '@/api/insurance.api';
import { documentsApi } from '@/api/documents.api';
import {
  InsuranceCatalogPicker,
  CatalogBrief,
  inferCatalogId,
} from '@/components/insurance/InsuranceCatalogPicker';
import { findCatalogProduct, type CatalogProduct } from '@/data/insuranceCatalog';

// ── Helpers ───────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  TERM: 'Term Life',
  WHOLE_LIFE: 'Whole Life',
  ULIP: 'ULIP',
  ENDOWMENT: 'Endowment',
  HEALTH: 'Health',
  MOTOR: 'Motor',
  HOME: 'Home',
  TRAVEL: 'Travel',
  PERSONAL_ACCIDENT: 'Personal Accident',
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  HEALTH: Heart,
  MOTOR: Car,
  HOME: Home,
  TRAVEL: Plane,
};

function TypeIcon({ type }: { type: string }) {
  const Icon = TYPE_ICONS[type] ?? Shield;
  return <Icon className="h-4 w-4" />;
}

function daysUntil(isoDate: string): number {
  const due = new Date(isoDate).getTime();
  return Math.ceil((due - Date.now()) / (1000 * 60 * 60 * 24));
}

function getStatusMeta(policy: InsurancePolicyDTO) {
  if (!policy.nextPremiumDue) return { color: 'text-muted-foreground', label: 'No due date', urgent: false };
  const days = daysUntil(policy.nextPremiumDue);
  if (days < 0) return { color: 'text-negative', label: 'Overdue', urgent: true };
  if (days <= 7) return { color: 'text-negative', label: `Due in ${days}d`, urgent: true };
  if (days <= 30) return { color: 'text-amber-500', label: `Due in ${days}d`, urgent: false };
  return { color: 'text-positive', label: `Due in ${days}d`, urgent: false };
}

// ── Summary strip ─────────────────────────────────────────────────────

function SummaryStrip({ policies }: { policies: InsurancePolicyDTO[] }) {
  const active = policies.filter((p) => p.status === 'ACTIVE').length;
  const urgent = policies.filter((p) => {
    if (!p.nextPremiumDue) return false;
    return daysUntil(p.nextPremiumDue) <= 7;
  }).length;
  const totalCover = policies
    .filter((p) => p.status === 'ACTIVE')
    .reduce((s, p) => s.plus(new Decimal(p.sumAssured)), new Decimal(0));

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      {[
        { label: 'Active policies', value: String(active), sub: `of ${policies.length} total` },
        {
          label: 'Total cover',
          value: formatINR(totalCover.toString()),
          sub: 'sum assured (active)',
        },
        {
          label: 'Renewals due',
          value: String(urgent),
          sub: urgent > 0 ? 'within 7 days' : 'all good',
          className: urgent > 0 ? 'text-negative' : 'text-positive',
        },
      ].map((m) => (
        <Card key={m.label}>
          <CardContent className="px-4 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              {m.label}
            </p>
            <p className={`text-xl font-semibold tabular-nums mt-1 ${m.className ?? ''}`}>
              {m.value}
            </p>
            <p className="text-xs text-muted-foreground">{m.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Policy card ───────────────────────────────────────────────────────

function PolicyCard({
  policy,
  onEdit,
  onDelete,
  isDeleting,
}: {
  policy: InsurancePolicyDTO;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const statusMeta = getStatusMeta(policy);
  const catalogId = inferCatalogId(policy.insurer, policy.planName);
  const product = findCatalogProduct(catalogId);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <TypeIcon type={policy.type} />
              <h3 className="font-semibold truncate">{policy.insurer}</h3>
              <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                {TYPE_LABELS[policy.type] ?? policy.type}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {policy.planName ?? policy.policyHolder} · {policy.policyNumber}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onEdit} title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={onDelete} disabled={isDeleting} title="Delete">
              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-7 w-7 p-0">
              <Link to={`/insurance/${policy.id}`}>
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Catalog-driven facts + coverage chips + brochure download */}
        {product && (
          <div className="mt-3 rounded-md border bg-gradient-to-br from-accent/20 to-muted/20 px-3 py-2.5 space-y-2">
            {/* Facts row */}
            <div className="grid grid-cols-2 gap-2">
              {product.sumAssuredRange && (
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Cover range</p>
                  <p className="text-xs font-semibold tabular-nums truncate">{product.sumAssuredRange}</p>
                </div>
              )}
              {product.ageBand && (
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Age</p>
                  <p className="text-xs font-semibold truncate">{product.ageBand}</p>
                </div>
              )}
            </div>

            {/* Coverage chips */}
            {product.coverageTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {product.coverageTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded bg-positive/10 text-positive border border-positive/15"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Action links */}
            <div className="flex items-center gap-2 pt-1">
              <a
                href={product.brochureUrl}
                target="_blank"
                rel="noopener noreferrer"
                download
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-foreground hover:text-accent hover:underline"
                title="Download official policy brochure PDF"
              >
                <Download className="h-3 w-3" /> Brochure
              </a>
              <span className="h-3 w-px bg-border" />
              <a
                href={product.insurerSite}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:underline"
                title="Insurer website"
              >
                <ExternalLink className="h-3 w-3" /> Insurer site
              </a>
            </div>
          </div>
        )}

        <div className="mt-4 pt-3 border-t space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Sum assured</span>
            <span className="font-medium tabular-nums">
              {formatINR(policy.sumAssured)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Premium</span>
            <span className="font-medium tabular-nums">
              {formatINR(policy.premiumAmount)}{' '}
              <span className="text-muted-foreground font-normal">
                / {policy.premiumFrequency.toLowerCase()}
              </span>
            </span>
          </div>
          {policy.nextPremiumDue && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Next due</span>
              <span className={`font-medium tabular-nums ${statusMeta.color}`}>
                {statusMeta.label}
              </span>
            </div>
          )}
          {policy.status !== 'ACTIVE' && (
            <div className="mt-2 rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground font-medium capitalize">
              {policy.status.toLowerCase()}
            </div>
          )}
          {statusMeta.urgent && (
            <div className="mt-2 rounded-md bg-negative/10 px-3 py-1.5 text-xs text-negative font-medium flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Premium renewal urgent
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Create / Edit dialog ──────────────────────────────────────────────

function CreatePolicyDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: InsurancePolicyDTO | null;
}) {
  const qc = useQueryClient();
  const isEdit = !!initial;
  const [form, setForm] = useState<CreatePolicyInput>({
    insurer: initial?.insurer ?? '',
    policyNumber: initial?.policyNumber ?? '',
    type: (initial?.type as CreatePolicyInput['type']) ?? 'TERM',
    planName: initial?.planName ?? '',
    policyHolder: initial?.policyHolder ?? '',
    sumAssured: initial?.sumAssured ?? '',
    premiumAmount: initial?.premiumAmount ?? '',
    premiumFrequency: (initial?.premiumFrequency as CreatePolicyInput['premiumFrequency']) ?? 'ANNUAL',
    startDate: initial?.startDate ?? '',
    maturityDate: initial?.maturityDate ?? '',
    nextPremiumDue: initial?.nextPremiumDue ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [catalogId, setCatalogId] = useState<string | null>(
    initial ? inferCatalogId(initial.insurer, initial.planName) : null,
  );
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const selectedCatalog = findCatalogProduct(catalogId);

  function applyCatalogProduct(product: CatalogProduct | null) {
    setCatalogId(product?.id ?? null);
    if (product) {
      setForm((f) => ({
        ...f,
        insurer: product.insurer,
        planName: product.planName,
        type: product.type,
      }));
    }
  }

  const mutation = useMutation({
    mutationFn: async (input: CreatePolicyInput) => {
      const policy = isEdit
        ? await insuranceApi.updatePolicy(initial!.id, input)
        : await insuranceApi.createPolicy(input);
      // If user attached a file, upload it after policy save so we have a valid ownerId.
      if (pendingFile) {
        try {
          await documentsApi.upload({
            file: pendingFile,
            ownerType: 'INSURANCE_POLICY',
            ownerId: policy.id,
            category: 'policy_document',
          });
        } catch (err) {
          // Surface but don't block save — policy itself is created.
          toast.error(`Policy saved, but document upload failed: ${err instanceof Error ? err.message : 'unknown'}`);
        }
      }
      return policy;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insurance-policies'] });
      qc.invalidateQueries({ queryKey: ['documents'] });
      toast.success(isEdit ? 'Policy updated' : 'Policy added');
      onOpenChange(false);
      setForm({
        insurer: '', policyNumber: '', type: 'TERM',
        policyHolder: '', sumAssured: '', premiumAmount: '',
        premiumFrequency: 'ANNUAL', startDate: '',
      });
      setCatalogId(null);
      setPendingFile(null);
    },
    onError: () => toast.error(isEdit ? 'Failed to update policy' : 'Failed to add policy'),
  });

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.insurer.trim()) errs['insurer'] = 'Required';
    if (!form.policyNumber.trim()) errs['policyNumber'] = 'Required';
    if (!form.policyHolder.trim()) errs['policyHolder'] = 'Required';
    if (!form.sumAssured || isNaN(Number(form.sumAssured))) errs['sumAssured'] = 'Required';
    if (!form.premiumAmount || isNaN(Number(form.premiumAmount))) errs['premiumAmount'] = 'Required';
    if (!form.startDate) errs['startDate'] = 'Required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    mutation.mutate({
      ...form,
      insurer: form.insurer.trim(),
      policyNumber: form.policyNumber.trim(),
      policyHolder: form.policyHolder.trim(),
      planName: form.planName?.trim() || null,
    });
  }

  const field = (key: keyof CreatePolicyInput) => ({
    value: (form[key] as string) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
    className: errors[key] ? 'border-negative' : '',
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit insurance policy' : 'Add insurance policy'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Catalog picker */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Quick pick from catalog
            </Label>
            <InsuranceCatalogPicker
              selectedId={catalogId}
              onSelect={applyCatalogProduct}
            />
            {selectedCatalog && (
              <div className="pt-1">
                <CatalogBrief product={selectedCatalog} />
              </div>
            )}
            {!selectedCatalog && (
              <p className="text-xs text-muted-foreground">
                Pick a product to auto-fill insurer, plan name and type, plus see coverage at a glance.
                Not in the list? Fill manually below — you can also upload your own brochure.
              </p>
            )}
          </div>

          <div className="border-t pt-4" />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Insurer *</Label>
              <Input placeholder="LIC, HDFC Life…" {...field('insurer')} />
              {errors['insurer'] && <p className="text-xs text-negative mt-1">{errors['insurer']}</p>}
            </div>
            <div>
              <Label>Policy number *</Label>
              <Input placeholder="XXX-XXXXXX" {...field('policyNumber')} />
              {errors['policyNumber'] && <p className="text-xs text-negative mt-1">{errors['policyNumber']}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <select
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CreatePolicyInput['type'] }))}
              >
                {[
                  ['TERM', 'Term Life'], ['WHOLE_LIFE', 'Whole Life'], ['ULIP', 'ULIP'],
                  ['ENDOWMENT', 'Endowment'], ['HEALTH', 'Health'], ['MOTOR', 'Motor'],
                  ['HOME', 'Home'], ['TRAVEL', 'Travel'], ['PERSONAL_ACCIDENT', 'Personal Accident'],
                ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <Label>Plan name</Label>
              <Input placeholder="Optional plan name" {...field('planName')} />
            </div>
          </div>

          <div>
            <Label>Policy holder *</Label>
            <Input placeholder="Full name" {...field('policyHolder')} />
            {errors['policyHolder'] && <p className="text-xs text-negative mt-1">{errors['policyHolder']}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Sum assured (₹) *</Label>
              <Input placeholder="5000000" {...field('sumAssured')} />
              {errors['sumAssured'] && <p className="text-xs text-negative mt-1">{errors['sumAssured']}</p>}
            </div>
            <div>
              <Label>Premium amount (₹) *</Label>
              <Input placeholder="25000" {...field('premiumAmount')} />
              {errors['premiumAmount'] && <p className="text-xs text-negative mt-1">{errors['premiumAmount']}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Frequency</Label>
              <select
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.premiumFrequency}
                onChange={(e) => setForm((f) => ({ ...f, premiumFrequency: e.target.value as CreatePolicyInput['premiumFrequency'] }))}
              >
                {['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ANNUAL', 'SINGLE'].map((f) => (
                  <option key={f} value={f}>{f.replace('_', ' ').toLowerCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Start date *</Label>
              <Input type="date" {...field('startDate')} />
              {errors['startDate'] && <p className="text-xs text-negative mt-1">{errors['startDate']}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Maturity date</Label>
              <Input type="date" {...field('maturityDate')} />
            </div>
            <div>
              <Label>Next premium due</Label>
              <Input type="date" {...field('nextPremiumDue')} />
            </div>
          </div>

          {/* Manual brochure upload */}
          <div className="border-t pt-4">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Policy document (optional)
            </Label>
            <p className="text-xs text-muted-foreground mt-1 mb-2">
              Upload your actual policy PDF for safekeeping — kept in your encrypted document vault.
            </p>
            {pendingFile ? (
              <div className="rounded-md border bg-muted/30 px-3 py-2 flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate flex-1">{pendingFile.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {(pendingFile.size / 1024).toFixed(0)} KB
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setPendingFile(null)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 rounded-md border border-dashed bg-background hover:bg-accent/40 transition-colors px-4 py-4 cursor-pointer text-sm text-muted-foreground">
                <UploadIcon className="h-4 w-4" />
                <span>Click to attach a PDF</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setPendingFile(f);
                  }}
                />
              </label>
            )}
          </div>
        </div>

        {mutation.isError && (
          <p className="text-sm text-negative">
            {mutation.error instanceof Error ? mutation.error.message : 'Error creating policy'}
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

export function InsuranceListPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editPolicy, setEditPolicy] = useState<InsurancePolicyDTO | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: policies, isLoading } = useQuery({
    queryKey: ['insurance-policies'],
    queryFn: () => insuranceApi.listPolicies(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => insuranceApi.deletePolicy(id),
    onSuccess: () => {
      toast.success('Policy deleted');
      setConfirmDeleteId(null);
      qc.invalidateQueries({ queryKey: ['insurance-policies'] });
    },
    onError: () => toast.error('Failed to delete policy'),
  });

  const list = policies ?? [];

  const byStatus = {
    active: list.filter((p) => p.status === 'ACTIVE'),
    inactive: list.filter((p) => p.status !== 'ACTIVE'),
  };

  return (
    <div>
      <PageHeader
        title="Insurance"
        description="Track policies, premiums, and claims across all types"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Add policy
          </Button>
        }
      />

      {!isLoading && list.length > 0 && <SummaryStrip policies={list} />}

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-44 animate-pulse bg-muted/60" />
          ))}
        </div>
      )}

      {!isLoading && list.length === 0 && (
        <EmptyState
          icon={Shield}
          title="No insurance policies yet"
          description="Add your term, health, motor, and other policies to track renewals and coverage."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Add first policy
            </Button>
          }
        />
      )}

      {!isLoading && byStatus.active.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {byStatus.active.map((p) =>
              confirmDeleteId === p.id ? (
                <Card key={p.id} className="border-destructive">
                  <CardContent className="p-5 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium truncate">Delete "{p.insurer} {p.policyNumber}"?</p>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="destructive" size="sm" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(p.id)}>
                        {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>No</Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <PolicyCard
                  key={p.id}
                  policy={p}
                  onEdit={() => { setEditPolicy(p); setCreateOpen(true); }}
                  onDelete={() => setConfirmDeleteId(p.id)}
                  isDeleting={deleteMutation.isPending && confirmDeleteId === p.id}
                />
              )
            )}
          </div>
          {byStatus.inactive.length > 0 && (
            <>
              <h2 className="text-sm font-medium text-muted-foreground mt-8 mb-3">
                Inactive / lapsed
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
                {byStatus.inactive.map((p) =>
                  confirmDeleteId === p.id ? (
                    <Card key={p.id} className="border-destructive">
                      <CardContent className="p-5 flex items-center justify-between gap-3">
                        <p className="text-sm font-medium truncate">Delete "{p.insurer}"?</p>
                        <div className="flex gap-2 shrink-0">
                          <Button variant="destructive" size="sm" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(p.id)}>
                            {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes'}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>No</Button>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <PolicyCard
                      key={p.id}
                      policy={p}
                      onEdit={() => { setEditPolicy(p); setCreateOpen(true); }}
                      onDelete={() => setConfirmDeleteId(p.id)}
                      isDeleting={deleteMutation.isPending && confirmDeleteId === p.id}
                    />
                  )
                )}
              </div>
            </>
          )}
        </>
      )}

      <CreatePolicyDialog
        open={createOpen}
        onOpenChange={(v) => { setCreateOpen(v); if (!v) setEditPolicy(null); }}
        initial={editPolicy}
      />
    </div>
  );
}
