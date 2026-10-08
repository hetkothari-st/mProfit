// apps/web/src/pages/split/FriendPage.tsx
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus } from 'lucide-react';
import type { SplitGroupDto } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiErrorMessage } from '@/api/client';
import { SPLIT_KEYS, splitApi } from '@/api/split.api';
import { useAuthStore } from '@/stores/auth.store';
import { BalancePill } from './BalancePill';
import { AddExpenseDialog } from './AddExpenseDialog';
import { myDisplayName } from './NewGroupDialog';

export function FriendPage() {
  const { key: rawKey = '' } = useParams();
  const key = decodeURIComponent(rawKey);
  const user = useAuthStore((s: { user: { name?: string | null } | null }) => s.user);
  const friends = useQuery({ queryKey: SPLIT_KEYS.friends, queryFn: splitApi.friends });
  const [direct, setDirect] = useState<SplitGroupDto | null>(null);

  const open1to1 = useMutation({
    mutationFn: (contactId: string) => splitApi.directGroup(contactId, myDisplayName(user)),
    onSuccess: (g) => setDirect(g),
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not open your 1:1 expenses')),
  });

  if (friends.isError) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Couldn't load balances. <Button variant="link" size="sm" onClick={() => void friends.refetch()}>Retry</Button>
      </p>
    );
  }
  if (!friends.data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const friend = friends.data.find((f) => f.key === key);
  if (!friend) return <p className="text-sm text-muted-foreground">No balances with this person. <Link className="underline" to="/split">Back</Link></p>;

  return (
    <div className="space-y-5">
      <Link to="/split" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Split Expenses</Link>
      <PageHeader
        title={friend.displayName}
        actions={friend.contactId ? (
          <Button onClick={() => open1to1.mutate(friend.contactId!)} disabled={open1to1.isPending}><Plus className="h-4 w-4 mr-1.5" />Add expense</Button>
        ) : undefined}
      />
      <Card><CardContent className="p-4 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Overall</span>
        <BalancePill net={friend.net} currency={friend.currency} approx={friend.approx} className="text-base" />
      </CardContent></Card>
      {friend.approx && <p className="text-xs text-muted-foreground">Includes groups in other currencies, converted at the latest rate.</p>}
      {!friend.contactId && <p className="text-sm text-muted-foreground">{`Add expenses with ${friend.displayName} inside your shared groups.`}</p>}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">By group</h2>
        <Card><CardContent className="p-0 divide-y">
          {friend.groups.map((g) => (
            <Link key={g.groupId} to={`/split/groups/${g.groupId}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
              <span className="text-sm truncate">{g.groupName}</span>
              <BalancePill net={g.net} currency={g.currency} />
            </Link>
          ))}
        </CardContent></Card>
      </section>
      {direct && <AddExpenseDialog open onOpenChange={(o) => !o && setDirect(null)} group={direct} />}
    </div>
  );
}
