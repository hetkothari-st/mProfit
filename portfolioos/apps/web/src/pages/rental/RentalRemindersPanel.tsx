import { useState } from 'react';
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

function statusBadge(status: RentReminderDTO['status']): { label: string; cls: string } {
  switch (status) {
    case 'PENDING_APPROVAL': return { label: 'Pending', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'APPROVED': return { label: 'Sending…', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'SENT': return { label: 'Sent', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'FAILED': return { label: 'Failed', cls: 'bg-red-50 text-red-700 border-red-200' };
    case 'REJECTED': return { label: 'Rejected', cls: 'bg-gray-50 text-gray-600 border-gray-200' };
    case 'SUPERSEDED': return { label: 'No longer needed', cls: 'bg-gray-50 text-gray-500 border-gray-200' };
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

  // Always show both the email and SMS sections so the landlord can review
  // the rendered content even before adding a tenant email / phone. Send
  // step verifies recipient presence — the preview is purely for QA.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Preview reminder</DialogTitle>
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

// ── Inline contact editor (per-row) ────────────────────────────────

interface ContactEditorProps {
  tenancyId: string;
  email: string | null;
  phone: string | null;
}

function ContactEditor({ tenancyId, email, phone }: ContactEditorProps) {
  const qc = useQueryClient();
  const [draftEmail, setDraftEmail] = useState(email ?? '');
  const [draftPhone, setDraftPhone] = useState(phone ?? '');

  const saveMut = useMutation({
    mutationFn: () =>
      rentalApi.updateTenancy(tenancyId, {
        tenantEmail: draftEmail.trim() || null,
        tenantPhone: draftPhone.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rental-reminders'] });
      qc.invalidateQueries({ queryKey: ['rental-property'] });
      toast.success('Tenant contact updated — channels enabled');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Save failed'),
  });

  const dirty = draftEmail.trim() !== (email ?? '') || draftPhone.trim() !== (phone ?? '');

  return (
    <div className="mt-2 pt-2 border-t border-border/60 flex flex-wrap items-end gap-2">
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
        onClick={() => saveMut.mutate()}
        disabled={!dirty || saveMut.isPending}
      >
        {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        Save contact
      </Button>
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

  const approveMut = useMutation({
    mutationFn: (id: string) => rentalApi.approveReminder(id),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['rental-reminders'] });
      if (row.status === 'SENT') toast.success('Reminder sent');
      else if (row.status === 'FAILED') toast.error(`Send failed — ${row.emailError ?? row.smsError ?? 'unknown'}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Approve failed'),
  });

  const rejectMut = useMutation({
    mutationFn: (id: string) => rentalApi.rejectReminder(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rental-reminders'] });
      toast.success('Reminder rejected');
    },
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
        {reminders.length === 0 ? (
          <div className="text-sm text-muted-foreground py-3 text-center border border-dashed rounded-md">
            No reminders awaiting approval. The scan runs daily at 09:00 IST,
            or click <strong>Run scan</strong> to check now.
          </div>
        ) : (
          <div className="space-y-2">
            {reminders.map((r) => {
              const badge = statusBadge(r.status);
              const tenant = r.tenancy?.tenantName ?? '—';
              const property = r.tenancy?.property?.name ?? '—';
              const amount = r.receipt
                ? formatINR(r.receipt.expectedAmount)
                : '—';
              const missingContact = !r.channels.email && !r.channels.sms;
              return (
                <div
                  key={r.id}
                  className="p-3 border border-border rounded-md hover:bg-foreground/[0.02]"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-[15px] truncate">{tenant}</span>
                        <span className="text-sm text-muted-foreground">·</span>
                        <span className="text-sm text-muted-foreground truncate">{property}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                        <span className={r.leadDays < 0 ? 'text-red-600 font-medium' : ''}>
                          {leadCopy(r.leadDays, r.receipt?.dueDate)}
                        </span>
                        <span>· {amount}</span>
                        <span className="flex items-center gap-1">
                          {r.channels.email && <Mail className="h-3 w-3" />}
                          {r.channels.sms && <MessageSquare className="h-3 w-3" />}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPreviewId(r.id)}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Preview
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => rejectMut.mutate(r.id)}
                        disabled={rejectMut.isPending}
                      >
                        <X className="h-3.5 w-3.5" /> Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => approveMut.mutate(r.id)}
                        disabled={approveMut.isPending || missingContact}
                        title={missingContact ? 'Add tenant email or phone below first' : undefined}
                      >
                        {approveMut.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        Approve &amp; send
                      </Button>
                    </div>
                  </div>
                  {missingContact && r.tenancy && (
                    <ContactEditor
                      tenancyId={r.tenancyId}
                      email={r.tenancy.tenantEmail}
                      phone={r.tenancy.tenantPhone}
                    />
                  )}
                </div>
              );
            })}
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
