import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, UserPlus, UsersRound } from 'lucide-react';
import { Decimal, toDecimal, formatDateTimeIST } from '@everypaisa/shared';
import type { SplitActivityDto } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SPLIT_KEYS, splitApi } from '@/api/split.api';
import { formatSplitMoney } from '@/lib/splitFormat';
import { BalancePill } from './BalancePill';
import { NewGroupDialog } from './NewGroupDialog';
import { ContactDialog } from './ContactDialog';

export function activityText(a: SplitActivityDto): string {
  const p = (a.payload ?? {}) as Record<string, unknown>;
  const desc = typeof p.description === 'string' ? `“${p.description}”` : 'an expense';
  switch (a.kind) {
    case 'EXPENSE_ADDED': return `${a.actorName} added ${desc}`;
    case 'EXPENSE_EDITED': return `${a.actorName} edited ${desc}`;
    case 'EXPENSE_DELETED': return `${a.actorName} deleted ${desc}`;
    case 'EXPENSE_RESTORED': return `${a.actorName} restored ${desc}`;
    case 'SETTLED': return `${a.actorName} recorded a payment`;
    case 'SETTLEMENT_EDITED': return `${a.actorName} edited a payment`;
    case 'SETTLEMENT_DELETED': return `${a.actorName} deleted a payment`;
    case 'GROUP_CREATED': return `${a.actorName} created the group`;
    case 'GROUP_UPDATED': return `${a.actorName} changed group settings`;
    case 'MEMBER_ADDED': return `${a.actorName} added ${typeof p.displayName === 'string' ? p.displayName : 'someone'}`;
    case 'MEMBER_REMOVED': return `${a.actorName} removed a member`;
    default: return `${a.actorName} updated the group`;
  }
}

export function SplitHomePage() {
  const [newGroup, setNewGroup] = useState(false);
  const [newPerson, setNewPerson] = useState(false);
  const friends = useQuery({ queryKey: SPLIT_KEYS.friends, queryFn: splitApi.friends });
  const groups = useQuery({ queryKey: SPLIT_KEYS.groups, queryFn: () => splitApi.listGroups() });
  const activity = useQuery({ queryKey: SPLIT_KEYS.activity(), queryFn: () => splitApi.activity() });

  const list = friends.data ?? [];
  const owed = list.reduce((a, f) => (toDecimal(f.net).gt(0) ? a.plus(toDecimal(f.net)) : a), new Decimal(0));
  const owe = list.reduce((a, f) => (toDecimal(f.net).lt(0) ? a.plus(toDecimal(f.net).abs()) : a), new Decimal(0));
  const currency = list[0]?.currency ?? 'INR';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tools"
        title="Split Expenses"
        description="Share costs with friends, flatmates and trips — see who owes whom and settle up."
        actions={
          <>
            <Button variant="outline" onClick={() => setNewPerson(true)}><UserPlus className="h-4 w-4 mr-1.5" />Add person</Button>
            <Button onClick={() => setNewGroup(true)}><Plus className="h-4 w-4 mr-1.5" />New group</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">You are owed</p>
          <p data-testid="split-owed-total" className="text-xl font-semibold tabular-nums mt-1">{formatSplitMoney(owed, currency)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">You owe</p>
          <p data-testid="split-owe-total" className="text-xl font-semibold tabular-nums mt-1">{formatSplitMoney(owe, currency)}</p>
        </CardContent></Card>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Groups</h2>
        {groups.isSuccess && groups.data.length === 0 && (
          <Card><CardContent className="p-6 text-center space-y-2">
            <UsersRound className="h-6 w-6 mx-auto text-muted-foreground" />
            <p className="font-medium">No groups yet</p>
            <p className="text-sm text-muted-foreground">Create one for a trip, your flat, or anything you share.</p>
            <Button size="sm" onClick={() => setNewGroup(true)}>New group</Button>
          </CardContent></Card>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {(groups.data ?? []).map((g) => (
            <Link key={g.id} to={`/split/groups/${g.id}`} className="block">
              <Card className="hover:bg-muted/40 transition-colors"><CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{g.name}</p>
                  <p className="text-xs text-muted-foreground">{g.members.length} people · {g.baseCurrency}</p>
                </div>
                <BalancePill net={g.myNet} currency={g.baseCurrency} />
              </CardContent></Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Friends</h2>
        {friends.isSuccess && list.length === 0 && <p className="text-sm text-muted-foreground">Balances with people appear here once you add expenses.</p>}
        <Card><CardContent className="p-0 divide-y">
          {list.map((f) => (
            <Link key={f.key} to={`/split/friends/${encodeURIComponent(f.key)}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
              <span className="font-medium truncate">{f.displayName}</span>
              <BalancePill net={f.net} currency={f.currency} approx={f.approx} />
            </Link>
          ))}
        </CardContent></Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recent activity</h2>
        <Card><CardContent className="p-0 divide-y">
          {(activity.data ?? []).slice(0, 20).map((a) => (
            <Link key={a.id} to={`/split/groups/${a.groupId}`} className="block px-4 py-3 hover:bg-muted/40">
              <p className="text-sm">{activityText(a)} <span className="text-muted-foreground">in {a.groupName}</span></p>
              <p className="text-xs text-muted-foreground">{formatDateTimeIST(a.createdAt)}</p>
            </Link>
          ))}
          {activity.isSuccess && activity.data.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">Nothing yet.</p>}
        </CardContent></Card>
      </section>

      <NewGroupDialog open={newGroup} onOpenChange={setNewGroup} />
      <ContactDialog open={newPerson} onOpenChange={setNewPerson} />
    </div>
  );
}
