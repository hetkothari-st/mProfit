// apps/web/src/pages/split/GroupPage.tsx
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, HandCoins, Trash2, Paperclip } from 'lucide-react';
import { Decimal, toDecimal, formatDateIST, formatDateTimeIST } from '@everypaisa/shared';
import type { SplitContactDto, SplitExpenseDto, SplitGroupDto, SplitLabelDto, SplitSettlementDto } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { splitErrorMessage } from './errors';
import { copyText } from './clipboard';
import { SPLIT_KEYS, splitApi } from '@/api/split.api';
import { formatSplitMoney, memberName, transferLabel } from '@/lib/splitFormat';
import { BalancePill } from './BalancePill';
import { AddExpenseDialog } from './AddExpenseDialog';
import { SettleUpDialog } from './SettleUpDialog';
import { PayNowDialog } from './PayNowDialog';
import { ContactDialog } from './ContactDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { LoadError } from './LoadError';
import { isNotFound } from './queryErrors';
import axios from 'axios';
import { activityText } from './SplitHomePage';

function myLine(e: SplitExpenseDto, myId: string | undefined, currency: string): string {
  if (!myId) return '';
  const paid = e.payers.filter((p) => p.memberId === myId).reduce((a, p) => a.plus(toDecimal(p.baseAmount)), new Decimal(0));
  const share = e.shares.filter((s) => s.memberId === myId).reduce((a, s) => a.plus(toDecimal(s.baseAmount)), new Decimal(0));
  const diff = paid.minus(share);
  if (diff.isZero()) return paid.isZero() ? 'not involved' : 'settled';
  return diff.gt(0) ? `you lent ${formatSplitMoney(diff, currency)}` : `you borrowed ${formatSplitMoney(diff.abs(), currency)}`;
}

type DayItem = { kind: 'expense'; e: SplitExpenseDto } | { kind: 'payment'; s: SplitSettlementDto };
const dayOf = (iso: string) => iso.slice(0, 10);

function LabelChips({ ids, labels }: { ids: string[]; labels: SplitLabelDto[] }) {
  const shown = ids.map((id) => labels.find((l) => l.id === id)).filter((l): l is SplitLabelDto => !!l);
  if (shown.length === 0) return null;
  return (
    <span className="mt-1 inline-flex flex-wrap items-center gap-1.5">
      {shown.slice(0, 2).map((l) => (
        <span key={l.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />{l.name}
        </span>
      ))}
      {shown.length > 2 && <span className="text-[11px] text-muted-foreground">{`+${shown.length - 2}`}</span>}
    </span>
  );
}

function ExpensesTab({ group, expenses, settlements, settlementsStatus, onRetrySettlements, labels, status, onRetry, onDeletePayment }: {
  group: SplitGroupDto; expenses: SplitExpenseDto[]; settlements: SplitSettlementDto[];
  settlementsStatus: 'pending' | 'error' | 'success'; onRetrySettlements: () => void; labels: SplitLabelDto[];
  status: 'pending' | 'error' | 'success'; onRetry: () => void; onDeletePayment: (s: SplitSettlementDto) => void;
}) {
  const me = group.members.find((m) => m.isMe);
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  if (status === 'pending') return <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>;
  if (status === 'error') return <LoadError text="Couldn't load expenses." onRetry={onRetry} />;
  const payments = settlements.filter((s) => !s.deletedAt);
  const shownExpenses = labelFilter ? expenses.filter((e) => e.labelIds.includes(labelFilter)) : expenses;
  const shownPayments = labelFilter ? [] : payments;
  const paymentsError = settlementsStatus === 'error' && (
    <LoadError text="Couldn't load payments." onRetry={onRetrySettlements} />
  );
  if (expenses.length === 0 && payments.length === 0) {
    return <>{paymentsError}<p className="text-sm text-muted-foreground py-6 text-center">No expenses yet.</p></>;
  }
  // Group by day, newest first. The API returns each list ordered by date desc; expenses lead within a day.
  const byDay = new Map<string, DayItem[]>();
  const push = (date: string, item: DayItem) => { byDay.set(date, [...(byDay.get(date) ?? []), item]); };
  for (const e of shownExpenses) push(dayOf(e.date), { kind: 'expense', e });
  for (const s of shownPayments) push(dayOf(s.date), { kind: 'payment', s });
  const days = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
  return (
    <div className="space-y-3">
      {paymentsError}
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by label">
          {[{ id: null as string | null, name: 'All' }, ...labels].map((l) => (
            <button key={l.id ?? 'all'} type="button" aria-pressed={labelFilter === l.id} onClick={() => setLabelFilter(l.id)}
              className={`rounded-full border px-3 py-1 text-xs ${labelFilter === l.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{l.name}</button>
          ))}
        </div>
      )}
      {labelFilter && shownExpenses.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No expenses with this label.</p>}
      {days.map(([date, items]) => (
        <section key={date}>
          <h3 data-testid="expense-day" className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{formatDateIST(`${date}T00:00:00+05:30`)}</h3>
          <Card><CardContent className="p-0 divide-y">
            {items.map((it) => it.kind === 'expense' ? (
              <Link key={it.e.id} to={`/split/expenses/${it.e.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {it.e.description}
                    {it.e.hasReceipt && <Paperclip aria-label="Has receipt" className="ml-1.5 inline h-3.5 w-3.5 text-muted-foreground" />}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {it.e.payers.length === 1 ? `${memberName(group.members, it.e.payers[0]!.memberId)} paid` : `${it.e.payers.length} people paid`} {formatSplitMoney(it.e.amount, it.e.currency)}
                  </p>
                  <LabelChips ids={it.e.labelIds} labels={labels} />
                </div>
                <span className="text-sm text-muted-foreground whitespace-nowrap">{myLine(it.e, me?.id, group.baseCurrency)}</span>
              </Link>
            ) : (
              <div key={it.s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex items-center gap-2">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">Payment</span>
                  <p className="text-sm truncate">{`${memberName(group.members, it.s.fromMemberId)} paid ${memberName(group.members, it.s.toMemberId).replace(/^You$/, 'you')} ${formatSplitMoney(it.s.baseAmount, group.baseCurrency)}`}</p>
                </div>
                <Button variant="ghost" size="sm" aria-label="Delete payment" onClick={() => onDeletePayment(it.s)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </CardContent></Card>
        </section>
      ))}
    </div>
  );
}

function inviteErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (err.response?.status === 409) return "They're already on EveryPaisa";
    if (err.response?.status === 429) return 'Already invited today';
  }
  return splitErrorMessage(err, "Invite couldn't be sent right now");
}

function SettingsTab({ group, nets }: { group: SplitGroupDto; nets: Array<{ net: string }> | undefined }) {
  const inviteContact = useMutation({
    mutationFn: (contactId: string) => splitApi.inviteContact(contactId),
    onSuccess: (r) => (r.sent ? toast.success('Invite sent') : toast.error("Invite couldn't be sent right now")),
    onError: (err) => toast.error(inviteErrorMessage(err)),
  });
  const qc = useQueryClient();
  const [name, setName] = useState(group.name);
  const [addPerson, setAddPerson] = useState(false);
  const [removing, setRemoving] = useState<SplitGroupDto['members'][number] | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const contacts = useQuery({ queryKey: SPLIT_KEYS.contacts, queryFn: splitApi.listContacts });
  const refresh = () => void qc.invalidateQueries({ queryKey: SPLIT_KEYS.all });
  const onErr = (fallback: string) => (err: unknown) => toast.error(splitErrorMessage(err, fallback));

  const update = useMutation({ mutationFn: (p: Parameters<typeof splitApi.updateGroup>[1]) => splitApi.updateGroup(group.id, p), onSuccess: () => { refresh(); toast.success('Saved'); }, onError: onErr('Could not save') });
  const add = useMutation({ mutationFn: (contactId: string) => splitApi.addMember(group.id, contactId), onSuccess: refresh, onError: onErr('Could not add') });
  const remove = useMutation({ mutationFn: (memberId: string) => splitApi.removeMember(group.id, memberId), onSuccess: () => { refresh(); toast.success('Removed'); }, onError: onErr('Could not remove') });

  const direct = group.type === 'DIRECT';
  const memberContactIds = new Set(group.members.filter((m) => !m.leftAt).map((m) => m.contactId));
  const ownedContacts = new Map((contacts.data ?? []).map((c: SplitContactDto) => [c.id, c]));
  const canInvite = (m: SplitGroupDto['members'][number]) =>
    !m.isMe && !m.userId && !!m.contactId && !!ownedContacts.get(m.contactId)?.email && !ownedContacts.get(m.contactId)?.linkedUserId;
  const addable = (contacts.data ?? []).filter((c) => !memberContactIds.has(c.id));

  return (
    <div className="space-y-4">
      {!direct && (
        <Card><CardContent className="p-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="g-name">Group name</Label>
            <div className="flex gap-2">
              <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} />
              <Button variant="outline" onClick={() => update.mutate({ name: name.trim() })} disabled={!name.trim() || name.trim() === group.name}>Rename</Button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={group.simplifyDebts} onChange={(e) => update.mutate({ simplifyDebts: e.target.checked })} />
            Simplify debts (fewest payments to settle)
          </label>
          <p className="text-xs text-muted-foreground">Currency: {group.baseCurrency} (fixed once a group is created)</p>
        </CardContent></Card>
      )}
      <Card><CardContent className="p-0 divide-y">
        {group.members.filter((m) => !m.leftAt).map((m) => (
          <div key={m.id} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm">
              {m.isMe ? `${m.displayName} (you)` : m.displayName}
              {m.userId && !m.isMe && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">On EveryPaisa</span>}
            </span>
            <span className="flex items-center gap-1">
              {canInvite(m) && <Button variant="outline" size="sm" aria-label={`Invite ${m.displayName}`} disabled={inviteContact.isPending} onClick={() => inviteContact.mutate(m.contactId!)}>Invite</Button>}
              {!direct && <Button variant="ghost" size="sm" aria-label={`Remove ${m.isMe ? 'yourself' : m.displayName}`} onClick={() => setRemoving(m)}>Remove</Button>}
            </span>
          </div>
        ))}
      </CardContent></Card>
      {!direct && (
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Add a person" value="" onChange={(e) => e.target.value && add.mutate(e.target.value)} className="w-56">
            <option value="">Add someone…</option>
            {addable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Button variant="link" size="sm" onClick={() => setAddPerson(true)}>+ New person</Button>
          <Button variant="outline" size="sm" className="ml-auto" disabled={nets === undefined} onClick={() => {
            const unsettled = (nets ?? []).some((n) => !toDecimal(n.net).isZero());
            if (!group.archivedAt && unsettled) setConfirmArchive(true);
            else update.mutate({ archived: !group.archivedAt });
          }}>
            {group.archivedAt ? 'Unarchive group' : 'Archive group'}
          </Button>
        </div>
      )}
      <ContactDialog open={addPerson} onOpenChange={setAddPerson} onSaved={(c) => add.mutate(c.id)} />
      <ConfirmDialog
        open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}
        title={removing?.isMe ? 'Leave group' : 'Remove member'}
        description={removing?.isMe
          ? "Leave this group? You'll lose access to its history unless someone adds you back."
          : `Remove ${removing?.displayName ?? ''} from the group?`}
        confirmLabel={removing?.isMe ? 'Leave' : 'Remove'} destructive
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
      <ConfirmDialog
        open={confirmArchive} onOpenChange={setConfirmArchive}
        title="Archive this group"
        description="This group still has unsettled balances. Archive anyway?"
        confirmLabel="Archive" destructive
        onConfirm={() => update.mutate({ archived: true })}
      />
    </div>
  );
}

export function GroupPage() {
  const { id = '' } = useParams();
  const [adding, setAdding] = useState(false);
  const [settle, setSettle] = useState<{ from?: string; to?: string; amount?: string } | null>(null);
  const [pay, setPay] = useState<{ to: string; amount: string } | null>(null);
  const group = useQuery({ queryKey: SPLIT_KEYS.group(id), queryFn: () => splitApi.getGroup(id),
    retry: (count, err) => !isNotFound(err) && count < 2 });
  const expenses = useQuery({ queryKey: SPLIT_KEYS.expenses(id), queryFn: () => splitApi.listExpenses(id) });
  const balances = useQuery({ queryKey: SPLIT_KEYS.balances(id), queryFn: () => splitApi.balances(id) });
  const settlements = useQuery({ queryKey: SPLIT_KEYS.settlements(id), queryFn: () => splitApi.listSettlements(id) });
  const [deletingPayment, setDeletingPayment] = useState<SplitSettlementDto | null>(null);
  const qc = useQueryClient();
  const deletePayment = useMutation({
    mutationFn: (sid: string) => splitApi.deleteSettlement(sid),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: SPLIT_KEYS.all }); toast.success('Payment deleted'); },
    onError: (err) => toast.error(splitErrorMessage(err, 'Could not delete the payment')),
  });
  const labels = useQuery({ queryKey: SPLIT_KEYS.labels(id), queryFn: () => splitApi.listLabels(id) });
  const remind = useMutation({
    mutationFn: (memberId: string) => splitApi.remind(id, memberId),
    onSuccess: (r) => (r.sent ? toast.success('Reminder sent') : toast.error("Reminder saved but email couldn't be sent right now")),
    onError: (err) => toast.error(axios.isAxiosError(err) && err.response?.status === 409 ? 'Already reminded today' : splitErrorMessage(err, 'Could not send the reminder')),
  });
  const [shareError, setShareError] = useState<string | null>(null);
  const share = useMutation({
    mutationFn: async (t: { fromMemberId: string; amount: string }) => {
      const link = await splitApi.requestLink(id, t.fromMemberId, toDecimal(t.amount).toFixed(2));
      return { link, ...t };
    },
    onSuccess: async ({ link, fromMemberId, amount }) => {
      setShareError(null);
      const g0 = group.data;
      const text = `${g0 ? memberName(g0.members, fromMemberId) : 'Hi'}, pay ${formatSplitMoney(amount, 'INR')} for ${g0?.name ?? 'our group'}: ${link.uri}`;
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: 'Pay me back', text });
        } catch (err) {
          // Cancelling the share sheet is not an error; anything else is shown.
          if ((err as { name?: string }).name !== 'AbortError') toast.error("Couldn't open the share sheet");
        }
        return;
      }
      if (await copyText(link.uri)) toast.success('Pay link copied � paste it in WhatsApp or SMS');
      else toast.error("Couldn't copy the pay link � use Settle up instead");
    },
    onError: (err) => setShareError(splitErrorMessage(err, 'Could not create the pay link')),
  });
  const activity = useQuery({ queryKey: SPLIT_KEYS.activity(id), queryFn: () => splitApi.activity(id) });

  if (group.isError) {
    return isNotFound(group.error)
      ? <p className="text-sm text-muted-foreground">This group doesn’t exist or you’re no longer in it. <Link className="underline" to="/split">Back to Split Expenses</Link></p>
      : <LoadError text="Couldn't load this group." onRetry={() => void group.refetch()} />;
  }
  if (!group.data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const g = group.data;
  const me = g.members.find((m) => m.isMe);

  return (
    <div className="space-y-5 pb-24">
      <Link to="/split" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Split Expenses</Link>
      <PageHeader
        eyebrow="Split Expenses"
        title={g.name}
        description={g.type === 'DIRECT' ? 'Your 1:1 expenses' : `${g.members.filter((m) => !m.leftAt).length} people · ${g.baseCurrency}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setSettle({})}><HandCoins className="h-4 w-4 mr-1.5" />Settle up</Button>
            <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4 mr-1.5" />Add expense</Button>
          </>
        }
      />
      <Card><CardContent className="p-4 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Your balance</span>
        <BalancePill net={g.myNet} currency={g.baseCurrency} phrases={{ owed: 'you are owed', owe: 'you owe' }} className="text-base" />
      </CardContent></Card>

      <Tabs defaultValue="expenses">
        <TabsList>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="expenses" className="pt-3"><ExpensesTab group={g} expenses={expenses.data ?? []} settlements={settlements.data ?? []} settlementsStatus={settlements.status} onRetrySettlements={() => void settlements.refetch()} labels={labels.data ?? []} status={expenses.status} onRetry={() => void expenses.refetch()} onDeletePayment={setDeletingPayment} /></TabsContent>
        <TabsContent value="balances" className="pt-3 space-y-3">
          {balances.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {balances.isError && <LoadError text="Couldn't load balances." onRetry={() => void balances.refetch()} />}
          {balances.isSuccess && <>
          <Card><CardContent className="p-0 divide-y">
            {(balances.data?.nets ?? []).filter((n) => !toDecimal(n.net).isZero() || !g.members.find((m) => m.id === n.memberId)?.leftAt).map((n) => (
              <div key={n.memberId} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm">{memberName(g.members, n.memberId)}</span>
                <BalancePill net={n.net} currency={g.baseCurrency} phrases={g.members.find((m) => m.id === n.memberId)?.isMe ? { owed: 'you are owed', owe: 'you owe' } : { owed: 'is owed', owe: 'owes' }} />
              </div>
            ))}
          </CardContent></Card>
          <h3 className="text-sm font-semibold">{balances.data?.simplified ? 'Suggested payments' : 'Who owes whom'}</h3>
          {balances.data.transfers.length === 0 && <p className="text-sm text-muted-foreground">Everyone is settled up.</p>}
          <Card><CardContent className="p-0 divide-y">
            {(balances.data?.transfers ?? []).map((t, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm">{transferLabel(g.members, t, g.baseCurrency)}</span>
                <span className="flex items-center gap-1.5">
                  {t.toMemberId === me?.id && (
                    <>
                      <Button size="sm" variant="outline" disabled={remind.isPending} onClick={() => remind.mutate(t.fromMemberId)}>Remind</Button>
                      {g.baseCurrency === 'INR' && (
                        <Button size="sm" variant="outline" disabled={share.isPending} onClick={() => share.mutate({ fromMemberId: t.fromMemberId, amount: t.amount })}>Share pay link</Button>
                      )}
                    </>
                  )}
                  {t.fromMemberId === me?.id && g.baseCurrency === 'INR' && (
                    <Button size="sm" onClick={() => setPay({ to: t.toMemberId, amount: t.amount })}>Pay</Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setSettle({ from: t.fromMemberId, to: t.toMemberId, amount: t.amount })}>Settle</Button>
                </span>
              </div>
            ))}
          </CardContent></Card>
          {shareError && (
            <p role="alert" className="text-sm text-destructive">
              {shareError}{/UPI ID/i.test(shareError) && <> <Link className="underline" to="/split/settings">Open Split settings</Link></>}
            </p>
          )}
          </>}
        </TabsContent>
        <TabsContent value="activity" className="pt-3">
          {activity.isError && <LoadError text="Couldn't load activity." onRetry={() => void activity.refetch()} />}
          <Card><CardContent className="p-0 divide-y">
            {(activity.data ?? []).map((a) => (
              <div key={a.id} className="px-4 py-3">
                <p className="text-sm">{activityText(a, g.members)}</p>
                <p className="text-xs text-muted-foreground">{formatDateTimeIST(a.createdAt)}</p>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="settings" className="pt-3"><SettingsTab group={g} nets={balances.data?.nets} /></TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deletingPayment !== null} onOpenChange={(o) => !o && setDeletingPayment(null)}
        title="Delete payment" description="Delete this payment? Balances will change back."
        confirmLabel="Delete" destructive
        onConfirm={() => deletingPayment && deletePayment.mutate(deletingPayment.id)}
      />
      <AddExpenseDialog open={adding} onOpenChange={setAdding} group={g} />
      {pay && <PayNowDialog open onOpenChange={(o) => !o && setPay(null)} group={g} toMemberId={pay.to} amount={pay.amount} />}
      <SettleUpDialog open={settle !== null} onOpenChange={(o) => !o && setSettle(null)} group={g} {...(settle ?? {})} />
    </div>
  );
}
