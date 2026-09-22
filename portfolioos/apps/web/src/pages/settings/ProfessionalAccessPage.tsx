import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  UserMinus,
  UserPlus,
  SlidersHorizontal,
  RotateCcw,
  X,
  Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { EmptyState } from '@/components/common/EmptyState';
import { professionalAccessApi, type MyProfessionalGrant } from '@/api/ca.api';
import { apiErrorMessage } from '@/api/client';
import { CaActivityFeed } from '@/components/ca/CaActivityFeed';
import { GrantScopePanel } from '@/components/ca/GrantScopePanel';
import { InviteEmailComposer } from '@/components/ca/InviteEmailComposer';

/**
 * Account Access — the account holder's page.
 *
 * This is the side of the relationship that matters. The person whose money it
 * is decides who may look at it, what they may look at, and until when. A
 * professional's own workspace is a different screen for a different role, and
 * conflating the two is what made this page hard to find: the sidebar's
 * "Account Access" used to open the CA workspace, so the controls that belong
 * to the account holder were three clicks away in Settings.
 *
 * Not behind any plan gate. Whoever can reach someone's financial position,
 * the person it belongs to must be able to see it and stop it — a revoke
 * button that required a subscription would not be a revoke button.
 *
 * Three states share the list, and the difference is load-bearing:
 *   invited   — nobody holds it yet; it grants nothing and can be cancelled
 *   active    — someone holds it; it can be narrowed or withdrawn
 *   withdrawn — history, and the way back if it was ended by accident
 */

const fmtDate = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

export function ProfessionalAccessPage() {
  const qc = useQueryClient();
  const [managing, setManaging] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: grants, isLoading } = useQuery({
    queryKey: ['professional-access', 'grants'],
    queryFn: () => professionalAccessApi.grants(),
  });

  const { data: activity } = useQuery({
    queryKey: ['professional-access', 'activity'],
    queryFn: () => professionalAccessApi.activity(),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['professional-access'] });
  };

  const revoke = useMutation({
    mutationFn: (clientId: string) => professionalAccessApi.revoke(clientId),
    onSuccess: () => {
      toast.success('Access withdrawn');
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

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Account access"
        description="Accountants and advisors you have let in. You choose what each of them can see, and you can withdraw it at any time."
        actions={
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" /> Invite a professional
          </Button>
        }
      />

      {isLoading ? (
        <Card className="overflow-hidden">
          <div className="h-[84px] animate-pulse bg-muted/30" />
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nobody else can see your books"
          description="Invite your CA or advisor when you want them to see your position or file on your behalf. Nothing is shared until they accept, and you decide how much they get."
          action={
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4" /> Invite a professional
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {rows.map((g) => (
              <div key={g.clientId} className="border-b border-border/50 last:border-0">
                <div className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-foreground">
                      {g.advisor?.name ?? g.name}
                      <StatusChip status={g.status} />
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      {g.advisor?.email ?? g.invitedEmail ?? '—'}
                      {g.status === 'ACTIVE' && g.grantedAt && (
                        <>
                          {' · '}
                          <span className="numeric">since {fmtDate(g.grantedAt)}</span>
                        </>
                      )}
                      {g.status === 'PENDING' && g.inviteExpiresAt && (
                        <>
                          {' · '}
                          <span className="numeric">
                            invite expires {fmtDate(g.inviteExpiresAt)}
                          </span>
                        </>
                      )}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/85">
                      {describeScope(g)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {g.status === 'ACTIVE' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setManaging(managing === g.clientId ? null : g.clientId)}
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" /> Manage
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={revoke.isPending}
                          onClick={() => revoke.mutate(g.clientId)}
                          className="hover:border-negative/40 hover:text-negative"
                        >
                          <UserMinus className="h-3.5 w-3.5" /> Withdraw
                        </Button>
                      </>
                    )}
                    {g.status === 'PENDING' && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={cancel.isPending}
                        onClick={() => cancel.mutate(g.clientId)}
                      >
                        <X className="h-3.5 w-3.5" /> Cancel invite
                      </Button>
                    )}
                    {g.status === 'REVOKED' && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={reinstate.isPending}
                        onClick={() => reinstate.mutate(g.clientId)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Restore
                      </Button>
                    )}
                  </div>
                </div>

                {managing === g.clientId && (
                  <GrantScopePanel clientId={g.clientId} onClose={() => setManaging(null)} />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <CaActivityFeed entries={activity ?? []} />

      <InviteProfessionalDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={invalidate}
      />
    </div>
  );
}

function StatusChip({ status }: { status: MyProfessionalGrant['status'] }) {
  if (status === 'ACTIVE') return null;
  const label = status === 'PENDING' ? 'invited' : 'withdrawn';
  return (
    <span className="ml-2 rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
  );
}

/**
 * Name, email, then the email itself — the same composer the professional side
 * uses, because it is the same email with the sentences the other way round.
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
              ? 'Read it, change anything you want to say, then send. The link works once and expires in 14 days.'
              : 'They accept from their own account. Nothing of yours is shared until they do.'}
          </DialogDescription>
        </DialogHeader>

        {createdClientId ? (
          <InviteEmailComposer clientId={createdClientId} onDone={close} />
        ) : (
          <>
            <div className="space-y-3">
              <div>
                <Label>Their name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label>Their email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Where the invitation goes"
                />
              </div>
              <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-muted-foreground">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Once they accept you can limit them to particular portfolios, asset classes or
                categories, and set a date the access ends by itself.
              </p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button
                onClick={() => invite.mutate()}
                disabled={!name.trim() || !email.trim() || invite.isPending}
              >
                {invite.isPending ? 'Creating…' : 'Continue'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * One line saying what this row actually reaches.
 *
 * Said plainly rather than in a tooltip: unrestricted access to somebody's
 * whole financial position is the strong case, and understating it would be
 * the wrong direction to be vague in.
 */
function describeScope(g: MyProfessionalGrant): string {
  if (g.status === 'PENDING') {
    return 'Invited — they have not accepted yet, so nothing of yours is shared.';
  }
  if (g.status === 'REVOKED') {
    return g.revokedAt ? `No access since ${fmtDate(g.revokedAt)}.` : 'No access.';
  }

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

  const window = g.accessUntil ? ` Ends ${fmtDate(g.accessUntil)}.` : '';

  return limits.length === 0
    ? `Can see your complete financial position and edit your books.${window}`
    : `Limited to ${limits.join(', ')}, and can edit your books.${window}`;
}
