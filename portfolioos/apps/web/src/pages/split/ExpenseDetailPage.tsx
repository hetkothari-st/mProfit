// apps/web/src/pages/split/ExpenseDetailPage.tsx
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Pencil, Trash2, RotateCcw } from 'lucide-react';
import { formatDateIST, formatDateTimeIST } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiErrorMessage } from '@/api/client';
import { SPLIT_KEYS, splitApi } from '@/api/split.api';
import { formatSplitMoney, memberName } from '@/lib/splitFormat';
import { AddExpenseDialog } from './AddExpenseDialog';
import { isNotFound } from './queryErrors';

const MODE_LABEL = { EQUAL: 'Split equally', EXACT: 'Exact amounts', PERCENT: 'By percent', SHARES: 'By shares' } as const;

function LoadError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <p className="text-sm text-muted-foreground py-6 text-center">
      {text} <Button variant="link" size="sm" onClick={onRetry}>Retry</Button>
    </p>
  );
}

export function ExpenseDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const expense = useQuery({ queryKey: SPLIT_KEYS.expense(id), queryFn: () => splitApi.getExpense(id),
    retry: (count, err) => !isNotFound(err) && count < 2 });
  const groupId = expense.data?.groupId ?? '';
  const group = useQuery({ queryKey: SPLIT_KEYS.group(groupId), queryFn: () => splitApi.getGroup(groupId), enabled: !!groupId });
  const refresh = () => void qc.invalidateQueries({ queryKey: SPLIT_KEYS.all });

  const restore = useMutation({
    mutationFn: () => splitApi.restoreExpense(id),
    onSuccess: () => { refresh(); toast.success('Expense restored'); },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not restore')),
  });
  // Standalone (not a mutation owned by this component) so Undo still reports after the user navigates away.
  const undoDelete = () => {
    splitApi.restoreExpense(id)
      .then(() => { void qc.invalidateQueries({ queryKey: SPLIT_KEYS.all }); toast.success('Expense restored'); })
      .catch((err: unknown) => { toast.error(apiErrorMessage(err, 'Could not restore')); });
  };
  const remove = useMutation({
    mutationFn: () => splitApi.deleteExpense(id),
    onSuccess: () => {
      refresh();
      toast((t) => (
        <span className="flex items-center gap-3">Expense deleted
          <button className="underline" onClick={() => { toast.dismiss(t.id); undoDelete(); }}>Undo</button>
        </span>
      ), { duration: 8000 });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not delete')),
  });

  if (expense.isError) {
    return isNotFound(expense.error)
      ? <p className="text-sm text-muted-foreground">This expense isn’t available. <Link className="underline" to="/split">Back</Link></p>
      : <LoadError text="Couldn't load this expense." onRetry={() => void expense.refetch()} />;
  }
  if (group.isError) return <LoadError text="Couldn't load this expense." onRetry={() => void group.refetch()} />;
  if (!expense.data || !group.data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const e = expense.data;
  const g = group.data;
  const foreign = e.currency !== g.baseCurrency;

  return (
    <div className="space-y-5">
      <Link to={`/split/groups/${g.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />{g.name}</Link>
      <PageHeader
        title={e.description}
        description={`${formatDateIST(e.date)} · ${MODE_LABEL[e.splitMode]}${e.deletedAt ? ' · deleted' : ''}`}
        actions={e.deletedAt ? (
          <Button onClick={() => restore.mutate()}><RotateCcw className="h-4 w-4 mr-1.5" />Restore</Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4 mr-1.5" />Edit</Button>
            <Button variant="destructive" onClick={() => remove.mutate()}><Trash2 className="h-4 w-4 mr-1.5" />Delete</Button>
          </>
        )}
      />
      <Card><CardContent className="p-4">
        <p className="text-3xl font-semibold tabular-nums">{formatSplitMoney(e.amount, e.currency)}</p>
        {foreign && <p className="text-sm text-muted-foreground mt-1">= {formatSplitMoney(e.baseAmount, g.baseCurrency)} at 1 {e.currency} = {e.fxRate} {g.baseCurrency}</p>}
      </CardContent></Card>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card><CardContent className="p-0 divide-y">
          <p className="px-4 py-2 text-xs font-semibold uppercase text-muted-foreground">Paid by</p>
          {e.payers.map((p) => (
            <div key={p.memberId} className="flex justify-between px-4 py-2.5 text-sm">
              <span>{memberName(g.members, p.memberId)}</span><span className="tabular-nums">{formatSplitMoney(p.amount, e.currency)}</span>
            </div>
          ))}
        </CardContent></Card>
        <Card><CardContent className="p-0 divide-y">
          <p className="px-4 py-2 text-xs font-semibold uppercase text-muted-foreground">Split between</p>
          {e.shares.map((s) => (
            <div key={s.memberId} className="flex justify-between px-4 py-2.5 text-sm">
              <span>{memberName(g.members, s.memberId)}</span><span className="tabular-nums">{formatSplitMoney(s.amount, e.currency)}</span>
            </div>
          ))}
        </CardContent></Card>
      </div>
      <p className="text-xs text-muted-foreground">Added {formatDateTimeIST(e.createdAt)}</p>
      <AddExpenseDialog open={editing} onOpenChange={setEditing} group={g} expense={e} />
    </div>
  );
}
