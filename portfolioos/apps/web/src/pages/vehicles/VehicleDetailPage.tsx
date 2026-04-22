import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Edit,
  RefreshCw,
  MessageSquareShare,
  ShieldAlert,
  ShieldCheck,
  Loader2,
  Receipt,
  Info,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { vehiclesApi } from '@/api/vehicles.api';
import { apiErrorMessage } from '@/api/client';
import { VehicleFormDialog } from './VehicleFormDialog';
import { SmsPasteDialog } from './SmsPasteDialog';

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.floor((then - now) / (1000 * 60 * 60 * 24));
}

function ExpiryRow({ label, iso }: { label: string; iso: string | null }) {
  const days = daysUntil(iso);
  const dateFmt = iso ? new Date(iso).toLocaleDateString() : null;
  let tone = 'text-muted-foreground';
  let badge = '—';
  if (days !== null) {
    if (days < 0) {
      tone = 'text-negative';
      badge = `Expired ${Math.abs(days)}d ago`;
    } else if (days <= 7) {
      tone = 'text-negative';
      badge = `${days}d left`;
    } else if (days <= 30) {
      tone = 'text-amber-600';
      badge = `${days}d left`;
    } else {
      tone = 'text-muted-foreground';
      badge = `${days}d left`;
    }
  }

  return (
    <div className="flex items-center justify-between py-2 border-b last:border-b-0">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{dateFmt ?? 'Not recorded'}</div>
      </div>
      <div className={`text-xs ${tone}`}>{badge}</div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value ?? '—'}</div>
    </div>
  );
}

export function VehicleDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);

  const { data: vehicle, isLoading } = useQuery({
    queryKey: ['vehicles', id],
    queryFn: () => vehiclesApi.get(id),
    enabled: Boolean(id),
  });

  const refreshMutation = useMutation({
    mutationFn: () => vehiclesApi.refresh(id, { mode: 'interactive' }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      if (result.outcome.ok) {
        toast.success(`Refreshed from ${result.outcome.source ?? 'adapter'}`);
      } else {
        const attempted = result.outcome.attempts
          .filter((a) => !a.error?.startsWith('skipped'))
          .map((a) => `${a.adapter}: ${a.ok ? 'ok' : a.error}`)
          .join(' · ');
        toast.error(`No fresh data. ${attempted || 'All adapters skipped.'}`, {
          duration: 6000,
        });
      }
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Refresh failed')),
  });

  if (isLoading || !vehicle) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
    );
  }

  const anyExpiringSoon = [
    vehicle.insuranceExpiry,
    vehicle.pucExpiry,
    vehicle.fitnessExpiry,
    vehicle.roadTaxExpiry,
    vehicle.permitExpiry,
  ].some((iso) => {
    const d = daysUntil(iso);
    return d !== null && d <= 30;
  });

  return (
    <div>
      <div className="mb-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/vehicles">
            <ArrowLeft className="h-4 w-4" /> Vehicles
          </Link>
        </Button>
      </div>

      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <span className="font-mono">{vehicle.registrationNo}</span>
            {anyExpiringSoon ? (
              <ShieldAlert className="h-5 w-5 text-amber-600" />
            ) : (
              <ShieldCheck className="h-5 w-5 text-positive" />
            )}
          </span>
        }
        description={
          [vehicle.make, vehicle.model, vehicle.variant].filter(Boolean).join(' ') ||
          'Vehicle details'
        }
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSmsOpen(true)}>
              <MessageSquareShare className="h-4 w-4" /> SMS
            </Button>
            <Button
              variant="outline"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
            >
              {refreshMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </Button>
            <Button onClick={() => setEditOpen(true)}>
              <Edit className="h-4 w-4" /> Edit
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Registration &amp; owner</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <DetailField label="Owner" value={vehicle.ownerName} />
              <DetailField label="RTO" value={vehicle.rtoCode} />
              <DetailField label="Fuel" value={vehicle.fuelType} />
              <DetailField label="Color" value={vehicle.color} />
              <DetailField label="Manufacturing year" value={vehicle.manufacturingYear} />
              <DetailField label="Chassis (last 4)" value={vehicle.chassisLast4} />
              <DetailField
                label="Purchase date"
                value={vehicle.purchaseDate?.slice(0, 10) ?? null}
              />
              <DetailField
                label="Purchase price"
                value={vehicle.purchasePrice ? `₹${vehicle.purchasePrice}` : null}
              />
              <DetailField
                label="Current value"
                value={vehicle.currentValue ? `₹${vehicle.currentValue}` : null}
              />
            </div>
            {(vehicle.lastRefreshedAt || vehicle.refreshSource) && (
              <div className="mt-4 pt-3 border-t text-xs text-muted-foreground flex items-center gap-2">
                <Info className="h-3.5 w-3.5" />
                Last refreshed{' '}
                {vehicle.lastRefreshedAt
                  ? new Date(vehicle.lastRefreshedAt).toLocaleString()
                  : 'never'}
                {vehicle.refreshSource && <> via <span className="font-mono">{vehicle.refreshSource}</span></>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Expiries</CardTitle>
          </CardHeader>
          <CardContent>
            <ExpiryRow label="Insurance" iso={vehicle.insuranceExpiry} />
            <ExpiryRow label="PUC" iso={vehicle.pucExpiry} />
            <ExpiryRow label="Fitness" iso={vehicle.fitnessExpiry} />
            <ExpiryRow label="Road tax" iso={vehicle.roadTaxExpiry} />
            <ExpiryRow label="Permit" iso={vehicle.permitExpiry} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4" /> Challans
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(vehicle.challans ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground py-4">
                No challans on record. Challan scanning runs monthly per §7.5 — the real
                adapter ships after Gate G6.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2 font-medium">Challan</th>
                    <th className="text-left py-2 font-medium">Offence</th>
                    <th className="text-left py-2 font-medium">Date</th>
                    <th className="text-left py-2 font-medium">Location</th>
                    <th className="text-right py-2 font-medium">Amount</th>
                    <th className="text-right py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(vehicle.challans ?? []).map((c) => (
                    <tr key={c.id} className="border-b last:border-b-0">
                      <td className="py-2 font-mono">{c.challanNo}</td>
                      <td className="py-2">{c.offenceType ?? '—'}</td>
                      <td className="py-2">{c.offenceDate.slice(0, 10)}</td>
                      <td className="py-2">{c.location ?? '—'}</td>
                      <td className="py-2 text-right numeric">₹{c.amount}</td>
                      <td className="py-2 text-right">{c.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <VehicleFormDialog open={editOpen} onOpenChange={setEditOpen} initial={vehicle} />
      <SmsPasteDialog
        open={smsOpen}
        onOpenChange={setSmsOpen}
        defaultRegNo={vehicle.registrationNo}
      />
    </div>
  );
}
