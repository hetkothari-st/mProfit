import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PortfolioSelect } from '@/components/common/PortfolioSelect';
import { apiErrorMessage } from '@/api/client';
import { realEstateApi } from '@/api/realEstate.api';
import { INDIA_STATES, citiesForState } from '@/data/indiaLocations';
import type {
  CreateOwnedPropertyInput,
  OwnedPropertyDTO,
  PropertyType,
  PropertyStatus,
  OwnershipType,
  MaintenanceFrequency,
} from '@portfolioos/shared';

const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: 'APARTMENT', label: 'Apartment / Flat' },
  { value: 'INDEPENDENT_HOUSE', label: 'Independent house' },
  { value: 'VILLA', label: 'Villa' },
  { value: 'PLOT_LAND', label: 'Plot / Land' },
  { value: 'COMMERCIAL_OFFICE', label: 'Commercial — office' },
  { value: 'COMMERCIAL_SHOP', label: 'Commercial — shop' },
  { value: 'AGRICULTURAL', label: 'Agricultural' },
  { value: 'PARKING_GARAGE', label: 'Parking / Garage' },
  { value: 'UNDER_CONSTRUCTION', label: 'Under construction' },
  { value: 'OTHER', label: 'Other' },
];

const PROPERTY_STATUSES: { value: PropertyStatus; label: string }[] = [
  { value: 'SELF_OCCUPIED', label: 'Self-occupied' },
  { value: 'SECOND_HOME', label: 'Second home' },
  { value: 'VACANT', label: 'Vacant' },
  { value: 'RENTED_OUT', label: 'Rented out' },
  { value: 'UNDER_CONSTRUCTION', label: 'Under construction' },
  { value: 'SOLD', label: 'Sold' },
];

const OWNERSHIP_TYPES: { value: OwnershipType; label: string }[] = [
  { value: 'SOLE', label: 'Sole owner' },
  { value: 'JOINT', label: 'Joint' },
  { value: 'HUF', label: 'HUF' },
  { value: 'COMPANY', label: 'Company' },
];

const MAINTENANCE_FREQS: { value: MaintenanceFrequency; label: string }[] = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'ANNUAL', label: 'Annual' },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: OwnedPropertyDTO | null;
}

const EMPTY: CreateOwnedPropertyInput = {
  name: '',
  propertyType: 'APARTMENT',
  status: 'SELF_OCCUPIED',
  country: 'IN',
  ownershipType: 'SOLE',
  ownershipPercent: '100',
  maintenanceFrequency: 'MONTHLY',
};

function fromDTO(dto: OwnedPropertyDTO): CreateOwnedPropertyInput {
  return {
    name: dto.name,
    propertyType: dto.propertyType,
    status: dto.status,
    portfolioId: dto.portfolioId,
    address: dto.address,
    city: dto.city,
    state: dto.state,
    pincode: dto.pincode,
    country: dto.country,
    builtUpSqft: dto.builtUpSqft,
    carpetSqft: dto.carpetSqft,
    plotAreaSqft: dto.plotAreaSqft,
    floors: dto.floors,
    ownershipType: dto.ownershipType,
    ownershipPercent: dto.ownershipPercent,
    coOwners: dto.coOwners,
    purchaseDate: dto.purchaseDate,
    purchasePrice: dto.purchasePrice,
    stampDuty: dto.stampDuty,
    registrationFee: dto.registrationFee,
    brokerage: dto.brokerage,
    otherCosts: dto.otherCosts,
    currentValue: dto.currentValue,
    loanId: dto.loanId,
    insurancePolicyId: dto.insurancePolicyId,
    rentalPropertyId: dto.rentalPropertyId,
    annualPropertyTax: dto.annualPropertyTax,
    propertyTaxDueMonth: dto.propertyTaxDueMonth,
    societyName: dto.societyName,
    monthlyMaintenance: dto.monthlyMaintenance,
    maintenanceFrequency: dto.maintenanceFrequency,
    ownerName: dto.ownerName,
    electricityConsumerNo: dto.electricityConsumerNo,
    waterConnectionNo: dto.waterConnectionNo,
    gasConnectionNo: dto.gasConnectionNo,
    khataNo: dto.khataNo,
    surveyNo: dto.surveyNo,
    builderName: dto.builderName,
    projectName: dto.projectName,
    reraRegNo: dto.reraRegNo,
    expectedPossessionDate: dto.expectedPossessionDate,
    paymentSchedulePaidPct: dto.paymentSchedulePaidPct,
    leaseholdEndDate: dto.leaseholdEndDate,
    notes: dto.notes,
    isActive: dto.isActive,
  };
}

export function PropertyFormDialog({ open, onOpenChange, initial }: Props) {
  const isEdit = !!initial;
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateOwnedPropertyInput>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof CreateOwnedPropertyInput, string>>>({});

  useEffect(() => {
    if (open) {
      setForm(initial ? fromDTO(initial) : EMPTY);
      setErrors({});
    }
  }, [open, initial]);

  const mutation = useMutation({
    mutationFn: (input: CreateOwnedPropertyInput) =>
      isEdit
        ? realEstateApi.updateProperty(initial!.id, input)
        : realEstateApi.createProperty(input),
    onSuccess: () => {
      toast.success(isEdit ? 'Property updated' : 'Property added');
      qc.invalidateQueries({ queryKey: ['real-estate'] });
      qc.invalidateQueries({ queryKey: ['real-estate-summary'] });
      if (isEdit) {
        qc.invalidateQueries({ queryKey: ['real-estate', initial!.id] });
      }
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Save failed')),
  });

  function set<K extends keyof CreateOwnedPropertyInput>(
    key: K,
    value: CreateOwnedPropertyInput[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): boolean {
    const errs: typeof errors = {};
    if (!form.name?.trim()) errs.name = 'Required';
    if (!form.propertyType) errs.propertyType = 'Required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    // Empty strings → null so Zod accepts. Trim free-text. Leave numeric
    // fields as-is (they're already strings on the wire).
    const trim = (s: string | null | undefined) => {
      if (s === null || s === undefined) return null;
      const t = s.trim();
      return t === '' ? null : t;
    };
    const payload: CreateOwnedPropertyInput = {
      ...form,
      name: form.name.trim(),
      address: trim(form.address),
      city: trim(form.city),
      state: trim(form.state),
      pincode: trim(form.pincode),
      coOwners: trim(form.coOwners),
      purchaseDate: trim(form.purchaseDate),
      purchasePrice: trim(form.purchasePrice),
      stampDuty: trim(form.stampDuty),
      registrationFee: trim(form.registrationFee),
      brokerage: trim(form.brokerage),
      otherCosts: trim(form.otherCosts),
      currentValue: trim(form.currentValue),
      builtUpSqft: trim(form.builtUpSqft),
      carpetSqft: trim(form.carpetSqft),
      plotAreaSqft: trim(form.plotAreaSqft),
      annualPropertyTax: trim(form.annualPropertyTax),
      societyName: trim(form.societyName),
      monthlyMaintenance: trim(form.monthlyMaintenance),
      ownerName: trim(form.ownerName),
      electricityConsumerNo: trim(form.electricityConsumerNo),
      waterConnectionNo: trim(form.waterConnectionNo),
      gasConnectionNo: trim(form.gasConnectionNo),
      khataNo: trim(form.khataNo),
      surveyNo: trim(form.surveyNo),
      builderName: trim(form.builderName),
      projectName: trim(form.projectName),
      reraRegNo: trim(form.reraRegNo),
      expectedPossessionDate: trim(form.expectedPossessionDate),
      paymentSchedulePaidPct: trim(form.paymentSchedulePaidPct),
      leaseholdEndDate: trim(form.leaseholdEndDate),
      notes: trim(form.notes),
    };
    // When the property is no longer Under Construction, null out UC-only
    // fields so possession alerts don't fire for an apartment with stale
    // builder/expected-possession data lingering in DB.
    if (!isUC) {
      payload.builderName = null;
      payload.projectName = null;
      payload.reraRegNo = null;
      payload.expectedPossessionDate = null;
      payload.paymentSchedulePaidPct = null;
    }
    mutation.mutate(payload);
  }

  const isUC = form.propertyType === 'UNDER_CONSTRUCTION' || form.status === 'UNDER_CONSTRUCTION';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit property' : 'Add property'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Identity */}
          <Section title="Identity">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Name *</Label>
                <Input
                  placeholder="Andheri East flat"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  className={errors.name ? 'border-negative' : ''}
                />
                {errors.name && <p className="text-xs text-negative mt-1">{errors.name}</p>}
              </div>
              <div>
                <Label>Type *</Label>
                <select
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.propertyType}
                  onChange={(e) => set('propertyType', e.target.value as PropertyType)}
                >
                  {PROPERTY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Status</Label>
                <select
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.status ?? 'SELF_OCCUPIED'}
                  onChange={(e) => set('status', e.target.value as PropertyStatus)}
                >
                  {PROPERTY_STATUSES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Portfolio</Label>
                <PortfolioSelect
                  value={form.portfolioId ?? null}
                  onChange={(v) => set('portfolioId', v)}
                />
              </div>
            </div>
            <div className="mt-3">
              <Label>Address</Label>
              <Input
                placeholder="Full address"
                value={form.address ?? ''}
                onChange={(e) => set('address', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              <div>
                <Label>State</Label>
                <select
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.state ?? ''}
                  onChange={(e) => {
                    const newState = e.target.value || null;
                    setForm((f) => {
                      const cities = citiesForState(newState);
                      const keepCity = f.city && cities.some((c) => c.toLowerCase() === f.city!.toLowerCase());
                      return { ...f, state: newState, city: keepCity ? f.city : null };
                    });
                  }}
                >
                  <option value="">— select state —</option>
                  {INDIA_STATES.map((s) => (
                    <option key={s.code} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>City</Label>
                <Input
                  list="city-suggestions"
                  placeholder={form.state ? 'Pick or type' : 'Select state first'}
                  value={form.city ?? ''}
                  onChange={(e) => set('city', e.target.value || null)}
                  disabled={!form.state}
                />
                <datalist id="city-suggestions">
                  {citiesForState(form.state).map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <Label>Pincode</Label>
                <Input value={form.pincode ?? ''} onChange={(e) => set('pincode', e.target.value)} />
              </div>
            </div>
          </Section>

          {/* Specs */}
          <Section title="Specs">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label>Built-up (sqft)</Label>
                <Input value={form.builtUpSqft ?? ''} onChange={(e) => set('builtUpSqft', e.target.value)} />
              </div>
              <div>
                <Label>Carpet (sqft)</Label>
                <Input value={form.carpetSqft ?? ''} onChange={(e) => set('carpetSqft', e.target.value)} />
              </div>
              <div>
                <Label>Plot area (sqft)</Label>
                <Input value={form.plotAreaSqft ?? ''} onChange={(e) => set('plotAreaSqft', e.target.value)} />
              </div>
              <div>
                <Label>Floors</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.floors ?? ''}
                  onChange={(e) => set('floors', e.target.value === '' ? null : parseInt(e.target.value, 10))}
                />
              </div>
            </div>
          </Section>

          {/* Ownership */}
          <Section title="Ownership">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Type</Label>
                <select
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.ownershipType ?? 'SOLE'}
                  onChange={(e) => set('ownershipType', e.target.value as OwnershipType)}
                >
                  {OWNERSHIP_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>My share (%)</Label>
                <Input
                  value={form.ownershipPercent ?? '100'}
                  onChange={(e) => set('ownershipPercent', e.target.value)}
                />
              </div>
              <div>
                <Label>Owner name</Label>
                <Input value={form.ownerName ?? ''} onChange={(e) => set('ownerName', e.target.value)} />
              </div>
            </div>
            <div className="mt-3">
              <Label>Co-owners (free-text)</Label>
              <Input
                placeholder="Spouse, parent, sibling…"
                value={form.coOwners ?? ''}
                onChange={(e) => set('coOwners', e.target.value)}
              />
            </div>
          </Section>

          {/* Purchase */}
          <Section title="Purchase cost">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <Label>Purchase date</Label>
                <Input type="date" value={form.purchaseDate ?? ''} onChange={(e) => set('purchaseDate', e.target.value)} />
              </div>
              <div>
                <Label>Purchase price (₹)</Label>
                <Input value={form.purchasePrice ?? ''} onChange={(e) => set('purchasePrice', e.target.value)} />
              </div>
              <div>
                <Label>Stamp duty (₹)</Label>
                <Input value={form.stampDuty ?? ''} onChange={(e) => set('stampDuty', e.target.value)} />
              </div>
              <div>
                <Label>Registration fee (₹)</Label>
                <Input value={form.registrationFee ?? ''} onChange={(e) => set('registrationFee', e.target.value)} />
              </div>
              <div>
                <Label>Brokerage (₹)</Label>
                <Input value={form.brokerage ?? ''} onChange={(e) => set('brokerage', e.target.value)} />
              </div>
              <div>
                <Label>Other costs (₹)</Label>
                <Input value={form.otherCosts ?? ''} onChange={(e) => set('otherCosts', e.target.value)} />
              </div>
            </div>
          </Section>

          {/* Current value */}
          <Section title="Current value">
            <div>
              <Label>Estimated current value (₹)</Label>
              <Input value={form.currentValue ?? ''} onChange={(e) => set('currentValue', e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">
                Update manually when market changes — automated price feeds for Indian property are unreliable.
              </p>
            </div>
          </Section>

          {/* Property tax + society */}
          <Section title="Property tax & society">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <Label>Annual property tax (₹)</Label>
                <Input value={form.annualPropertyTax ?? ''} onChange={(e) => set('annualPropertyTax', e.target.value)} />
              </div>
              <div>
                <Label>Tax due month</Label>
                <select
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.propertyTaxDueMonth ?? ''}
                  onChange={(e) =>
                    set('propertyTaxDueMonth', e.target.value === '' ? null : parseInt(e.target.value, 10))
                  }
                >
                  <option value="">—</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {new Date(2024, m - 1, 1).toLocaleString('en-IN', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Society name</Label>
                <Input value={form.societyName ?? ''} onChange={(e) => set('societyName', e.target.value)} />
              </div>
              <div>
                <Label>Maintenance amount (₹)</Label>
                <Input value={form.monthlyMaintenance ?? ''} onChange={(e) => set('monthlyMaintenance', e.target.value)} />
              </div>
              <div>
                <Label>Frequency</Label>
                <select
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.maintenanceFrequency ?? 'MONTHLY'}
                  onChange={(e) => set('maintenanceFrequency', e.target.value as MaintenanceFrequency)}
                >
                  {MAINTENANCE_FREQS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Section>

          {/* Identifiers */}
          <Section title="Identifiers (optional)">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <Label>Electricity consumer no.</Label>
                <Input value={form.electricityConsumerNo ?? ''} onChange={(e) => set('electricityConsumerNo', e.target.value)} />
              </div>
              <div>
                <Label>Water connection no.</Label>
                <Input value={form.waterConnectionNo ?? ''} onChange={(e) => set('waterConnectionNo', e.target.value)} />
              </div>
              <div>
                <Label>Gas connection no.</Label>
                <Input value={form.gasConnectionNo ?? ''} onChange={(e) => set('gasConnectionNo', e.target.value)} />
              </div>
              <div>
                <Label>Khata / Property ID</Label>
                <Input value={form.khataNo ?? ''} onChange={(e) => set('khataNo', e.target.value)} />
              </div>
              <div>
                <Label>Survey no.</Label>
                <Input value={form.surveyNo ?? ''} onChange={(e) => set('surveyNo', e.target.value)} />
              </div>
            </div>
          </Section>

          {/* Under-construction (conditional) */}
          {isUC && (
            <Section title="Under construction">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <Label>Builder name</Label>
                  <Input value={form.builderName ?? ''} onChange={(e) => set('builderName', e.target.value)} />
                </div>
                <div>
                  <Label>Project name</Label>
                  <Input value={form.projectName ?? ''} onChange={(e) => set('projectName', e.target.value)} />
                </div>
                <div>
                  <Label>RERA reg. no.</Label>
                  <Input value={form.reraRegNo ?? ''} onChange={(e) => set('reraRegNo', e.target.value)} />
                </div>
                <div>
                  <Label>Expected possession</Label>
                  <Input
                    type="date"
                    value={form.expectedPossessionDate ?? ''}
                    onChange={(e) => set('expectedPossessionDate', e.target.value)}
                  />
                </div>
                <div>
                  <Label>Paid so far (%)</Label>
                  <Input value={form.paymentSchedulePaidPct ?? ''} onChange={(e) => set('paymentSchedulePaidPct', e.target.value)} />
                </div>
              </div>
            </Section>
          )}

          {/* Lease */}
          <Section title="Lease (optional)">
            <div>
              <Label>Leasehold end date</Label>
              <Input
                type="date"
                value={form.leaseholdEndDate ?? ''}
                onChange={(e) => set('leaseholdEndDate', e.target.value)}
              />
            </div>
          </Section>

          {/* Notes */}
          <Section title="Notes">
            <textarea
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Any other details to remember…"
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
            />
          </Section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Add property'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        {title}
      </h3>
      {children}
    </div>
  );
}
