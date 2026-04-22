import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Building2,
  Plus,
  ArrowUpRight,
  Users,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Pencil,
  Trash2,
  Loader2,
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
import { Select } from '@/components/ui/select';
import {
  rentalApi,
  type RentalPropertyDTO,
  type CreatePropertyInput,
} from '@/api/rental.api';

// ── Status helpers ────────────────────────────────────────────────────

function overdueDays(isoDate: string): number {
  const due = new Date(isoDate).getTime();
  return Math.floor((Date.now() - due) / (1000 * 60 * 60 * 24));
}

function getPropertySummary(property: RentalPropertyDTO) {
  const activeTenancy = property.tenancies?.find((t) => t.isActive);
  const allReceipts = property.tenancies?.flatMap((t) => t.rentReceipts ?? []) ?? [];
  const overdueCount = allReceipts.filter((r) => r.status === 'OVERDUE').length;
  const expectedCount = allReceipts.filter((r) => r.status === 'EXPECTED').length;
  const nextDue = allReceipts
    .filter((r) => r.status === 'EXPECTED')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  return { activeTenancy, overdueCount, expectedCount, nextDue };
}

// ── Create / Edit property dialog ─────────────────────────────────────

function CreatePropertyDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: RentalPropertyDTO | null;
}) {
  const qc = useQueryClient();
  const isEdit = !!initial;
  const [form, setForm] = useState<CreatePropertyInput>({
    name: initial?.name ?? '',
    propertyType: initial?.propertyType ?? 'RESIDENTIAL',
    address: initial?.address ?? '',
    purchaseDate: initial?.purchaseDate ?? '',
    purchasePrice: initial?.purchasePrice ?? '',
    currentValue: initial?.currentValue ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CreatePropertyInput, string>>>({});

  // Re-sync form when dialog opens with a different initial
  useState(() => {
    if (open) {
      setForm({
        name: initial?.name ?? '',
        propertyType: initial?.propertyType ?? 'RESIDENTIAL',
        address: initial?.address ?? '',
        purchaseDate: initial?.purchaseDate ?? '',
        purchasePrice: initial?.purchasePrice ?? '',
        currentValue: initial?.currentValue ?? '',
      });
    }
  });

  const mutation = useMutation({
    mutationFn: (input: CreatePropertyInput) =>
      isEdit ? rentalApi.updateProperty(initial!.id, input) : rentalApi.createProperty(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rental-properties'] });
      onOpenChange(false);
      setForm({ name: '', propertyType: 'RESIDENTIAL' });
    },
  });

  function validate(): boolean {
    const errs: typeof errors = {};
    if (!form.name.trim()) errs.name = 'Required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    const payload: CreatePropertyInput = {
      name: form.name.trim(),
      propertyType: form.propertyType,
      address: form.address || null,
      purchaseDate: form.purchaseDate || null,
      purchasePrice: form.purchasePrice || null,
      currentValue: form.currentValue || null,
    };
    mutation.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit property' : 'Add property'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Name *</Label>
            <Input
              placeholder="Andheri East flat"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={errors.name ? 'border-negative' : ''}
            />
            {errors.name && <p className="text-xs text-negative mt-1">{errors.name}</p>}
          </div>
          <div>
            <Label>Type</Label>
            <select
              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.propertyType}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  propertyType: e.target.value as CreatePropertyInput['propertyType'],
                }))
              }
            >
              {['RESIDENTIAL', 'COMMERCIAL', 'LAND', 'PARKING'].map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0) + t.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Address</Label>
            <Input
              placeholder="Full address (optional)"
              value={form.address ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Purchase date</Label>
              <Input
                type="date"
                value={form.purchaseDate ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))}
              />
            </div>
            <div>
              <Label>Purchase price (₹)</Label>
              <Input
                placeholder="0"
                value={form.purchasePrice ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, purchasePrice: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <Label>Current value (₹)</Label>
            <Input
              placeholder="0"
              value={form.currentValue ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, currentValue: e.target.value }))}
            />
          </div>
        </div>
        {mutation.isError && (
          <p className="text-sm text-negative">
            {mutation.error instanceof Error ? mutation.error.message : 'Error creating property'}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Property card ─────────────────────────────────────────────────────

function PropertyCard({
  property,
  onEdit,
  onDelete,
  isDeleting,
}: {
  property: RentalPropertyDTO;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const { activeTenancy, overdueCount, nextDue } = getPropertySummary(property);

  const statusColor = overdueCount > 0 ? 'text-negative' : 'text-positive';
  const statusIcon =
    overdueCount > 0 ? (
      <AlertTriangle className="h-4 w-4 text-negative" />
    ) : activeTenancy ? (
      <CheckCircle2 className="h-4 w-4 text-positive" />
    ) : (
      <Clock className="h-4 w-4 text-muted-foreground" />
    );

  const monthlyRent = activeTenancy
    ? new Decimal(activeTenancy.monthlyRent)
    : null;

  const typeLabel: Record<string, string> = {
    RESIDENTIAL: 'Residential',
    COMMERCIAL: 'Commercial',
    LAND: 'Land',
    PARKING: 'Parking',
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-semibold truncate">{property.name}</h3>
              {statusIcon}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs text-muted-foreground">
                {typeLabel[property.propertyType] ?? property.propertyType}
              </span>
              {property.address && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                    {property.address}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onEdit} title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={onDelete} disabled={isDeleting} title="Delete">
              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-7 w-7 p-0">
              <Link to={`/rental/${property.id}`}>
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t space-y-2">
          {activeTenancy ? (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Tenant
                </span>
                <span className="font-medium">{activeTenancy.tenantName}</span>
              </div>
              {monthlyRent && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Monthly rent
                  </span>
                  <span className={`font-medium tabular-nums ${statusColor}`}>
                    {formatINR(monthlyRent.toString())}
                  </span>
                </div>
              )}
              {nextDue && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Next due
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {new Date(nextDue.dueDate).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </span>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No active tenancy</p>
          )}

          {overdueCount > 0 && (
            <div className="mt-2 rounded-md bg-negative/10 px-3 py-1.5 text-xs text-negative font-medium">
              {overdueCount} overdue receipt{overdueCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Summary strip ─────────────────────────────────────────────────────

function SummaryStrip({ properties }: { properties: RentalPropertyDTO[] }) {
  const active = properties.filter((p) =>
    p.tenancies?.some((t) => t.isActive),
  ).length;
  const totalOverdue = properties.reduce((sum, p) => {
    const receipts = p.tenancies?.flatMap((t) => t.rentReceipts ?? []) ?? [];
    return sum + receipts.filter((r) => r.status === 'OVERDUE').length;
  }, 0);
  const monthlyIncome = properties.reduce((sum, p) => {
    const activeTenancy = p.tenancies?.find((t) => t.isActive);
    if (!activeTenancy) return sum;
    return sum.plus(new Decimal(activeTenancy.monthlyRent));
  }, new Decimal(0));

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      {[
        {
          label: 'Active tenancies',
          value: String(active),
          sub: `of ${properties.length} properties`,
        },
        {
          label: 'Monthly income',
          value: formatINR(monthlyIncome.toString()),
          sub: 'active tenancies',
          className: 'text-positive',
        },
        {
          label: 'Overdue receipts',
          value: String(totalOverdue),
          sub: totalOverdue > 0 ? 'need attention' : 'all clear',
          className: totalOverdue > 0 ? 'text-negative' : 'text-positive',
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

// ── Page ──────────────────────────────────────────────────────────────

export function RentalListPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editProperty, setEditProperty] = useState<RentalPropertyDTO | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: properties, isLoading } = useQuery({
    queryKey: ['rental-properties'],
    queryFn: () => rentalApi.listProperties(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => rentalApi.deleteProperty(id),
    onSuccess: () => {
      toast.success('Property deleted');
      setConfirmDeleteId(null);
      qc.invalidateQueries({ queryKey: ['rental-properties'] });
    },
    onError: () => toast.error('Failed to delete property'),
  });

  const list = properties ?? [];

  return (
    <div>
      <PageHeader
        title="Rental Properties"
        description="Track properties, tenancies, rent receipts, and expenses"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Add property
          </Button>
        }
      />

      {!isLoading && list.length > 0 && <SummaryStrip properties={list} />}

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-44 animate-pulse bg-muted/60" />
          ))}
        </div>
      )}

      {!isLoading && list.length === 0 && (
        <EmptyState
          icon={Building2}
          title="No rental properties yet"
          description="Add a property, set up a tenancy, and let PortfolioOS track rent receipts automatically."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Add your first property
            </Button>
          }
        />
      )}

      {!isLoading && list.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((p) => (
            <div key={p.id}>
              {confirmDeleteId === p.id ? (
                <Card className="border-destructive">
                  <CardContent className="p-5 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">Delete "{p.name}"?</p>
                    <div className="flex gap-2">
                      <Button variant="destructive" size="sm" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(p.id)}>
                        {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes, delete'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <PropertyCard
                  property={p}
                  onEdit={() => { setEditProperty(p); setCreateOpen(true); }}
                  onDelete={() => setConfirmDeleteId(p.id)}
                  isDeleting={deleteMutation.isPending && confirmDeleteId === p.id}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <CreatePropertyDialog
        open={createOpen}
        onOpenChange={(v) => { setCreateOpen(v); if (!v) setEditProperty(null); }}
        initial={editProperty}
      />
    </div>
  );
}
