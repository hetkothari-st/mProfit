import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Phone } from 'lucide-react';
import { CLAIM_GUIDES, guidesForPolicyType, type ClaimKind } from '@portfolioos/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage } from '@/api/client';
import { insuranceApi, type InsurancePolicyDTO } from '@/api/insurance.api';
import { insurerContactFor, telHref } from '@/lib/insurerContacts';
import { ClaimGuideView } from './ClaimGuideView';

const MONEY = /^\d+(\.\d+)?$/;
const today = () => new Date().toISOString().slice(0, 10);

type Choice = ClaimKind | 'OTHER';

/**
 * Start a claim: pick what happened, read what to do and what to gather, then
 * start tracking it (the insurer still has to be told — this says how).
 */
export function StartClaimDialog({
  policy,
  open,
  onOpenChange,
  initialKind,
}: {
  policy: InsurancePolicyDTO;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialKind?: ClaimKind | null;
}) {
  const qc = useQueryClient();
  const guides = guidesForPolicyType(policy.type);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [form, setForm] = useState({ claimDate: today(), claimType: '', claimedAmount: '', claimNumber: '' });
  const [problem, setProblem] = useState<string | null>(null);
  const guide = choice && choice !== 'OTHER' ? CLAIM_GUIDES[choice] : null;

  function choose(c: Choice | null) {
    setChoice(c);
    setForm((f) => ({ ...f, claimType: c && c !== 'OTHER' ? CLAIM_GUIDES[c].title : '' }));
  }

  useEffect(() => {
    if (!open) return;
    setForm({ claimDate: today(), claimType: '', claimedAmount: '', claimNumber: '' });
    setProblem(null);
    choose(initialKind ?? (guides.length === 1 ? guides[0]!.kind : null));
    // `guides` is derived from policy.type; re-run only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialKind, policy.type]);

  const create = useMutation({
    mutationFn: () =>
      insuranceApi.addClaim(policy.id, {
        kind: guide ? guide.kind : null,
        claimDate: form.claimDate,
        claimType: form.claimType.trim(),
        claimedAmount: form.claimedAmount.trim(),
        claimNumber: form.claimNumber.trim() || null,
        status: 'SUBMITTED',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insurance-policy', policy.id] });
      qc.invalidateQueries({ queryKey: ['insurance-policies'] });
      toast.success('Claim started — track it under Claims');
      onOpenChange(false);
    },
  });

  function start() {
    if (!form.claimDate) return setProblem('Add the date you reported the claim');
    if (!form.claimType.trim()) return setProblem('Say what the claim is for');
    if (!MONEY.test(form.claimedAmount.trim())) return setProblem('Enter the amount you’re claiming, like 85000');
    setProblem(null);
    create.mutate();
  }

  // The user's own note first; otherwise the insurer's verified customer-care line.
  const helpline = policy.contacts?.helpline ?? insurerContactFor(policy.insurer)?.phones[0] ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{guide ? guide.title : choice === 'OTHER' ? 'Start a claim' : 'What happened?'}</DialogTitle>
        </DialogHeader>

        {choice === null ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {guides.map((g) => (
              <button
                key={g.kind}
                type="button"
                onClick={() => choose(g.kind)}
                className="rounded-lg border p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <p className="text-sm font-medium">{g.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{g.summary}</p>
              </button>
            ))}
            <button
              type="button"
              onClick={() => choose('OTHER')}
              className="rounded-lg border border-dashed p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <p className="text-sm font-medium">Something else</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Track any other claim on this policy.</p>
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {guides.length > 1 || choice === 'OTHER' ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => choose(null)}
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Choose a different kind of claim
              </button>
            ) : null}

            <div className="flex gap-3 rounded-lg border bg-muted/20 p-3 text-sm">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p>
                <span className="font-medium">First, tell {policy.insurer}.</span>{' '}
                {helpline ? (
                  <>
                    Call{' '}
                    <a href={telHref(helpline)} className="text-accent hover:underline">
                      {helpline}
                    </a>{' '}
                    and note the claim number.
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    Its number is on your policy document — save it under “Who to call” so it’s here next time.
                  </span>
                )}
              </p>
            </div>

            {guide && <ClaimGuideView guide={guide} />}

            <div className="space-y-3 border-t pt-4">
              <p className="text-sm font-medium">Track it here</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="start-claim-date">Reported to the insurer on</Label>
                  <Input
                    id="start-claim-date"
                    type="date"
                    value={form.claimDate}
                    onChange={(e) => setForm((f) => ({ ...f, claimDate: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="start-claim-number">Claim number</Label>
                  <Input
                    id="start-claim-number"
                    placeholder="If you have one yet"
                    value={form.claimNumber}
                    onChange={(e) => setForm((f) => ({ ...f, claimNumber: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="start-claim-type">What for</Label>
                  <Input
                    id="start-claim-type"
                    value={form.claimType}
                    onChange={(e) => setForm((f) => ({ ...f, claimType: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="start-claim-amount">Amount claimed (₹)</Label>
                  <Input
                    id="start-claim-amount"
                    inputMode="decimal"
                    placeholder="85000"
                    value={form.claimedAmount}
                    onChange={(e) => setForm((f) => ({ ...f, claimedAmount: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {(problem || create.isError) && (
          <p className="text-sm text-negative">{problem ?? apiErrorMessage(create.error, 'Could not start the claim')}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {choice !== null && (
            <Button onClick={start} disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Start tracking'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
