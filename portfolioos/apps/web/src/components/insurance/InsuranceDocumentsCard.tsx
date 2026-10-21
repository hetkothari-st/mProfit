import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, FileText, Lock, Plus, X } from 'lucide-react';
import { formatINR } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { apiErrorMessage } from '@/api/client';
import { insuranceApi, type InsuranceDocumentDTO } from '@/api/insurance/insurance.api';
import { POLICY_TYPE_LABELS } from '@/lib/insurance';
import { PolicyFormDialog } from './PolicyFormDialog';

const KIND_LABELS: Record<string, string> = {
  POLICY_DOCUMENT: 'Policy document',
  PREMIUM_RECEIPT: 'Premium receipt',
  RENEWAL_NOTICE: 'Renewal notice',
  CLAIM_LETTER: 'Claim letter',
  OTHER: 'Insurance document',
};

const DESCRIBES_POLICY = new Set(['POLICY_DOCUMENT', 'RENEWAL_NOTICE']);

function received(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

function title(d: InsuranceDocumentDTO): string {
  const x = d.extract;
  const name = [x?.insurer, x?.plan_name ?? (x?.policy_type ? POLICY_TYPE_LABELS[x.policy_type] : null)]
    .filter(Boolean)
    .join(' — ');
  return name || d.fileName;
}

function subtitle(d: InsuranceDocumentDTO): string {
  return [
    d.docKind ? KIND_LABELS[d.docKind] : null,
    d.policyNumberLast4 ? `policy ending ${d.policyNumberLast4}` : null,
    received(d.receivedAt),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** "starhealth.in" from "policy@starhealth.in" — insurers lock all their PDFs alike. */
function senderOf(d: InsuranceDocumentDTO): string {
  return d.fromAddress?.split('@').pop()?.toLowerCase() ?? 'an unknown sender';
}

/**
 * Locked PDFs from one sender, unlocked with one password. Remembered by
 * default (encrypted), so later PDFs from the insurer open without asking.
 */
function LockedGroup({ sender, docs }: { sender: string; docs: InsuranceDocumentDTO[] }) {
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const unlock = useMutation({
    mutationFn: () => insuranceApi.unlockDocument(docs[0]!.id, password, remember),
    onSuccess: (r) => {
      toast.success(r.unlocked === 1 ? 'Opened 1 PDF' : `Opened ${r.unlocked} PDFs`);
      setPassword('');
      void qc.invalidateQueries({ queryKey: ['insurance-documents'] });
      void qc.invalidateQueries({ queryKey: ['insurance-policies'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not open the PDF')),
  });
  const id = `unlock-${sender}`;

  return (
    <li className="rounded-md border p-3 text-sm">
      <div className="flex items-start gap-2">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="font-medium">
            {docs.length === 1 ? '1 locked PDF' : `${docs.length} locked PDFs`} from {sender}
          </label>
          <p className="text-muted-foreground">
            The email from the insurer usually says what the password is, such as your date of birth or policy
            number.
          </p>
          <form
            className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center"
            onSubmit={(e) => {
              e.preventDefault();
              if (password) unlock.mutate();
            }}
          >
            <Input
              id={id}
              type="password"
              autoComplete="off"
              placeholder="PDF password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="sm:max-w-xs"
            />
            <Button type="submit" size="sm" disabled={!password || unlock.isPending}>
              {unlock.isPending ? 'Opening…' : 'Open'}
            </Button>
          </form>
          <label className="mt-2 flex items-center gap-2 text-muted-foreground">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember it (encrypted) for future PDFs
          </label>
        </div>
      </div>
    </li>
  );
}

/**
 * What the Gmail search found and what became of it: policies to add (the
 * user checks the figures first), readings that did not match the document,
 * and — folded away — everything already linked or waiting.
 */
export function InsuranceDocumentsCard() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState<InsuranceDocumentDTO | null>(null);
  const q = useQuery({ queryKey: ['insurance-documents'], queryFn: () => insuranceApi.listDocuments() });

  const answer = useMutation({
    mutationFn: ({ id, apply }: { id: string; apply: boolean }) => insuranceApi.answerRenewal(id, apply),
    onSuccess: (_r, v) => {
      toast.success(v.apply ? 'Policy updated from the renewal notice' : 'Renewal notice ignored');
      void qc.invalidateQueries({ queryKey: ['insurance-documents'] });
      void qc.invalidateQueries({ queryKey: ['insurance-policies'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not answer the renewal notice')),
  });

  const dismiss = useMutation({
    mutationFn: (id: string) => insuranceApi.dismissDocument(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['insurance-documents'] }),
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not dismiss the document')),
  });

  const docs = q.data ?? [];
  if (docs.length === 0) return null;

  const suggested = docs.filter((d) => d.status === 'SUGGESTED');
  const renewals = docs.filter((d) => d.renewal && d.renewal.length > 0);
  const review = docs.filter((d) => d.status === 'NEEDS_REVIEW');
  const locked = new Map<string, InsuranceDocumentDTO[]>();
  for (const d of docs.filter((x) => x.status === 'NEEDS_PASSWORD')) {
    locked.set(senderOf(d), [...(locked.get(senderOf(d)) ?? []), d]);
  }
  const rest = docs.filter((d) => !['SUGGESTED', 'NEEDS_REVIEW', 'NEEDS_PASSWORD'].includes(d.status));

  return (
    <Card className="mb-4">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div className="min-w-0">
            <div className="font-medium">Insurance documents from Gmail</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Premium receipts and claim letters are recorded on the matching policy. A policy that isn't here yet is
              suggested below — check it, then add it.
            </p>
          </div>
        </div>

        {suggested.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-medium">Policies found ({suggested.length})</h3>
            <ul className="space-y-2">
              {suggested.map((d) => (
                <li key={d.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="truncate font-medium">{title(d)}</div>
                    <div className="text-muted-foreground">
                      {[
                        d.extract?.policy_holder,
                        d.extract?.sum_assured ? `cover ${formatINR(d.extract.sum_assured, { compact: true })}` : null,
                        subtitle(d),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" onClick={() => setAdding(d)}>
                      <Plus className="h-4 w-4" /> Review and add
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={dismiss.isPending}
                      onClick={() => dismiss.mutate(d.id)}
                    >
                      Not mine
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {renewals.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-medium">Renewals to confirm ({renewals.length})</h3>
            <ul className="space-y-2">
              {renewals.map((d) => (
                <li key={d.id} className="rounded-md border p-3 text-sm">
                  <div className="truncate font-medium">
                    {d.policyId ? (
                      <Link to={`/insurance/${d.policyId}`} className="hover:underline">
                        {title(d)}
                      </Link>
                    ) : (
                      title(d)
                    )}
                  </div>
                  <div className="text-muted-foreground">{subtitle(d)}</div>
                  <ul className="mt-2 space-y-0.5">
                    {d.renewal!.map((c) => (
                      <li key={c.field}>
                        {c.label}: {c.from ? <span className="text-muted-foreground line-through">{c.from}</span> : null}{' '}
                        <span className="font-medium">{c.to}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" disabled={answer.isPending} onClick={() => answer.mutate({ id: d.id, apply: true })}>
                      Update the policy
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={answer.isPending}
                      onClick={() => answer.mutate({ id: d.id, apply: false })}
                    >
                      Ignore
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {locked.size > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-medium">Password protected</h3>
            <ul className="space-y-2">
              {[...locked].map(([sender, group]) => (
                <LockedGroup key={sender} sender={sender} docs={group} />
              ))}
            </ul>
          </section>
        )}

        {review.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-medium">Needs your check ({review.length})</h3>
            <ul className="space-y-2">
              {review.map((d) => (
                <li key={d.id} className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{title(d)}</div>
                      <div className="text-muted-foreground">{subtitle(d)}</div>
                      <p className="mt-1">
                        Not recorded: the reading did not match the document ({d.problems.join('; ')}).
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2 sm:pl-6">
                    {d.docKind && DESCRIBES_POLICY.has(d.docKind) && d.policyNumberLast4 && (
                      <Button size="sm" variant="outline" onClick={() => setAdding(d)}>
                        Add the policy myself
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={dismiss.isPending}
                      onClick={() => dismiss.mutate(d.id)}
                    >
                      <X className="h-4 w-4" /> Dismiss
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {rest.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">All documents ({rest.length})</summary>
            <ul className="mt-2 divide-y text-sm">
              {rest.map((d) => (
                <li key={d.id} className="flex items-start gap-2 py-2">
                  {d.status === 'NEEDS_PASSWORD' ? (
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate">
                      {d.policyId ? (
                        <Link to={`/insurance/${d.policyId}`} className="font-medium hover:underline">
                          {title(d)}
                        </Link>
                      ) : (
                        <span className="font-medium">{title(d)}</span>
                      )}
                    </div>
                    <div className="text-muted-foreground">{subtitle(d)}</div>
                    <div className="text-muted-foreground">
                      {d.note ??
                        d.errorMessage ??
                        (d.status === 'PENDING' ? 'Not read yet.' : null)}
                    </div>
                    {d.status === 'FILED' && (
                      <Link to="/documents" className="text-accent hover:underline">
                        Filed in Documents under the policy holder
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>

      <PolicyFormDialog open={adding !== null} onOpenChange={(v) => !v && setAdding(null)} fromDocument={adding} />
    </Card>
  );
}
