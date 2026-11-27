import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fmtDate, inviteLinkStatus } from '@/components/ca/accessModel';
import { caApi, type CaClient } from '@/api/ca.api';
import { caFirmSeatsApi, seatInviteLink, type Seat } from '@/api/caFirmSeats.api';

const KEY = ['ca', 'seats'];

/**
 * The firm's staff. Each works only on the clients assigned here, under that
 * client's own grant, with their own login and two-factor sign-in. Clients
 * see by name who on the staff can open their books.
 */
export function StaffPage() {
  const qc = useQueryClient();
  const { data: seats = [] } = useQuery({ queryKey: KEY, queryFn: () => caFirmSeatsApi.list() });
  const { data: clients = [] } = useQuery({ queryKey: ['ca', 'clients'], queryFn: () => caApi.listClients() });
  const myActive = clients.filter((c) => c.status === 'ACTIVE' && c.actingAs !== 'STAFF');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const invite = useMutation({
    mutationFn: () => caFirmSeatsApi.invite({ name: name.trim(), email: email.trim() }),
    onSuccess: (res) => {
      setLink(seatInviteLink(res.token));
      setName('');
      setEmail('');
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const live = seats.filter((s) => s.status !== 'REVOKED');

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/ca" className="mb-2 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> All clients
      </Link>
      <PageHeader
        eyebrow="Practice"
        title="Staff"
        description="Give your staff their own login to work on the clients you choose. They see only those clients, within the limits each client set, and never your billing."
      />

      <form
        className="mb-6 flex flex-wrap gap-2 rounded-xl border border-border/60 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && email.trim()) invite.mutate();
        }}
      >
        <Input aria-label="Staff name" placeholder="Name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="min-w-[180px] flex-1" />
        <Input aria-label="Staff email" type="email" placeholder="Their email" value={email} onChange={(e) => setEmail(e.target.value)} className="min-w-[220px] flex-1" />
        <Button type="submit" size="sm" disabled={!name.trim() || !email.trim() || invite.isPending}>
          <UserPlus className="h-4 w-4" /> Invite
        </Button>
        {link && (
          <div className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 text-[12.5px]">
            <span className="text-muted-foreground">Send them this link (works once, for 14 days):</span>
            <code className="break-all">{link}</code>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => navigator.clipboard?.writeText(link).then(() => toast.success('Link copied'))}
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
          </div>
        )}
      </form>

      {live.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-[13px] text-muted-foreground">No staff yet.</p>
      ) : (
        <ul className="space-y-3">
          {live.map((s) => (
            <SeatCard key={s.id} seat={s} clients={myActive} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SeatCard({ seat: s, clients }: { seat: Seat; clients: CaClient[] }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });
  const onError = (e: Error) => toast.error(e.message);
  const toggle = useMutation({
    mutationFn: (v: { clientId: string; on: boolean }) =>
      v.on ? caFirmSeatsApi.assign(s.id, v.clientId) : caFirmSeatsApi.unassign(s.id, v.clientId),
    onSuccess: refresh,
    onError,
  });
  const [confirming, setConfirming] = useState(false);
  const revoke = useMutation({ mutationFn: () => caFirmSeatsApi.revoke(s.id), onSuccess: refresh, onError });
  const link = s.status === 'PENDING' ? inviteLinkStatus(s.inviteExpiresAt) : null;

  return (
    <li className="rounded-xl border border-border/70 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[15px] text-foreground">{s.name}</p>
          <p className="text-[12.5px] text-muted-foreground">
            {s.invitedEmail}
            {s.status === 'PENDING' ? (
              <span className={link?.expired ? 'ml-2 text-negative' : 'ml-2 text-warning'}>
                Not accepted yet{link ? ` · ${link.text}` : ''}
              </span>
            ) : (
              s.acceptedAt && <span className="ml-2">Joined {fmtDate(s.acceptedAt)}</span>
            )}
          </p>
        </div>
        {confirming ? (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
            <Button size="sm" variant="outline" className="border-negative/40 text-negative" onClick={() => revoke.mutate()} disabled={revoke.isPending}>
              {s.status === 'PENDING' ? 'Withdraw invitation' : 'Remove from firm'}
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setConfirming(true)}>
            Remove
          </Button>
        )}
      </div>

      {s.status === 'ACTIVE' && (
        <fieldset className="mt-3">
          <legend className="mb-1.5 text-[12.5px] text-muted-foreground">
            Clients {s.name} works on ({s.clientIds.length})
          </legend>
          {clients.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">You have no active clients to assign.</p>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {clients.map((c) => {
                const on = s.clientIds.includes(c.id);
                return (
                  <label key={c.id} className="flex items-center gap-1.5 text-[13px]">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={toggle.isPending}
                      onChange={() => toggle.mutate({ clientId: c.id, on: !on })}
                      className="h-4 w-4"
                    />
                    {c.displayName}
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
      )}
    </li>
  );
}
