/**
 * VerificationPage — user reviews and corrects extracted fields before analysis.
 *
 * Shows each field with:
 *  - Extracted value
 *  - Confidence badge (≥0.8 green, 0.5–0.8 amber, <0.5 red)
 *  - Source doc + page link
 *  - Editable input
 *
 * Blocks proceeding when critical fields (sum insured, policy type) are
 * NOT_FOUND — names them explicitly.
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getExtraction, patchExtraction } from '@/api/policyCheckApi';
import type { ExtractedPolicyDataDTO } from '@everypaisa/shared';

const NUMERIC_FIELDS = new Set(['initialWaitingDays', 'pedWaitingDays', 'specificDiseaseWaitingDays']);
const BOOLEAN_FIELDS = new Set(['proportionateDeductionApplies', 'ncbAvailable', 'restorationAvailable', 'opdCovered', 'healthCheckupCovered']);

/** The server validates corrections against the extraction schema, so send real numbers / booleans. */
function coerceInput(key: string, raw: string): unknown {
  const t = raw.trim();
  if (t === '') return null;
  if (NUMERIC_FIELDS.has(key)) return /^\d+$/.test(t) ? Number(t) : t;
  if (BOOLEAN_FIELDS.has(key)) {
    if (/^(true|yes|y)$/i.test(t)) return true;
    if (/^(false|no|n)$/i.test(t)) return false;
  }
  return t;
}

interface Props {
  checkId: string;
}

type FieldValue<T> = {
  value: T | null;
  confidence: number;
  sourceDocId: string | null;
  sourcePage: number | null;
  clauseHeading: string | null;
  status: 'EXTRACTED' | 'USER_EDITED' | 'NOT_FOUND';
};

function ConfidenceBadge({ confidence, status }: { confidence: number; status: string }) {
  if (status === 'NOT_FOUND') return <Badge variant="outline" className="text-xs">Not found</Badge>;
  if (status === 'USER_EDITED') return <Badge variant="outline" className="text-xs text-blue-600">Edited</Badge>;
  if (confidence >= 0.8) return <Badge className="text-xs bg-green-100 text-green-800">High confidence</Badge>;
  if (confidence >= 0.5) return <Badge className="text-xs bg-amber-100 text-amber-800">Medium confidence</Badge>;
  return <Badge className="text-xs bg-red-100 text-red-800">Low confidence — verify</Badge>;
}

function fieldTitle(key: string): string {
  const base = key.split('.')[0]!;
  const sub = key.includes('.') ? ` (${key.split('.').slice(1).join('.')})` : '';
  const label = (FIELD_LABELS as Record<string, string | undefined>)[base] ?? base.replace(/([A-Z])/g, ' $1').toLowerCase();
  return label + sub;
}

const kindOf = (c: string) => c.replace('_', ' ').toLowerCase();

const CRITICAL_FIELDS: Array<keyof ExtractedPolicyDataDTO> = ['sumInsured', 'policyType'];

const FIELD_LABELS: Partial<Record<keyof ExtractedPolicyDataDTO, string>> = {
  insuredName: 'Insured Name',
  policyNumber: 'Policy Number',
  insurerName: 'Insurer',
  planName: 'Plan Name',
  policyType: 'Policy Type',
  policyStartDate: 'Start Date',
  policyEndDate: 'End Date',
  sumInsured: 'Sum Insured (₹)',
  premiumAmountInr: 'Annual Premium (₹)',
  copaymentPct: 'Co-payment (%)',
  roomRentLimitType: 'Room Rent Limit Type',
  roomRentLimitInr: 'Room Rent Limit (₹/day)',
  pedWaitingDays: 'PED Waiting Period (days)',
  initialWaitingDays: 'Initial Waiting Period (days)',
  ncbAvailable: 'No-Claim Bonus',
  restorationAvailable: 'Restoration Benefit',
  continuousCoverSince: 'Continuous cover since (date)',
  continuityCreditNote: 'Continuity / portability credit wording',
  specificDiseaseWaitingDays: 'Specific Disease Waiting (days)',
};

const FIELD_GROUPS: Array<{ title: string; fields: Array<keyof ExtractedPolicyDataDTO> }> = [
  {
    title: 'Basic Information',
    fields: ['insuredName', 'policyNumber', 'insurerName', 'planName', 'policyType', 'policyStartDate', 'policyEndDate', 'sumInsured', 'premiumAmountInr'],
  },
  {
    title: 'Financial Restrictions',
    fields: ['copaymentPct', 'roomRentLimitType', 'roomRentLimitInr', 'proportionateDeductionApplies', 'deductibleInr'],
  },
  {
    title: 'Waiting Periods',
    fields: ['initialWaitingDays', 'pedWaitingDays', 'specificDiseaseWaitingDays'],
  },
  {
    title: 'Continuity of Cover',
    fields: ['continuousCoverSince', 'continuityCreditNote'],
  },
  {
    title: 'Benefits',
    fields: ['ncbAvailable', 'restorationAvailable', 'opdCovered', 'healthCheckupCovered'],
  },
];

export function VerificationPage({ checkId }: Props) {
  const navigate = useNavigate();
  const [corrections, setCorrections] = useState<Record<string, unknown>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['policy-extraction', checkId],
    queryFn: () => getExtraction(checkId),
  });

  const fields = data?.fields as Partial<ExtractedPolicyDataDTO> | undefined;

  const missingCritical = useMemo(() => {
    if (!fields) return CRITICAL_FIELDS;
    return CRITICAL_FIELDS.filter((key) => {
      const f = fields[key] as FieldValue<unknown> | undefined;
      return !f || f.status === 'NOT_FOUND' || f.value === null;
    });
  }, [fields]);

  // One entry per field: an unresolved disagreement outranks a resolved override.
  const conflictByField = useMemo(() => {
    const m = new Map<string, 'UNRESOLVED' | 'RESOLVED_BY_PRECEDENCE'>();
    for (const c of data?.conflicts ?? []) {
      const key = c.field.split('.')[0]!;
      if (c.status === 'UNRESOLVED' || !m.has(key)) m.set(key, c.status);
    }
    return m;
  }, [data?.conflicts]);

  const confirmMutation = useMutation({
    mutationFn: () => patchExtraction(checkId, corrections),
    onSuccess: () => {
      navigate(`/insurance/health-check/${checkId}/analyzing`);
    },
  });

  if (isLoading || !fields) {
    return <div className="p-4 text-muted-foreground">Loading extracted fields…</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Review Extracted Data</h1>
        <p className="text-muted-foreground mt-1">
          Verify the information extracted from your policy documents. Correct any errors before
          proceeding to analysis.
        </p>
      </div>

      {missingCritical.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            The following critical fields were not found and must be entered manually before analysis
            can proceed:{' '}
            <strong>
              {missingCritical.map((k) => FIELD_LABELS[k] ?? k).join(', ')}
            </strong>
            . Please upload the policy schedule or enter the values below.
          </AlertDescription>
        </Alert>
      )}

      {(data?.conflicts ?? []).some((c) => c.status === 'UNRESOLVED') && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="space-y-2">
            <p className="font-medium">Your documents disagree — please confirm the right value</p>
            {(data?.conflicts ?? []).filter((c) => c.status === 'UNRESOLVED').map((c, i) => (
              <p key={i} className="text-xs">
                <strong>{fieldTitle(c.field)}</strong>: "{c.chosen.value}" (p.{c.chosen.page ?? '?'}, {kindOf(c.chosen.classification)}) vs
                "{c.other.value}" (p.{c.other.page ?? '?'}, {kindOf(c.other.classification)}). Edit the field below to settle it.
              </p>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {(data?.conflicts ?? []).some((c) => c.status === 'RESOLVED_BY_PRECEDENCE') && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="space-y-2">
            <p className="font-medium">Some values were changed by a later document</p>
            {(data?.conflicts ?? []).filter((c) => c.status === 'RESOLVED_BY_PRECEDENCE').map((c, i) => (
              <p key={i} className="text-xs">
                <strong>{fieldTitle(c.field)}</strong>: using the {kindOf(c.chosen.classification)} value "{c.chosen.value}"
                (p.{c.chosen.page ?? '?'}) instead of the {kindOf(c.other.classification)} value "{c.other.value}" (p.{c.other.page ?? '?'}).
              </p>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {FIELD_GROUPS.map((group) => {
        const groupFields = group.fields.filter((k) => k in FIELD_LABELS);
        if (groupFields.length === 0) return null;
        return (
          <Card key={group.title}>
            <CardHeader>
              <CardTitle className="text-sm">{group.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {groupFields.map((fieldKey) => {
                const field = fields[fieldKey] as FieldValue<unknown> | undefined;
                const label = FIELD_LABELS[fieldKey] ?? fieldKey;
                const currentValue = (corrections[fieldKey] as { value: unknown } | undefined)?.value
                  ?? field?.value;
                const isCritical = CRITICAL_FIELDS.includes(fieldKey);
                const isMissing = !field || field.status === 'NOT_FOUND' || field.value === null;

                return (
                  <div key={fieldKey} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Label className={isCritical && isMissing ? 'text-destructive' : ''}>
                        {label}
                        {isCritical && <span className="text-destructive ml-1">*</span>}
                      </Label>
                      {field && (
                        <ConfidenceBadge confidence={field.confidence} status={field.status} />
                      )}
                      {conflictByField.get(fieldKey as string) === 'UNRESOLVED' && !(fieldKey in corrections) && (
                        <>
                          <Badge className="text-xs bg-red-100 text-red-800">Documents disagree</Badge>
                          <button
                            type="button"
                            className="text-xs text-blue-600 hover:underline"
                            onClick={() =>
                              setCorrections((prev) => ({ ...prev, [fieldKey]: { value: field?.value ?? null } }))
                            }
                          >
                            Confirm this value
                          </button>
                        </>
                      )}
                      {conflictByField.get(fieldKey as string) === 'UNRESOLVED' && fieldKey in corrections && (
                        <Badge variant="outline" className="text-xs text-green-700">You confirmed this</Badge>
                      )}
                      {conflictByField.get(fieldKey as string) === 'RESOLVED_BY_PRECEDENCE' && (
                        <Badge variant="outline" className="text-xs text-amber-700">Changed by a later document</Badge>
                      )}
                      {field?.sourcePage && (
                        <span className="text-xs text-muted-foreground">
                          p.{field.sourcePage}
                          {field.clauseHeading ? ` — ${field.clauseHeading}` : ''}
                        </span>
                      )}
                    </div>
                    <Input
                      value={currentValue !== null && currentValue !== undefined ? String(currentValue) : ''}
                      placeholder={isMissing ? 'Not found — enter manually' : undefined}
                      className={isCritical && isMissing ? 'border-destructive' : ''}
                      onChange={(e) =>
                        setCorrections((prev) => ({
                          ...prev,
                          [fieldKey]: { value: coerceInput(fieldKey, e.target.value) },
                        }))
                      }
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      <div className="flex gap-3">
        <Button
          onClick={() => confirmMutation.mutate()}
          disabled={missingCritical.length > 0 || confirmMutation.isPending}
          className="flex-1"
        >
          {confirmMutation.isPending ? 'Saving…' : 'Confirm and Run Analysis'}
        </Button>
      </div>

      {missingCritical.length > 0 && (
        <p className="text-xs text-muted-foreground">
          <Info className="inline w-3 h-3 mr-1" />
          Fill in the required fields marked with * to proceed.
        </p>
      )}
    </div>
  );
}
