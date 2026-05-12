import { useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
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
  ScanLine,
  Trash2,
  Image as ImageIcon,
  Calculator,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { vehiclesApi, type ChallanDTO } from '@/api/vehicles.api';
import { apiErrorMessage } from '@/api/client';
import { VehicleFormDialog } from './VehicleFormDialog';
import { SmsPasteDialog } from './SmsPasteDialog';
import { FuelPricesCard } from './FuelPricesCard';

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.floor((then - now) / (1000 * 60 * 60 * 24));
}

function formatYearsAndMonths(fromDate: Date): string {
  const now = new Date();
  let years = now.getFullYear() - fromDate.getFullYear();
  let months = now.getMonth() - fromDate.getMonth();
  if (months < 0) {
    years--;
    months += 12;
  }
  if (years <= 0 && months <= 0) return 'Less than 1 month';
  if (years <= 0) return `${months} month${months > 1 ? 's' : ''}`;
  if (months === 0) return `${years} year${years > 1 ? 's' : ''}`;
  return `${years} year${years > 1 ? 's' : ''} ${months} month${months > 1 ? 's' : ''}`;
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

function DetailField({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value !== null && value !== undefined && value !== '' ? value : '—'}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  let cls = 'bg-slate-100 text-slate-700';
  if (s === 'PENDING' || s === 'UNPAID') cls = 'bg-amber-100 text-amber-700';
  else if (s === 'PAID' || s === 'DISPOSED') cls = 'bg-emerald-100 text-emerald-700';
  else if (s === 'CONTESTED' || s === 'COURT') cls = 'bg-blue-100 text-blue-700';
  else if (s === 'CANCELLED') cls = 'bg-slate-200 text-slate-600';
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {status}
    </span>
  );
}

type ChallanTab = 'ALL' | 'PENDING' | 'PAID' | 'CONTESTED';

function challanMatches(c: ChallanDTO, tab: ChallanTab): boolean {
  const s = c.status.toUpperCase();
  if (tab === 'ALL') return true;
  if (tab === 'PENDING') return s === 'PENDING' || s === 'UNPAID';
  if (tab === 'PAID') return s === 'PAID' || s === 'DISPOSED';
  if (tab === 'CONTESTED') return s === 'CONTESTED' || s === 'COURT';
  return false;
}

function sumAmount(rows: ChallanDTO[]): string {
  let total = 0;
  for (const r of rows) total += Number(r.amount);
  return total.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export function VehicleDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [challanTab, setChallanTab] = useState<ChallanTab>('ALL');

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

  const refreshPhotoMutation = useMutation({
    mutationFn: () => vehiclesApi.refreshPhoto(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      if (result.photo) toast.success('Photo updated');
      else toast.error('No matching stock photo for this make/model.');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Photo refresh failed')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => vehiclesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      toast.success('Vehicle deleted');
      navigate('/vehicles');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Delete failed')),
  });

  const handleDelete = () => {
    if (!vehicle) return;
    if (!window.confirm(`Delete vehicle ${vehicle.registrationNo}?`)) return;
    deleteMutation.mutate();
  };

  const challanScanMutation = useMutation({
    mutationFn: () => vehiclesApi.scanChallans(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      if (result.ok) {
        const parts: string[] = [];
        if (result.newChallans > 0) parts.push(`${result.newChallans} new`);
        if (result.updatedChallans > 0) parts.push(`${result.updatedChallans} updated`);
        if (parts.length === 0) parts.push('no changes');
        toast.success(`Challan scan: ${parts.join(', ')}`);
      } else {
        toast.error(result.error ?? 'Challan scan failed', { duration: 6000 });
      }
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Challan scan failed')),
  });

  const ageInfo = useMemo(() => {
    if (!vehicle) return null;
    const fromMfg = vehicle.manufacturingYear
      ? formatYearsAndMonths(new Date(vehicle.manufacturingYear, 0, 1))
      : null;
    const fromReg = vehicle.registrationDate
      ? formatYearsAndMonths(new Date(vehicle.registrationDate))
      : null;
    return { fromMfg, fromReg };
  }, [vehicle]);

  const challanRows = vehicle?.challans ?? [];
  const filteredChallans = useMemo(
    () => challanRows.filter((c) => challanMatches(c, challanTab)),
    [challanRows, challanTab],
  );
  const challanCounts = useMemo(() => {
    const counts: Record<ChallanTab, number> = { ALL: challanRows.length, PENDING: 0, PAID: 0, CONTESTED: 0 };
    const sums: Record<ChallanTab, string> = { ALL: sumAmount(challanRows), PENDING: '0', PAID: '0', CONTESTED: '0' };
    for (const tab of ['PENDING', 'PAID', 'CONTESTED'] as ChallanTab[]) {
      const filtered = challanRows.filter((c) => challanMatches(c, tab));
      counts[tab] = filtered.length;
      sums[tab] = sumAmount(filtered);
    }
    return { counts, sums };
  }, [challanRows]);

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

  const showBothAges =
    ageInfo?.fromMfg && ageInfo?.fromReg && ageInfo.fromMfg !== ageInfo.fromReg;

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
          <div className="flex gap-2 flex-wrap">
            <Button asChild variant="outline">
              <Link to={`/vehicles/value?vehicleId=${vehicle.id}`}>
                <Calculator className="h-4 w-4" /> Get valuation
              </Link>
            </Button>
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
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Photo card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ImageIcon className="h-4 w-4" /> Photo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="aspect-video bg-slate-100 rounded-md overflow-hidden flex items-center justify-center">
              {vehicle.photoUrl ? (
                <img
                  src={vehicle.photoUrl}
                  alt={[vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="text-xs text-muted-foreground text-center p-4">
                  No photo available.
                  <br />
                  Refresh RC data to fetch a stock photo.
                </div>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {vehicle.photoUrl
                  ? `Stock photo · ${vehicle.photoSource ?? 'source'}`
                  : ''}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refreshPhotoMutation.mutate()}
                disabled={refreshPhotoMutation.isPending}
              >
                {refreshPhotoMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {vehicle.photoUrl ? 'Refresh' : 'Find photo'}
              </Button>
            </div>
            {vehicle.photoUrl && (
              <p className="mt-1 text-[10px] text-muted-foreground italic">
                RTO does not publish vehicle-specific photos. Stock image keyed by make+model.
              </p>
            )}
          </CardContent>
        </Card>

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
                label="Registration date"
                value={vehicle.registrationDate?.slice(0, 10) ?? null}
              />
              <DetailField label="RC status" value={vehicle.rcStatus} />
              <DetailField label="Vehicle class" value={vehicle.vehicleClass} />
              <DetailField label="Emission norms" value={vehicle.normsType} />
              <DetailField
                label="Vehicle age"
                value={
                  showBothAges
                    ? `${ageInfo?.fromMfg} (mfg) · ${ageInfo?.fromReg} (reg)`
                    : (ageInfo?.fromMfg ?? ageInfo?.fromReg ?? null)
                }
              />
              <DetailField
                label="Seating capacity"
                value={vehicle.seatingCapacity}
              />
              <DetailField
                label="Unloaded weight"
                value={vehicle.unloadedWeight ? `${vehicle.unloadedWeight} kg` : null}
              />
              <DetailField label="Engine no." value={vehicle.engineNo} />
              <DetailField
                label="Hypothecation"
                value={vehicle.hypothecation && vehicle.hypothecation !== 'NONE' ? vehicle.hypothecation : 'Clear'}
              />
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

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Expiries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <ExpiryRow label="Insurance" iso={vehicle.insuranceExpiry} />
              <ExpiryRow label="PUC" iso={vehicle.pucExpiry} />
              <ExpiryRow label="Fitness" iso={vehicle.fitnessExpiry} />
              <ExpiryRow label="Road tax" iso={vehicle.roadTaxExpiry} />
              <ExpiryRow label="Permit" iso={vehicle.permitExpiry} />
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-3">
          <FuelPricesCard defaultRtoCode={vehicle.rtoCode} />
        </div>

        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-4 w-4" /> Challans
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => challanScanMutation.mutate()}
                disabled={challanScanMutation.isPending}
              >
                {challanScanMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ScanLine className="h-4 w-4" />
                )}
                Check challans
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Tabs */}
            <div className="flex flex-wrap gap-2 mb-3 border-b pb-3">
              {(['ALL', 'PENDING', 'PAID', 'CONTESTED'] as ChallanTab[]).map((tab) => {
                const active = tab === challanTab;
                return (
                  <button
                    key={tab}
                    onClick={() => setChallanTab(tab)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-border hover:bg-muted'
                    }`}
                  >
                    {tab.charAt(0) + tab.slice(1).toLowerCase()} ({challanCounts.counts[tab]})
                  </button>
                );
              })}
            </div>
            {/* Totals card */}
            {challanRows.length > 0 && (
              <div className="mb-3 rounded-md bg-muted/50 p-3 text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-medium">
                    {challanCounts.counts[challanTab]} challan{challanCounts.counts[challanTab] !== 1 ? 's' : ''}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="numeric">
                    Total: ₹{challanCounts.sums[challanTab]}
                  </span>
                  {challanTab === 'ALL' && challanRows.length > 0 && (
                    <span className="text-muted-foreground ml-2">
                      (Pending: {challanCounts.counts.PENDING} · ₹{challanCounts.sums.PENDING}
                      {' · '}Paid: {challanCounts.counts.PAID} · ₹{challanCounts.sums.PAID})
                    </span>
                  )}
                </div>
              </div>
            )}

            {filteredChallans.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4">
                {challanRows.length === 0
                  ? 'No challans on record. Click "Check challans" to scan.'
                  : `No challans in "${challanTab.toLowerCase()}" tab.`}
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
                  {filteredChallans.map((c) => (
                    <tr key={c.id} className="border-b last:border-b-0">
                      <td className="py-2 font-mono text-xs">{c.challanNo}</td>
                      <td className="py-2">{c.offenceType ?? '—'}</td>
                      <td className="py-2">{c.offenceDate.slice(0, 10)}</td>
                      <td className="py-2">{c.location ?? '—'}</td>
                      <td className="py-2 text-right numeric">₹{c.amount}</td>
                      <td className="py-2 text-right">
                        <StatusBadge status={c.status} />
                      </td>
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
