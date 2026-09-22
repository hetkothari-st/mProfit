import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Mail, BookOpen, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/common/EmptyState';
import { useEntitlement } from '@/hooks/useEntitlement';
import { InviteEmailComposer } from '@/components/ca/InviteEmailComposer';
import { cn } from '@/lib/cn';
import { caApi, type CaClient } from '@/api/ca.api';
import { LIVE_QUERY, LIVE_INTERVAL_MS } from '@/lib/liveQuery';
import { Initials, ClientAccessStrip } from '@/components/ca/AccessParts';
import { fmtDate } from '@/components/ca/accessModel';

/**
 * A CA's client list.
 *
 * Two kinds of row, and the difference is not cosmetic — it is who holds the
 * rights. A managed record is one the CA created for somebody with no login:
 * the CA is the only party, and the client cannot see or end it. An invited
 * client is a real person who consented and can revoke at any moment. The
 * list says which is which on every row, because a CA should never be unsure
 * whether the person they are working for can see what they are doing.
 */

export function CaWorkspacePage() {
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  // Inviting a client of your OWN is what the advisor plan is for. Someone who
  // is here only because a client invited them keeps the workspace for free,
  // and is shown the way to the plan instead of a button the server refuses.
  const canInvite = useEntitlement('CA_WORKSPACE').allowed;

  // Live for the same reason as the books page: the client changes what this
  // list says (reach, edit rights, withdrawal) from their own session.
  const { data: clients, isLoading } = useQuery({
    queryKey: ['ca', 'clients'],
    queryFn: () => caApi.listClients(),
    ...LIVE_QUERY,
    refetchInterval: LIVE_INTERVAL_MS,
  });

  const revoke = useMutation({
    mutationFn: (clientId: string) => caApi.revokeGrant(clientId),
    onSuccess: () => {
      toast.success('Engagement closed');
      qc.invalidateQueries({ queryKey: ['ca', 'clients'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = clients ?? [];
  const active = rows.filter((c) => c.status === 'ACTIVE');
  const pending = rows.filter((c) => c.status === 'PENDING');
  const closed = rows.filter((c) => c.status === 'REVOKED');

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Practice"
        title="Clients"
        description="The people whose books you keep. Each of them decides what you can see and do, and can withdraw it at any time."
        actions={
          canInvite ? (
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <Mail className="h-4 w-4" /> Invite a client
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link to="/settings/billing">
                <Mail className="h-4 w-4" /> Invite your own clients
              </Link>
            </Button>
          )
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          <div className="h-[132px] animate-pulse rounded-xl border border-border/60 bg-muted/20" />
          <div className="h-[132px] animate-pulse rounded-xl border border-border/60 bg-muted/10" />
        </div>
      ) : active.length + pending.length === 0 && closed.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No clients yet"
          description={
            canInvite
              ? 'Invite a client and they grant you access from their own account. They decide what you see.'
              : 'When someone invites you to their books, they appear here. Inviting clients of your own needs an advisor plan.'
          }
          action={
            canInvite ? (
              <Button onClick={() => setInviteOpen(true)}>
                <Mail className="h-4 w-4" /> Invite a client
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-8">
          {active.length > 0 && (
            <Group
              title="Your clients"
              count={active.length}
              hint="Open someone's books to work in them. What you can change is theirs to decide."
            >
              {active.map((c) => (
                <ActiveClient
                  key={c.id}
                  client={c}
                  onClose={() => revoke.mutate(c.id)}
                  closing={revoke.isPending}
                />
              ))}
            </Group>
          )}

          {pending.length > 0 && (
            <Group
              title="Waiting to accept"
              count={pending.length}
              hint="Invited, not yet accepted. Their books stay closed to you until they do."
            >
              {pending.map((c) => (
                <PendingClient key={c.id} client={c} />
              ))}
            </Group>
          )}

          {closed.length > 0 && (
            <section>
              <button
                type="button"
                onClick={() => setShowClosed((v) => !v)}
                aria-expanded={showClosed}
                className="focus-ring inline-flex items-center gap-1.5 rounded text-[13px] text-muted-foreground hover:text-foreground"
              >
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', showClosed && 'rotate-180')}
                />
                Past engagements ({closed.length})
              </button>
              {showClosed && (
                <ul className="mt-3 divide-y divide-border/50 rounded-xl border border-border/60">
                  {closed.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                      <Initials name={c.displayName} tone="muted" />
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] text-foreground">{c.displayName}</p>
                        <p className="truncate text-[12px] text-muted-foreground">
                          {c.revokedAt ? `Ended ${fmtDate(c.revokedAt)}` : 'Ended'}. What was
                          done stays on the record.
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}

      <InviteClientDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}

function Group({
  title,
  count,
  hint,
  children,
}: {
  title: string;
  count: number;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-[15px] font-medium text-foreground">
          {title} <span className="text-muted-foreground">{count}</span>
        </h2>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">{hint}</p>
      </div>
      <ul className="space-y-3">{children}</ul>
    </section>
  );
}

/** How the professional should see who these books belong to. */
function clientEmail(c: CaClient): string | null {
  // A client who invited you is identified by their own address; one you
  // invited, by the address you sent it to.
  return c.initiatedBy === 'CLIENT' ? c.displayEmail : (c.displayEmail ?? c.invitedEmail);
}

function ActiveClient({
  client: c,
  onClose,
  closing,
}: {
  client: CaClient;
  onClose: () => void;
  closing: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="overflow-hidden rounded-xl border border-border/70 bg-card">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <Initials name={c.displayName} tone="active" />
          <div className="min-w-0">
            <p className="truncate font-display text-[17px] leading-tight text-foreground">
              {c.displayName}
            </p>
            <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
              {clientEmail(c) ?? 'No email on record'}
              {c.acceptedAt && <span className="ml-2">Client since {fmtDate(c.acceptedAt)}</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {confirming ? (
            <>
              <span className="text-[12.5px] text-muted-foreground">Close this engagement?</span>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Keep
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={closing}
                onClick={onClose}
                className="border-negative/40 text-negative hover:bg-negative/10"
              >
                Close engagement
              </Button>
            </>
          ) : (
            <>
              <Button asChild size="sm">
                <Link to={`/ca/clients/${c.id}`}>
                  <BookOpen className="h-3.5 w-3.5" /> Open books
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(true)}
                className="text-muted-foreground hover:text-negative"
              >
                Close
              </Button>
            </>
          )}
        </div>
      </div>

      <ClientAccessStrip client={c} className="mt-4" />
    </li>
  );
}

function PendingClient({ client: c }: { client: CaClient }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed border-border px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <Initials name={c.displayName} tone="invited" />
        <div className="min-w-0">
          <p className="truncate text-[15px] text-foreground">{c.displayName}</p>
          <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
            {clientEmail(c) ?? 'No email on record'}
            {c.inviteExpiresAt && (
              <span className="ml-2 text-warning">Link expires {fmtDate(c.inviteExpiresAt)}</span>
            )}
          </p>
        </div>
      </div>
    </li>
  );
}

function InviteClientDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  // The invitation exists as soon as it is created; the email is a second,
  // optional step on top of it. Keeping the client id (not just the link) is
  // what lets the composer ask the server for the draft.
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: () => caApi.inviteClient({ name, email }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['ca', 'clients'] });
      setCreatedClientId(res.client.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function close() {
    onOpenChange(false);
    setName('');
    setEmail('');
    setCreatedClientId(null);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className={createdClientId ? 'max-w-xl' : 'max-w-md'}>
        <DialogHeader>
          <DialogTitle>{createdClientId ? 'Send the invitation' : 'Invite a client'}</DialogTitle>
          <DialogDescription>
            {createdClientId
              ? 'Read it, change anything you want to say, then send. The link works once and expires in 14 days.'
              : 'They keep their own account and can withdraw access at any time.'}
          </DialogDescription>
        </DialogHeader>

        {createdClientId ? (
          <InviteEmailComposer clientId={createdClientId} onDone={close} />
        ) : (
          <>
            <div className="space-y-3">
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                They keep their own account and grant you access. They can see everything you do and
                withdraw it at any time.
              </p>
              <div>
                <Label>Client name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label>Their email</Label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="The address on their account"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button
                onClick={() => invite.mutate()}
                disabled={!name.trim() || !email.trim() || invite.isPending}
              >
                {invite.isPending ? 'Creating…' : 'Create invitation'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
