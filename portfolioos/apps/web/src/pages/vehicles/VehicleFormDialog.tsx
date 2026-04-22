import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { vehiclesApi, type VehicleDTO } from '@/api/vehicles.api';
import { apiErrorMessage } from '@/api/client';

const isoDateOrEmpty = z
  .string()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Use YYYY-MM-DD')
  .optional();

const schema = z.object({
  registrationNo: z.string().min(5).max(20),
  make: z.string().max(120).optional(),
  model: z.string().max(120).optional(),
  variant: z.string().max(120).optional(),
  manufacturingYear: z
    .union([z.coerce.number().int().min(1900).max(2100), z.literal('')])
    .optional(),
  fuelType: z.string().max(32).optional(),
  color: z.string().max(32).optional(),
  chassisLast4: z.string().max(16).optional(),
  ownerName: z.string().max(160).optional(),
  purchaseDate: isoDateOrEmpty,
  purchasePrice: z
    .string()
    .regex(/^(\d+(\.\d+)?)?$/, 'Decimal value')
    .optional(),
  currentValue: z
    .string()
    .regex(/^(\d+(\.\d+)?)?$/, 'Decimal value')
    .optional(),
  insuranceExpiry: isoDateOrEmpty,
  pucExpiry: isoDateOrEmpty,
  fitnessExpiry: isoDateOrEmpty,
  roadTaxExpiry: isoDateOrEmpty,
  permitExpiry: isoDateOrEmpty,
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: VehicleDTO | null;
}

export function VehicleFormDialog({ open, onOpenChange, initial }: Props) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(initial);

  const { register, handleSubmit, reset, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (open) {
      reset({
        registrationNo: initial?.registrationNo ?? '',
        make: initial?.make ?? '',
        model: initial?.model ?? '',
        variant: initial?.variant ?? '',
        manufacturingYear:
          initial?.manufacturingYear == null ? undefined : initial.manufacturingYear,
        fuelType: initial?.fuelType ?? '',
        color: initial?.color ?? '',
        chassisLast4: initial?.chassisLast4 ?? '',
        ownerName: initial?.ownerName ?? '',
        purchaseDate: initial?.purchaseDate?.slice(0, 10) ?? '',
        purchasePrice: initial?.purchasePrice ?? '',
        currentValue: initial?.currentValue ?? '',
        insuranceExpiry: initial?.insuranceExpiry?.slice(0, 10) ?? '',
        pucExpiry: initial?.pucExpiry?.slice(0, 10) ?? '',
        fitnessExpiry: initial?.fitnessExpiry?.slice(0, 10) ?? '',
        roadTaxExpiry: initial?.roadTaxExpiry?.slice(0, 10) ?? '',
        permitExpiry: initial?.permitExpiry?.slice(0, 10) ?? '',
      });
    }
  }, [open, initial, reset]);

  const normalise = (values: FormValues) => {
    // React-hook-form preserves "" for empty inputs; the API expects null /
    // absent, not empty strings, so flatten here.
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v === '' || v === undefined) continue;
      out[k] = v;
    }
    return out;
  };

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const body = normalise(values);
      if (isEdit && initial) {
        return vehiclesApi.update(initial.id, body);
      }
      return vehiclesApi.create(body as { registrationNo: string });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      toast.success(isEdit ? 'Vehicle updated' : 'Vehicle added');
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Save failed')),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!initial) return;
      await vehiclesApi.remove(initial.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      toast.success('Vehicle deleted');
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Delete failed')),
  });

  const handleDelete = () => {
    if (!initial) return;
    if (!window.confirm(`Delete vehicle ${initial.registrationNo}? This cannot be undone.`))
      return;
    deleteMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit vehicle' : 'Add a vehicle'}</DialogTitle>
          <DialogDescription>
            Enter the registration number — everything else can be filled later via a refresh
            or SMS paste.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit((v) => saveMutation.mutate(v))}
          className="space-y-4 max-h-[70vh] overflow-y-auto"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="registrationNo">Registration number</Label>
              <Input
                id="registrationNo"
                className="mt-1 uppercase"
                placeholder="MH47BT5950"
                disabled={isEdit}
                {...register('registrationNo')}
              />
              {formState.errors.registrationNo && (
                <p className="text-xs text-negative mt-1">
                  {formState.errors.registrationNo.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="ownerName">Owner</Label>
              <Input id="ownerName" className="mt-1" {...register('ownerName')} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="make">Make</Label>
              <Input id="make" className="mt-1" placeholder="HONDA" {...register('make')} />
            </div>
            <div>
              <Label htmlFor="model">Model</Label>
              <Input id="model" className="mt-1" placeholder="CITY" {...register('model')} />
            </div>
            <div>
              <Label htmlFor="variant">Variant</Label>
              <Input id="variant" className="mt-1" {...register('variant')} />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div>
              <Label htmlFor="manufacturingYear">Year</Label>
              <Input
                id="manufacturingYear"
                className="mt-1"
                type="number"
                {...register('manufacturingYear')}
              />
            </div>
            <div>
              <Label htmlFor="fuelType">Fuel</Label>
              <Select id="fuelType" className="mt-1" {...register('fuelType')}>
                <option value="">—</option>
                <option value="PETROL">Petrol</option>
                <option value="DIESEL">Diesel</option>
                <option value="CNG">CNG</option>
                <option value="LPG">LPG</option>
                <option value="ELECTRIC">Electric</option>
                <option value="HYBRID">Hybrid</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="color">Color</Label>
              <Input id="color" className="mt-1" {...register('color')} />
            </div>
            <div>
              <Label htmlFor="chassisLast4">Chassis (last 4)</Label>
              <Input id="chassisLast4" className="mt-1" {...register('chassisLast4')} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="purchaseDate">Purchase date</Label>
              <Input id="purchaseDate" type="date" className="mt-1" {...register('purchaseDate')} />
            </div>
            <div>
              <Label htmlFor="purchasePrice">Purchase price (₹)</Label>
              <Input
                id="purchasePrice"
                inputMode="decimal"
                className="mt-1"
                {...register('purchasePrice')}
              />
            </div>
            <div>
              <Label htmlFor="currentValue">Current value (₹)</Label>
              <Input
                id="currentValue"
                inputMode="decimal"
                className="mt-1"
                {...register('currentValue')}
              />
            </div>
          </div>

          <div className="rounded-md border p-3 bg-muted/30">
            <p className="text-xs font-medium mb-2 text-muted-foreground">Expiries</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="insuranceExpiry">Insurance</Label>
                <Input
                  id="insuranceExpiry"
                  type="date"
                  className="mt-1"
                  {...register('insuranceExpiry')}
                />
              </div>
              <div>
                <Label htmlFor="pucExpiry">PUC</Label>
                <Input id="pucExpiry" type="date" className="mt-1" {...register('pucExpiry')} />
              </div>
              <div>
                <Label htmlFor="fitnessExpiry">Fitness</Label>
                <Input
                  id="fitnessExpiry"
                  type="date"
                  className="mt-1"
                  {...register('fitnessExpiry')}
                />
              </div>
              <div>
                <Label htmlFor="roadTaxExpiry">Road tax</Label>
                <Input
                  id="roadTaxExpiry"
                  type="date"
                  className="mt-1"
                  {...register('roadTaxExpiry')}
                />
              </div>
              <div>
                <Label htmlFor="permitExpiry">Permit</Label>
                <Input
                  id="permitExpiry"
                  type="date"
                  className="mt-1"
                  {...register('permitExpiry')}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2 gap-2 sm:justify-between">
            {isEdit ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {isEdit ? 'Save' : 'Add vehicle'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
