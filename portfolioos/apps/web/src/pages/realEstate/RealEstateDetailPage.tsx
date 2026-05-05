import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Pencil,
  Banknote,
  RefreshCw,
  ExternalLink,
  Building2,
  Shield,
  HandCoins,
  Home,
} from 'lucide-react';
import {
  Decimal,
  formatINR,
  totalCostBasisOf,
  PROPERTY_TYPE_LABELS,
  PROPERTY_STATUS_LABELS,
} from '@portfolioos/shared';
import type { OwnedPropertyDTO } from '@portfolioos/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { DocumentVault } from '@/components/documents/DocumentVault';
import { realEstateApi } from '@/api/realEstate.api';
import { apiErrorMessage } from '@/api/client';
import { PropertyFormDialog } from './PropertyFormDialog';
import { MarkSoldDialog } from './MarkSoldDialog';
import { CapitalGainPanel } from './CapitalGainPanel';

function daysSince(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function RealEstateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [editOpen, setEditOpen] = useState(false);
  const [soldOpen, setSoldOpen] = useState(false);
  const [refreshOpen, setRefreshOpen] = useState(false);

  const { data: property, isLoading } = useQuery({
    queryKey: ['real-estate', id],
    queryFn: () => realEstateApi.getProperty(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }
  if (!property) {
    return <div className="text-sm text-negative">Property not found</div>;
  }

  const cost = totalCostBasisOf(property);
  const cur = new Decimal(property.currentValue ?? 0);
  const gain = cur.minus(cost);
  const gainPositive = gain.greaterThan(0);
  const isUC = property.propertyType === 'UNDER_CONSTRUCTION' || property.status === 'UNDER_CONSTRUCTION';
  const isSold = property.status === 'SOLD';

  return (
    <div>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            <Button asChild variant="ghost" size="sm" className="-ml-2 h-9 w-9 p-0">
              <Link to="/real-estate">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <span className="truncate">{property.name}</span>
            {isSold && (
              <span className="text-[11px] font-semibold uppercase tracking-wider rounded bg-muted px-2 py-1">
                Sold
              </span>
            )}
          </span>
        }
        description={`${PROPERTY_TYPE_LABELS[property.propertyType]} · ${PROPERTY_STATUS_LABELS[property.status]}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            {!isSold && (
              <>
                <Button variant="outline" onClick={() => setRefreshOpen(true)}>
                  <RefreshCw className="h-4 w-4" /> Refresh value
                </Button>
                <Button onClick={() => setSoldOpen(true)}>
                  <Banknote className="h-4 w-4" /> Mark sold
                </Button>
              </>
            )}
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <Card>
          <CardContent className="px-4 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Current value
            </p>
            <p className="text-xl font-semibold tabular-nums mt-1">
              {property.currentValue ? formatINR(property.currentValue) : '—'}
            </p>
            {property.currentValueAsOf && (
              <p className="text-xs text-muted-foreground">
                Updated {daysSince(property.currentValueAsOf)} day(s) ago
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Total cost basis
            </p>
            <p className="text-xl font-semibold tabular-nums mt-1">{formatINR(cost.toString())}</p>
            <p className="text-xs text-muted-foreground">incl. duties + fees</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              {isSold ? 'Realised gain (raw)' : 'Unrealised gain'}
            </p>
            <p
              className={`text-xl font-semibold tabular-nums mt-1 ${
                gainPositive ? 'text-positive' : gain.isZero() ? '' : 'text-negative'
              }`}
            >
              {gainPositive ? '+' : ''}
              {formatINR(gain.toString())}
            </p>
            <p className="text-xs text-muted-foreground">value − cost basis</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        {/* Capital gain — only on sold */}
        {isSold && (
          <Section title="Capital gain (section 112)">
            <CapitalGainPanel propertyId={property.id} />
          </Section>
        )}

        {/* Identity */}
        <Section title="Address">
          <Card>
            <CardContent className="p-5 space-y-2">
              {property.address && <p className="text-sm">{property.address}</p>}
              <p className="text-sm text-muted-foreground">
                {[property.city, property.state, property.pincode, property.country]
                  .filter(Boolean)
                  .join(', ') || '—'}
              </p>
            </CardContent>
          </Card>
        </Section>

        {/* Specs */}
        <Section title="Specs">
          <Card>
            <CardContent className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
              <KV label="Built-up" value={property.builtUpSqft ? `${property.builtUpSqft} sqft` : '—'} />
              <KV label="Carpet" value={property.carpetSqft ? `${property.carpetSqft} sqft` : '—'} />
              <KV label="Plot area" value={property.plotAreaSqft ? `${property.plotAreaSqft} sqft` : '—'} />
              <KV label="Floors" value={property.floors !== null ? String(property.floors) : '—'} />
            </CardContent>
          </Card>
        </Section>

        {/* Ownership */}
        <Section title="Ownership">
          <Card>
            <CardContent className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
              <KV label="Type" value={property.ownershipType} />
              <KV label="My share" value={`${property.ownershipPercent}%`} />
              <KV label="Owner name" value={property.ownerName ?? '—'} />
              <KV label="Co-owners" value={property.coOwners ?? '—'} />
            </CardContent>
          </Card>
        </Section>

        {/* Purchase */}
        <Section title="Purchase cost breakdown">
          <Card>
            <CardContent className="p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
              <KV label="Purchase date" value={fmtDate(property.purchaseDate)} />
              <KV label="Purchase price" value={property.purchasePrice ? formatINR(property.purchasePrice) : '—'} />
              <KV label="Stamp duty" value={property.stampDuty ? formatINR(property.stampDuty) : '—'} />
              <KV label="Registration" value={property.registrationFee ? formatINR(property.registrationFee) : '—'} />
              <KV label="Brokerage" value={property.brokerage ? formatINR(property.brokerage) : '—'} />
              <KV label="Other costs" value={property.otherCosts ? formatINR(property.otherCosts) : '—'} />
            </CardContent>
          </Card>
        </Section>

        {/* Property tax + society */}
        <Section title="Property tax & society">
          <Card>
            <CardContent className="p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
              <KV
                label="Annual property tax"
                value={property.annualPropertyTax ? formatINR(property.annualPropertyTax) : '—'}
              />
              <KV
                label="Tax due month"
                value={
                  property.propertyTaxDueMonth
                    ? new Date(2024, property.propertyTaxDueMonth - 1, 1).toLocaleString('en-IN', { month: 'long' })
                    : '—'
                }
              />
              <KV label="Society" value={property.societyName ?? '—'} />
              <KV
                label="Maintenance"
                value={
                  property.monthlyMaintenance
                    ? `${formatINR(property.monthlyMaintenance)} ${property.maintenanceFrequency?.toLowerCase() ?? ''}`
                    : '—'
                }
              />
            </CardContent>
          </Card>
        </Section>

        {/* Identifiers */}
        {(property.electricityConsumerNo ||
          property.waterConnectionNo ||
          property.gasConnectionNo ||
          property.khataNo ||
          property.surveyNo) && (
          <Section title="Identifiers">
            <Card>
              <CardContent className="p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
                {property.electricityConsumerNo && (
                  <KV label="Electricity" value={property.electricityConsumerNo} />
                )}
                {property.waterConnectionNo && <KV label="Water" value={property.waterConnectionNo} />}
                {property.gasConnectionNo && <KV label="Gas" value={property.gasConnectionNo} />}
                {property.khataNo && <KV label="Khata / Property ID" value={property.khataNo} />}
                {property.surveyNo && <KV label="Survey no." value={property.surveyNo} />}
              </CardContent>
            </Card>
          </Section>
        )}

        {/* Under construction */}
        {isUC && (
          <Section title="Under construction">
            <Card>
              <CardContent className="p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
                <KV label="Builder" value={property.builderName ?? '—'} />
                <KV label="Project" value={property.projectName ?? '—'} />
                <KV label="RERA reg." value={property.reraRegNo ?? '—'} />
                <KV label="Expected possession" value={fmtDate(property.expectedPossessionDate)} />
                <KV label="Paid so far" value={property.paymentSchedulePaidPct ? `${property.paymentSchedulePaidPct}%` : '—'} />
              </CardContent>
            </Card>
          </Section>
        )}

        {/* Linkages */}
        {(property.loanId || property.insurancePolicyId || property.rentalPropertyId) && (
          <Section title="Linked records">
            <Card>
              <CardContent className="p-5 space-y-2">
                {property.loanId && (
                  <LinkRow icon={HandCoins} to={`/loans/${property.loanId}`} label="Linked loan" />
                )}
                {property.insurancePolicyId && (
                  <LinkRow icon={Shield} to={`/insurance/${property.insurancePolicyId}`} label="Linked insurance" />
                )}
                {property.rentalPropertyId && (
                  <LinkRow icon={Building2} to={`/rental/${property.rentalPropertyId}`} label="Rented out (rental record)" />
                )}
              </CardContent>
            </Card>
          </Section>
        )}

        {/* Sale (SOLD only) */}
        {isSold && (
          <Section title="Sale">
            <Card>
              <CardContent className="p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
                <KV label="Sale date" value={fmtDate(property.saleDate)} />
                <KV label="Sale price" value={property.salePrice ? formatINR(property.salePrice) : '—'} />
                <KV label="Sale brokerage" value={property.saleBrokerage ? formatINR(property.saleBrokerage) : '—'} />
              </CardContent>
            </Card>
          </Section>
        )}

        {/* Lease */}
        {property.leaseholdEndDate && (
          <Section title="Lease">
            <Card>
              <CardContent className="p-5">
                <KV label="Leasehold end date" value={fmtDate(property.leaseholdEndDate)} />
              </CardContent>
            </Card>
          </Section>
        )}

        {/* Notes */}
        {property.notes && (
          <Section title="Notes">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm whitespace-pre-wrap">{property.notes}</p>
              </CardContent>
            </Card>
          </Section>
        )}

        {/* Documents */}
        <Section title="Documents">
          <DocumentVault
            ownerType="OWNED_PROPERTY"
            ownerId={property.id}
            title="Sale deed, agreements & receipts"
            defaultCategory="agreement"
          />
        </Section>
      </div>

      <PropertyFormDialog open={editOpen} onOpenChange={setEditOpen} initial={property} />
      <MarkSoldDialog
        open={soldOpen}
        onOpenChange={setSoldOpen}
        propertyId={property.id}
        propertyName={property.name}
      />
      <RefreshValueDialog
        open={refreshOpen}
        onOpenChange={setRefreshOpen}
        propertyId={property.id}
        currentValue={property.currentValue}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
        <Home className="h-4 w-4" /> {title}
      </h2>
      {children}
    </section>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-medium mt-0.5 break-words">{value}</p>
    </div>
  );
}

function LinkRow({
  icon: Icon,
  to,
  label,
}: {
  icon: typeof Home;
  to: string;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between rounded-md p-2 hover:bg-muted/40 transition-colors"
    >
      <span className="flex items-center gap-2 text-sm">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {label}
      </span>
      <ExternalLink className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}

function RefreshValueDialog({
  open,
  onOpenChange,
  propertyId,
  currentValue,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  propertyId: string;
  currentValue: string | null;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState(currentValue ?? '');

  // Re-seed input each time the dialog opens or the property's stored
  // value changes — prevents the dialog from flashing stale digits if the
  // user updates value, closes, and reopens.
  useEffect(() => {
    if (open) setValue(currentValue ?? '');
  }, [open, currentValue]);

  const mutation = useMutation({
    mutationFn: () =>
      realEstateApi.refreshValue(propertyId, { currentValue: value, currentValueSource: 'manual' }),
    onSuccess: () => {
      toast.success('Current value updated');
      qc.invalidateQueries({ queryKey: ['real-estate', propertyId] });
      qc.invalidateQueries({ queryKey: ['real-estate'] });
      qc.invalidateQueries({ queryKey: ['real-estate-summary'] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Refresh failed')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update current value</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Enter the latest market value (your estimate or a recent quote). Stamp/register
            timestamp will refresh automatically.
          </p>
          <div>
            <Label>Current value (₹) *</Label>
            <Input value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !value}>
            {mutation.isPending ? 'Saving…' : 'Update'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
