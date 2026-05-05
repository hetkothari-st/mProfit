import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Home,
  Plus,
  ArrowUpRight,
  MapPin,
  Pencil,
  Trash2,
  Loader2,
  TrendingUp,
  Building2,
  Castle,
  Map as MapIcon,
  Briefcase,
  Store,
  Sprout,
  Car,
  Construction,
  Building,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Decimal,
  formatINR,
  totalCostBasisOf,
  PROPERTY_TYPE_LABELS,
  PROPERTY_STATUS_LABELS,
} from '@portfolioos/shared';
import type { OwnedPropertyDTO, PropertyType } from '@portfolioos/shared';

interface TypeStyle {
  icon: LucideIcon;
  /** Tailwind gradient classes for the card's hero banner. */
  gradient: string;
}

const PROPERTY_TYPE_STYLES: Record<PropertyType, TypeStyle> = {
  APARTMENT:          { icon: Building2,    gradient: 'from-blue-500 via-blue-600 to-indigo-700' },
  INDEPENDENT_HOUSE:  { icon: Home,         gradient: 'from-emerald-500 via-emerald-600 to-teal-700' },
  VILLA:              { icon: Castle,       gradient: 'from-purple-500 via-fuchsia-600 to-pink-700' },
  PLOT_LAND:          { icon: MapIcon,      gradient: 'from-amber-500 via-orange-500 to-red-600' },
  COMMERCIAL_OFFICE:  { icon: Briefcase,    gradient: 'from-slate-600 via-slate-700 to-zinc-800' },
  COMMERCIAL_SHOP:    { icon: Store,        gradient: 'from-orange-500 via-red-500 to-rose-700' },
  AGRICULTURAL:       { icon: Sprout,       gradient: 'from-lime-500 via-green-600 to-emerald-700' },
  PARKING_GARAGE:     { icon: Car,          gradient: 'from-cyan-500 via-sky-600 to-blue-700' },
  UNDER_CONSTRUCTION: { icon: Construction, gradient: 'from-yellow-500 via-amber-600 to-orange-700' },
  OTHER:              { icon: Building,     gradient: 'from-stone-500 via-stone-600 to-neutral-700' },
};
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { realEstateApi } from '@/api/realEstate.api';
import { apiErrorMessage } from '@/api/client';
import { PropertyFormDialog } from './PropertyFormDialog';

function appreciation(p: OwnedPropertyDTO): { gain: Decimal; pct: Decimal | null } {
  const cost = totalCostBasisOf(p);
  const cur = new Decimal(p.currentValue ?? 0);
  const gain = cur.minus(cost);
  const pct = cost.greaterThan(0) ? gain.dividedBy(cost).times(100) : null;
  return { gain, pct };
}

function PropertyCard({
  property,
  onEdit,
  onDelete,
  isDeleting,
}: {
  property: OwnedPropertyDTO;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const { gain, pct } = appreciation(property);
  const gainPositive = gain.greaterThan(0);
  const gainColor = gainPositive ? 'text-positive' : gain.isZero() ? 'text-muted-foreground' : 'text-negative';
  const isSold = property.status === 'SOLD';
  const typeStyle = PROPERTY_TYPE_STYLES[property.propertyType] ?? PROPERTY_TYPE_STYLES.OTHER;
  const TypeIcon = typeStyle.icon;
  const typeLabel = PROPERTY_TYPE_LABELS[property.propertyType] ?? property.propertyType;
  const statusLabel = PROPERTY_STATUS_LABELS[property.status] ?? property.status;

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <Link
      to={`/real-estate/${property.id}`}
      className="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg"
    >
      <Card className="overflow-hidden group-hover:shadow-lg group-hover:-translate-y-0.5 transition-all duration-200 p-0 cursor-pointer">
      {/* Hero banner: gradient + giant decorative icon + type chip */}
      <div className={`relative h-28 bg-gradient-to-br ${typeStyle.gradient}`}>
        {/* Decorative oversized icon, washed out */}
        <TypeIcon
          className="absolute -right-3 -bottom-3 h-32 w-32 text-white/15"
          strokeWidth={1.25}
        />
        {/* Subtle radial highlight */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-white/10" />
        {/* Top-right floating icon chip */}
        <div className="absolute top-3 right-3 h-9 w-9 rounded-lg bg-white/15 backdrop-blur-sm border border-white/25 flex items-center justify-center">
          <TypeIcon className="h-5 w-5 text-white" />
        </div>
        {/* Type label top-left */}
        <div className="absolute top-3 left-4 flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/95">
            {typeLabel}
          </span>
          {isSold && (
            <span className="text-[10px] font-semibold uppercase tracking-wider rounded bg-white/90 text-black px-1.5 py-0.5">
              Sold
            </span>
          )}
        </div>
        {/* Name overlay bottom */}
        <div className="absolute bottom-3 left-4 right-4">
          <h3 className="font-semibold text-lg text-white truncate drop-shadow-sm">
            {property.name}
          </h3>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-white/85">
            <span className="truncate">{statusLabel}</span>
            {(property.city || property.address) && (
              <>
                <span className="text-white/50">·</span>
                <span className="flex items-center gap-1 truncate">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{property.city ?? property.address}</span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <CardContent className="p-5">
        <div className="flex items-center justify-end gap-1 -mt-1 mb-3">
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
          <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </div>

        <div className="space-y-2">
          {property.currentValue ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Current value</span>
                <span className="font-semibold tabular-nums text-base">
                  {formatINR(property.currentValue)}
                </span>
              </div>
              {totalCostBasisOf(property).greaterThan(0) && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Appreciation
                  </span>
                  <span className={`font-medium tabular-nums ${gainColor}`}>
                    {gainPositive ? '+' : ''}
                    {formatINR(gain.toString())}
                    {pct ? ` (${gainPositive ? '+' : ''}${pct.toFixed(1)}%)` : ''}
                  </span>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Current value not set</p>
          )}
        </div>
      </CardContent>
      </Card>
    </Link>
  );
}

function SummaryStrip({ properties }: { properties: OwnedPropertyDTO[] }) {
  const active = properties.filter((p) => p.status !== 'SOLD').length;
  const totalValue = properties.reduce(
    (s, p) => (p.status === 'SOLD' ? s : s.plus(new Decimal(p.currentValue ?? 0))),
    new Decimal(0),
  );
  const totalCost = properties.reduce(
    (s, p) => (p.status === 'SOLD' ? s : s.plus(totalCostBasisOf(p))),
    new Decimal(0),
  );
  const gain = totalValue.minus(totalCost);
  const gainPositive = gain.greaterThan(0);

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      {[
        {
          label: 'Active properties',
          value: String(active),
          sub: `of ${properties.length} total`,
        },
        {
          label: 'Portfolio value',
          value: formatINR(totalValue.toString()),
          sub: 'current estimate',
        },
        {
          label: 'Unrealised gain',
          value: formatINR(gain.toString()),
          sub: 'value − cost basis',
          className: gainPositive ? 'text-positive' : gain.isZero() ? '' : 'text-negative',
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

export function RealEstateListPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editProperty, setEditProperty] = useState<OwnedPropertyDTO | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: properties, isLoading } = useQuery({
    queryKey: ['real-estate'],
    queryFn: () => realEstateApi.listProperties(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => realEstateApi.deleteProperty(id),
    onSuccess: () => {
      toast.success('Property deleted');
      setConfirmDeleteId(null);
      qc.invalidateQueries({ queryKey: ['real-estate'] });
      qc.invalidateQueries({ queryKey: ['real-estate-summary'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to delete')),
  });

  const list = properties ?? [];

  return (
    <div>
      <PageHeader
        title="Real Estate"
        description="Properties you own — homes, plots, commercial. Manual current value, capital-gain on sale, document vault."
        actions={
          <Button onClick={() => { setEditProperty(null); setCreateOpen(true); }}>
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
          icon={Home}
          title="No properties yet"
          description="Add a property to track purchase cost, current value, documents, and tax obligations."
          action={
            <Button onClick={() => { setEditProperty(null); setCreateOpen(true); }}>
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
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(p.id)}
                      >
                        {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes, delete'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>
                        Cancel
                      </Button>
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

      <PropertyFormDialog
        open={createOpen}
        onOpenChange={(v) => { setCreateOpen(v); if (!v) setEditProperty(null); }}
        initial={editProperty}
      />
    </div>
  );
}
