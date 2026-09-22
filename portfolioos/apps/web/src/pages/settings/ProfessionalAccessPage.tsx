import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  UserPlus,
  SlidersHorizontal,
  RotateCcw,
  Mail,
  Briefcase,
  ChevronDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import { professionalAccessApi, caApi, type MyProfessionalGrant } from '@/api/ca.api';
import { apiErrorMessage } from '@/api/client';
import { useEntitlement } from '@/hooks/useEntitlement';
import { CaActivityFeed } from '@/components/ca/CaActivityFeed';
import { GrantScopePanel } from '@/components/ca/GrantScopePanel';
import { InviteEmailComposer } from '@/components/ca/InviteEmailComposer';

/**
 * Account Access — the account holder's page.
 *
 * The person whose money it is decides who may look at it, what they may look
 * at, and until when. Everything on this page is organised around answering
 * those three questions for each professional at a glance: the "reach" strip
 * under every name says what they see, what they can do, and until when,
 * before anyone opens a panel.
 *
 * Three states, visually distinct because they mean different things:
 *   active     — someone holds it; it can be narrowed or withdrawn
 *   invited    — nobody holds it yet; it grants nothing and can be cancelled
 *   withdrawn  — history, kept apart and quieter, and the way back if needed
 *
 * Not behind any plan gate. Whoever can reach someone's financial position,
 * the person it belongs to must be able to see it and stop it.
 */

const fmtDate = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

export function ProfessionalAccessPage() {
  const qc = useQueryClient();
  const [managing, setManaging] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [resending, setResending] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  // The professional accepts from their own browser, so there is no event to
  // listen for here. Polled instead: quickly while an invitation is waiting,
  // slowly otherwise, and not at all in a background tab.
  const { data: grants, isLoading } = useQuery({
    queryKey: ['professional-access', 'grants'],
    queryFn: () => professionalAccessApi.grants(),
    refetchInterval: (query) =>
      query.state.data?.some((g) => g.status === 'PENDING') ? 5_000 : 30_000,
    refetchOnWindowFocus: true,
  });

  const { data: activity } = useQuery({
    queryKey: ['professional-access', 'activity'],
    queryFn: () => professionalAccessApi.activity(),
    refetchInterval: 30_000,
  });

  useAnnounceAcceptances(grants);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['professional-access'] });
  };

  const revoke = useMutation({
    mutationFn: (clientId: string) => professionalAccessApi.revoke(clientId),
    onSuccess: () => {
      toast.success('Access withdrawn');
      setManaging(null);
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not withdraw access')),
  });

  const cancel = useMutation({
    mutationFn: (clientId: string) => professionalAccessApi.cancelInvitation(clientId),
    onSuccess: () => {
      toast.success('Invitation cancelled');
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not cancel that invitation')),
  });

  const reinstate = useMutation({
    mutationFn: (clientId: string) => professionalAccessApi.reinstate(clientId),
    onSuccess: () => {
      toast.success('Access restored');
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not restore access')),
  });

  const rows = grants ?? [];
  const active = rows.filter((g) => g.status === 'ACTIVE');
  const invited = rows.filter((g) => g.status === 'PENDING');
  const past = rows.filter((g) => g.status === 'REVOKED');

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Settings"
        title="Account access"
        description="The accountants and advisors you have let into your books, what each of them can reach, and everything they have done."
        actions={
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" /> Invite a professional
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          <div className="h-[132px] animate-pulse rounded-xl border border-border/60 bg-muted/20" />
          <div className="h-[92px] animate-pulse rounded-xl border border-border/60 bg-muted/10" />
        </div>
      ) : active.length === 0 && invited.length === 0 ? (
        <EmptyAccess onInvite={() => setInviteOpen(true)} />
      ) : (
        <div className="space-y-8">
          {active.length > 0 && (
            <Group
              title="With access"
              count={active.length}
              hint="These people can open your books right now."
            >
              {active.map((g) => (
                <ActiveGrant
                  key={g.clientId}
                  grant={g}
                  managing={managing === g.clientId}
                  onManage={() => setManaging(managing === g.clientId ? null : g.clientId)}
                  onWithdraw={() => revoke.mutate(g.clientId)}
                  withdrawing={revoke.isPending && revoke.variables === g.clientId}
                />
              ))}
            </Group>
          )}

          {invited.length > 0 && (
            <Group
              title="Waiting to accept"
              count={invited.length}
              hint="Nothing of yours is shared until they accept from their own account."
            >
              {invited.map((g) => (
                <InvitedGrant
                  key={g.clientId}
                  grant={g}
                  onResend={() => setResending(g.clientId)}
                  onCancel={() => cancel.mutate(g.clientId)}
                  cancelling={cancel.isPending && cancel.variables === g.clientId}
                />
              ))}
            </Group>
          )}
        </div>
      )}

      {past.length > 0 && (
        <section className="mt-8">
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            aria-expanded={showPast}
            className="focus-ring inline-flex items-center gap-1.5 rounded text-[13px] text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', showPast && 'rotate-180')} />
            Past access ({past.length})
          </button>
          {showPast && (
            <ul className="mt-3 divide-y divide-border/50 rounded-xl border border-border/60">
              {past.map((g) => (
                <li key={g.clientId} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Initials name={personName(g)} tone="muted" />
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] text-foreground">{personName(g)}</p>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {g.revokedAt ? `No access since ${fmtDate(g.revokedAt)}` : 'No access'}
                      </p>
                    </div>
                  </div>
                  {/* An invitation that was cancelled before anyone accepted
                      has nobody to restore access to. */}
                  {g.advisor && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={reinstate.isPending}
                      onClick={() => reinstate.mutate(g.clientId)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Restore
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <ActForClientsCard />

      <CaActivityFeed entries={activity ?? []} />

      <InviteProfessionalDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={invalidate}
      />

      <Dialog open={resending !== null} onOpenChange={(v) => !v && setResending(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Send the invitation again</DialogTitle>
            <DialogDescription>
              Same link, same expiry. Edit the note if you want to add anything.
            </DialogDescription>
          </DialogHeader>
          {resending && (
            <InviteEmailComposer clientId={resending} onDone={() => setResending(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * "Mahesh accepted your invitation" — said once, when it happens.
 *
 * The row moves from one group to the other on the next poll; without a word
 * that reads as the list reshuffling itself.
 */
function useAnnounceAcceptances(grants: MyProfessionalGrant[] | undefined) {
  const seen = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    if (!grants) return;
    const now = new Map(grants.map((g) => [g.clientId, g.status]));
    const before = seen.current;
    seen.current = now;
    if (!before) return;
    for (const g of grants) {
      if (before.get(g.clientId) === 'PENDING' && g.status === 'ACTIVE') {
        toast.success(`${personName(g)} accepted your invitation.`);
      }
    }
  }, [grants]);
}

function personName(g: MyProfessionalGrant): string {
  return g.advisor?.name || g.name;
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

/** Two letters in a disc, tinted by what the row means. */
function Initials({ name, tone }: { name: string; tone: 'active' | 'invited' | 'muted' }) {
  const letters =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?';
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-medium',
        tone === 'active' && 'bg-positive/15 text-positive',
        tone === 'invited' && 'bg-warning/15 text-warning',
        tone === 'muted' && 'bg-muted text-muted-foreground',
      )}
    >
      {letters}
    </span>
  );
}

function ActiveGrant({
  grant: g,
  managing,
  onManage,
  onWithdraw,
  withdrawing,
}: {
  grant: MyProfessionalGrant;
  managing: boolean;
  onManage: () => void;
  onWithdraw: () => void;
  withdrawing: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <li
      className={cn(
        'overflow-hidden rounded-xl border bg-card transition-colors',
        managing ? 'border-accent/50' : 'border-border/70',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <Initials name={personName(g)} tone="active" />
          <div className="min-w-0">
            <p className="truncate font-display text-[17px] leading-tight text-foreground">
              {personName(g)}
            </p>
            <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
              {g.advisor?.email ?? g.invitedEmail}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {confirming ? (
            <>
              <span className="text-[12.5px] text-muted-foreground">Withdraw their access?</span>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Keep
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={withdrawing}
                onClick={onWithdraw}
                className="border-negative/40 text-negative hover:bg-negative/10"
              >
                Withdraw
              </Button>
            </>
          ) : (
            <>
              <Button
                variant={managing ? 'default' : 'outline'}
                size="sm"
                onClick={onManage}
                aria-expanded={managing}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {managing ? 'Close' : 'Manage access'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(true)}
                className="text-muted-foreground hover:text-negative"
              >
                Withdraw
              </Button>
            </>
          )}
        </div>
      </div>

      <Reach grant={g} />

      {managing && <GrantScopePanel clientId={g.clientId} onClose={onManage} />}
    </li>
  );
}

/**
 * The three answers someone wants about a professional before they open
 * anything: what they see, what they can do, until when.
 */
function Reach({ grant: g }: { grant: MyProfessionalGrant }) {
  const seesAll = g.scopeAllPortfolios && g.scopeAllCategories && g.scopeAllAssetClasses;
  const limits: string[] = [];
  if (!g.scopeAllPortfolios) {
    limits.push(`${g.portfolioCount} portfolio${g.portfolioCount === 1 ? '' : 's'}`);
  }
  if (!g.scopeAllCategories) {
    limits.push(`${g.categoryCount} categor${g.categoryCount === 1 ? 'y' : 'ies'}`);
  }
  if (!g.scopeAllAssetClasses) {
    limits.push(`${g.assetClassCount} asset class${g.assetClassCount === 1 ? '' : 'es'}`);
  }

  return (
    <dl className="mt-4 grid grid-cols-1 border-t border-border/60 sm:grid-cols-3">
      <ReachCell term="Sees">
        {seesAll ? 'Everything' : limits.join(', ')}
      </ReachCell>
      <ReachCell term="Can">
        {g.editMode === 'FULL'
          ? 'Keep your books'
          : g.editMode === 'PARTIAL'
            ? 'Make some changes'
            : 'View only'}
      </ReachCell>
      <ReachCell term="Until">
        {g.accessUntil ? fmtDate(g.accessUntil) : 'No end date'}
      </ReachCell>
    </dl>
  );
}

function ReachCell({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="border-b border-border/60 px-5 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <dt className="text-[11.5px] text-muted-foreground">{term}</dt>
      <dd className="mt-0.5 text-[13.5px] text-foreground">{children}</dd>
    </div>
  );
}

function InvitedGrant({
  grant: g,
  onResend,
  onCancel,
  cancelling,
}: {
  grant: MyProfessionalGrant;
  onResend: () => void;
  onCancel: () => void;
  cancelling: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed border-border px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <Initials name={g.name} tone="invited" />
        <div className="min-w-0">
          <p className="truncate text-[15px] text-foreground">{g.name}</p>
          <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
            {g.invitedEmail}
            {g.inviteExpiresAt && (
              <span className="ml-2 text-warning">
                Link expires {fmtDate(g.inviteExpiresAt)}
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onResend}>
          <Mail className="h-3.5 w-3.5" /> Send again
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={cancelling}
          onClick={onCancel}
          className="text-muted-foreground hover:text-negative"
        >
          Cancel invitation
        </Button>
      </div>
    </li>
  );
}

/**
 * No professional yet. The three steps are a real sequence — invite, they
 * accept, you decide — so they are numbered.
 */
function EmptyAccess({ onInvite }: { onInvite: () => void }) {
  const steps = [
    {
      title: 'Invite them by email',
      body: 'Your CA or advisor gets a link that works once and expires in 14 days.',
    },
    {
      title: 'They accept from their own account',
      body: 'Nothing is shared before this. Signing up is free for them.',
    },
    {
      title: 'You decide what they reach',
      body: 'Choose portfolios and categories, view-only or bookkeeping, and an end date.',
    },
  ];

  return (
    <div className="rounded-2xl border border-border/70 bg-card px-6 py-8 sm:px-10">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent/15 text-accent-ink">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display text-[22px] leading-tight text-foreground">
            Nobody else can see your books
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Bring in your accountant when you want them to look at your position or file for you.
          </p>
        </div>
      </div>

      <ol className="mt-7 grid gap-5 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="relative">
            <span className="numeric text-[13px] font-medium text-accent-ink">{i + 1}</span>
            <p className="mt-1 text-[14px] font-medium text-foreground">{s.title}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{s.body}</p>
          </li>
        ))}
      </ol>

      <Button className="mt-7" onClick={onInvite}>
        <UserPlus className="h-4 w-4" /> Invite a professional
      </Button>
    </div>
  );
}

/**
 * The way in for someone who may take on clients but has none yet.
 *
 * The sidebar entry follows grants actually held, so a practice that has just
 * subscribed would otherwise have nowhere to start. It disappears the moment
 * they hold one, when the workspace gets its own place in the sidebar.
 */
function ActForClientsCard() {
  const entitled = useEntitlement('CA_WORKSPACE');
  const { data: clients } = useQuery({
    queryKey: ['ca', 'clients'],
    queryFn: () => caApi.listClients(),
    retry: false,
  });

  if (!entitled.allowed || (clients?.length ?? 0) > 0) return null;

  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Briefcase className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] text-foreground">Do you keep books for clients?</p>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Your plan lets you act for other people. Invite your first client to get started.
          </p>
        </div>
      </div>
      <Button asChild size="sm" variant="outline">
        <Link to="/ca">Open client books</Link>
      </Button>
    </div>
  );
}

/**
 * Name, email, then the email itself — the same composer the professional's
 * side uses, because it is the same email with the sentences the other way
 * round.
 */
function InviteProfessionalDialog({
  open,
  onOpenChange,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onInvited: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: () => professionalAccessApi.invite({ name: name.trim(), email: email.trim() }),
    onSuccess: (res) => {
      setCreatedClientId(res.client.id);
      onInvited();
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not create that invitation')),
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
          <DialogTitle>
            {createdClientId ? 'Send the invitation' : 'Invite a professional'}
          </DialogTitle>
          <DialogDescription>
            {createdClientId
              ? 'Read it, change anything you want to say, then send.'
              : 'They accept from their own account. Nothing of yours is shared until they do.'}
          </DialogDescription>
        </DialogHeader>

        {createdClientId ? (
          <InviteEmailComposer clientId={createdClientId} onDone={close} />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim() && email.trim()) invite.mutate();
            }}
          >
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="pro-name">Their name</Label>
                <Input
                  id="pro-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Mahesh Kumar"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pro-email">Their email</Label>
                <Input
                  id="pro-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="mahesh@firm.in"
                />
              </div>
              <p className="rounded-lg bg-muted/40 px-3 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
                They start view-only. Once they accept you can let them keep your books, limit them
                to particular portfolios, and set a date their access ends by itself.
              </p>
            </div>
            <DialogFooter className="mt-5">
              <Button type="button" variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || !email.trim() || invite.isPending}>
                {invite.isPending ? 'Creating…' : 'Continue to the email'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
