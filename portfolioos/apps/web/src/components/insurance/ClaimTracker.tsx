/**
 * One claim, tracked: where it stands and what to do next (worked out by the
 * server from IRDAI's time limits), its milestones, the document checklist,
 * a log of every call and letter, and the escalation route when it stalls.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ChevronDown, Loader2, Pencil, Trash2 } from 'lucide-react';
import { CLAIM_GUIDES, formatINR, type ClaimGuide } from '@portfolioos/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage } from '@/api/client';
import { insuranceApi, type InsuranceClaimDTO, type UpdateClaimInput } from '@/api/insurance.api';
import { TONE_TEXT, formatDay, type Tone } from '@/lib/insurance';
import { ClaimGuideView } from './ClaimGuideView';
import { EscalationPanel } from './EscalationPanel';

const MONEY = /^\d+(\.\d+)?$/;
const SELECT = 'mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
const today = () => new Date().toISOString().slice(0, 10);
const day = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');

const STATUS_LABELS: Record<InsuranceClaimDTO['status'], string> = {
  SUBMITTED: 'Reported',
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SETTLED: 'Settled',
};

type MilestoneState = 'done' | 'due' | 'late' | 'todo';

interface Milestone {
  label: string;
  on: string | null;
  detail: string | null;
  state: MilestoneState;
}

const MARKER: Record<MilestoneState, string> = {
  done: 'bg-positive border-positive',
  due: 'bg-background border-amber-500',
  late: 'bg-negative border-negative',
  todo: 'bg-background border-muted-foreground/40',
};

function milestones(c: InsuranceClaimDTO, guide: ClaimGuide | null): Milestone[] {
  const p = c.progress;
  const out: Milestone[] = [
    { label: 'Claim reported', on: c.claimDate, detail: c.claimNumber ? `Claim no. ${c.claimNumber}` : null, state: 'done' },
  ];
  if (guide?.clock?.from === 'DOCUMENTS' || c.documentsCompletedOn) {
    out.push({
      label: 'Every document submitted',
      on: c.documentsCompletedOn,
      detail: null,
      state: c.documentsCompletedOn ? 'done' : 'todo',
    });
  }
  if (guide?.clock?.from === 'SURVEYOR' || c.surveyorAllocatedOn) {
    out.push({
      label: 'Surveyor appointed',
      on: c.surveyorAllocatedOn,
      detail: null,
      state: c.surveyorAllocatedOn ? 'done' : 'todo',
    });
  }

  const decided = c.status === 'SETTLED' || c.status === 'REJECTED';
  const shortPaid = p.stage === 'SHORT_PAID' || (p.stage !== 'SETTLED' && c.status === 'SETTLED');
  out.push({
    label: decided
      ? c.status === 'REJECTED'
        ? 'Rejected'
        : shortPaid
          ? 'Paid in part'
          : 'Paid'
      : c.status === 'APPROVED'
        ? 'Approved — payment pending'
        : 'Decision',
    on: decided ? c.settledOn : null,
    detail: decided
      ? c.status === 'REJECTED'
        ? c.rejectionReason
        : c.settledAmount
          ? `${formatINR(c.settledAmount, { fractionDigits: 0 })} of ${formatINR(c.claimedAmount, { fractionDigits: 0 })}`
          : null
      : p.latestDueOn
        ? `Due by ${formatDay(p.decisionDueOn)}${p.latestDueOn !== p.decisionDueOn ? ` (${formatDay(p.latestDueOn)} if investigated)` : ''}`
        : null,
    state: decided ? (c.status === 'REJECTED' || shortPaid ? 'late' : 'done') : p.overdueDays ? 'late' : 'due',
  });

  if (c.grievanceFiledOn || p.next.action === 'FILE_GRIEVANCE') {
    out.push({
      label: 'Complaint to the insurer',
      on: c.grievanceFiledOn,
      detail: c.grievanceRef ? `Ref. ${c.grievanceRef}` : null,
      state: c.grievanceFiledOn ? 'done' : 'todo',
    });
  }
  if (c.ombudsmanFiledOn || p.next.action === 'GO_TO_OMBUDSMAN') {
    out.push({
      label: 'Insurance Ombudsman',
      on: c.ombudsmanFiledOn,
      detail: c.ombudsmanRef ? `Ref. ${c.ombudsmanRef}` : null,
      state: c.ombudsmanFiledOn ? 'done' : 'todo',
    });
  }
  return out;
}

interface FormState {
  status: InsuranceClaimDTO['status'];
  claimNumber: string;
  settledAmount: string;
  settledOn: string;
  documentsCompletedOn: string;
  surveyorAllocatedOn: string;
  rejectionReason: string;
  grievanceFiledOn: string;
  grievanceRef: string;
  ombudsmanFiledOn: string;
  ombudsmanRef: string;
}

function formFrom(c: InsuranceClaimDTO): FormState {
  return {
    status: c.status,
    claimNumber: c.claimNumber ?? '',
    settledAmount: c.settledAmount ?? '',
    settledOn: day(c.settledOn),
    documentsCompletedOn: day(c.documentsCompletedOn),
    surveyorAllocatedOn: day(c.surveyorAllocatedOn),
    rejectionReason: c.rejectionReason ?? '',
    grievanceFiledOn: day(c.grievanceFiledOn),
    grievanceRef: c.grievanceRef ?? '',
    ombudsmanFiledOn: day(c.ombudsmanFiledOn),
    ombudsmanRef: c.ombudsmanRef ?? '',
  };
}

function UpdateClaimDialog({
  claim,
  guide,
  open,
  onOpenChange,
  onSave,
  saving,
  error,
}: {
  claim: InsuranceClaimDTO;
  guide: ClaimGuide | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (input: UpdateClaimInput) => void;
  saving: boolean;
  error: unknown;
}) {
  const [form, setForm] = useState<FormState>(() => formFrom(claim));
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(formFrom(claim));
      setProblem(null);
    }
  }, [open, claim]);

  const field = (key: keyof FormState, type = 'text') => ({
    id: `claim-${claim.id}-${key}`,
    type,
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  function save() {
    if (form.settledAmount.trim() && !MONEY.test(form.settledAmount.trim())) {
      return setProblem('Enter the amount paid, like 85000');
    }
    setProblem(null);
    const orNull = (v: string) => v.trim() || null;
    onSave({
      status: form.status,
      claimNumber: orNull(form.claimNumber),
      settledAmount: orNull(form.settledAmount),
      settledOn: orNull(form.settledOn),
      documentsCompletedOn: orNull(form.documentsCompletedOn),
      surveyorAllocatedOn: orNull(form.surveyorAllocatedOn),
      rejectionReason: orNull(form.rejectionReason),
      grievanceFiledOn: orNull(form.grievanceFiledOn),
      grievanceRef: orNull(form.grievanceRef),
      ombudsmanFiledOn: orNull(form.ombudsmanFiledOn),
      ombudsmanRef: orNull(form.ombudsmanRef),
    });
  }

  const showSurveyor = guide?.clock?.from === 'SURVEYOR' || Boolean(claim.surveyorAllocatedOn);
  const id = (key: keyof FormState) => `claim-${claim.id}-${key}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Update claim</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={id('status')}>Status</Label>
              <select
                id={id('status')}
                className={SELECT}
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as FormState['status'] }))}
              >
                {Object.entries(STATUS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor={id('claimNumber')}>Claim number</Label>
              <Input {...field('claimNumber')} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={id('documentsCompletedOn')}>Every document submitted on</Label>
              <Input {...field('documentsCompletedOn', 'date')} />
            </div>
            {showSurveyor && (
              <div>
                <Label htmlFor={id('surveyorAllocatedOn')}>Surveyor appointed on</Label>
                <Input {...field('surveyorAllocatedOn', 'date')} />
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={id('settledAmount')}>Amount paid (₹)</Label>
              <Input inputMode="decimal" {...field('settledAmount')} />
            </div>
            <div>
              <Label htmlFor={id('settledOn')}>Paid / decided on</Label>
              <Input {...field('settledOn', 'date')} />
            </div>
          </div>

          {(form.status === 'REJECTED' || form.rejectionReason) && (
            <div>
              <Label htmlFor={id('rejectionReason')}>Reason given</Label>
              <Input placeholder="As the insurer's letter puts it" {...field('rejectionReason')} />
            </div>
          )}

          <fieldset className="space-y-3 rounded-lg border p-3">
            <legend className="px-1 text-xs text-muted-foreground">If you escalate</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor={id('grievanceFiledOn')}>Complaint to insurer on</Label>
                <Input {...field('grievanceFiledOn', 'date')} />
              </div>
              <div>
                <Label htmlFor={id('grievanceRef')}>Complaint reference</Label>
                <Input {...field('grievanceRef')} />
              </div>
              <div>
                <Label htmlFor={id('ombudsmanFiledOn')}>Filed with Ombudsman on</Label>
                <Input {...field('ombudsmanFiledOn', 'date')} />
              </div>
              <div>
                <Label htmlFor={id('ombudsmanRef')}>Ombudsman reference</Label>
                <Input {...field('ombudsmanRef')} />
              </div>
            </div>
          </fieldset>
        </div>
        {(problem !== null || error != null) && (
          <p className="text-sm text-negative">{problem ?? apiErrorMessage(error, 'Could not update the claim')}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ClaimTracker({ claim, insurer }: { claim: InsuranceClaimDTO; insurer?: string }) {
  const qc = useQueryClient();
  const guide = claim.kind ? CLAIM_GUIDES[claim.kind] : null;
  const [editOpen, setEditOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [noteOn, setNoteOn] = useState(today);
  const [note, setNote] = useState('');
  const p = claim.progress;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['insurance-policy', claim.policyId] });
    qc.invalidateQueries({ queryKey: ['insurance-policies'] });
  };

  const update = useMutation({
    mutationFn: (input: UpdateClaimInput) => insuranceApi.updateClaim(claim.id, input),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => insuranceApi.removeClaim(claim.id),
    onSuccess: () => {
      refresh();
      toast.success('Claim removed');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not remove the claim')),
  });

  const saveQuick = (input: UpdateClaimInput, done?: () => void) =>
    update.mutate(input, {
      onSuccess: done,
      onError: (err) => toast.error(apiErrorMessage(err, 'Could not save')),
    });

  const tone: Tone =
    p.next.action === 'NONE'
      ? p.stage === 'SETTLED'
        ? 'ok'
        : 'neutral'
      : p.next.action === 'WAIT'
        ? 'neutral'
        : 'warn';
  const escalating =
    p.next.action === 'FILE_GRIEVANCE' ||
    p.next.action === 'GO_TO_OMBUDSMAN' ||
    p.stage === 'COMPLAINT_FILED';
  const log = [...(claim.timeline ?? [])].sort((a, b) => b.on.localeCompare(a.on));

  return (
    <article className="space-y-4 rounded-xl border p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg leading-tight">{claim.claimType}</h3>
          <p className="text-xs text-muted-foreground">
            {formatINR(claim.claimedAmount, { fractionDigits: 0 })} claimed · reported {formatDay(claim.claimDate)} ·{' '}
            {STATUS_LABELS[claim.status]}
          </p>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" /> Update
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-negative"
            aria-label={`Remove the ${claim.claimType} claim`}
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm('Remove this claim and its notes?')) remove.mutate();
            }}
          >
            {remove.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </header>

      <div
        className={`rounded-lg px-3 py-2.5 text-sm ${
          tone === 'warn' ? 'bg-amber-500/10' : tone === 'ok' ? 'bg-positive/10' : 'bg-muted/40'
        }`}
      >
        <p className={`font-medium ${TONE_TEXT[tone]}`}>
          {p.next.action === 'FILE_GRIEVANCE'
            ? 'Next: raise a complaint'
            : p.next.action === 'GO_TO_OMBUDSMAN'
              ? 'Next: the Insurance Ombudsman'
              : p.next.action === 'WAIT'
                ? p.next.dueOn
                  ? `Waiting — until ${formatDay(p.next.dueOn)}`
                  : 'Waiting on the insurer'
                : p.stage === 'SETTLED'
                  ? 'Settled'
                  : 'Nothing to do'}
        </p>
        <p className="text-muted-foreground">{p.next.reason}</p>
      </div>

      <ol className="space-y-2.5">
        {milestones(claim, guide).map((m) => (
          <li key={m.label} className="flex gap-3">
            <span aria-hidden className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 ${MARKER[m.state]}`} />
            <div className="min-w-0 text-sm">
              <p>
                {m.label}
                {m.on && <span className="ml-2 text-xs tabular-nums text-muted-foreground">{formatDay(m.on)}</span>}
              </p>
              {m.detail && <p className="text-xs text-muted-foreground">{m.detail}</p>}
            </div>
          </li>
        ))}
      </ol>

      {escalating && (
        <EscalationPanel current={p.next.action === 'GO_TO_OMBUDSMAN' ? 'OMBUDSMAN' : 'GRIEVANCE'} insurer={insurer} />
      )}

      {guide && (
        <div className="space-y-3 border-t pt-3">
          <ClaimGuideView
            guide={guide}
            checklist={claim.checklist}
            busy={update.isPending}
            onToggleDoc={(id, done) => saveQuick({ checklist: { ...(claim.checklist ?? {}), [id]: done } })}
            show={['documents']}
          />
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            aria-expanded={showGuide}
            onClick={() => setShowGuide((v) => !v)}
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showGuide ? 'rotate-180' : ''}`} />
            {showGuide ? 'Hide' : 'Show'} the steps and your rights
          </button>
          {showGuide && <ClaimGuideView guide={guide} show={['steps', 'rights']} />}
        </div>
      )}

      <section className="space-y-2 border-t pt-3">
        <h4 className="text-sm font-medium">Notes</h4>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!note.trim()) return;
            saveQuick({ timeline: [...(claim.timeline ?? []), { on: noteOn, note: note.trim() }] }, () => setNote(''));
          }}
        >
          <Input
            type="date"
            aria-label="Date of note"
            className="w-auto"
            value={noteOn}
            onChange={(e) => setNoteOn(e.target.value)}
          />
          <Input
            aria-label="Note"
            className="min-w-[12rem] flex-1"
            placeholder="Called the TPA — they asked for the pharmacy bills"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button type="submit" size="sm" variant="outline" disabled={update.isPending || !note.trim()}>
            Add note
          </Button>
        </form>
        {log.length > 0 && (
          <ul className="space-y-1.5">
            {log.map((e, i) => (
              <li key={`${e.on}-${i}`} className="grid grid-cols-[6.5rem_1fr] gap-2 text-sm">
                <span className="text-xs tabular-nums text-muted-foreground">{formatDay(e.on)}</span>
                <span className="min-w-0 break-words">{e.note}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <UpdateClaimDialog
        claim={claim}
        guide={guide}
        open={editOpen}
        onOpenChange={setEditOpen}
        saving={update.isPending}
        error={update.error}
        onSave={(input) => update.mutate(input, { onSuccess: () => {
          toast.success('Claim updated');
          setEditOpen(false);
        } })}
      />
    </article>
  );
}
