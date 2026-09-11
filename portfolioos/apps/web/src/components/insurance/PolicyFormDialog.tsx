import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FileText, Trash2, Upload as UploadIcon } from 'lucide-react';
import { defaultGraceDays } from '@portfolioos/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage } from '@/api/client';
import {
  insuranceApi,
  type CreatePolicyInput,
  type InsurancePolicyDTO,
  type UpdatePolicyInput,
} from '@/api/insurance.api';
import { documentsApi } from '@/api/documents.api';
import { findCatalogProduct, type CatalogProduct } from '@/data/insuranceCatalog';
import { FREQUENCY_LABELS, POLICY_TYPES, POLICY_TYPE_LABELS, plural } from '@/lib/insurance';
import { CatalogBrief, InsuranceCatalogPicker, inferCatalogId } from './InsuranceCatalogPicker';

const MONEY = /^\d+(\.\d+)?$/;
const SELECT = 'mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

interface FormState {
  insurer: string;
  policyNumber: string;
  type: string;
  planName: string;
  policyHolder: string;
  sumAssured: string;
  premiumAmount: string;
  premiumFrequency: string;
  startDate: string;
  maturityDate: string;
  nextPremiumDue: string;
  gracePeriodDays: string;
}

/** API dates are full ISO timestamps; <input type="date"> wants YYYY-MM-DD. */
const day = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');

function formFrom(p: InsurancePolicyDTO | null | undefined): FormState {
  return {
    insurer: p?.insurer ?? '',
    // Never prefilled: the saved number isn't sent to the browser.
    policyNumber: '',
    type: p?.type ?? 'TERM',
    planName: p?.planName ?? '',
    policyHolder: p?.policyHolder ?? '',
    sumAssured: p?.sumAssured ?? '',
    premiumAmount: p?.premiumAmount ?? '',
    premiumFrequency: p?.premiumFrequency ?? 'ANNUAL',
    startDate: day(p?.startDate),
    maturityDate: day(p?.maturityDate),
    nextPremiumDue: day(p?.nextPremiumDue),
    gracePeriodDays: p?.gracePeriodDays != null ? String(p.gracePeriodDays) : '',
  };
}

export function PolicyFormDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: InsurancePolicyDTO | null;
}) {
  const qc = useQueryClient();
  const isEdit = !!initial;
  const [form, setForm] = useState<FormState>(() => formFrom(initial));
  const [openedNextDue, setOpenedNextDue] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [catalogId, setCatalogId] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const selectedCatalog = findCatalogProduct(catalogId);

  useEffect(() => {
    if (!open) return;
    const f = formFrom(initial);
    setForm(f);
    setOpenedNextDue(f.nextPremiumDue);
    setErrors({});
    setCatalogId(initial ? inferCatalogId(initial.insurer, initial.planName) : null);
    setPendingFile(null);
  }, [open, initial]);

  function applyCatalogProduct(product: CatalogProduct | null) {
    setCatalogId(product?.id ?? null);
    if (product) setForm((f) => ({ ...f, insurer: product.insurer, planName: product.planName, type: product.type }));
  }

  const mutation = useMutation({
    mutationFn: async (input: UpdatePolicyInput) => {
      const policy = isEdit
        ? await insuranceApi.updatePolicy(initial!.id, input)
        : // validate() has checked every field a new policy needs.
          await insuranceApi.createPolicy(input as CreatePolicyInput);
      if (pendingFile) {
        try {
          await documentsApi.upload({
            file: pendingFile,
            ownerType: 'INSURANCE_POLICY',
            ownerId: policy.id,
            category: 'policy_document',
          });
        } catch (err) {
          // The policy is saved; say what didn't make it.
          toast.error(`Policy saved, but the document didn't upload: ${apiErrorMessage(err, 'unknown error')}`);
        }
      }
      return policy;
    },
    onSuccess: (policy) => {
      qc.invalidateQueries({ queryKey: ['insurance-policies'] });
      qc.invalidateQueries({ queryKey: ['insurance-policy', policy.id] });
      qc.invalidateQueries({ queryKey: ['documents'] });
      toast.success(isEdit ? 'Policy updated' : 'Policy added');
      onOpenChange(false);
    },
  });

  function validate(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.insurer.trim()) errs.insurer = 'Required';
    if (!isEdit && !form.policyNumber.trim()) errs.policyNumber = 'Required';
    if (!form.policyHolder.trim()) errs.policyHolder = 'Required';
    if (!MONEY.test(form.sumAssured.trim())) errs.sumAssured = 'Enter an amount, like 5000000';
    if (!MONEY.test(form.premiumAmount.trim())) errs.premiumAmount = 'Enter an amount, like 25000';
    if (!form.startDate) errs.startDate = 'Required';
    if (form.maturityDate && form.startDate && form.maturityDate <= form.startDate) {
      errs.maturityDate = 'Must be after the start date';
    }
    const grace = form.gracePeriodDays.trim();
    if (grace && !(/^\d{1,2}$/.test(grace) && Number.parseInt(grace, 10) <= 90)) {
      errs.gracePeriodDays = 'Days, from 0 to 90';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    const grace = form.gracePeriodDays.trim();
    const input: UpdatePolicyInput = {
      insurer: form.insurer.trim(),
      type: form.type,
      planName: form.planName.trim() || null,
      policyHolder: form.policyHolder.trim(),
      sumAssured: form.sumAssured.trim(),
      premiumAmount: form.premiumAmount.trim(),
      premiumFrequency: form.premiumFrequency,
      startDate: form.startDate,
      maturityDate: form.maturityDate || null,
      gracePeriodDays: grace ? Number.parseInt(grace, 10) : null,
    };
    // Blank on edit keeps the saved number.
    if (form.policyNumber.trim()) input.policyNumber = form.policyNumber.trim();
    // The next due date also decides which earlier premiums count as settled,
    // so send it only when it was actually changed.
    if (form.nextPremiumDue && form.nextPremiumDue !== openedNextDue) input.nextPremiumDue = form.nextPremiumDue;
    mutation.mutate(input);
  }

  const field = (key: keyof FormState) => ({
    id: `policy-${key}`,
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
    className: errors[key] ? 'border-negative' : '',
  });
  const error = (key: keyof FormState) =>
    errors[key] ? <p className="mt-1 text-xs text-negative">{errors[key]}</p> : null;

  const usualGrace = defaultGraceDays(form.type, form.premiumFrequency);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit policy' : 'Add a policy'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!isEdit && (
            <div className="space-y-2">
              <Label>Pick the plan (optional)</Label>
              <InsuranceCatalogPicker selectedId={catalogId} onSelect={applyCatalogProduct} />
              {selectedCatalog ? (
                <CatalogBrief product={selectedCatalog} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Fills in the insurer, plan and type. Not listed? Type them in below.
                </p>
              )}
              <div className="border-t pt-1" />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="policy-insurer">Insurer</Label>
              <Input placeholder="LIC, HDFC Life, Star Health…" {...field('insurer')} />
              {error('insurer')}
            </div>
            <div>
              <Label htmlFor="policy-policyNumber">Policy number</Label>
              <Input
                autoComplete="off"
                placeholder={
                  isEdit
                    ? initial?.policyNumberLast4
                      ? `Saved, ending ${initial.policyNumberLast4} — type to replace`
                      : 'Not saved — add it here'
                    : 'As printed on the policy'
                }
                {...field('policyNumber')}
              />
              {error('policyNumber')}
              <p className="mt-1 text-xs text-muted-foreground">Stored encrypted. Only the last 4 are shown.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="policy-type">Type</Label>
              <select
                id="policy-type"
                className={SELECT}
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                {POLICY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {POLICY_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="policy-planName">Plan name</Label>
              <Input placeholder="Optional" {...field('planName')} />
            </div>
          </div>

          <div>
            <Label htmlFor="policy-policyHolder">Policyholder</Label>
            <Input placeholder="Full name, as on the policy" {...field('policyHolder')} />
            {error('policyHolder')}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="policy-sumAssured">Cover / sum assured (₹)</Label>
              <Input inputMode="decimal" placeholder="5000000" {...field('sumAssured')} />
              {error('sumAssured')}
            </div>
            <div>
              <Label htmlFor="policy-premiumAmount">Premium (₹)</Label>
              <Input inputMode="decimal" placeholder="25000" {...field('premiumAmount')} />
              {error('premiumAmount')}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="policy-premiumFrequency">Paid</Label>
              <select
                id="policy-premiumFrequency"
                className={SELECT}
                value={form.premiumFrequency}
                onChange={(e) => setForm((f) => ({ ...f, premiumFrequency: e.target.value }))}
              >
                {Object.entries(FREQUENCY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l[0]!.toUpperCase() + l.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="policy-startDate">Start date</Label>
              <Input type="date" {...field('startDate')} />
              {error('startDate')}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="policy-maturityDate">Maturity / end date</Label>
              <Input type="date" {...field('maturityDate')} />
              {error('maturityDate')}
            </div>
            {form.premiumFrequency !== 'SINGLE' && (
              <div>
                <Label htmlFor="policy-nextPremiumDue">Next premium due</Label>
                <Input type="date" {...field('nextPremiumDue')} />
                <p className="mt-1 text-xs text-muted-foreground">
                  {isEdit
                    ? 'Change only if the insurer says otherwise — earlier premiums then count as paid.'
                    : 'Premiums before this date count as already paid.'}
                </p>
              </div>
            )}
          </div>

          {form.premiumFrequency !== 'SINGLE' && (
            <div className="sm:w-1/2 sm:pr-1.5">
              <Label htmlFor="policy-gracePeriodDays">Grace period (days)</Label>
              <Input
                inputMode="numeric"
                placeholder={usualGrace > 0 ? `Usual: ${plural(usualGrace, 'day')}` : 'Usual: none'}
                {...field('gracePeriodDays')}
              />
              {error('gracePeriodDays') ?? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Time to pay a missed premium before the policy lapses. Leave blank for the usual.
                </p>
              )}
            </div>
          )}

          <div className="border-t pt-4">
            <Label>Policy document (optional)</Label>
            <p className="mb-2 mt-1 text-xs text-muted-foreground">
              Keep the policy PDF with it, in your encrypted document vault.
            </p>
            {pendingFile ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-sm font-medium">{pendingFile.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  aria-label="Remove attached file"
                  onClick={() => setPendingFile(null)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed bg-background px-4 py-4 text-sm text-muted-foreground transition-colors hover:bg-accent/40">
                <UploadIcon className="h-4 w-4" />
                <span>Attach a PDF</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setPendingFile(f);
                  }}
                />
              </label>
            )}
          </div>
        </div>

        {mutation.isError && (
          <p className="text-sm text-negative">
            {apiErrorMessage(mutation.error, isEdit ? 'Could not update the policy' : 'Could not add the policy')}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Add policy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
