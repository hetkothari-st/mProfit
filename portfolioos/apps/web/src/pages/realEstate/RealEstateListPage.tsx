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
  TrendingDown,
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
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { realEstateApi } from '@/api/realEstate.api';
import { apiErrorMessage } from '@/api/client';
import { PropertyFormDialog } from './PropertyFormDialog';

// ── Per-type identity: icon + tinted banner palette ──────────────────
// Each tone is a calm, postcard-like tint that signals the property type
// without resorting to lurid Tailwind gradients. Light + dark variants
// share the same hue family but step value differently.

const TYPE_ICON: Record<PropertyType, LucideIcon> = {
  APARTMENT: Building2,
  INDEPENDENT_HOUSE: Home,
  VILLA: Castle,
  PLOT_LAND: MapIcon,
  COMMERCIAL_OFFICE: Briefcase,
  COMMERCIAL_SHOP: Store,
  AGRICULTURAL: Sprout,
  PARKING_GARAGE: Car,
  UNDER_CONSTRUCTION: Construction,
  OTHER: Building,
};

interface BannerTone { bg: string; ink: string }

const BANNER_TONE: Record<PropertyType, BannerTone> = {
  APARTMENT:          { bg: 'bg-[hsl(217_22%_88%)] dark:bg-[hsl(217_18%_22%)]', ink: 'text-[hsl(217_38%_24%)] dark:text-[hsl(217_22%_72%)]' },
  INDEPENDENT_HOUSE:  { bg: 'bg-[hsl(38_42%_88%)]  dark:bg-[hsl(38_22%_20%)]',  ink: 'text-[hsl(28_50%_28%)]  dark:text-[hsl(38_42%_72%)]' },
  VILLA:              { bg: 'bg-[hsl(12_42%_90%)]  dark:bg-[hsl(12_22%_22%)]',  ink: 'text-[hsl(12_42%_32%)]  dark:text-[hsl(12_42%_72%)]' },
  PLOT_LAND:          { bg: 'bg-[hsl(36_50%_88%)]  dark:bg-[hsl(36_24%_20%)]',  ink: 'text-[hsl(32_60%_30%)]  dark:text-[hsl(36_60%_70%)]' },
  COMMERCIAL_OFFICE:  { bg: 'bg-[hsl(213_28%_85%)] dark:bg-[hsl(213_22%_18%)]', ink: 'text-[hsl(213_53%_22%)] dark:text-[hsl(213_22%_75%)]' },
  COMMERCIAL_SHOP:    { bg: 'bg-[hsl(28_55%_88%)]  dark:bg-[hsl(28_24%_22%)]',  ink: 'text-[hsl(20_60%_32%)]  dark:text-[hsl(28_60%_72%)]' },
  AGRICULTURAL:       { bg: 'bg-[hsl(130_28%_86%)] dark:bg-[hsl(130_18%_18%)]', ink: 'text-[hsl(130_38%_28%)] dark:text-[hsl(130_28%_70%)]' },
  PARKING_GARAGE:     { bg: 'bg-[hsl(215_12%_84%)] dark:bg-[hsl(215_10%_20%)]', ink: 'text-[hsl(215_22%_32%)] dark:text-[hsl(215_12%_70%)]' },
  UNDER_CONSTRUCTION: { bg: 'bg-[hsl(36_70%_86%)]  dark:bg-[hsl(36_28%_22%)]',  ink: 'text-[hsl(28_70%_32%)]  dark:text-[hsl(36_75%_70%)]' },
  OTHER:              { bg: 'bg-[hsl(38_18%_88%)]  dark:bg-[hsl(38_10%_20%)]',  ink: 'text-[hsl(213_38%_22%)] dark:text-[hsl(38_22%_72%)]' },
};

// ── Property banner — postcard / deed aesthetic ──────────────────────
// Type-tinted color band + ghosted center icon + brass corner brackets
// + type label / serial / city stamp. No abstract patterns.

interface PropertyBannerProps {
  property: OwnedPropertyDTO;
  isSold: boolean;
}

function PropertyBanner({ property, isSold }: PropertyBannerProps) {
  const TypeIcon = TYPE_ICON[property.propertyType] ?? Building;
  const tone = BANNER_TONE[property.propertyType] ?? BANNER_TONE.OTHER;
  const typeLabel = PROPERTY_TYPE_LABELS[property.propertyType] ?? property.propertyType;
  const serial = property.id.replace(/[^A-Z0-9]/gi, '').slice(-6).toUpperCase();
  const locationLabel = property.city ?? property.address ?? null;

  return (
    <div className={`relative h-32 overflow-hidden border-b border-border/70 ${tone.bg}`}>
      {/* Ghosted centerpiece icon — the type, instantly readable */}
      <TypeIcon
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-24 w-24 opacity-30 ${tone.ink}`}
        strokeWidth={1.1}
      />

      {/* Brass corner brackets */}
      <div className="absolute top-2 left-2 w-3 h-3 border-t border-l border-accent/60" />
      <div className="absolute top-2 right-2 w-3 h-3 border-t border-r border-accent/60" />
      <div className="absolute bottom-2 left-2 w-3 h-3 border-b border-l border-accent/60" />
      <div className="absolute bottom-2 right-2 w-3 h-3 border-b border-r border-accent/60" />

      {/* Top: type label + serial */}
      <div className="absolute top-2.5 left-5 right-5 flex items-center justify-between">
        <span className={`flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] font-medium ${tone.ink}`}>
          <TypeIcon className="h-3 w-3" strokeWidth={1.8} />
          {typeLabel}
        </span>
        <span className={`text-[10px] font-mono uppercase tracking-wider ${tone.ink} opacity-70`}>
          № {serial}
        </span>
      </div>

      {/* Bottom: city stamp */}
      {locationLabel && (
        <div className="absolute bottom-2.5 left-5 right-5 flex items-center">
          <span className={`flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] font-medium ${tone.ink} opacity-70`}>
            <MapPin className="h-3 w-3" />
            <span className="truncate max-w-[14rem]">{locationLabel}</span>
          </span>
        </div>
      )}

      {/* SOLD diagonal stamp */}
      {isSold && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="font-display text-3xl tracking-[0.25em] text-destructive/65 -rotate-12 border-4 border-destructive/65 px-4 py-1 rounded-sm bg-card/40 backdrop-blur-sm">
            SOLD
          </span>
        </div>
      )}
    </div>
  );
}

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
  const gainNeutral = gain.isZero();
  const gainColor = gainPositive ? 'text-positive' : gainNeutral ? 'text-muted-foreground' : 'text-negative';
  const isSold = property.status === 'SOLD';
  const statusLabel = PROPERTY_STATUS_LABELS[property.status] ?? property.status;

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <Link
      to={`/real-estate/${property.id}`}
      className="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 rounded-lg"
    >
      <Card className={`overflow-hidden p-0 cursor-pointer transition-all duration-300 paper relative
        group-hover:shadow-elev-lg group-hover:-translate-y-0.5
        ${isSold ? 'opacity-75' : ''}`}>

        {/* Type-relevant banner */}
        <PropertyBanner property={property} isSold={isSold} />

        {/* Body */}
        <CardContent className="p-5 relative">
          <div className="flex items-start justify-between gap-3 mb-1">
            <div className="min-w-0 flex-1">
              <h3 className="font-sans font-semibold text-[28px] leading-[1.1] tracking-[-0.02em] text-foreground truncate">
                {property.name}
              </h3>
              <p className="font-display-italic text-xs text-muted-foreground mt-1.5">
                {statusLabel}
              </p>
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

          {/* Diamond rule */}
          <div className="rule-ornament my-3"><span /></div>

          {/* Monumental value */}
          {property.currentValue ? (
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">
                Current value
              </p>
              <p className="numeric-display-lg money-digits text-3xl mt-1">
                {formatINR(property.currentValue)}
              </p>
              {totalCostBasisOf(property).greaterThan(0) && (
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm tabular-nums font-medium
                    ${gainPositive ? 'bg-positive/10 text-positive'
                      : gainNeutral ? 'bg-muted text-muted-foreground'
                      : 'bg-negative/10 text-negative'}`}>
                    {gainPositive ? <TrendingUp className="h-3 w-3" />
                      : gainNeutral ? null
                      : <TrendingDown className="h-3 w-3" />}
                    {pct ? `${gainPositive ? '+' : ''}${pct.toFixed(1)}%` : '—'}
                  </span>
                  <span className={`font-display-italic ${gainColor}`}>
                    {gainPositive ? '+' : ''}{formatINR(gain.toString())}
                  </span>
                  <span className="text-muted-foreground/70 ml-auto group-hover:text-accent transition-colors">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground font-display-italic">
                Current value not set
              </p>
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/70 group-hover:text-accent transition-colors" />
            </div>
          )}
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
