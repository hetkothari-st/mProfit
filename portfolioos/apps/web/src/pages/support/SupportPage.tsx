import { useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, LifeBuoy } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  SUPPORT_MESSAGE_MAX,
  SUPPORT_MESSAGE_MIN,
  SUPPORT_STATUS_LABELS,
  SUPPORT_SUBJECT_MAX,
  SUPPORT_SUBJECT_MIN,
  SUPPORT_TOPICS,
  SUPPORT_TOPIC_LABELS,
  formatDateIST,
  type SupportTopic,
} from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/common/EmptyState';
import { apiErrorMessage } from '@/api/client';
import { supportApi } from '@/api/support.api';
import { useAuthStore } from '@/stores/auth.store';

const QUERY_KEY = ['support-tickets'];

/** Client-side mirror of the server's limits, so the user hears about a problem before sending. */
export function validateSupportForm(f: { subject: string; message: string }): { subject?: string; message?: string } {
  const errors: { subject?: string; message?: string } = {};
  const subject = f.subject.trim();
  const message = f.message.trim();
  if (subject.length < SUPPORT_SUBJECT_MIN) errors.subject = 'Add a short subject';
  else if (subject.length > SUPPORT_SUBJECT_MAX) errors.subject = `Keep the subject under ${SUPPORT_SUBJECT_MAX} characters`;
  if (message.length < SUPPORT_MESSAGE_MIN) errors.message = 'Tell us a little more so we can help';
  else if (message.length > SUPPORT_MESSAGE_MAX) errors.message = `Keep the message under ${SUPPORT_MESSAGE_MAX} characters`;
  return errors;
}

export function SupportPage() {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const qc = useQueryClient();
  // The screen the user came from, passed by the Help link. A path only; the server drops anything else.
  const from = (location.state as { from?: string } | null)?.from;

  const [topic, setTopic] = useState<SupportTopic>('QUESTION');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [touched, setTouched] = useState(false);
  const [sentNote, setSentNote] = useState(false);
  const errors = validateSupportForm({ subject, message });

  const tickets = useQuery({ queryKey: QUERY_KEY, queryFn: () => supportApi.mine() });
  const send = useMutation({
    mutationFn: () => supportApi.create({ topic, subject: subject.trim(), message: message.trim(), pagePath: from }),
    onSuccess: () => {
      toast.success('Message sent');
      setSubject('');
      setMessage('');
      setTouched(false);
      setSentNote(true);
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not send your message. Please try again.')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (errors.subject || errors.message) return;
    send.mutate();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Help"
        title="Help & support"
        description="Ask a question, report a problem or suggest something. We reply by email."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Send us a message</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div>
                <Label htmlFor="support-topic">What is this about?</Label>
                <Select id="support-topic" className="mt-1" value={topic} onChange={(e) => setTopic(e.target.value as SupportTopic)}>
                  {SUPPORT_TOPICS.map((t) => (
                    <option key={t} value={t}>{SUPPORT_TOPIC_LABELS[t]}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="support-subject">Subject</Label>
                <Input
                  id="support-subject"
                  className="mt-1"
                  value={subject}
                  maxLength={SUPPORT_SUBJECT_MAX + 20}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="A few words"
                />
                {touched && errors.subject && <p className="mt-1 text-xs text-negative">{errors.subject}</p>}
              </div>
              <div>
                <Label htmlFor="support-message">Details</Label>
                <Textarea
                  id="support-message"
                  className="mt-1"
                  rows={7}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What were you trying to do, and what happened instead?"
                />
                <div className="mt-1 flex items-start justify-between gap-3 text-xs">
                  <span className="text-negative">{touched ? errors.message : ''}</span>
                  <span className="shrink-0 text-muted-foreground">{message.trim().length}/{SUPPORT_MESSAGE_MAX}</span>
                </div>
              </div>
              {from && <p className="text-xs text-muted-foreground">We will note that you were on <span className="font-mono">{from}</span>.</p>}
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={send.isPending}>
                  {send.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Send message
                </Button>
              </div>
              {sentNote && (
                <p role="status" className="rounded-md border border-positive/30 bg-positive/10 px-3 py-2 text-sm">
                  Thanks, we have your message. We will reply to <strong>{user?.email}</strong>.
                </p>
              )}
            </form>
          </CardContent>
        </Card>

        <section aria-labelledby="your-requests">
          <h2 id="your-requests" className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Your requests
          </h2>
          {tickets.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : tickets.isError ? (
            <p className="text-sm text-negative">Could not load your requests.</p>
          ) : (tickets.data ?? []).length === 0 ? (
            <EmptyState icon={LifeBuoy} title="No requests yet" description="Messages you send appear here with their status." />
          ) : (
            <ul className="space-y-3">
              {tickets.data!.map((t) => (
                <li key={t.id}>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium break-words">{t.subject}</p>
                          <p className="text-xs text-muted-foreground">
                            {SUPPORT_TOPIC_LABELS[t.topic]} · sent {formatDateIST(t.createdAt)}
                          </p>
                        </div>
                        <Badge variant={t.status === 'RESOLVED' ? 'secondary' : 'outline'}>{SUPPORT_STATUS_LABELS[t.status]}</Badge>
                      </div>
                      <details className="mt-2 text-sm">
                        <summary className="cursor-pointer text-muted-foreground">Show what you sent</summary>
                        <p className="mt-2 whitespace-pre-wrap break-words">{t.message}</p>
                      </details>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
