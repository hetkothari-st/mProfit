import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { MaritalStatus, PersonalLaw, WillFinding, WillRelationship } from '@everypaisa/shared';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/cn';

export const RELATIONSHIP_LABEL: Record<WillRelationship, string> = {
  SPOUSE: 'Spouse', SON: 'Son', DAUGHTER: 'Daughter', FATHER: 'Father', MOTHER: 'Mother', BROTHER: 'Brother',
  SISTER: 'Sister', GRANDSON: 'Grandson', GRANDDAUGHTER: 'Granddaughter', SON_IN_LAW: 'Son-in-law',
  DAUGHTER_IN_LAW: 'Daughter-in-law', NEPHEW: 'Nephew', NIECE: 'Niece', OTHER_RELATIVE: 'Other relative',
  FRIEND: 'Friend', CHARITY: 'Charity', OTHER: 'Other',
};

export const LAW_LABEL: Record<PersonalLaw, string> = {
  HINDU: 'Hindu', SIKH: 'Sikh', JAIN: 'Jain', BUDDHIST: 'Buddhist', CHRISTIAN: 'Christian', PARSI: 'Parsi',
  MUSLIM: 'Muslim', OTHER: 'Other / none',
};

export const MARITAL_LABEL: Record<MaritalStatus, string> = {
  SINGLE: 'Single', MARRIED: 'Married', WIDOWED: 'Widowed', DIVORCED: 'Divorced', SEPARATED: 'Separated',
};

export function newLocalId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function Field({ id, label, required, children, hint }: { id: string; label: string; required?: boolean; hint?: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-negative"> *</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'warning' | 'info'; children: ReactNode }) {
  return (
    <div
      role={tone === 'warning' ? 'alert' : undefined}
      className={cn(
        'rounded-md border p-3 text-sm text-foreground',
        tone === 'warning' ? 'border-warning/40 bg-warning/10' : 'border-border/60 bg-muted/40',
      )}
    >
      {children}
    </div>
  );
}

const ICON = { BLOCKER: XCircle, WARNING: AlertTriangle, INFO: Info } as const;
const TONE = { BLOCKER: 'text-negative', WARNING: 'text-warning', INFO: 'text-muted-foreground' } as const;

/** Findings for one step; `passLabel` shows a tick when there are none. */
export function FindingList({ findings, passLabel }: { findings: readonly WillFinding[]; passLabel?: string }) {
  if (findings.length === 0) {
    return passLabel ? (
      <p className="flex items-center gap-1.5 text-sm text-positive"><CheckCircle2 className="h-4 w-4" />{passLabel}</p>
    ) : null;
  }
  return (
    <ul className="space-y-1.5">
      {findings.map((f, i) => {
        const Icon = ICON[f.severity];
        return (
          <li key={`${f.ruleId}-${i}`} className="flex items-start gap-1.5 text-sm text-foreground">
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', TONE[f.severity])} />
            <span className="min-w-0 break-words">{f.message}</span>
          </li>
        );
      })}
    </ul>
  );
}
