import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Building2,
  Plus,
  ArrowUpRight,
  Calendar,
  Pencil,
  Trash2,
  Loader2,
  Home,
  Store,
  Map as MapIcon,
  Car,
  MapPin,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
import { Select } from '@/components/ui/select';
import {
  rentalApi,
  type RentalPropertyDTO,
  type CreatePropertyInput,
} from '@/api/rental.api';

// ── Property type theming ─────────────────────────────────────────────

type PropertyTypeKey = 'RESIDENTIAL' | 'COMMERCIAL' | 'LAND' | 'PARKING';

interface PropertyTypeStyle {
  label: string;
  icon: LucideIcon;
  /** Solid color for the type stripe — varColor maps to a CSS hsl var. */
  stripe: string;
  /** Foreground for stripe text. */
  stripeText: string;
}

// Receipt-style cards: each type owns one solid color band, drawn from theme.
const PROPERTY_TYPE_STYLES: Record<PropertyTypeKey, PropertyTypeStyle> = {
  RESIDENTIAL: {
    label: 'Residential',
    icon: Home,
    stripe: 'hsl(var(--positive))',
    stripeText: 'hsl(40 50% 97%)',
  },
  COMMERCIAL: {
    label: 'Commercial',
    icon: Store,
    stripe: 'hsl(var(--primary))',
    stripeText: 'hsl(var(--primary-foreground))',
  },
  LAND: {
    label: 'Land',
    icon: MapIcon,
    stripe: 'hsl(var(--accent))',
    stripeText: 'hsl(var(--accent-foreground))',
  },
  PARKING: {
    label: 'Parking',
    icon: Car,
    stripe: 'hsl(215 18% 38%)',
    stripeText: 'hsl(40 50% 97%)',
  },
};

function getPropertyStyle(type: string): PropertyTypeStyle {
  const key: PropertyTypeKey =
    type === 'COMMERCIAL' || type === 'LAND' || type === 'PARKING'
      ? type
      : 'RESIDENTIAL';
  return PROPERTY_TYPE_STYLES[key];
}

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

  return { activeTenancy, overdueCount, expectedCount, nextDue, allReceipts };
}

// ── 12-month receipt ledger strip ─────────────────────────────────────
// Renders the trailing 12 months as small cells, color-coded by status.

type ReceiptStatus = 'RECEIVED' | 'EXPECTED' | 'PARTIAL' | 'OVERDUE' | 'SKIPPED';
interface MiniReceipt { forMonth: string; status: ReceiptStatus }

function buildLast12(receipts: MiniReceipt[]) {
  const map = new Map(receipts.map((r) => [r.forMonth, r.status]));
  const cells: Array<{ month: string; label: string; status: ReceiptStatus | null }> = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    cells.push({
      month: key,
      label: d.toLocaleString('en-IN', { month: 'short' }).slice(0, 1),
      status: map.get(key) ?? null,
    });
  }
  return cells;
}

function ReceiptLedger({ receipts }: { receipts: MiniReceipt[] }) {
  const cells = buildLast12(receipts);
  const cls = (s: ReceiptStatus | null) => {
    switch (s) {
      case 'RECEIVED': return 'bg-positive border-positive';
      case 'PARTIAL':  return 'bg-warning/60 border-warning';
      case 'OVERDUE':  return 'bg-negative border-negative';
      case 'EXPECTED': return 'bg-transparent border-muted-foreground/40';
      case 'SKIPPED':  return 'bg-muted border-muted-foreground/30';
      case null:
      default:         return 'bg-transparent border-border/50';
    }
  };
  return (
    <div className="flex items-center gap-[3px]" aria-label="Last 12 months receipt status">
      {cells.map((c, i) => (
        <div
          key={c.month}
          title={`${c.month} · ${c.status ?? 'no record'}`}
          className={`h-3.5 w-3.5 rounded-[2px] border transition-colors ${cls(c.status)} ${i === 11 ? 'ring-1 ring-accent/60 ring-offset-1 ring-offset-card' : ''}`}
        />
      ))}
    </div>
  );
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
  useEffect(() => {
    if (open) {
      setForm({
        name: initial?.name ?? '',
        propertyType: initial?.propertyType ?? 'RESIDENTIAL',
        address: initial?.address ?? '',
        purchaseDate: initial?.purchaseDate ?? '',
        purchasePrice: initial?.purchasePrice ?? '',
        currentValue: initial?.currentValue ?? '',
      });
      setErrors({});
    }
  }, [open, initial]);

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
  const { activeTenancy, overdueCount, nextDue, allReceipts } = getPropertySummary(property);
  const monthlyRent = activeTenancy ? new Decimal(activeTenancy.monthlyRent) : null;
  const typeStyle = getPropertyStyle(property.propertyType);

  const occupancyState: 'occupied' | 'vacant' | 'overdue' =
    overdueCount > 0 ? 'overdue' : activeTenancy ? 'occupied' : 'vacant';
  const stampLabel = occupancyState === 'overdue' ? 'OVERDUE' : occupancyState === 'occupied' ? 'OCCUPIED' : 'VACANT';
  const stampColor =
    occupancyState === 'overdue' ? 'text-negative border-negative'
    : occupancyState === 'occupied' ? 'text-positive border-positive'
    : 'text-muted-foreground border-muted-foreground/60';

  // Receipt serial — paper-receipt feel.
  const serial = property.id.replace(/[^A-Z0-9]/gi, '').slice(-8).toUpperCase();

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Inline style for the type stripe (color from theme vars).
  const stripeStyle: React.CSSProperties = {
    backgroundColor: typeStyle.stripe,
    color: typeStyle.stripeText,
  };

  return (
    <Link
      to={`/rental/${property.id}`}
      className="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 rounded-lg"
    >
      <Card className="overflow-hidden p-0 cursor-pointer transition-all duration-300 paper relative
        group-hover:shadow-elev-lg group-hover:-translate-y-0.5">

        {/* TICKET STUB — type label band */}
        <div
          className="relative px-5 py-2.5 flex items-center justify-between text-[10px] uppercase tracking-[0.22em] font-medium"
          style={stripeStyle}
        >
          <span className="flex items-center gap-2">
            <span className="opacity-90">{typeStyle.label}</span>
            <span className="opacity-60">·</span>
            <span className="font-mono normal-case tracking-normal opacity-80">№ {serial}</span>
          </span>
          {nextDue && (
            <span className="opacity-80 normal-case tracking-normal text-[10px] font-mono">
              Next · {new Date(nextDue.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
            </span>
          )}
        </div>

        {/* PERFORATED DIVIDER */}
        <div className="relative h-3 bg-card">
          <div className="absolute -top-1.5 -left-1.5 h-3 w-3 rounded-full bg-background border border-border/70" />
          <div className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-background border border-border/70" />
          <div
            className="absolute inset-x-3 top-1/2 h-px"
            style={{
              backgroundImage: 'repeating-linear-gradient(to right, hsl(var(--border)) 0 6px, transparent 6px 12px)',
            }}
          />
        </div>

        {/* BODY */}
        <CardContent className="p-5 pt-1 relative">
          {/* Top: name + actions + occupancy stamp */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-sans font-semibold text-[28px] leading-[1.1] tracking-[-0.02em] text-foreground truncate">
                {property.name}
              </h3>
              {property.address && (
                <div className="flex items-center gap-1.5 mt-2.5 text-base text-muted-foreground">
                  <MapPin className="h-4 w-4 shrink-0 text-accent/70" />
                  <span className="truncate">{property.address}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-0.5 shrink-0 -mr-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={(e) => { stop(e); onEdit(); }}
                title="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={(e) => { stop(e); onDelete(); }}
                disabled={isDeleting}
                title="Delete"
              >
                {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {/* Tenant + rent + stamp row */}
          {activeTenancy ? (
            <div className="grid grid-cols-[1fr_auto] gap-4 items-end">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">
                  Tenant
                </p>
                <p className="font-display-italic text-base text-foreground mt-0.5 truncate">
                  {activeTenancy.tenantName}
                </p>
                {monthlyRent && (
                  <div className="mt-2">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">
                      Monthly rent
                    </p>
                    <p className="numeric-display-lg money-digits text-2xl mt-0.5">
                      {formatINR(monthlyRent.toString())}
                    </p>
                  </div>
                )}
              </div>
              <div className={`shrink-0 -rotate-6 border-2 px-2.5 py-1 rounded-sm font-display text-sm tracking-[0.18em] ${stampColor}`}>
                {stampLabel}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="font-display-italic text-base text-muted-foreground">
                No active tenancy
              </p>
              <div className={`-rotate-6 border-2 px-2.5 py-1 rounded-sm font-display text-sm tracking-[0.18em] ${stampColor}`}>
                {stampLabel}
              </div>
            </div>
          )}

          {/* 12-month ledger */}
          <div className="mt-4 pt-3 border-t border-dashed border-border/70">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground font-medium">
                Last 12 months
              </p>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                {overdueCount > 0 && (
                  <span className="text-negative font-medium">{overdueCount} overdue</span>
                )}
                <Calendar className="h-3 w-3" />
              </div>
            </div>
            <ReceiptLedger receipts={allReceipts as MiniReceipt[]} />
          </div>

          <ArrowUpRight className="absolute bottom-4 right-5 h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-accent transition-colors" />
        </CardContent>
      </Card>
    </Link>
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
          <div className="flex gap-2">
            <DownloadReportButton type="rental" />
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Add property
            </Button>
          </div>
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
