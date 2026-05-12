import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Plus,
  Car,
  ArrowUpRight,
  MessageSquareShare,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Loader2,
  Calculator,
  User,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DownloadReportButton } from '@/components/reports/DownloadReportButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { cn } from '@/lib/cn';
import { vehiclesApi, type VehicleDTO } from '@/api/vehicles.api';
import { VehicleFormDialog } from './VehicleFormDialog';
import { SmsPasteDialog } from './SmsPasteDialog';
import { FuelPricesCard } from './FuelPricesCard';

type ViewMode = 'individual' | 'family';
const VIEW_MODE_KEY = 'vehicles_view_mode';

export function VehicleListPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem(VIEW_MODE_KEY) as ViewMode) || 'individual',
  );

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  }

  const { data: vehicles, isLoading } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => vehiclesApi.list(),
  });

  // Group vehicles by ownerName for "family" view.
  const groups = useMemo(() => {
    const list = vehicles ?? [];
    const map = new Map<string, VehicleDTO[]>();
    for (const v of list) {
      const key = (v.ownerName ?? '').trim() || 'Unassigned';
      const arr = map.get(key) ?? [];
      arr.push(v);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .map(([owner, items]) => ({ owner, items }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [vehicles]);

  return (
    <div>
      <PageHeader
        title="Vehicles"
        description="Registration, insurance, PUC, fitness — all expiries in one place"
        actions={
          <div className="flex gap-2 items-center">
            {/* View mode toggle — individual vs family (grouped by owner) */}
            <div
              role="tablist"
              aria-label="View mode"
              className="flex items-center rounded-md border border-border/70 bg-background/40 p-0.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'individual'}
                onClick={() => changeViewMode('individual')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[5px] text-[11px] font-medium tracking-wide transition-all',
                  viewMode === 'individual'
                    ? 'bg-foreground text-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <User className="h-3 w-3" /> Individual
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'family'}
                onClick={() => changeViewMode('family')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[5px] text-[11px] font-medium tracking-wide transition-all',
                  viewMode === 'family'
                    ? 'bg-foreground text-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Users className="h-3 w-3" /> Family
              </button>
            </div>
            <DownloadReportButton type="vehicles" />
            <Button asChild variant="outline">
              <Link to="/vehicles/value">
                <Calculator className="h-4 w-4" /> Get valuation
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setSmsOpen(true)}>
              <MessageSquareShare className="h-4 w-4" /> Paste SMS
            </Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" /> Add vehicle
            </Button>
          </div>
        }
      />

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-40 animate-pulse bg-muted/60" />
          ))}
        </div>
      )}

      {!isLoading && (
        <div className="mb-4">
          <FuelPricesCard defaultRtoCode={vehicles?.[0]?.rtoCode ?? null} />
        </div>
      )}

      {!isLoading && (vehicles ?? []).length === 0 && (
        <EmptyState
          icon={Car}
          title="No vehicles yet"
          description="Add an RC number — we'll track insurance, PUC, fitness, and challan expiries automatically."
          action={
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" /> Add your first vehicle
            </Button>
          }
        />
      )}

      {!isLoading && (vehicles ?? []).length > 0 && viewMode === 'individual' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vehicles!.map((v) => (
            <VehicleCard key={v.id} vehicle={v} />
          ))}
        </div>
      )}

      {!isLoading && (vehicles ?? []).length > 0 && viewMode === 'family' && (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.owner}>
              <div className="mb-3 flex items-center gap-3">
                <div className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                </div>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-sm font-semibold tracking-tight">{g.owner}</h3>
                  <span className="text-[11px] uppercase tracking-kerned text-muted-foreground">
                    {g.items.length} {g.items.length === 1 ? 'vehicle' : 'vehicles'}
                  </span>
                </div>
                <span className="flex-1 h-px bg-border/60" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {g.items.map((v) => (
                  <VehicleCard key={v.id} vehicle={v} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <VehicleFormDialog open={formOpen} onOpenChange={setFormOpen} />
      <SmsPasteDialog open={smsOpen} onOpenChange={setSmsOpen} />
    </div>
  );
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.floor((then - now) / (1000 * 60 * 60 * 24));
}

function ExpiryRow({ label, iso }: { label: string; iso: string | null }) {
  const days = daysUntil(iso);
  if (days === null) {
    return (
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>—</span>
      </div>
    );
  }
  const tone =
    days < 0
      ? 'text-negative'
      : days <= 7
        ? 'text-negative'
        : days <= 30
          ? 'text-amber-600'
          : 'text-muted-foreground';
  const label2 =
    days < 0 ? `Expired ${Math.abs(days)}d ago` : days === 0 ? 'Today' : `${days}d left`;
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={tone}>{label2}</span>
    </div>
  );
}

function VehicleCard({ vehicle }: { vehicle: VehicleDTO }) {
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: () => vehiclesApi.remove(vehicle.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      toast.success(`Vehicle ${vehicle.registrationNo} deleted`);
    },
    onError: () => toast.error('Failed to delete vehicle'),
  });

  const title = [vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Unknown vehicle';
  const anyExpiringSoon = [
    vehicle.insuranceExpiry,
    vehicle.pucExpiry,
    vehicle.fitnessExpiry,
  ].some((iso) => {
    const d = daysUntil(iso);
    return d !== null && d <= 30;
  });

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-semibold font-mono truncate">{vehicle.registrationNo}</h3>
              {anyExpiringSoon ? (
                <ShieldAlert className="h-4 w-4 text-amber-600" />
              ) : (
                <ShieldCheck className="h-4 w-4 text-positive" />
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{title}</p>
            {vehicle.ownerName && (
              <p className="text-xs text-muted-foreground">{vehicle.ownerName}</p>
            )}
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-negative"
              onClick={() => {
                if (window.confirm(`Delete vehicle ${vehicle.registrationNo}?`)) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to={`/vehicles/${vehicle.id}`}>
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t space-y-1">
          <ExpiryRow label="Insurance" iso={vehicle.insuranceExpiry} />
          <ExpiryRow label="PUC" iso={vehicle.pucExpiry} />
          <ExpiryRow label="Fitness" iso={vehicle.fitnessExpiry} />
        </div>
      </CardContent>
    </Card>
  );
}
