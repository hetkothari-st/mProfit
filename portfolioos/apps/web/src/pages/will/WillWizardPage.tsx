import { useMemo, useRef } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { istCalendarDate, runWillRules } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useElementWidth } from '@/pages/emi/useElementWidth';
import { WillGate } from './WillGuards';
import { WillStepper } from './WillStepper';
import { stepBySlug, willStepPath } from './willSteps';
import { useWillDraft } from './useWillDraft';
import { WILL_STEP_COMPONENTS } from './steps/registry';

export function WillWizardPage() {
  return (
    <div className="space-y-4 pb-24">
      <WillGate>
        <WizardBody />
      </WillGate>
    </div>
  );
}

function WizardBody() {
  const { id = '', step = 'details' } = useParams();
  const navigate = useNavigate();
  const meta = stepBySlug(step);
  const draft = useWillDraft(id);
  const failedLeaves = useRef(0);
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const today = useMemo(() => istCalendarDate(new Date()), []);
  const findings = useMemo(() => (draft.payload ? runWillRules(draft.payload, { today }) : []), [draft.payload, today]);

  if (!meta || meta.n === 1) return <Navigate to="/will" replace />;
  const Step = WILL_STEP_COMPONENTS[meta.slug];
  if (!Step) return <Navigate to="/will" replace />;
  const blockers = findings.filter((f) => f.severity === 'BLOCKER');

  /**
   * Save, then move. A failed save keeps you here with a Retry; going back (or
   * to an earlier step) is allowed on the second try so a dead connection can't
   * trap you, and the unsaved edit stays queued for the unmount flush.
   */
  async function go(n: number, mayLeaveUnsaved = false) {
    const ok = await draft.flush(n > 1 ? n : undefined);
    if (ok) {
      failedLeaves.current = 0;
    } else {
      failedLeaves.current += 1;
      const stuck = failedLeaves.current >= 2 && mayLeaveUnsaved && !draft.conflict;
      if (!stuck) return;
    }
    navigate(willStepPath(id, n));
  }

  return (
    <div ref={ref} className="min-w-0 space-y-4">
      <PageHeader eyebrow="Will Maker" title={meta.label} />
      <WillStepper current={meta.n} wide={width >= 900} onSelect={(n) => void go(n, n < meta.n)} />
      {draft.conflict && (
        <Card role="alert" className="flex flex-wrap items-center justify-between gap-2 border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
          <span>This will was changed in another tab or device. Reload to see the latest version - your last change here was not saved.</span>
          <Button size="sm" variant="outline" onClick={() => void draft.reload()}>Reload</Button>
        </Card>
      )}
      {draft.error && !draft.conflict && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-negative">
          <span>{draft.error}</span>
          <Button size="sm" variant="outline" onClick={() => void draft.flush()}>Retry</Button>
        </div>
      )}
      {draft.status === 'loading' && <p className="text-sm text-muted-foreground">Loading your will...</p>}
      {draft.status === 'error' && (
        <Card className="p-4 text-sm text-foreground">
          This draft could not be opened. <Link to="/will" className="text-accent-ink underline">Back to Will Maker</Link>
        </Card>
      )}
      {draft.status === 'ready' && draft.payload && (
        <fieldset disabled={draft.conflict} className="m-0 min-w-0 border-0 p-0">
          <Step
            willId={id}
            payload={draft.payload}
            findings={findings}
            today={today}
            wide={width >= 640}
            update={draft.update}
            refreshEstate={draft.refreshEstate}
            flush={() => draft.flush(meta.n)}
            getRevision={draft.getRevision}
            goTo={(n) => void go(n)}
          />
        </fieldset>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
        <Button variant="outline" onClick={() => void go(meta.n - 1, true)}>Back</Button>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {draft.saving ? 'Saving...' : draft.error || draft.conflict ? 'Not saved' : 'All changes saved'}
        </span>
        {meta.n < 8 ? (
          <Button onClick={() => void go(meta.n + 1)} disabled={draft.status !== 'ready' || (meta.n === 7 && blockers.length > 0)}>
            Next
          </Button>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
