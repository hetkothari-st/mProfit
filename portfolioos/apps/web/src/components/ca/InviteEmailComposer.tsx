import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Check, Copy, Loader2, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { caInviteEmailApi, type InviteEmailDraft } from '@/api/ca.api';
import { apiErrorMessage } from '@/api/client';

/**
 * Compose, read, send.
 *
 * The advisor edits a subject and a note; everything that makes the mail
 * checkable — the link, the expiry, who sent it, how to refuse — is rendered
 * by the server and shown here as part of the preview, not as fields.
 *
 * The preview comes from the server on a debounce rather than being assembled
 * here. Rendering the same email twice, once for looking at and once for
 * sending, is how a preview comes to differ from what lands in the inbox.
 *
 * The copy-the-link fallback stays. It is what works when the mailer is down,
 * when the address was wrong, or when the client wants it over WhatsApp.
 */

/**
 * Where an invitation's email comes from. A professional invitation and a
 * family invitation are drafted and sent by different endpoints, but they are
 * read, edited and sent here the same way.
 */
export interface InviteEmailSource {
  key: readonly unknown[];
  preview: (edits: { subject?: string; message?: string }) => Promise<InviteEmailDraft>;
  send: (edits: {
    subject?: string;
    message?: string;
  }) => Promise<{ sent: boolean; to: string; sendsRemaining: number; reason?: string }>;
}

interface Props {
  /** A professional invitation; or pass `source` for any other kind. */
  clientId?: string;
  source?: InviteEmailSource;
  onDone: () => void;
}

export function InviteEmailComposer({ clientId, source: given, onDone }: Props) {
  const source: InviteEmailSource = given ?? {
    key: ['ca', 'invite-email', clientId],
    preview: (edits) => caInviteEmailApi.preview(clientId!, edits),
    send: (edits) => caInviteEmailApi.send(clientId!, edits),
  };
  const [subject, setSubject] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Debounced copies, so every keystroke does not become a request.
  const [debounced, setDebounced] = useState<{ subject?: string; message?: string }>({});
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const t = setTimeout(
      () =>
        setDebounced({
          ...(subject !== null ? { subject } : {}),
          ...(message !== null ? { message } : {}),
        }),
      450,
    );
    return () => clearTimeout(t);
  }, [subject, message]);

  const draft = useQuery<InviteEmailDraft>({
    queryKey: [...source.key, debounced],
    queryFn: () => source.preview(debounced),
  });

  // Seed the fields from the server's defaults, once.
  useEffect(() => {
    if (draft.data && subject === null && message === null) {
      setSubject(draft.data.subject);
      setMessage(draft.data.message);
    }
  }, [draft.data, subject, message]);

  const send = useMutation({
    mutationFn: () =>
      source.send({
        ...(subject !== null ? { subject } : {}),
        ...(message !== null ? { message } : {}),
      }),
    onSuccess: (r) => {
      if (r.sent) {
        setSent(true);
        toast.success(`Sent to ${r.to}`);
      } else {
        // Not a success dressed as one: the link is still the way through.
        toast.error(r.reason ?? 'The email could not be sent.');
      }
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not send the invitation')),
  });

  if (draft.isLoading || !draft.data) {
    return (
      <div className="flex items-center gap-2 py-8 text-[13px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing the email…
      </div>
    );
  }

  const d = draft.data;

  if (sent) {
    return (
      <div className="space-y-4 py-2">
        <p className="text-[13px] leading-relaxed text-foreground">
          Sent to <span className="font-medium">{d.to}</span>. They have until {d.expiresOn} to
          accept, and replies come back to you.
        </p>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Nothing of theirs is shared until they accept. You can send it again from here if it does
          not arrive.
        </p>
        <Button onClick={onDone} className="w-full">
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <Label>To</Label>
        <Input readOnly value={`${d.recipientName} <${d.to}>`} className="text-[12.5px]" />
      </div>

      <div>
        <Label>Subject</Label>
        <Input
          value={subject ?? d.subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={160}
        />
      </div>

      <div>
        <Label>Your message</Label>
        <Textarea
          rows={6}
          value={message ?? d.message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={4000}
          className="text-[13px]"
        />
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
          The accept link, the expiry date and your name are added below your message and cannot be
          removed — that is what lets them tell this apart from a phishing mail.
        </p>
      </div>

      <div>
        <Label>Preview</Label>
        <div className="mt-1 overflow-hidden rounded-md border border-border">
          {/* Sandboxed: this is rendered email HTML, so it gets no scripts and
              no ability to navigate the app. */}
          <iframe
            title="Email preview"
            srcDoc={d.html}
            sandbox=""
            className="h-[320px] w-full bg-white"
          />
        </div>
        {draft.isFetching && (
          <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Updating preview…
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Input readOnly value={d.acceptUrl} className="text-[11.5px]" />
        <Button
          variant="outline"
          size="sm"
          title="Copy the link and send it yourself instead"
          onClick={() => {
            void navigator.clipboard.writeText(d.acceptUrl);
            setCopied(true);
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {!d.canSend && (
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Email is not configured on this server, so copy the link above and send it yourself.
        </p>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-[11.5px] text-muted-foreground">
          {d.sendsRemaining > 0
            ? `${d.sendsRemaining} send${d.sendsRemaining === 1 ? '' : 's'} left for this invitation`
            : 'No sends left — copy the link instead'}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onDone}>
            Later
          </Button>
          <Button
            onClick={() => send.mutate()}
            disabled={!d.canSend || d.sendsRemaining === 0 || send.isPending}
          >
            {send.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Send email
          </Button>
        </div>
      </div>
    </div>
  );
}
