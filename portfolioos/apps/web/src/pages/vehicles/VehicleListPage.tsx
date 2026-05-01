import { useState } from 'react';
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
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { vehiclesApi, type VehicleDTO } from '@/api/vehicles.api';
import { VehicleFormDialog } from './VehicleFormDialog';
import { SmsPasteDialog } from './SmsPasteDialog';

export function VehicleListPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);

  const { data: vehicles, isLoading } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => vehiclesApi.list(),
  });

  return (
    <div>
      <PageHeader
        title="Vehicles"
        description="Registration, insurance, PUC, fitness — all expiries in one place"
        actions={
          <div className="flex gap-2">
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

      {!isLoading && (vehicles ?? []).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vehicles!.map((v) => (
            <VehicleCard key={v.id} vehicle={v} />
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
