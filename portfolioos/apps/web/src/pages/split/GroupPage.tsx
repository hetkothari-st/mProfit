// apps/web/src/pages/split/GroupPage.tsx
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, HandCoins } from 'lucide-react';
import { Decimal, toDecimal, formatDateIST, formatDateTimeIST } from '@everypaisa/shared';
import type { SplitExpenseDto, SplitGroupDto } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiErrorMessage } from '@/api/client';
import { SPLIT_KEYS, splitApi } from '@/api/split.api';
import { formatSplitMoney, memberName, transferLabel } from '@/lib/splitFormat';
import { BalancePill } from './BalancePill';
import { AddExpenseDialog } from './AddExpenseDialog';
import { SettleUpDialog } from './SettleUpDialog';
import { ContactDialog } from './ContactDialog';
import { activityText } from './SplitHomePage';

function myLine(e: SplitExpenseDto, myId: string | undefined, currency: string): string {
  if (!myId) return '';
  const paid = e.payers.filter((p) => p.memberId === myId).reduce((a, p) => a.plus(toDecimal(p.baseAmount)), new Decimal(0));
  const share = e.shares.filter((s) => s.memberId === myId).reduce((a, s) => a.plus(toDecimal(s.baseAmount)), new Decimal(0));
  const diff = paid.minus(share);
  if (diff.isZero()) return paid.isZero() ? 'not involved' : 'settled';
  return diff.gt(0) ? `you lent ${formatSplitMoney(diff, currency)}` : `you borrowed ${formatSplitMoney(diff.abs(), currency)}`;
}

function isNotFound(err: unknown): boolean {
  return axios.isAxiosError(err) && (err.response?.status === 404 || err.response?.status === 403);
}

function LoadError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <p className="text-sm text-muted-foreground py-6 text-center">
      {text} <Button variant="link" size="sm" onClick={onRetry}>Retry</Button>
    </p>
  );
}

function ExpensesTab({ group, expenses, status, onRetry }: {
  group: SplitGroupDto; expenses: SplitExpenseDto[]; status: 'pending' | 'error' | 'success'; onRetry: () => void;
}) {
  const me = group.members.find((m) => m.isMe);
  if (status === 'pending') return <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>;
  if (status === 'error') return <LoadError text="Couldn't load expenses." onRetry={onRetry} />;
  if (expenses.length === 0) return <p className="text-sm text-muted-foreground py-6 text-center">No expenses yet.</p>;
  // Consecutive grouping: the API returns expenses ordered by date desc.
  const days: { date: string; items: SplitExpenseDto[] }[] = [];
  for (const e of expenses) {
    const last = days[days.length - 1];
    if (last && last.date === e.date) last.items.push(e);
    else days.push({ date: e.date, items: [e] });
  }
  return (
    <div className="space-y-3">
      {days.map((d) => (
        <section key={d.date}>
          <h3 data-testid="expense-day" className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{formatDateIST(`${d.date}T00:00:00+05:30`)}</h3>
          <Card><CardContent className="p-0 divide-y">
            {d.items.map((e) => (
              <Link key={e.id} to={`/split/expenses/${e.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
                <div className="min-w-0">
                  <p className="font-medium truncate">{e.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.payers.length === 1 ? `${memberName(group.members, e.payers[0]!.memberId)} paid` : `${e.payers.length} people paid`} {formatSplitMoney(e.amount, e.currency)}
                  </p>
                </div>
                <span className="text-sm text-muted-foreground whitespace-nowrap">{myLine(e, me?.id, group.baseCurrency)}</span>
              </Link>
            ))}
          </CardContent></Card>
        </section>
      ))}
    </div>
  );
}

function SettingsTab({ group }: { group: SplitGroupDto }) {
  const qc = useQueryClient();
  const [name, setName] = useState(group.name);
  const [addPerson, setAddPerson] = useState(false);
  const contacts = useQuery({ queryKey: SPLIT_KEYS.contacts, queryFn: splitApi.listContacts });
  const refresh = () => void qc.invalidateQueries({ queryKey: SPLIT_KEYS.all });
  const onErr = (fallback: string) => (err: unknown) => toast.error(apiErrorMessage(err, fallback));

  const update = useMutation({ mutationFn: (p: Parameters<typeof splitApi.updateGroup>[1]) => splitApi.updateGroup(group.id, p), onSuccess: () => { refresh(); toast.success('Saved'); }, onError: onErr('Could not save') });
  const add = useMutation({ mutationFn: (contactId: string) => splitApi.addMember(group.id, contactId), onSuccess: refresh, onError: onErr('Could not add') });
  const remove = useMutation({ mutationFn: (memberId: string) => splitApi.removeMember(group.id, memberId), onSuccess: () => { refresh(); toast.success('Removed'); }, onError: onErr('Could not remove') });

  const direct = group.type === 'DIRECT';
  const memberContactIds = new Set(group.members.filter((m) => !m.leftAt).map((m) => m.contactId));
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
            <span className="text-sm">{m.isMe ? `${m.displayName} (you)` : m.displayName}{!m.userId && <span className="text-xs text-muted-foreground"> · not on the app yet</span>}</span>
            {!direct && <Button variant="ghost" size="sm" aria-label={`Remove ${m.isMe ? 'yourself' : m.displayName}`} onClick={() => remove.mutate(m.id)}>Remove</Button>}
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
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => update.mutate({ archived: !group.archivedAt })}>
            {group.archivedAt ? 'Unarchive group' : 'Archive group'}
          </Button>
        </div>
      )}
      <ContactDialog open={addPerson} onOpenChange={setAddPerson} onSaved={(c) => add.mutate(c.id)} />
    </div>
  );
}

export function GroupPage() {
  const { id = '' } = useParams();
  const [adding, setAdding] = useState(false);
  const [settle, setSettle] = useState<{ from?: string; to?: string; amount?: string } | null>(null);
  const group = useQuery({ queryKey: SPLIT_KEYS.group(id), queryFn: () => splitApi.getGroup(id),
    retry: (count, err) => !isNotFound(err) && count < 2 });
  const expenses = useQuery({ queryKey: SPLIT_KEYS.expenses(id), queryFn: () => splitApi.listExpenses(id) });
  const balances = useQuery({ queryKey: SPLIT_KEYS.balances(id), queryFn: () => splitApi.balances(id) });
  const activity = useQuery({ queryKey: SPLIT_KEYS.activity(id), queryFn: () => splitApi.activity(id) });

  if (group.isError) {
    return isNotFound(group.error)
      ? <p className="text-sm text-muted-foreground">This group doesn’t exist or you’re no longer in it. <Link className="underline" to="/split">Back to Split Expenses</Link></p>
      : <LoadError text="Couldn't load this group." onRetry={() => void group.refetch()} />;
  }
  if (!group.data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const g = group.data;

  return (
    <div className="space-y-5">
      <Link to="/split" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Split Expenses</Link>
      <PageHeader
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
        <BalancePill net={g.myNet} currency={g.baseCurrency} className="text-base" />
      </CardContent></Card>

      <Tabs defaultValue="expenses">
        <TabsList>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="expenses" className="pt-3"><ExpensesTab group={g} expenses={expenses.data ?? []} status={expenses.status} onRetry={() => void expenses.refetch()} /></TabsContent>
        <TabsContent value="balances" className="pt-3 space-y-3">
          {balances.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {balances.isError && <LoadError text="Couldn't load balances." onRetry={() => void balances.refetch()} />}
          {balances.isSuccess && <>
          <Card><CardContent className="p-0 divide-y">
            {(balances.data?.nets ?? []).filter((n) => !toDecimal(n.net).isZero() || !g.members.find((m) => m.id === n.memberId)?.leftAt).map((n) => (
              <div key={n.memberId} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm">{memberName(g.members, n.memberId)}</span>
                <BalancePill net={n.net} currency={g.baseCurrency} />
              </div>
            ))}
          </CardContent></Card>
          <h3 className="text-sm font-semibold">{balances.data?.simplified ? 'Suggested payments' : 'Who owes whom'}</h3>
          {balances.data.transfers.length === 0 && <p className="text-sm text-muted-foreground">Everyone is settled up.</p>}
          <Card><CardContent className="p-0 divide-y">
            {(balances.data?.transfers ?? []).map((t, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm">{transferLabel(g.members, t, g.baseCurrency)}</span>
                <Button size="sm" variant="outline" onClick={() => setSettle({ from: t.fromMemberId, to: t.toMemberId, amount: t.amount })}>Settle</Button>
              </div>
            ))}
          </CardContent></Card>
          </>}
        </TabsContent>
        <TabsContent value="activity" className="pt-3">
          {activity.isError && <LoadError text="Couldn't load activity." onRetry={() => void activity.refetch()} />}
          <Card><CardContent className="p-0 divide-y">
            {(activity.data ?? []).map((a) => (
              <div key={a.id} className="px-4 py-3">
                <p className="text-sm">{activityText(a)}</p>
                <p className="text-xs text-muted-foreground">{formatDateTimeIST(a.createdAt)}</p>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="settings" className="pt-3"><SettingsTab group={g} /></TabsContent>
      </Tabs>

      <AddExpenseDialog open={adding} onOpenChange={setAdding} group={g} />
      <SettleUpDialog open={settle !== null} onOpenChange={(o) => !o && setSettle(null)} group={g} {...(settle ?? {})} />
    </div>
  );
}
