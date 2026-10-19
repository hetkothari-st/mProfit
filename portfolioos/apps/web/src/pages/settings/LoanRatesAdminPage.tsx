import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  MCLR_TENORS, MCLR_TENOR_LABELS, RATE_BASES, RATE_BASIS_LABELS, RATE_LOAN_TYPE_LABELS, formatDateOnly, formatDateTimeIST,
  isRateLoanType,
  type AdminLoanRateSourceWire, type AdminRateKeyWire, type LoanRateReadingWire, type ManualRateInputWire, type MclrTenor, type RateBasis,
} from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/api/client';
import { loanRatesAdminApi } from '@/api/loans/loanRates.api';
import { useAuthStore } from '@/stores/auth.store';
import { rateRange } from '@/pages/emi/liveRates';
import { useElementWidth } from '@/pages/emi/useElementWidth';
import { ConfirmDialog } from '@/pages/split/ConfirmDialog';

/** Below this container width the per-rate table becomes stacked cards (no sideways scroll at 375 px). */
const KEYS_TABLE_MIN_WIDTH = 720;

const QUERY_KEY = ['admin-loan-rates'];

function typeLabel(loanType: string): string {
  if (isRateLoanType(loanType)) return RATE_LOAN_TYPE_LABELS[loanType];
  return loanType === 'REPO' ? 'Repo rate' : loanType;
}

function readingText(r: LoanRateReadingWire | null): string {
  if (r === null) return '-';
  const wef = r.effectiveDate ? `, w.e.f. ${formatDateOnly(r.effectiveDate)}` : '';
  return `${rateRange(r)} (${RATE_BASIS_LABELS[r.basis]}${wef})`;
}

/**
 * Settings - Loan rates (spec s5.5). The server gate (ADMIN + a session signed in with a second factor) is
 * the control that matters; the role check here only avoids showing a page whose every request would fail.
 */
export function LoanRatesAdminPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'ADMIN';
  const qc = useQueryClient();
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: () => loanRatesAdminApi.list(), enabled: isAdmin });
  const [lender, setLender] = useState('All');
  const [confirm, setConfirm] = useState<{ kind: 'reject'; id: string } | { kind: 'clear'; sourceId: string; tenor: MclrTenor | null } | null>(null);
  const [editing, setEditing] = useState<{ sourceId: string; tenor: MclrTenor | null } | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: QUERY_KEY });
  const onError = (err: unknown) => toast.error(apiErrorMessage(err, "That didn't work"));
  const approve = useMutation({ mutationFn: (id: string) => loanRatesAdminApi.approve(id), onSuccess: () => { toast.success('Approved'); void refresh(); }, onError });
  const reject = useMutation({ mutationFn: (id: string) => loanRatesAdminApi.reject(id), onSuccess: () => { toast.success('Rejected'); void refresh(); }, onError });
  const clear = useMutation({
    mutationFn: (k: { sourceId: string; tenor: MclrTenor | null }) => loanRatesAdminApi.clearManual(k.sourceId, k.tenor),
    onSuccess: () => { toast.success('Override cleared'); void refresh(); },
    onError,
  });
  // Each Run now button tracks its own source ('*' = run all), so one slow page does not lock the others.
  const [runningIds, setRunningIds] = useState<ReadonlySet<string>>(new Set());
  const run = useMutation({
    mutationFn: (sourceId: string | undefined) => loanRatesAdminApi.run(sourceId),
    onMutate: (sourceId) => setRunningIds((s) => new Set(s).add(sourceId ?? '*')),
    onSuccess: (_d, sourceId) => { toast.success(sourceId ? 'Page read again' : 'Started - refresh in a minute'); void refresh(); },
    onError,
    onSettled: (_d, _e, sourceId) => setRunningIds((s) => {
      const next = new Set(s);
      next.delete(sourceId ?? '*');
      return next;
    }),
  });
  // Approve and Reject act on the same pending list: one at a time.
  const reviewBusy = approve.isPending || reject.isPending;

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <PageHeader title="Loan rates" />
        <Card><CardContent className="pt-6 text-sm">Admins only.</CardContent></Card>
      </div>
    );
  }

  const sources = query.data ?? [];
  const lenders = ['All', ...new Set(sources.map((s) => s.lender))];
  const suspects = sources.flatMap((s) => s.suspects.map((reading) => ({ source: s, reading })));
  const shown = sources.filter((s) => lender === 'All' || s.lender === lender);

  return (
    <div className="space-y-4 pb-24">
      <PageHeader
        title="Loan rates"
        description="Daily lender rates behind the EMI calculator's Live rates tab. A rate you set here wins over the bank page until you clear it."
        actions={
          <Button type="button" size="sm" variant="outline" disabled={runningIds.has('*')} onClick={() => run.mutate(undefined)}>
            <RefreshCw className="mr-1 h-4 w-4" />Run all now
          </Button>
        }
      />

      {query.isLoading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" /></div>}
      {query.isError && (
        <Card><CardContent data-testid="admin-error" className="pt-6 text-sm text-destructive">{apiErrorMessage(query.error, "Couldn't load loan rates")}</CardContent></Card>
      )}

      {suspects.length > 0 && (
        <Card data-testid="suspects">
          <CardHeader><CardTitle>Needs review ({suspects.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {suspects.map(({ source, reading }) => (
              <div key={reading.id} data-testid={`suspect-${reading.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
                <div>
                  <div className="font-medium">{source.lender} - {typeLabel(source.loanType)}{reading.tenor ? ` ${MCLR_TENOR_LABELS[reading.tenor]}` : ''}</div>
                  <div className="text-muted-foreground">{readingText(reading)} read {formatDateTimeIST(reading.fetchedAt)}{reading.note ? ` - ${reading.note}` : ''}</div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" disabled={reviewBusy} onClick={() => approve.mutate(reading.id)}>Approve</Button>
                  <Button type="button" size="sm" variant="outline" disabled={reviewBusy} onClick={() => setConfirm({ kind: 'reject', id: reading.id })}>Reject</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="w-full space-y-1 sm:w-64">
        <Label htmlFor="lr-lender">Lender</Label>
        <Select id="lr-lender" value={lender} onChange={(e) => setLender(e.target.value)}>
          {lenders.map((l) => <option key={l} value={l}>{l}</option>)}
        </Select>
      </div>

      {shown.map((source) => (
        <SourceCard
          key={source.id}
          source={source}
          editing={editing?.sourceId === source.id ? editing : null}
          onEdit={(tenor) => setEditing({ sourceId: source.id, tenor })}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); void refresh(); }}
          onClear={(tenor) => setConfirm({ kind: 'clear', sourceId: source.id, tenor })}
          onRun={() => run.mutate(source.id)}
          running={runningIds.has(source.id)}
        />
      ))}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => { if (!o) setConfirm(null); }}
        title={confirm?.kind === 'reject' ? 'Reject this reading?' : 'Clear this override?'}
        description={confirm?.kind === 'reject'
          ? 'It will not be shown to users.'
          : 'Users will see the bank page figure again.'}
        confirmLabel={confirm?.kind === 'reject' ? 'Reject' : 'Clear override'}
        destructive
        onConfirm={() => {
          if (confirm?.kind === 'reject') reject.mutate(confirm.id);
          else if (confirm?.kind === 'clear') clear.mutate({ sourceId: confirm.sourceId, tenor: confirm.tenor });
        }}
      />
    </div>
  );
}

function SourceCard(props: {
  source: AdminLoanRateSourceWire;
  editing: { tenor: MclrTenor | null } | null;
  onEdit: (tenor: MclrTenor | null) => void;
  onCancel: () => void;
  onSaved: () => void;
  onClear: (tenor: MclrTenor | null) => void;
  onRun: () => void;
  running: boolean;
}) {
  const { source } = props;
  const isMclr = source.loanType === 'MCLR';
  const [boxRef, boxWidth] = useElementWidth<HTMLDivElement>();
  const wide = boxWidth >= KEYS_TABLE_MIN_WIDTH;
  return (
    <Card data-testid={`source-${source.id}`}>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{source.lender} - {typeLabel(source.loanType)}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{source.mode}</Badge>
            {source.stale && <Badge variant="destructive">Stale</Badge>}
            {source.mode === 'AUTO' && (
              <Button type="button" size="sm" variant="outline" disabled={props.running} onClick={props.onRun}>Run now</Button>
            )}
            <Button type="button" size="sm" onClick={() => props.onEdit(isMclr ? '1Y' : null)}>Set rate</Button>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Last success: {source.lastSuccessAt ? formatDateTimeIST(source.lastSuccessAt) : 'never'}
          {source.lastError && <> - last error {source.lastErrorAt ? formatDateTimeIST(source.lastErrorAt) : ''}: {source.lastError}</>}
        </div>
        <a href={source.url} target="_blank" rel="noopener noreferrer" className="break-all text-xs underline underline-offset-2">{source.url}</a>
      </CardHeader>
      <CardContent className="space-y-3">
        {source.keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rate yet.</p>
        ) : (
          <div ref={boxRef}>
            {wide ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  {isMclr && <th className="py-1 pr-3 font-medium">Tenor</th>}
                  <th className="py-1 pr-3 font-medium">Shown to users</th>
                  <th className="py-1 pr-3 font-medium">Bank page</th>
                  <th className="py-1 pr-3 font-medium">Your override</th>
                  <th className="py-1 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {source.keys.map((k: AdminRateKeyWire) => (
                  <tr key={k.tenor ?? '-'} data-testid={`key-${source.id}-${k.tenor ?? 'none'}`} className="border-b last:border-0">
                    {isMclr && <td className="py-1 pr-3">{k.tenor ? MCLR_TENOR_LABELS[k.tenor] : '-'}</td>}
                    <td className="py-1 pr-3">{readingText(k.effective)}</td>
                    <td className="py-1 pr-3">{readingText(k.latestAuto)}</td>
                    <td className={`py-1 pr-3 ${k.differs ? 'font-medium text-amber-600 dark:text-amber-400' : ''}`}>
                      {readingText(k.manual)}
                      {k.differs && <div className="text-xs">Differs from the bank page</div>}
                    </td>
                    <td className="py-1 text-right">
                      {k.manual && <Button type="button" size="sm" variant="ghost" onClick={() => props.onClear(k.tenor)}>Clear override</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            ) : (
              <ul className="space-y-2">
                {source.keys.map((k: AdminRateKeyWire) => (
                  <li key={k.tenor ?? '-'} data-testid={`key-${source.id}-${k.tenor ?? 'none'}`} className="space-y-1 rounded-md border p-3 text-sm">
                    {isMclr && <div className="font-medium">{k.tenor ? MCLR_TENOR_LABELS[k.tenor] : '-'}</div>}
                    <div><span className="text-xs text-muted-foreground">Shown to users: </span>{readingText(k.effective)}</div>
                    <div><span className="text-xs text-muted-foreground">Bank page: </span>{readingText(k.latestAuto)}</div>
                    <div className={k.differs ? 'font-medium text-amber-600 dark:text-amber-400' : ''}>
                      <span className="text-xs text-muted-foreground">Your override: </span>{readingText(k.manual)}
                      {k.differs && <div className="text-xs">Differs from the bank page</div>}
                    </div>
                    {k.manual && <Button type="button" size="sm" variant="ghost" onClick={() => props.onClear(k.tenor)}>Clear override</Button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {props.editing && (
          <ManualRateForm
            source={source}
            initialTenor={props.editing.tenor}
            initialBasis={source.keys[0]?.effective?.basis ?? (isMclr ? 'MCLR' : 'OTHER')}
            onCancel={props.onCancel}
            onSaved={props.onSaved}
          />
        )}
      </CardContent>
    </Card>
  );
}

function ManualRateForm(props: {
  source: AdminLoanRateSourceWire;
  initialTenor: MclrTenor | null;
  initialBasis: RateBasis;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const isMclr = props.source.loanType === 'MCLR';
  const [basis, setBasis] = useState<RateBasis>(props.initialBasis);
  const [tenor, setTenor] = useState<MclrTenor>(props.initialTenor ?? '1Y');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [wef, setWef] = useState('');
  const [note, setNote] = useState('');
  const save = useMutation({
    mutationFn: (input: ManualRateInputWire) => loanRatesAdminApi.setManual(props.source.id, input),
    onSuccess: () => { toast.success('Rate saved'); props.onSaved(); },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, "Couldn't save the rate")),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate({
      basis,
      tenor: isMclr ? tenor : null,
      minRatePct: min.trim(),
      maxRatePct: max.trim() === '' ? null : max.trim(),
      effectiveDate: wef === '' ? null : wef,
      note: note.trim(),
    });
  }

  const id = (name: string) => `lr-${props.source.id}-${name}`;
  return (
    <form onSubmit={submit} data-testid={`manual-form-${props.source.id}`} className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Label htmlFor={id('basis')}>Basis</Label>
        <Select id={id('basis')} value={basis} onChange={(e) => setBasis(e.target.value as RateBasis)}>
          {RATE_BASES.map((b) => <option key={b} value={b}>{RATE_BASIS_LABELS[b]}</option>)}
        </Select>
      </div>
      {isMclr && (
        <div className="space-y-1">
          <Label htmlFor={id('tenor')}>Tenor</Label>
          <Select id={id('tenor')} value={tenor} onChange={(e) => setTenor(e.target.value as MclrTenor)}>
            {MCLR_TENORS.map((t) => <option key={t} value={t}>{MCLR_TENOR_LABELS[t]}</option>)}
          </Select>
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor={id('min')}>From (% p.a.)</Label>
        <Input id={id('min')} inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor={id('max')}>To (% p.a., optional)</Label>
        <Input id={id('max')} inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={id('wef')}>With effect from (optional)</Label>
        <Input id={id('wef')} type="date" value={wef} onChange={(e) => setWef(e.target.value)} />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={id('note')}>Note (where this rate comes from)</Label>
        <Textarea id={id('note')} value={note} onChange={(e) => setNote(e.target.value)} required minLength={3} maxLength={500} />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={save.isPending}>Save rate</Button>
        <Button type="button" size="sm" variant="ghost" onClick={props.onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
