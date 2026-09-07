import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/api/client';
import { mfAnalyticsKeys } from '@/api/mfAnalyticsKeys';
import {
  mfQualitativeFactsApi,
  type MfQualitativeFactAdmin,
  type MfQualitativeFactCatalogEntry,
  type MfQualitativeFactCreateResult,
  type MfQualitativeScoringImpact,
} from '@/api/mfQualitativeFacts.api';
import { useAuthStore } from '@/stores/auth.store';

/**
 * `/admin/mf-qualitative-facts` — the admin entry surface for
 * `MfSchemeQualitativeFact` (`07-IMPLEMENTATION-PLAN.md` Task 6.2,
 * `01-DATA-FOUNDATION.md §2`, `03-SCORING.md §4`).
 *
 * This is the only page in the product where a human types a value that changes
 * what **every** user is shown. A row entered here can deduct 0.5 from a fund's
 * `amcQualitativeScore` (weight 30 inside `PEOPLE_PARENT` for active equity,
 * hybrid and fund-of-funds) and raise an `AMC_REGULATORY_ACTION` warning that
 * the verdict table reads. So the page is built around one idea: **the operator
 * must not be able to miss what a fact will do before they save it.**
 *
 * Concretely, three things that a generic CRUD form would not do:
 *
 *  1. **The consequence is rendered before the save, in the server's words.**
 *     `scoringImpact` and the `effect` sentence come from `GET /catalog` — the
 *     server is the only place that knows what the scorer actually consumes, so
 *     the page never decides for itself whether a fact type is inert. A type
 *     the scorer does not read is shown as such rather than hidden, because
 *     recording a fact ahead of the scorer is legitimate.
 *  2. **A regulatory action is a fact about an AMC, not about a scheme,** but
 *     the table is keyed by scheme. Entering it against one scheme marks down
 *     one fund and leaves the AMC's other forty untouched — which is almost
 *     never what the operator means. The AMC-wide mode makes the fan-out
 *     explicit and server-resolved, and the form says which mode is armed.
 *  3. **The create result is reported per scheme**, not as a count. `created`,
 *     `skippedDuplicate` and `unknownScheme` are three different outcomes;
 *     "4 of 6 saved" would make the operator guess which four.
 *
 * Route-level access is belt-and-braces: `requireRole('ADMIN')` on the server
 * is the control that matters, and the check below only keeps a non-admin from
 * being shown a form whose every request would 401.
 */

const IMPACT_COPY: Record<MfQualitativeScoringImpact, { label: string; tone: string }> = {
  RAISES_FINDING_AND_PENALISES_SCORE: {
    label: 'Marks the fund down and raises a warning',
    tone: 'border-red-500/40 bg-red-500/10 text-red-200',
  },
  PENALISES_SCORE: {
    label: 'Marks the fund down',
    tone: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  },
  RECORDED_ONLY: {
    label: 'Recorded only — no score effect',
    tone: 'border-border bg-muted/40 text-muted-foreground',
  },
  UNKNOWN_TYPE_RECORDED_ONLY: {
    label: 'Unrecognised type — recorded, no score effect today',
    tone: 'border-border bg-muted/40 text-muted-foreground',
  },
};

function ImpactChip({ impact }: { impact: MfQualitativeScoringImpact }) {
  const copy = IMPACT_COPY[impact];
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${copy.tone}`}>
      {copy.label}
    </span>
  );
}

/** `value` is free-form JSON the scorer never reads — it is the human record of
 *  what the fact says. Kept as raw text in state so a half-typed object does not
 *  clear the box, and parsed only on submit. */
const DEFAULT_VALUE_JSON = '{\n  "summary": ""\n}';

type TargetMode = 'schemes' | 'amc';

export function QualitativeFactsAdminPage() {
  const role = useAuthStore((s) => s.user?.role);
  const queryClient = useQueryClient();

  const [targetMode, setTargetMode] = useState<TargetMode>('schemes');
  const [schemeCodesRaw, setSchemeCodesRaw] = useState('');
  const [amcCode, setAmcCode] = useState('');
  const [factType, setFactType] = useState('AMC_REGULATORY_ACTION');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [source, setSource] = useState('');
  const [valueJson, setValueJson] = useState(DEFAULT_VALUE_JSON);
  const [formError, setFormError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<MfQualitativeFactCreateResult | null>(null);

  const [filterScheme, setFilterScheme] = useState('');
  const [filterAmc, setFilterAmc] = useState('');
  const [includeExpired, setIncludeExpired] = useState(false);

  const filters = useMemo(
    () => ({
      schemeCode: filterScheme.trim() || undefined,
      amcCode: filterAmc.trim() || undefined,
      includeExpired,
    }),
    [filterScheme, filterAmc, includeExpired],
  );

  const catalogQuery = useQuery({
    queryKey: mfAnalyticsKeys.qualitativeFactCatalog(),
    queryFn: () => mfQualitativeFactsApi.catalog(),
    // The catalog changes when a scorer changes and a deploy ships, not while
    // someone is filling in the form.
    staleTime: 60 * 60 * 1000,
    enabled: role === 'ADMIN',
  });

  const listQuery = useQuery({
    queryKey: mfAnalyticsKeys.qualitativeFacts(filters),
    queryFn: () => mfQualitativeFactsApi.list(filters),
    enabled: role === 'ADMIN',
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['mf-analytics', 'qualitative-facts'] });

  const createMutation = useMutation({
    mutationFn: mfQualitativeFactsApi.create,
    onSuccess: async (result) => {
      setLastResult(result);
      setFormError(null);
      await invalidate();
    },
    onError: (err: unknown) => {
      setLastResult(null);
      setFormError(apiErrorMessage(err, 'Could not save the fact.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => mfQualitativeFactsApi.remove(id),
    onSuccess: invalidate,
  });

  const selected: MfQualitativeFactCatalogEntry | undefined = catalogQuery.data?.find(
    (c) => c.factType === factType,
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setLastResult(null);

    let value: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(valueJson);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setFormError('Value must be a JSON object, e.g. {"summary": "SEBI order dated …"}.');
        return;
      }
      value = parsed as Record<string, unknown>;
    } catch {
      // Not a silent catch: the parse failure IS the message, and re-throwing
      // a SyntaxError into React Query would render it as a request failure,
      // which it is not.
      setFormError('Value is not valid JSON.');
      return;
    }

    const codes = schemeCodesRaw
      .split(/[\s,]+/)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (targetMode === 'schemes' && codes.length === 0) {
      setFormError('Enter at least one scheme code.');
      return;
    }
    if (targetMode === 'amc' && amcCode.trim().length === 0) {
      setFormError('Enter an AMC code.');
      return;
    }

    createMutation.mutate({
      ...(targetMode === 'schemes' ? { schemeCodes: codes } : { amcCode: amcCode.trim() }),
      factType,
      value,
      validFrom,
      validTo: validTo.trim() === '' ? null : validTo,
      source,
    });
  }

  if (role !== 'ADMIN') {
    return (
      <div>
        <PageHeader eyebrow="Admin" title="Qualitative facts" />
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            This page is restricted to administrators.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="MF qualitative facts"
        description="Hand-entered facts about an AMC or a scheme. These feed amcQualitativeScore and the AMC_REGULATORY_ACTION rule, so an entry here changes what every user sees. Always record a source."
      />

      {/* ---------------------------------------------------------------- */}
      {/* Create                                                            */}
      {/* ---------------------------------------------------------------- */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Record a fact</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="factType">Fact type</Label>
              <Select
                id="factType"
                value={factType}
                onChange={(e) => setFactType(e.target.value)}
                disabled={catalogQuery.isLoading}
              >
                {(catalogQuery.data ?? []).map((c) => (
                  <option key={c.factType} value={c.factType}>
                    {c.label} — {c.factType}
                  </option>
                ))}
              </Select>
              {/* The consequence, in the server's words, before the save. */}
              {selected && (
                <div className="mt-1 flex flex-col gap-2">
                  <ImpactChip impact={selected.scoringImpact} />
                  <p className="text-[12px] leading-relaxed text-muted-foreground">
                    {selected.effect}
                  </p>
                </div>
              )}
            </div>

            <div className="grid gap-2">
              <Label>Applies to</Label>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="targetMode"
                    checked={targetMode === 'schemes'}
                    onChange={() => setTargetMode('schemes')}
                  />
                  Specific scheme codes
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="targetMode"
                    checked={targetMode === 'amc'}
                    onChange={() => setTargetMode('amc')}
                  />
                  Every ACTIVE scheme of an AMC
                </label>
              </div>
              {targetMode === 'schemes' ? (
                <>
                  <Input
                    value={schemeCodesRaw}
                    onChange={(e) => setSchemeCodesRaw(e.target.value)}
                    placeholder="119551 119552 120503"
                  />
                  {/* The footgun this page exists to defuse. */}
                  <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-amber-300/90">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    An action against an AMC only marks down the schemes you list here. Its other
                    funds keep their score.
                  </p>
                </>
              ) : (
                <Input
                  value={amcCode}
                  onChange={(e) => setAmcCode(e.target.value)}
                  placeholder="AMC code, e.g. SBIMF"
                />
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="validFrom">Valid from</Label>
                <Input
                  id="validFrom"
                  type="date"
                  required
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                />
                <p className="text-[12px] text-muted-foreground">
                  The date the fact became true — for a regulatory action, the order date. The
                  3-year ageing window is measured from here.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="validTo">Valid to (optional)</Label>
                <Input
                  id="validTo"
                  type="date"
                  value={validTo}
                  onChange={(e) => setValidTo(e.target.value)}
                />
                <p className="text-[12px] text-muted-foreground">
                  Leave empty while the fact is still in force. Empty means "still true", not
                  "unknown".
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="source">Source (required)</Label>
              <Input
                id="source"
                required
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="https://www.sebi.gov.in/enforcement/orders/… or a note naming the document"
              />
              <p className="text-[12px] text-muted-foreground">
                A URL or a note. It is shown beside the finding this fact raises, so it has to be
                something a reader can check.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="value">Details (JSON)</Label>
              <Textarea
                id="value"
                rows={5}
                value={valueJson}
                onChange={(e) => setValueJson(e.target.value)}
                className="font-mono text-[12px]"
              />
              <p className="text-[12px] text-muted-foreground">
                Free-form. No scorer or rule reads inside this object — it is the human record of
                what the fact says.
              </p>
            </div>

            {formError !== null && (
              <p className="text-sm text-red-300">{formError}</p>
            )}

            {lastResult !== null && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-[13px]">
                <p className="font-medium">
                  Created {lastResult.created.length} fact
                  {lastResult.created.length === 1 ? '' : 's'}.
                </p>
                {lastResult.skippedDuplicate.length > 0 && (
                  <p className="mt-1 text-muted-foreground">
                    Skipped as already recorded on this date:{' '}
                    {lastResult.skippedDuplicate.join(', ')}. A second identical fact would double
                    the penalty, so it was not inserted.
                  </p>
                )}
                {lastResult.unknownScheme.length > 0 && (
                  <p className="mt-1 text-amber-300/90">
                    No scheme found for: {lastResult.unknownScheme.join(', ')}. Nothing was recorded
                    against these.
                  </p>
                )}
              </div>
            )}

            <div>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Record fact
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* List                                                              */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Recorded facts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="filterScheme">Scheme code</Label>
              <Input
                id="filterScheme"
                value={filterScheme}
                onChange={(e) => setFilterScheme(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="filterAmc">AMC code</Label>
              <Input
                id="filterAmc"
                value={filterAmc}
                onChange={(e) => setFilterAmc(e.target.value)}
                className="w-40"
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={includeExpired}
                onChange={(e) => setIncludeExpired(e.target.checked)}
              />
              Include expired
            </label>
          </div>

          {listQuery.isLoading && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="inline h-4 w-4 animate-spin" /> Loading…
            </p>
          )}

          {listQuery.error !== null && !listQuery.isLoading && (
            <p className="py-8 text-center text-sm text-red-300">
              {apiErrorMessage(listQuery.error, 'Could not load the recorded facts.')}
            </p>
          )}

          {listQuery.data?.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No facts match this filter.
            </p>
          )}

          {listQuery.data !== undefined && listQuery.data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Scheme</th>
                    <th className="py-2 pr-3">Fact</th>
                    <th className="py-2 pr-3">In force</th>
                    <th className="py-2 pr-3">Source</th>
                    <th className="py-2 pr-3">Entered by</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {listQuery.data.map((f: MfQualitativeFactAdmin) => (
                    <tr key={f.id} className="border-t border-border/60 align-top">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{f.schemeCode}</div>
                        {/* Null name = no MfSchemeMeta row. Said out loud, not
                            papered over with the code repeated. */}
                        <div className="text-muted-foreground">
                          {f.schemeName ?? 'No scheme master row — check the code'}
                        </div>
                        {f.amcName !== null && (
                          <div className="text-muted-foreground">{f.amcName}</div>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="font-mono text-[12px]">{f.factType}</div>
                        <div className="mt-1">
                          <ImpactChip impact={f.scoringImpact} />
                        </div>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {f.validFrom} → {f.validTo ?? 'still in force'}
                      </td>
                      <td className="max-w-[22rem] break-words py-2 pr-3 text-muted-foreground">
                        {f.source}
                      </td>
                      <td className="py-2 pr-3 font-mono text-[11px] text-muted-foreground">
                        {f.enteredBy}
                      </td>
                      <td className="py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            // Confirm because the delete is hard and immediate:
                            // it restores a score for every user the moment the
                            // next run reads the table.
                            if (
                              window.confirm(
                                `Delete the ${f.factType} fact on ${f.schemeCode}? Use "valid to" instead if the fact was real but has ended.`,
                              )
                            ) {
                              deleteMutation.mutate(f.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
