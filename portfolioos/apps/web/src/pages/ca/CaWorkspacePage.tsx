import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Plus, Mail, ArrowUpRight, Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/common/EmptyState';
import { cn } from '@/lib/cn';
import {
  caApi,
  CONSENT_BASIS_LABEL,
  type CaClient,
  type CaConsentBasis,
} from '@/api/ca.api';

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

const KIND_LABEL: Record<CaClient['kind'], string> = {
  SHADOW: 'Managed record',
  INVITED: 'Consented client',
};

function statusTone(status: CaClient['status']): string {
  if (status === 'ACTIVE') return 'text-positive';
  if (status === 'PENDING') return 'text-warning';
  return 'text-muted-foreground';
}

export function CaWorkspacePage() {
  const qc = useQueryClient();
  const [managedOpen, setManagedOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: clients, isLoading } = useQuery({
    queryKey: ['ca', 'clients'],
    queryFn: () => caApi.listClients(),
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
    <div>
      <PageHeader
        eyebrow="Practice"
        title="Clients"
        description="The people whose books you keep — those you manage directly, and those who granted you access to their own account."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
              <Mail className="h-4 w-4" /> Invite a client
            </Button>
            <Button size="sm" onClick={() => setManagedOpen(true)}>
              <Plus className="h-4 w-4" /> Add managed client
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border/50">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[72px] animate-pulse bg-muted/30" />
            ))}
          </div>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No clients yet"
          description="Add a managed record for someone who doesn't use the app, or invite a client who does — they'll grant you access from their own account."
          action={
            <Button onClick={() => setManagedOpen(true)}>
              <Plus className="h-4 w-4" /> Add managed client
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          <ClientGroup
            label="Active"
            rows={active}
            onRevoke={(id) => revoke.mutate(id)}
            revoking={revoke.isPending}
          />
          <ClientGroup
            label="Awaiting acceptance"
            caption="These clients have been invited but have not accepted yet. You cannot see their books until they do."
            rows={pending}
            onRevoke={(id) => revoke.mutate(id)}
            revoking={revoke.isPending}
          />
          <ClientGroup
            label="Closed"
            caption="Kept as history. What was done under these engagements stays on the record."
            rows={closed}
          />
        </div>
      )}

      <ManagedClientDialog open={managedOpen} onOpenChange={setManagedOpen} />
      <InviteClientDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}

function ClientGroup({
  label,
  caption,
  rows,
  onRevoke,
  revoking,
}: {
  label: string;
  caption?: string;
  rows: CaClient[];
  onRevoke?: (clientId: string) => void;
  revoking?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-3">
        <h2 className="text-[10px] font-medium uppercase tracking-kerned text-foreground/70">
          {label}
        </h2>
        <span className="numeric tabular-nums text-[11px] text-muted-foreground">{rows.length}</span>
      </div>
      {caption && <p className="mb-2 text-[12px] leading-relaxed text-muted-foreground">{caption}</p>}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {rows.map((c) => (
            <div
              key={c.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border/50 px-4 py-3 last:border-0 transition-colors hover:bg-muted/25"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-[14px] font-medium text-foreground">{c.name}</p>
                  <span className="text-[9.5px] uppercase tracking-kerned text-muted-foreground/80">
                    {KIND_LABEL[c.kind]}
                  </span>
                  <span
                    className={cn(
                      'text-[9.5px] uppercase tracking-kerned',
                      statusTone(c.status),
                    )}
                  >
                    {c.status.toLowerCase()}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {[c.email ?? c.invitedEmail, c.pan].filter(Boolean).join(' · ') || '—'}
                </p>
                {c.kind === 'SHADOW' && c.consentBasis && (
                  <p className="mt-1 text-[11px] text-muted-foreground/80">
                    Basis: {CONSENT_BASIS_LABEL[c.consentBasis]}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {c.status === 'ACTIVE' && (
                  <>
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/ca/clients/${c.id}`}>
                        Open books <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    {onRevoke && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={revoking}
                        onClick={() => onRevoke(c.id)}
                        className="text-muted-foreground hover:text-negative"
                      >
                        Close
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function ManagedClientDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pan, setPan] = useState('');
  const [consentBasis, setConsentBasis] = useState<CaConsentBasis>('ENGAGEMENT_LETTER');
  const [consentNote, setConsentNote] = useState('');

  const create = useMutation({
    mutationFn: () =>
      caApi.createManagedClient({
        name,
        email: email || undefined,
        pan: pan || undefined,
        consentBasis,
        consentNote: consentNote || undefined,
      }),
    onSuccess: () => {
      toast.success('Client record created');
      qc.invalidateQueries({ queryKey: ['ca', 'clients'] });
      onOpenChange(false);
      setName(''); setEmail(''); setPan(''); setConsentNote('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a managed client</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            For a client who doesn&apos;t use this app. You will hold their books, and they
            will have no account and no way to see or end this — so the basis on which you
            hold their data is recorded here.
          </p>

          <div>
            <Label>Client name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Email (optional)</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="For your records" />
            </div>
            <div>
              <Label>PAN (optional)</Label>
              <Input value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} maxLength={10} />
            </div>
          </div>

          <div>
            <Label>Basis for holding their data</Label>
            <Select
              className="mt-1"
              value={consentBasis}
              onChange={(e) => setConsentBasis(e.target.value as CaConsentBasis)}
            >
              {(Object.keys(CONSENT_BASIS_LABEL) as CaConsentBasis[]).map((k) => (
                <option key={k} value={k}>
                  {CONSENT_BASIS_LABEL[k]}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Recorded, not verified. It is your basis, on your record.
            </p>
          </div>

          {consentBasis === 'OTHER' && (
            <div>
              <Label>Describe the basis</Label>
              <Input
                value={consentNote}
                onChange={(e) => setConsentNote(e.target.value)}
                placeholder="e.g. verbal instruction confirmed by email, 12 Mar"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!name.trim() || create.isPending || (consentBasis === 'OTHER' && !consentNote.trim())}
          >
            {create.isPending ? 'Creating…' : 'Create record'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const invite = useMutation({
    mutationFn: () => caApi.inviteClient({ name, email }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['ca', 'clients'] });
      setLink(`${window.location.origin}/ca/invitations/${res.token}/accept`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function close() {
    onOpenChange(false);
    setName(''); setEmail(''); setLink(null); setCopied(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{link ? 'Send this to your client' : 'Invite a client'}</DialogTitle>
        </DialogHeader>

        {link ? (
          <div className="space-y-3">
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              We don&apos;t email this yet — send it yourself. It works once, expires in 14
              days, and only for the address you entered.
            </p>
            <div className="flex items-center gap-2">
              <Input readOnly value={link} className="text-[12px]" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(link);
                  setCopied(true);
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <Button onClick={close} className="w-full">Done</Button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                They keep their own account and grant you access. They can see everything you
                do and withdraw it at any time.
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
              <Button variant="ghost" onClick={close}>Cancel</Button>
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
