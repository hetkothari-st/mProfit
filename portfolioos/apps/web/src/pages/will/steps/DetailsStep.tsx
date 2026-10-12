import {
  FOREIGN_LAW_MESSAGE, MARITAL_STATUSES, MUSLIM_LAW_MESSAGE, PERSONAL_LAWS,
  type MaritalStatus, type PersonalLaw, type WillDetails,
} from '@everypaisa/shared';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Field, FindingList, LAW_LABEL, MARITAL_LABEL, Notice } from '../parts';
import type { WillStepProps } from './types';

const yesNo = (v: boolean | null) => (v === null ? '' : v ? 'yes' : 'no');
const fromYesNo = (v: string) => (v === '' ? null : v === 'yes');

export function DetailsStep({ payload, update, findings }: WillStepProps) {
  const d = payload.details;
  const set = (patch: Partial<WillDetails>) => update('details', { ...d, ...patch });
  const blockers = findings.filter((f) => f.step === 2 && f.severity === 'BLOCKER' && f.ruleId === 'REQUIRED_FIELDS');

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <Card className="min-w-0 space-y-4 p-4 sm:p-5">
        <Field id="will-name" label="Full legal name" required hint="As on your PAN or passport.">
          <Input id="will-name" value={d.legalName} maxLength={120} autoComplete="name" onChange={(e) => set({ legalName: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="will-dob" label="Date of birth" required>
            <Input id="will-dob" type="date" value={d.dob ?? ''} onChange={(e) => set({ dob: e.target.value || null })} />
          </Field>
          <Field id="will-country" label="Country whose law applies" required>
            <Select id="will-country" value={d.jurisdiction} onChange={(e) => set({ jurisdiction: e.target.value === 'IN' ? 'IN' : 'OTHER' })}>
              <option value="IN">India</option>
              <option value="OTHER">Another country</option>
            </Select>
          </Field>
        </div>
        {d.jurisdiction === 'OTHER' && <Notice tone="warning">{FOREIGN_LAW_MESSAGE}</Notice>}
        <Field id="will-law" label="Religion / personal law" required hint="This decides which succession law applies to your will.">
          <Select id="will-law" value={d.personalLaw ?? ''} onChange={(e) => set({ personalLaw: (e.target.value || null) as PersonalLaw | null })}>
            <option value="">Choose...</option>
            {PERSONAL_LAWS.map((l) => <option key={l} value={l}>{LAW_LABEL[l]}</option>)}
          </Select>
        </Field>
        {d.personalLaw === 'MUSLIM' && <Notice tone="warning">{MUSLIM_LAW_MESSAGE}</Notice>}
        <Field id="will-address" label="Address" required>
          <Textarea id="will-address" rows={3} maxLength={400} value={d.address} onChange={(e) => set({ address: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="will-marital" label="Marital status" required>
            <Select id="will-marital" value={d.maritalStatus ?? ''} onChange={(e) => set({ maritalStatus: (e.target.value || null) as MaritalStatus | null })}>
              <option value="">Choose...</option>
              {MARITAL_STATUSES.map((s) => <option key={s} value={s}>{MARITAL_LABEL[s]}</option>)}
            </Select>
          </Field>
          <Field id="will-children" label="Do you have children?" required>
            <Select id="will-children" value={yesNo(d.hasChildren)} onChange={(e) => set({ hasChildren: fromYesNo(e.target.value) })}>
              <option value="">Choose...</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>
          <Field id="will-dependents" label="Anyone else depends on you?">
            <Select id="will-dependents" value={yesNo(d.hasDependents)} onChange={(e) => set({ hasDependents: fromYesNo(e.target.value) })}>
              <option value="">Choose...</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>
        </div>
        <FindingList findings={blockers} />
      </Card>
      <Card tone="muted" className="h-fit min-w-0 space-y-2 p-4 text-sm">
        <p className="font-medium text-foreground">Why we ask</p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Your name, date of birth and address identify you in the will.</li>
          <li>Your religion decides which succession law applies.</li>
          <li>Marriage and children decide who your family is in law, and whether a guardian is needed.</li>
        </ul>
      </Card>
    </div>
  );
}
