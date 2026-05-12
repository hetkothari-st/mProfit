import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Mail, MessageSquare, X, Pencil, Send, Loader2, BellRing, Save } from 'lucide-react';
import { formatINR } from '@portfolioos/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { rentalApi, type RentReminderDTO } from '@/api/rental.api';

// Map raw provider/server error codes to landlord-friendly text. Anything
// not matched falls through unchanged so genuine carrier errors still
// reach the toast verbatim.
function friendlyError(reason: string): string {
  switch (reason) {
    case 'smtp_not_configured':
      return 'Email server not configured (set SMTP_HOST/USER/PASS in env)';
    case 'sms_not_configured':
      return 'SMS provider disabled (set SMS_PROVIDER=twilio + Twilio creds in env)';
    case 'twilio_credentials_missing':
      return 'Twilio credentials missing in env';
    case 'tenant_email_missing':
      return 'Tenant email not set';
    case 'tenant_phone_missing':
      return 'Tenant phone not set';
    case 'invalid_phone_format':
      return 'Tenant phone is not a valid number';
    case 'no_channels_enabled':
      return 'No channels enabled — toggle email or SMS first';
    default:
      return reason;
  }
}

function leadCopy(leadDays: number, dueDate?: string): string {
  if (leadDays < 0) {
    if (dueDate) {
      const days = Math.max(
        1,
        Math.floor((Date.now() - new Date(dueDate).getTime()) / 86_400_000),
      );
      return days === 1 ? 'Overdue by 1 day' : `Overdue by ${days} days`;
    }
    return 'Overdue';
  }
  if (leadDays === 0) return 'Due today';
  if (leadDays === 1) return 'Due tomorrow';
  return `Due in ${leadDays} days`;
}

function formatMonthLabel(forMonth?: string): string {
  if (!forMonth) return '—';
  const [y, m] = forMonth.split('-');
  if (!y || !m) return forMonth;
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

// ── Preview dialog ─────────────────────────────────────────────────

interface PreviewProps {
  reminder: RentReminderDTO;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function ReminderPreviewDialog({ reminder, open, onOpenChange }: PreviewProps) {
  const qc = useQueryClient();
  const [subject, setSubject] = useState(reminder.subject);
  const [smsBody, setSmsBody] = useState(reminder.smsBody);

  const updateMut = useMutation({
    mutationFn: () => rentalApi.updateReminder(reminder.id, { subject, smsBody }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rental-reminders'] });
      toast.success('Reminder updated');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Update failed'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Preview reminder — {formatMonthLabel(reminder.receipt?.forMonth)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <Label className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Email subject
              {!reminder.channels.email && (
                <span className="text-[10px] text-amber-700 font-medium">
                  (email channel disabled — tenant email missing)
                </span>
              )}
            </Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="font-medium"
            />
            <div className="mt-2 rounded-md border border-border bg-background/50 p-3 max-h-72 overflow-y-auto">
              <iframe
                title="Email preview"
                srcDoc={reminder.body}
                className="w-full h-64 border-0 bg-white"
              />
            </div>
          </div>
          <div>
            <Label className="flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> SMS body ({smsBody.length}/160)
              {!reminder.channels.sms && (
                <span className="text-[10px] text-amber-700 font-medium">
                  (SMS channel disabled — tenant phone missing)
                </span>
              )}
            </Label>
            <textarea
              value={smsBody}
              onChange={(e) => setSmsBody(e.target.value)}
              maxLength={300}
              className="w-full h-20 rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            variant="outline"
            onClick={() => updateMut.mutate()}
            disabled={updateMut.isPending}
          >
            {updateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Inline contact editor (controlled by parent) ───────────────────

interface ContactEditorProps {
  email: string | null;
  phone: string | null;
  draftEmail: string;
  draftPhone: string;
  setDraftEmail: (v: string) => void;
  setDraftPhone: (v: string) => void;
  editing: boolean;
  setEditing: (v: boolean) => void;
  saving: boolean;
  onSave: () => void;
  missing: boolean;
}

function ContactEditor({
  email,
  phone,
  draftEmail,
  draftPhone,
  setDraftEmail,
  setDraftPhone,
  editing,
  setEditing,
  saving,
  onSave,
  missing,
}: ContactEditorProps) {
  const dirty = draftEmail.trim() !== (email ?? '') || draftPhone.trim() !== (phone ?? '');
  const hasContact = !!email || !!phone;

  if (hasContact && !editing) {
    return (
      <div className="flex items-center gap-3 flex-wrap text-sm">
        {email && (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Mail className="h-3.5 w-3.5" />
            <span className="text-foreground">{email}</span>
          </span>
        )}
        {phone && (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="text-foreground">{phone}</span>
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 ml-auto"
          onClick={() => setEditing(true)}
        >
          <Pencil className="h-3.5 w-3.5" /> Edit contact
        </Button>
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-end gap-2 ${missing ? 'p-3 rounded-md bg-amber-50/40 border border-amber-200' : ''}`}>
      <div className="flex-1 min-w-[200px]">
        <Label className="text-[10px] uppercase tracking-kerned text-muted-foreground">Tenant email</Label>
        <Input
          type="email"
          value={draftEmail}
          onChange={(e) => setDraftEmail(e.target.value)}
          placeholder="tenant@example.com"
          className="h-8 text-sm"
        />
      </div>
      <div className="flex-1 min-w-[160px]">
        <Label className="text-[10px] uppercase tracking-kerned text-muted-foreground">Tenant phone</Label>
        <Input
          type="tel"
          value={draftPhone}
          onChange={(e) => setDraftPhone(e.target.value)}
          placeholder="9876543210"
          className="h-8 text-sm"
        />
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={onSave}
        disabled={!dirty || saving}
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        Save contact
      </Button>
      {hasContact && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setDraftEmail(email ?? '');
            setDraftPhone(phone ?? '');
            setEditing(false);
          }}
          disabled={saving}
        >
          Cancel
        </Button>
      )}
    </div>
  );
}

// ── Grouped tenancy block ──────────────────────────────────────────

interface TenancyBlockProps {
  tenancyId: string;
  reminders: RentReminderDTO[];
  onPreview: (id: string) => void;
}

function TenancyBlock({ tenancyId, reminders, onPreview }: TenancyBlockProps) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const tenancy = reminders[0]?.tenancy;
  const property = tenancy?.property;
  const tenantEmail = tenancy?.tenantEmail ?? null;
  const tenantPhone = tenancy?.tenantPhone ?? null;
  // True only when *neither* the saved contact *nor* the in-flight draft
  // has a destination. As soon as the landlord types an email or phone
  // (even before clicking Save Contact), the missing-contact warning
  // hides and the approve button enables — the auto-save on approve
  // persists the draft before the actual send.

  // Lift contact draft state up so the approve handler can save it
  // first when the landlord typed an email/phone but forgot to click
  // "Save contact". Without this, Approve stays disabled even though
  // the form looks ready to send.
  const initialEditing = !tenantEmail && !tenantPhone;
  const [editing, setEditing] = useState<boolean>(initialEditing);
  const [draftEmail, setDraftEmail] = useState(tenantEmail ?? '');
  const [draftPhone, setDraftPhone] = useState(tenantPhone ?? '');

  const draftDirty =
    draftEmail.trim() !== (tenantEmail ?? '') ||
    draftPhone.trim() !== (tenantPhone ?? '');
  const draftHasContact = !!draftEmail.trim() || !!draftPhone.trim();
  const missingContact = !tenantEmail && !tenantPhone && !draftHasContact;

  // Per-send channel toggles. Default to whichever channel has a
  // recipient — landlord can opt out of one channel without losing the
  // stored config (the override is one-shot; future scans still queue
  // both channels when both contacts exist).
  const effectiveEmail = !!tenantEmail || !!draftEmail.trim();
  const effectivePhone = !!tenantPhone || !!draftPhone.trim();
  const [sendEmail, setSendEmail] = useState(true);
  const [sendSms, setSendSms] = useState(true);

  const saveContactMut = useMutation({
    mutationFn: () =>
      rentalApi.updateTenancy(tenancyId, {
        tenantEmail: draftEmail.trim() || null,
        tenantPhone: draftPhone.trim() || null,
      }),
    onSuccess: async () => {
      setEditing(false);
      toast.success('Tenant contact updated — channels enabled');
      // Force-refetch immediately so the row collapses to the read-only
      // contact view and the missing-contact warning clears without
      // waiting for the next staleTime tick. `refetchQueries` is sync
      // about scheduling so the UI updates in the same paint.
      await Promise.all([
        qc.refetchQueries({ queryKey: ['rental-reminders'] }),
        qc.refetchQueries({ queryKey: ['rental-property'] }),
      ]);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Save failed'),
  });

  const sortedReminders = [...reminders].sort((a, b) => {
    // Oldest overdue first; upcoming after, soonest first.
    const aDue = a.receipt?.dueDate ? new Date(a.receipt.dueDate).getTime() : 0;
    const bDue = b.receipt?.dueDate ? new Date(b.receipt.dueDate).getTime() : 0;
    return aDue - bDue;
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === sortedReminders.length ? new Set() : new Set(sortedReminders.map((r) => r.id))));
  }

  const approveAllMut = useMutation({
    mutationFn: async (ids: string[]) => {
      // If the landlord typed an email/phone but hasn't clicked Save
      // Contact yet, persist it first so the send step sees the
      // recipient — otherwise every channel would fail with
      // tenant_email_missing / tenant_phone_missing.
      if (draftDirty && draftHasContact) {
        await saveContactMut.mutateAsync();
      }
      const channelOverride = {
        email: sendEmail && effectiveEmail,
        sms: sendSms && effectivePhone,
      };
      const results = await Promise.allSettled(
        ids.map((id) => rentalApi.approveReminder(id, channelOverride)),
      );
      return results;
    },
    onSuccess: (results) => {
      qc.invalidateQueries({ queryKey: ['rental-reminders'] });
      const sent = results.filter((r) => r.status === 'fulfilled' && r.value.status === 'SENT').length;
      const failed = results.length - sent;
      // Pull the actual carrier error so the landlord sees "SMTP not
      // configured" instead of a meaningless "All 1 failed". Falls back
      // to a generic message only when neither channel reported.
      const reasons = results
        .filter((r): r is PromiseFulfilledResult<RentReminderDTO> => r.status === 'fulfilled')
        .map((r) => r.value)
        .filter((row) => row.status === 'FAILED')
        .flatMap((row) => [row.emailError, row.smsError].filter(Boolean) as string[])
        .map(friendlyError)
        .filter((s, i, arr) => arr.indexOf(s) === i);
      if (failed === 0) {
        toast.success(`${sent} reminders sent`);
      } else if (sent === 0) {
        toast.error(`${failed} failed — ${reasons.join(', ')}`, { duration: 8000 });
      } else {
        toast.success(`${sent} sent · ${failed} failed (${reasons.join(', ')})`, {
          duration: 8000,
        });
      }
      setSelected(new Set());
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Approve failed'),
  });

  const rejectAllMut = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.allSettled(ids.map((id) => rentalApi.rejectReminder(id)));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rental-reminders'] });
      toast.success('Reminders rejected');
      setSelected(new Set());
    },
  });

  return (
    <div className="border border-border rounded-md overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-foreground/[0.02] border-b border-border">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-semibold text-[16px]">{tenancy?.tenantName ?? '—'}</span>
              <span className="text-sm text-muted-foreground">·</span>
              <span className="text-sm text-muted-foreground">{property?.name ?? '—'}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {sortedReminders.length} pending reminder{sortedReminders.length === 1 ? '' : 's'}
              {missingContact && (
                <span className="ml-2 text-amber-700 font-medium">
                  ⚠ Tenant contact missing
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="mt-3">
          <ContactEditor
            email={tenantEmail}
            phone={tenantPhone}
            draftEmail={draftEmail}
            draftPhone={draftPhone}
            setDraftEmail={setDraftEmail}
            setDraftPhone={setDraftPhone}
            editing={editing}
            setEditing={setEditing}
            saving={saveContactMut.isPending}
            onSave={() => saveContactMut.mutate()}
            missing={missingContact}
          />
        </div>
      </div>

      {/* Month picker + channel toggles + actions */}
      <div className="px-4 py-2 border-b border-border flex items-center gap-3 flex-wrap bg-background">
        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={selected.size === sortedReminders.length && sortedReminders.length > 0}
            onChange={toggleAll}
            className="h-4 w-4"
          />
          Select all
        </label>
        <span className="text-xs text-muted-foreground">·</span>
        <span className="text-xs text-muted-foreground">
          {selected.size} selected
        </span>

        {/* Channel toggles — disabled when the corresponding recipient
            doesn't exist so the landlord can't pick a channel they
            haven't filled in. */}
        <span className="text-xs text-muted-foreground ml-2">· Send via</span>
        <label
          className={`flex items-center gap-1.5 text-xs cursor-pointer ${effectiveEmail ? '' : 'opacity-40 cursor-not-allowed'}`}
          title={effectiveEmail ? undefined : 'Add tenant email above'}
        >
          <input
            type="checkbox"
            checked={sendEmail && effectiveEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
            disabled={!effectiveEmail}
            className="h-3.5 w-3.5"
          />
          <Mail className="h-3 w-3" /> Email
        </label>
        <label
          className={`flex items-center gap-1.5 text-xs cursor-pointer ${effectivePhone ? '' : 'opacity-40 cursor-not-allowed'}`}
          title={effectivePhone ? undefined : 'Add tenant phone above'}
        >
          <input
            type="checkbox"
            checked={sendSms && effectivePhone}
            onChange={(e) => setSendSms(e.target.checked)}
            disabled={!effectivePhone}
            className="h-3.5 w-3.5"
          />
          <MessageSquare className="h-3 w-3" /> SMS
        </label>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => rejectAllMut.mutate(Array.from(selected))}
            disabled={selected.size === 0 || rejectAllMut.isPending}
          >
            <X className="h-3.5 w-3.5" /> Reject selected
          </Button>
          <Button
            size="sm"
            onClick={() => approveAllMut.mutate(Array.from(selected))}
            disabled={
              selected.size === 0
              || approveAllMut.isPending
              || saveContactMut.isPending
              || (missingContact && !draftHasContact)
              || (!(sendEmail && effectiveEmail) && !(sendSms && effectivePhone))
            }
            title={
              missingContact && !draftHasContact
                ? 'Add tenant email or phone above first'
                : !(sendEmail && effectiveEmail) && !(sendSms && effectivePhone)
                  ? 'Pick at least one channel'
                  : undefined
            }
          >
            {(approveAllMut.isPending || saveContactMut.isPending) ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Approve &amp; send selected
          </Button>
        </div>
      </div>

      {/* Reminder rows */}
      <div className="divide-y divide-border">
        {sortedReminders.map((r) => {
          const isSelected = selected.has(r.id);
          const monthLabel = formatMonthLabel(r.receipt?.forMonth);
          const amount = r.receipt ? formatINR(r.receipt.expectedAmount) : '—';
          return (
            <label
              key={r.id}
              className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                isSelected ? 'bg-foreground/[0.04]' : 'hover:bg-foreground/[0.02]'
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(r.id)}
                className="h-4 w-4 flex-shrink-0"
              />
              <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium">{monthLabel}</span>
                <span className="text-xs text-muted-foreground">· {amount}</span>
                <span className={`text-xs ${r.leadDays < 0 ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                  · {leadCopy(r.leadDays, r.receipt?.dueDate)}
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  {r.channels.email && <Mail className="h-3 w-3" />}
                  {r.channels.sms && <MessageSquare className="h-3 w-3" />}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7"
                onClick={(e) => { e.preventDefault(); onPreview(r.id); }}
              >
                <Pencil className="h-3.5 w-3.5" /> Preview
              </Button>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ── Panel ──────────────────────────────────────────────────────────

export function RentalRemindersPanel() {
  const qc = useQueryClient();
  const [previewId, setPreviewId] = useState<string | null>(null);

  const remindersQuery = useQuery({
    queryKey: ['rental-reminders', 'pending'],
    queryFn: () => rentalApi.listReminders({ status: 'PENDING_APPROVAL' }),
    refetchInterval: 60_000,
  });

  const scanMut = useMutation({
    mutationFn: () => rentalApi.runReminderScan(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['rental-reminders'] });
      toast.success(r.queued > 0 ? `Queued ${r.queued} reminders` : 'No new reminders needed');
    },
  });

  const reminders = remindersQuery.data ?? [];
  const previewing = previewId ? reminders.find((r) => r.id === previewId) : null;

  // Group by tenancyId so the panel collapses N pending receipts for the
  // same tenant into one card with a month picker, instead of N parallel
  // rows that all repeat the tenant name + property.
  const groups = useMemo(() => {
    const map = new Map<string, RentReminderDTO[]>();
    for (const r of reminders) {
      const arr = map.get(r.tenancyId) ?? [];
      arr.push(r);
      map.set(r.tenancyId, arr);
    }
    return Array.from(map.entries());
  }, [reminders]);

  if (remindersQuery.isLoading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2.5">
          <BellRing className="h-5 w-5 text-accent-ink/70" />
          <CardTitle className="text-[20px] font-semibold">
            Pending tenant reminders
            {reminders.length > 0 && (
              <span className="ml-3 text-sm text-muted-foreground font-normal">
                {reminders.length} awaiting approval
              </span>
            )}
          </CardTitle>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => scanMut.mutate()}
          disabled={scanMut.isPending}
        >
          {scanMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Run scan
        </Button>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <div className="text-sm text-muted-foreground py-3 text-center border border-dashed rounded-md">
            No reminders awaiting approval. The scan runs daily at 09:00 IST,
            or click <strong>Run scan</strong> to check now.
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map(([tenancyId, group]) => (
              <TenancyBlock
                key={tenancyId}
                tenancyId={tenancyId}
                reminders={group}
                onPreview={setPreviewId}
              />
            ))}
          </div>
        )}
      </CardContent>
      {previewing && (
        <ReminderPreviewDialog
          reminder={previewing}
          open={!!previewId}
          onOpenChange={(v) => !v && setPreviewId(null)}
        />
      )}
    </Card>
  );
}
