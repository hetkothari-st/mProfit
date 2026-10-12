import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  LEGACY_CATEGORY_LABELS, LEGACY_DEFAULT_INACTIVITY_DAYS, LEGACY_MIN_INACTIVITY_DAYS,
  type LegacyNomineeDTO, type LegacyStatusValue, type LegacyTriggerValue,
} from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { apiErrorMessage } from '@/api/client';
import { LEGACY_KEYS, legacyApi, type NomineeInput } from '@/api/legacy.api';
import { useEntitlement } from '@/hooks/useEntitlement';
import { useAuthStore } from '@/stores/auth.store';
import { StepUpDialog } from './StepUpDialog';
import { NomineeDialog } from './NomineeDialog';

const STATUS_TEXT: Record<LegacyStatusValue, string> = {
  DRAFT: 'Off',
  ARMED: 'On',
  WARNING_1: 'Reminder sent',
  WARNING_2: 'Second reminder sent',
  FINAL_WARNING: 'Final reminder sent',
  GRACE: 'Nominees notified',
  RELEASED: 'Shared with nominees',
  PAUSED: 'Paused',
};
const COUNTING: ReadonlySet<LegacyStatusValue> = new Set(['ARMED', 'WARNING_1', 'WARNING_2', 'FINAL_WARNING', 'GRACE']);
const EDITABLE: ReadonlySet<LegacyStatusValue> = new Set(['DRAFT', 'ARMED', 'PAUSED']);

export function LegacyPage() {
  const qc = useQueryClient();
  const ent = useEntitlement('LEGACY_TRANSFER');
  const q = useQuery({ queryKey: LEGACY_KEYS.overview, queryFn: legacyApi.overview });
  const [pending, setPending] = useState<null | (() => Promise<void>)>(null);
  const [nomDlg, setNomDlg] = useState<{ open: boolean; initial: LegacyNomineeDTO | null }>({ open: false, initial: null });
  const [trigger, setTrigger] = useState<LegacyTriggerValue>('INACTIVITY');
  const [days, setDays] = useState(LEGACY_DEFAULT_INACTIVITY_DAYS);
  const [date, setDate] = useState('');
  const [letter, setLetter] = useState('');
  const [testMode, setTestMode] = useState(false);
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');
  const [pauseUntil, setPauseUntil] = useState('');

  // Seed once per load so a background refetch never wipes unsaved edits.
  const seeded = useRef(false);
  useEffect(() => {
    const o = q.data;
    if (!o || seeded.current) return;
    seeded.current = true;
    setTrigger(o.triggerMode);
    setDays(o.inactivityDays);
    setTestMode(o.testMode);
    setDate(o.scheduledFor ?? '');
    setLetter(o.letter ?? '');
  }, [q.data]);

  /** Run fn with a step-up grant, asking for one first if needed. */
  function guarded(fn: () => Promise<void>, success = 'Saved') {
    const run = async () => {
      try {
        await fn();
        await qc.invalidateQueries({ queryKey: LEGACY_KEYS.overview });
        toast.success(success);
      } catch (e) {
        toast.error(apiErrorMessage(e));
      }
    };
    if (legacyApi.hasGrant()) void run();
    else setPending(() => run);
  }

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (q.error || !q.data) return <div className="p-6 text-sm">{apiErrorMessage(q.error, 'Could not load Succession.')}</div>;
  const o = q.data;
  const canEdit = ent.allowed && EDITABLE.has(o.status);
  const settingsValid = testMode
    ? trigger === 'INACTIVITY'
    : trigger === 'SCHEDULED' ? date !== '' : days >= LEGACY_MIN_INACTIVITY_DAYS && (trigger === 'INACTIVITY' || date !== '');

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <PageHeader title="Succession" description="Make sure your loved ones are never left in the dark about your finances." />

      {!ent.allowed && (
        <Card><CardContent className="p-4 text-sm">
          Succession is part of the {ent.requiredTier} plan.
          {o.status !== 'DRAFT' && ' Your existing plan keeps working; you can still pause, revoke or remove nominees.'}{' '}
          <Link className="underline" to="/pricing">See plans</Link>
        </CardContent></Card>
      )}

      <Card><CardContent className="space-y-2 p-4">
        <div className="flex items-center gap-2"><span className="font-medium">Status</span><Badge>{STATUS_TEXT[o.status]}</Badge>
          {o.testMode && <Badge variant="destructive">Test mode · 1 minute</Badge>}</div>
        {o.nextEvent && <p className="text-sm text-muted-foreground">{o.nextEvent}</p>}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {o.status === 'DRAFT' && (
            <Button disabled={!ent.allowed || o.nominees.length === 0} onClick={() => guarded(legacyApi.activate, 'Succession is on')}>Turn on</Button>
          )}
          {COUNTING.has(o.status) && (
            <>
              <Input type="date" className="w-44" value={pauseUntil} onChange={(e) => setPauseUntil(e.target.value)} aria-label="Pause until" />
              <Button variant="outline" disabled={!pauseUntil} onClick={() => guarded(() => legacyApi.pause(pauseUntil), 'Paused')}>Pause</Button>
            </>
          )}
          {o.status === 'PAUSED' && <Button variant="outline" onClick={() => guarded(legacyApi.resume, 'Resumed')}>Resume</Button>}
          {o.status === 'RELEASED' && (
            <Button variant="destructive" onClick={() => guarded(() => legacyApi.revoke(), 'Access withdrawn')}>Revoke all access</Button>
          )}
          {o.status !== 'DRAFT' && <Button variant="ghost" onClick={() => guarded(legacyApi.deactivate, 'Succession is off')}>Turn off</Button>}
        </div>
        {o.status === 'DRAFT' && o.nominees.length === 0 && <p className="text-xs text-muted-foreground">Add a nominee to turn it on.</p>}
      </CardContent></Card>

      <Card><CardContent className="space-y-3 p-4">
        <h2 className="font-medium">When to share</h2>
        <div className="space-y-1">
          <Label htmlFor="lg-trigger">Trigger</Label>
          <Select id="lg-trigger" value={trigger} disabled={!canEdit} onChange={(e) => setTrigger(e.target.value as LegacyTriggerValue)}>
            <option value="INACTIVITY">If I’m inactive</option>
            <option value="SCHEDULED">On a date</option>
            <option value="BOTH">Whichever comes first</option>
          </Select>
        </div>
        {isAdmin && (
          <label className="flex items-start gap-2 rounded-md border border-dashed p-2 text-sm">
            <input type="checkbox" className="mt-1" checked={testMode} disabled={!canEdit}
              onChange={(e) => { setTestMode(e.target.checked); if (e.target.checked) setTrigger('INACTIVITY'); }} />
            <span>
              <span className="font-medium">Test mode: 1 minute (admins only)</span>
              <span className="block text-xs text-muted-foreground">
                After 1 minute of inactivity, each reminder stage lasts 1 minute, so nominees get access in about 5 minutes.
                Browsing the app only counts as activity once an hour, so use the “I’m OK” email link to test a reset. Use test nominee emails.
              </span>
            </span>
          </label>
        )}
        {trigger !== 'SCHEDULED' && !testMode && (
          <div className="space-y-1">
            <Label htmlFor="lg-days">Inactive for (days, at least {LEGACY_MIN_INACTIVITY_DAYS})</Label>
            <Input id="lg-days" type="number" min={LEGACY_MIN_INACTIVITY_DAYS} value={days} disabled={!canEdit}
              onChange={(e) => setDays(Number.parseInt(e.target.value, 10) || 0)} />
            <p className="text-xs text-muted-foreground">Then 3 email reminders a week apart, and a 7-day notice to nominees, before anything is shared.</p>
          </div>
        )}
        {trigger !== 'INACTIVITY' && (
          <div className="space-y-1">
            <Label htmlFor="lg-date">Release date</Label>
            <Input id="lg-date" type="date" value={date} disabled={!canEdit} onChange={(e) => setDate(e.target.value)} />
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="lg-letter">Personal letter (optional)</Label>
          <Textarea id="lg-letter" rows={4} value={letter} disabled={!canEdit} placeholder="e.g. FD papers are in the SBI locker #42"
            onChange={(e) => setLetter(e.target.value)} />
        </div>
        <Button disabled={!canEdit || !settingsValid} onClick={() => guarded(() => legacyApi.saveSettings({
          triggerMode: trigger, inactivityDays: days, scheduledFor: trigger === 'INACTIVITY' ? null : date || null, letter: letter.trim() || null, testMode,
        }))}>Save</Button>
        {!EDITABLE.has(o.status) && <p className="text-xs text-muted-foreground">Settings are locked while reminders are going out or after release. Pause or revoke first.</p>}
      </CardContent></Card>

      <Card><CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium">Nominees</h2>
          <Button size="sm" disabled={!ent.allowed} onClick={() => setNomDlg({ open: true, initial: null })}>Add nominee</Button>
        </div>
        {o.nominees.length === 0 && <p className="text-sm text-muted-foreground">No nominees yet.</p>}
        {o.nominees.map((n) => (
          <div key={n.id} className="flex flex-col gap-2 border-t pt-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 font-medium">
                <span className="truncate">{n.name}</span>
                <span className="font-normal text-muted-foreground">· {n.relationship}</span>
                {n.isVerifier && <Badge variant="secondary">Verifier</Badge>}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {n.email}
                {n.acknowledgedAt ? ' · confirmed' : o.status !== 'DRAFT' ? ' · ⚠ email not confirmed yet' : ''}
              </div>
              <div className="text-xs text-muted-foreground">
                {n.categories.map((c) => LEGACY_CATEGORY_LABELS[c]).join(', ')} · {n.showAmounts ? 'with amounts' : 'no amounts'}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={!ent.allowed} onClick={() => setNomDlg({ open: true, initial: n })}>Edit</Button>
              {o.status === 'RELEASED' && (
                <Button size="sm" variant="outline" onClick={() => guarded(() => legacyApi.revoke(n.id), 'Access withdrawn')}>Revoke</Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => guarded(() => legacyApi.removeNominee(n.id), 'Nominee removed')}>Remove</Button>
            </div>
          </div>
        ))}
      </CardContent></Card>

      <p className="text-xs text-muted-foreground">
        Succession shares information only. It is not a will and does not transfer any asset. Nominees never get edit access.
      </p>

      <NomineeDialog
        open={nomDlg.open}
        initial={nomDlg.initial}
        onClose={() => setNomDlg({ open: false, initial: null })}
        onSave={(v: NomineeInput) => {
          const editing = nomDlg.initial;
          setNomDlg({ open: false, initial: null });
          guarded(async () => { if (editing) await legacyApi.updateNominee(editing.id, v); else await legacyApi.addNominee(v); });
        }}
      />
      <StepUpDialog
        open={pending !== null}
        onCancel={() => setPending(null)}
        onDone={() => { const fn = pending; setPending(null); void fn?.(); }}
      />
    </div>
  );
}
