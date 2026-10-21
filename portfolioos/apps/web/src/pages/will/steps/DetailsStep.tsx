import {
  FOREIGN_LAW_MESSAGE, MARITAL_STATUSES, MUSLIM_LAW_MESSAGE, PERSONAL_LAWS, WILL_PARENTAGE_RELATIONS,
  type MaritalStatus, type PersonalLaw, type WillDetails, type WillParentageRelation,
} from '@everypaisa/shared';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Field, FindingList, LAW_LABEL, MARITAL_LABEL, Notice } from '../parts';
import type { WillStepProps } from './types';

const PARENTAGE_LABEL: Record<WillParentageRelation, string> = {
  SON_OF: 'Son of', DAUGHTER_OF: 'Daughter of', WIFE_OF: 'Wife of', HUSBAND_OF: 'Husband of', CHILD_OF: 'Child of', SPOUSE_OF: 'Spouse of',
};

const yesNo = (v: boolean | null) => (v === null ? '' : v ? 'yes' : 'no');
const fromYesNo = (v: string) => (v === '' ? null : v === 'yes');

export function DetailsStep({ payload, update, findings, today }: WillStepProps) {
  const d = payload.details;
  const set = (patch: Partial<WillDetails>) => update('details', { ...d, ...patch });
  // The Muslim-law and foreign-law blockers already have their own notices above.
  const stepFindings = findings.filter((f) => f.step === 2 && f.ruleId !== 'MUSLIM_LAW_UNSUPPORTED' && f.ruleId !== 'JURISDICTION_INDIA_ONLY');

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <Card className="min-w-0 space-y-4 p-4 sm:p-5">
        <Field id="will-name" label="Full legal name" required hint="As on your PAN or passport.">
          <Input id="will-name" value={d.legalName} maxLength={120} autoComplete="name" onChange={(e) => set({ legalName: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
          <Field id="will-parentage-relation" label="Described as" hint="Optional. Printed after your name.">
            <Select
              id="will-parentage-relation"
              value={d.parentage.relation ?? ''}
              onChange={(e) => set({ parentage: { ...d.parentage, relation: (e.target.value || null) as WillParentageRelation | null } })}
            >
              <option value="">Leave out</option>
              {WILL_PARENTAGE_RELATIONS.map((r) => <option key={r} value={r}>{PARENTAGE_LABEL[r]}</option>)}
            </Select>
          </Field>
          <Field id="will-parentage-name" label="Father's, mother's or spouse's full name" hint="As on your ID, e.g. Mohan Lal Verma.">
            <Input
              id="will-parentage-name"
              value={d.parentage.name}
              maxLength={120}
              disabled={!d.parentage.relation}
              onChange={(e) => set({ parentage: { ...d.parentage, name: e.target.value } })}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="will-dob" label="Date of birth" required>
            <Input id="will-dob" type="date" min="1900-01-01" max={today} value={d.dob ?? ''} onChange={(e) => set({ dob: e.target.value || null })} />
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
        <FindingList findings={stepFindings} />
      </Card>
      <Card tone="muted" className="h-fit min-w-0 space-y-2 p-4 text-sm">
        <p className="font-medium text-foreground">Why we ask</p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Your name, date of birth and address identify you in the will. Wills in India usually also say whose son, daughter or spouse you are.</li>
          <li>Your religion decides which succession law applies.</li>
          <li>Marriage and children decide who your family is in law, and whether a guardian is needed.</li>
        </ul>
      </Card>
    </div>
  );
}
