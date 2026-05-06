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
} from 'lucide-react';
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

// ── Architectural plate patterns ─────────────────────────────────────
// One SVG per property type, drawn in brass line-art over parchment.
// Patterns scale fluidly via preserveAspectRatio.

function PropertyPattern({ type }: { type: PropertyType }) {
  const stroke = 'hsl(var(--accent))';
  const ink = 'hsl(var(--primary))';
  const common = {
    width: '100%',
    height: '100%',
    viewBox: '0 0 320 128',
    preserveAspectRatio: 'xMidYMid slice',
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (type) {
    case 'APARTMENT':
      return (
        <svg {...common}>
          <g stroke={stroke} strokeWidth="1.2" opacity="0.55">
            {[0, 1, 2, 3, 4].map((c) =>
              [0, 1, 2, 3, 4, 5].map((r) => (
                <rect key={`${c}-${r}`} x={40 + c * 50} y={20 + r * 16} width="32" height="10" rx="1" />
              )),
            )}
          </g>
          <g stroke={ink} strokeWidth="1.4" opacity="0.7">
            <path d="M30 122 L30 18 L80 18 L80 122" />
            <path d="M80 122 L80 8 L130 8 L130 122" />
            <path d="M130 122 L130 22 L180 22 L180 122" />
            <path d="M180 122 L180 12 L230 12 L230 122" />
            <path d="M230 122 L230 26 L280 26 L280 122" />
          </g>
        </svg>
      );
    case 'INDEPENDENT_HOUSE':
      return (
        <svg {...common}>
          <g stroke={ink} strokeWidth="1.4" opacity="0.75">
            <path d="M60 122 L60 60 L160 16 L260 60 L260 122" />
            <path d="M40 60 L160 6 L280 60" />
            <rect x="148" y="78" width="24" height="44" />
            <rect x="92" y="76" width="22" height="22" />
            <rect x="206" y="76" width="22" height="22" />
            <path d="M220 60 L220 30 L240 30 L240 60" />
          </g>
          <g stroke={stroke} strokeWidth="1" opacity="0.5">
            <line x1="0" y1="122" x2="320" y2="122" />
            <line x1="20" y1="118" x2="40" y2="118" />
            <line x1="280" y1="118" x2="300" y2="118" />
          </g>
        </svg>
      );
    case 'VILLA':
      return (
        <svg {...common}>
          <g stroke={ink} strokeWidth="1.3" opacity="0.7">
            <path d="M40 122 L40 50 L60 30 L80 50 L80 122" />
            <path d="M80 122 L80 40 L120 20 L160 40 L160 122" />
            <path d="M160 122 L160 30 L200 12 L240 30 L240 122" />
            <path d="M240 122 L240 50 L260 30 L280 50 L280 122" />
            <path d="M105 122 Q120 86 135 122" />
            <path d="M185 122 Q200 80 215 122" />
          </g>
          <g stroke={stroke} strokeWidth="1" opacity="0.55">
            <circle cx="60" cy="78" r="6" />
            <circle cx="260" cy="78" r="6" />
            <line x1="0" y1="122" x2="320" y2="122" />
          </g>
        </svg>
      );
    case 'PLOT_LAND':
      return (
        <svg {...common}>
          <g stroke={stroke} strokeWidth="1.1" opacity="0.6">
            <path d="M0 110 Q80 96 160 102 T320 92" />
            <path d="M0 92 Q80 78 160 84 T320 74" />
            <path d="M0 74 Q80 60 160 66 T320 56" />
            <path d="M0 56 Q80 42 160 48 T320 38" />
            <path d="M0 38 Q80 24 160 30 T320 20" />
          </g>
          <g stroke={ink} strokeWidth="1.4" opacity="0.7" strokeDasharray="4 4">
            <path d="M48 122 L80 18 L240 18 L272 122 Z" />
          </g>
          <text x="160" y="76" fill={ink} opacity="0.6" fontSize="9" textAnchor="middle" letterSpacing="2" fontFamily="JetBrains Mono, monospace">
            N ↑
          </text>
        </svg>
      );
    case 'COMMERCIAL_OFFICE':
      return (
        <svg {...common}>
          <g stroke={ink} strokeWidth="1.4" opacity="0.7">
            <rect x="80" y="6" width="160" height="116" />
            <line x1="80" y1="36" x2="240" y2="36" />
            <line x1="80" y1="66" x2="240" y2="66" />
            <line x1="80" y1="96" x2="240" y2="96" />
            <line x1="120" y1="6" x2="120" y2="122" />
            <line x1="160" y1="6" x2="160" y2="122" />
            <line x1="200" y1="6" x2="200" y2="122" />
          </g>
          <g fill={stroke} opacity="0.35">
            <rect x="124" y="40" width="32" height="22" />
            <rect x="164" y="70" width="32" height="22" />
            <rect x="204" y="10" width="32" height="22" />
            <rect x="84" y="100" width="32" height="18" />
          </g>
        </svg>
      );
    case 'COMMERCIAL_SHOP':
      return (
        <svg {...common}>
          <g stroke={ink} strokeWidth="1.4" opacity="0.7">
            <path d="M30 60 L160 24 L290 60" />
            <path d="M50 60 L50 122" />
            <path d="M270 60 L270 122" />
            <rect x="80" y="76" width="160" height="46" />
            <rect x="100" y="92" width="32" height="30" />
            <rect x="188" y="92" width="32" height="30" />
          </g>
          <g stroke={stroke} strokeWidth="1.2" opacity="0.6">
            <path d="M50 60 Q70 70 90 60 Q110 70 130 60 Q150 70 170 60 Q190 70 210 60 Q230 70 250 60 Q270 70 290 60" />
            <line x1="0" y1="122" x2="320" y2="122" />
          </g>
        </svg>
      );
    case 'AGRICULTURAL':
      return (
        <svg {...common}>
          <g stroke={ink} strokeWidth="1.3" opacity="0.65">
            <path d="M0 110 Q60 96 120 110 T240 110 T320 110" />
            <path d="M0 90 Q60 76 120 90 T240 90 T320 90" />
            <path d="M0 70 Q60 56 120 70 T240 70 T320 70" />
            <path d="M0 50 Q60 36 120 50 T240 50 T320 50" />
          </g>
          <g stroke={stroke} strokeWidth="1.2" opacity="0.6">
            <circle cx="270" cy="28" r="14" />
            <line x1="270" y1="6" x2="270" y2="14" />
            <line x1="270" y1="42" x2="270" y2="50" />
            <line x1="248" y1="28" x2="256" y2="28" />
            <line x1="284" y1="28" x2="292" y2="28" />
            <line x1="254" y1="12" x2="260" y2="18" />
            <line x1="280" y1="38" x2="286" y2="44" />
          </g>
        </svg>
      );
    case 'PARKING_GARAGE':
      return (
        <svg {...common}>
          <g stroke={ink} strokeWidth="1.4" opacity="0.7">
            <line x1="0" y1="40" x2="320" y2="40" />
            <line x1="0" y1="122" x2="320" y2="122" />
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <line key={i} x1={20 + i * 40} y1="40" x2={20 + i * 40} y2="122" />
            ))}
          </g>
          <text
            x="40" y="92" fill={stroke} opacity="0.55" fontSize="38" fontFamily="Instrument Serif, serif"
          >P</text>
          <g stroke={stroke} strokeWidth="1" opacity="0.5">
            <path d="M80 70 L100 70 L100 110 L130 110" strokeDasharray="3 3" />
            <path d="M180 70 L210 70 L210 110 L240 110" strokeDasharray="3 3" />
          </g>
        </svg>
      );
    case 'UNDER_CONSTRUCTION':
      return (
        <svg {...common}>
          <g stroke={stroke} strokeWidth="1.2" opacity="0.55">
            {[...Array(20)].map((_, i) => (
              <line key={i} x1={-20 + i * 20} y1="0" x2={20 + i * 20} y2="128" />
            ))}
          </g>
          <g stroke={ink} strokeWidth="1.5" opacity="0.75">
            <path d="M40 122 L40 30 L40 30 L240 30 L240 50" />
            <path d="M40 30 L80 10 L80 30" />
            <line x1="40" y1="50" x2="240" y2="50" />
            <line x1="240" y1="30" x2="240" y2="80" />
            <rect x="80" y="80" width="120" height="42" />
            <line x1="80" y1="100" x2="200" y2="100" />
          </g>
        </svg>
      );
    case 'OTHER':
    default:
      return (
        <svg {...common}>
          <g stroke={stroke} strokeWidth="1" opacity="0.5">
            {[20, 40, 60, 80, 100, 120].map((y) => (
              <line key={y} x1="0" y1={y} x2="320" y2={y} />
            ))}
            {[40, 80, 120, 160, 200, 240, 280].map((x) => (
              <line key={x} x1={x} y1="0" x2={x} y2="128" />
            ))}
          </g>
          <g stroke={ink} strokeWidth="1.5" opacity="0.7">
            <circle cx="160" cy="64" r="36" />
            <path d="M160 28 L168 64 L160 100 L152 64 Z" fill={ink} fillOpacity="0.4" />
          </g>
        </svg>
      );
  }
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
  const typeLabel = PROPERTY_TYPE_LABELS[property.propertyType] ?? property.propertyType;
  const statusLabel = PROPERTY_STATUS_LABELS[property.status] ?? property.status;

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Plate serial number — derived from id, gives each card a unique ledger marker.
  const serial = property.id.replace(/[^A-Z0-9]/gi, '').slice(-6).toUpperCase();

  return (
    <Link
      to={`/real-estate/${property.id}`}
      className="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 rounded-lg"
    >
      <Card className={`overflow-hidden p-0 cursor-pointer transition-all duration-300 paper relative
        group-hover:shadow-elev-lg group-hover:-translate-y-0.5
        ${isSold ? 'opacity-75' : ''}`}>

        {/* Architectural plate hero */}
        <div className="relative h-32 overflow-hidden border-b border-border/70">
          <div className="absolute inset-0 paper" />
          <div className="absolute inset-0">
            <PropertyPattern type={property.propertyType} />
          </div>
          {/* Brass corner brackets — engraved-plate feel */}
          <div className="absolute top-2 left-2 w-3 h-3 border-t border-l border-accent/60" />
          <div className="absolute top-2 right-2 w-3 h-3 border-t border-r border-accent/60" />
          <div className="absolute bottom-2 left-2 w-3 h-3 border-b border-l border-accent/60" />
          <div className="absolute bottom-2 right-2 w-3 h-3 border-b border-r border-accent/60" />

          {/* Type label — editorial uppercase wide-tracked */}
          <div className="absolute top-2.5 left-5 right-5 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-accent">
              {typeLabel}
            </span>
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/80">
              № {serial}
            </span>
          </div>

          {/* Sold rubber-stamp */}
          {isSold && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="font-display text-4xl tracking-[0.25em] text-destructive/55 -rotate-12 border-4 border-destructive/55 px-4 py-1 rounded-sm">
                SOLD
              </span>
            </div>
          )}
        </div>

        {/* Body — editorial composition */}
        <CardContent className="p-5 pt-4 relative">
          {/* Top row: name + actions */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-2xl leading-tight tracking-tight text-foreground truncate">
                {property.name}
              </h3>
              <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                <span className="font-display-italic">{statusLabel}</span>
                {(property.city || property.address) && (
                  <>
                    <span className="text-accent/60">·</span>
                    <MapPin className="h-3 w-3 shrink-0 text-accent/70" />
                    <span className="truncate">{property.city ?? property.address}</span>
                  </>
                )}
              </div>
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
