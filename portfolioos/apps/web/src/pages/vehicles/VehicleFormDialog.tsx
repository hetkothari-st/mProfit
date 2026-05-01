import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Trash2, Smartphone, Key, CheckCircle, Car, User, Calendar, FileText, ChevronLeft } from 'lucide-react';
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
  const [step, setStep] = useState<'registration' | 'mobile' | 'otp' | 'details'>(
    isEdit ? 'details' : 'registration',
  );
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [mobileNo, setMobileNo] = useState('');
  const [otp, setOtp] = useState('');

  const { register, handleSubmit, reset, formState, watch } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const registrationNo = watch('registrationNo');

  useEffect(() => {
    if (open) {
      // Reset internal wizard state when opening
      setStep(isEdit ? 'details' : 'registration');
      setSessionId(null);
      setOtp('');
      
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
  }, [open, initial, isEdit, reset]);

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

  const carInfoInitMutation = useMutation({
    mutationFn: async () => {
      const regNo = registrationNo || initial?.registrationNo;
      return vehiclesApi.carInfoInit({ registrationNo: regNo!, mobileNo });
    },
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setStep('otp');
      toast.success('OTP sent');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to send OTP')),
  });

  const carInfoVerifyMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) return;
      return vehiclesApi.carInfoVerify({ sessionId, otp });
    },
    onSuccess: (data) => {
      // Map CarInfo data to form
      const raw = data?.raw || {};
      const sc = raw.scraped || {};
      
      // Flatten all captured API JSON responses to find hidden vehicle details
      const flattenObj = (ob: any): any => {
        let result: any = {};
        if (!ob) return result;
        for (const i in ob) {
            if (typeof ob[i] === 'object' && !Array.isArray(ob[i]) && ob[i] !== null) {
                const temp = flattenObj(ob[i]);
                for (const j in temp) {
                    result[j] = temp[j];
                }
            } else {
                result[i] = ob[i];
            }
        }
        return result;
      };

      let flatApi = {};
      if (Array.isArray(raw.apiResponses)) {
          for (const res of raw.apiResponses) {
              if (res.json) {
                  flatApi = { ...flatApi, ...flattenObj(res.json) };
              }
          }
      }

      const rc = { ...(raw.rcData || raw.rc || raw.data || {}), ...flatApi };
      
      console.log('CarInfo Data received:', { raw, rc, sc });

      const parseDate = (d?: string) => {
        if (!d) return '';
        // If already YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
        // Handle DD-MMM-YYYY or DD MMM YYYY
        const months: Record<string, string> = { 
          jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
          jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
        };
        const parts = d.split(/[- ]/);
        if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
          const day = parts[0].padStart(2, '0');
          const month = months[parts[1].toLowerCase().slice(0, 3)];
          const year = parts[2];
          if (day && month && year) return `${year}-${month}-${day}`;
        }
        return d;
      };

      // Also look for common variants in the flattened API data
      reset({
        registrationNo: rc.regNo || rc.registration_no || rc.registrationNumber || sc.registrationNo || watch('registrationNo'),
        ownerName: sc.ownerName || rc.owner_name || rc.owner || rc.ownerName || rc.ownerName1 || '',
        make: sc.make || rc.maker_desc || rc.make || rc.maker_name || rc.brand || '',
        model: sc.model || rc.model_name || rc.model || rc.maker_model || '',
        variant: sc.variant || rc.variant || rc.variant_name || '',
        manufacturingYear: parseInt(rc.mfg_year || rc.manufacturingYear || rc.manufacturing_year || sc.registrationDate?.slice(-4) || '0') || undefined,
        fuelType: (sc.fuelType || rc.fuel_type || rc.fuelType || rc.fuel || '').toUpperCase(),
        color: sc.color || rc.color || rc.colour || '',
        chassisLast4: (sc.chassisNo || rc.chassis_no || rc.chassis || '').slice(-4),
        insuranceExpiry: parseDate(sc.insuranceExpiry || rc.insurance_upto || rc.insurance_expiry || rc.insuranceUpto),
        pucExpiry: parseDate(sc.pucExpiry || rc.pucc_upto || rc.puc_expiry || rc.puccUpto || rc.pucUpto),
        fitnessExpiry: parseDate(sc.fitnessExpiry || rc.fit_upto || rc.fitness_expiry || rc.fitnessUpto),
        roadTaxExpiry: parseDate(sc.roadTaxExpiry || rc.tax_upto || rc.tax_expiry || rc.taxUpto),
      });
      setStep('details');
      toast.success('Vehicle details fetched');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || err.message || 'Verification failed');
    },
  });

  const handleNext = () => {
    if (step === 'registration') setStep('mobile');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit vehicle' : step === 'details' ? 'Verify vehicle details' : 'Add a vehicle'}
          </DialogTitle>
          {!isEdit && (
            <div className="flex items-center gap-2 mt-2">
              <div
                className={`h-2 flex-1 rounded-full ${
                  step === 'registration' ? 'bg-primary' : 'bg-primary/20'
                }`}
              />
              <div
                className={`h-2 flex-1 rounded-full ${
                  step === 'mobile' ? 'bg-primary' : 'bg-primary/20'
                }`}
              />
              <div
                className={`h-2 flex-1 rounded-full ${
                  step === 'otp' ? 'bg-primary' : 'bg-primary/20'
                }`}
              />
              <div
                className={`h-2 flex-1 rounded-full ${
                  step === 'details' ? 'bg-primary' : 'bg-primary/20'
                }`}
              />
            </div>
          )}
        </DialogHeader>

        {step === 'registration' && (
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="registrationNo">Registration number</Label>
              <Input
                id="registrationNo"
                className="mt-1 uppercase text-lg h-12"
                placeholder="MH47BT5950"
                {...register('registrationNo')}
              />
              <p className="text-sm text-muted-foreground mt-2">
                Enter your full number plate to fetch RC and Challan details.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" onClick={handleNext} disabled={!registrationNo || registrationNo.length < 5}>
                Next
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'mobile' && (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center">
              <Smartphone className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-medium">Owner verification required</h3>
            <p className="text-muted-foreground">
              Enter your mobile number to receive an OTP from CarInfo. This is required to
              fetch private owner and insurance details.
            </p>
            <div className="max-w-xs mx-auto">
              <Input
                type="tel"
                placeholder="10-digit mobile number"
                className="text-center text-lg h-12"
                value={mobileNo}
                onChange={(e) => setMobileNo(e.target.value.replace(/\D/g, '').slice(0, 10))}
              />
            </div>
            <DialogFooter className="sm:justify-center">
              <Button
                type="button"
                className="w-full sm:w-auto"
                onClick={() => carInfoInitMutation.mutate()}
                disabled={mobileNo.length !== 10 || carInfoInitMutation.isPending}
              >
                {carInfoInitMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Get OTP
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'otp' && (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center">
              <Key className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-medium">Verify OTP</h3>
            <p className="text-muted-foreground">
              Enter the OTP sent to <strong>+91 {mobileNo}</strong>
            </p>
            <div className="max-w-xs mx-auto">
              <Input
                type="text"
                placeholder="Enter OTP"
                className="text-center text-lg h-12 tracking-widest"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </div>
            <DialogFooter className="sm:justify-center">
              <Button
                type="button"
                className="w-full sm:w-auto"
                onClick={() => carInfoVerifyMutation.mutate()}
                disabled={otp.length < 4 || carInfoVerifyMutation.isPending}
              >
                {carInfoVerifyMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Verify & Fetch Details
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'details' && (
          <form
            onSubmit={handleSubmit((v) => saveMutation.mutate(v))}
            className="space-y-6 max-h-[75vh] overflow-y-auto px-1"
          >
            {/* Header Summary */}
            <div className="bg-primary/5 rounded-xl p-4 border border-primary/10 flex items-start gap-4">
              <div className="bg-primary/10 p-3 rounded-lg">
                <Car className="w-8 h-8 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold tracking-tight uppercase">
                    {watch('registrationNo')}
                  </h3>
                  <div className="px-2 py-0.5 rounded text-[10px] font-bold border bg-background">
                    {watch('fuelType') || 'Fuel Unknown'}
                  </div>
                </div>
                <p className="text-muted-foreground font-medium">{watch('model')}</p>
                <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                  <User className="w-4 h-4" />
                  <span className="font-semibold text-foreground uppercase">{watch('ownerName')}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Vehicle Specifications */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <FileText className="w-4 h-4" /> Vehicle Specifications
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Make</Label>
                    <Input className="h-9" {...register('make')} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Variant</Label>
                    <Input className="h-9" {...register('variant')} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Year</Label>
                    <Input type="number" className="h-9" {...register('manufacturingYear')} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Color</Label>
                    <Input className="h-9" {...register('color')} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">Chassis (Last 4)</Label>
                  <Input className="h-9" {...register('chassisLast4')} />
                </div>
              </div>

              {/* Status & Expiries */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> Document Expiries
                </h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <Label className="text-xs">Insurance</Label>
                    </div>
                    <Input type="date" className="h-8 w-32 text-xs" {...register('insuranceExpiry')} />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <Label className="text-xs">PUC / Emission</Label>
                    </div>
                    <Input type="date" className="h-8 w-32 text-xs" {...register('pucExpiry')} />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-orange-500" />
                      <Label className="text-xs">Fitness Validity</Label>
                    </div>
                    <Input type="date" className="h-8 w-32 text-xs" {...register('fitnessExpiry')} />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-purple-500" />
                      <Label className="text-xs">Road Tax</Label>
                    </div>
                    <Input type="date" className="h-8 w-32 text-xs" {...register('roadTaxExpiry')} />
                  </div>
                </div>
              </div>
            </div>

            {/* Disclaimer */}
            <p className="text-[10px] text-center text-muted-foreground italic bg-muted/50 p-2 rounded">
              Data synchronized via CarInfo RTO services. Please verify these details with your original documents.
            </p>

            <DialogFooter className="pt-2 gap-2 sm:justify-between border-t mt-4">
              {isEdit ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Delete Vehicle
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => setStep('registration')}>
                  <ChevronLeft className="h-4 w-4 mr-2" /> Back
                </Button>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saveMutation.isPending}>
                  {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {isEdit ? 'Save Changes' : 'Confirm & Add Vehicle'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
