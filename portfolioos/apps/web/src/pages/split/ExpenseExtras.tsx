import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Paperclip, Plus, Trash2 } from 'lucide-react';
import { formatDateTimeIST, toDecimal } from '@everypaisa/shared';
import type { SplitExpenseDto, SplitGroupDto } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PortfolioSelect } from '@/components/common/PortfolioSelect';
import { SPLIT_KEYS, splitApi } from '@/api/split.api';
import { formatSplitMoney } from '@/lib/splitFormat';
import { ConfirmDialog } from './ConfirmDialog';
import { splitErrorMessage } from './errors';

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const LABEL_COLORS = ['#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#2563eb', '#7c3aed', '#64748b'];

type Props = { expense: SplitExpenseDto; group: SplitGroupDto };

export function ExpenseExtras({ expense, group }: Props) {
  return (
    <div className="space-y-3">
      <ReceiptCard expense={expense} />
      <LabelsCard expense={expense} group={group} />
      <CashActivityCard expense={expense} />
      <CommentsCard expense={expense} />
    </div>
  );
}

function ReceiptCard({ expense }: { expense: SplitExpenseDto }) {
  const qc = useQueryClient();
  const readOnly = !!expense.deletedAt;
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [view, setView] = useState<{ url: string; isPdf: boolean } | null>(null);
  const [version, setVersion] = useState(0);
  const [fetchTry, setFetchTry] = useState(0);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: SPLIT_KEYS.expense(expense.id) });
    void qc.invalidateQueries({ queryKey: SPLIT_KEYS.expenses(expense.groupId) });
  };

  useEffect(() => {
    if (!expense.hasReceipt) { setView(null); return; }
    let cancelled = false;
    let made: string | null = null;
    setError(null);
    setView(null);
    splitApi.fetchReceipt(expense.id)
      .then((blob) => {
        if (cancelled) return;
        made = URL.createObjectURL(blob);
        setView({ url: made, isPdf: blob.type === 'application/pdf' });
      })
      .catch((err: unknown) => { if (!cancelled) setError(splitErrorMessage(err, "Couldn't load the receipt")); });
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [expense.id, expense.hasReceipt, version, fetchTry]);

  const upload = useMutation({
    mutationFn: (f: File) => splitApi.uploadReceipt(expense.id, f),
    onSuccess: () => { setError(null); setVersion((v) => v + 1); refresh(); toast.success('Receipt saved'); },
    onError: (err) => setError(splitErrorMessage(err, "Couldn't upload the receipt")),
  });
  const remove = useMutation({
    mutationFn: () => splitApi.deleteReceipt(expense.id),
    onSuccess: () => { refresh(); toast.success('Receipt removed'); },
    onError: (err) => toast.error(splitErrorMessage(err, "Couldn't remove the receipt")),
  });

  const onPick = (f: File | undefined) => {
    if (inputRef.current) inputRef.current.value = '';
    if (!f) return;
    if (f.size > MAX_RECEIPT_BYTES) { setError('Receipts must be under 10 MB'); return; }
    setError(null);
    upload.mutate(f);
  };

  return (
    <Card><CardContent className="p-4 space-y-3">
      <h2 className="text-sm font-semibold">Receipt</h2>
      {expense.hasReceipt && !view && !error && <p className="text-sm text-muted-foreground">Loading receipt…</p>}
      {expense.hasReceipt && view && (view.isPdf
        ? <a href={view.url} target="_blank" rel="noreferrer" className="text-sm underline">Open PDF</a>
        : <img src={view.url} alt="Receipt" className="max-h-72 max-w-full rounded-md border object-contain" />)}
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
          <Button type="button" variant="outline" size="sm" disabled={upload.isPending} onClick={() => inputRef.current?.click()}>
            <Paperclip className="h-4 w-4 mr-1.5" />{expense.hasReceipt ? 'Replace' : 'Add receipt'}
          </Button>
          {expense.hasReceipt && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmRemove(true)}>
              <Trash2 className="h-4 w-4 mr-1.5" />Remove
            </Button>
          )}
        </div>
      )}
      {!expense.hasReceipt && readOnly && <p className="text-sm text-muted-foreground">No receipt.</p>}
      {error && (
        <div className="flex items-center gap-2">
          <p role="alert" className="text-xs text-destructive">{error}</p>
          {expense.hasReceipt && <Button type="button" variant="outline" size="sm" onClick={() => setFetchTry((n) => n + 1)}>Retry</Button>}
        </div>
      )}
      <ConfirmDialog open={confirmRemove} onOpenChange={setConfirmRemove} title="Remove this receipt?"
        confirmLabel="Remove" destructive onConfirm={() => remove.mutate()} />
    </CardContent></Card>
  );
}

function LabelsCard({ expense, group }: Props) {
  const qc = useQueryClient();
  const readOnly = !!expense.deletedAt;
  const labels = useQuery({ queryKey: SPLIT_KEYS.labels(group.id), queryFn: () => splitApi.listLabels(group.id) });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(LABEL_COLORS[0]!);

  const setLabels = useMutation({
    mutationFn: (ids: string[]) => splitApi.setExpenseLabels(expense.id, ids),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SPLIT_KEYS.expense(expense.id) });
      void qc.invalidateQueries({ queryKey: SPLIT_KEYS.expenses(expense.groupId) });
    },
    onError: (err) => toast.error(splitErrorMessage(err, "Couldn't update labels")),
  });
  const create = useMutation({
    mutationFn: () => splitApi.createLabel(group.id, { name: name.trim(), color }),
    onSuccess: () => {
      setName(''); setAdding(false);
      void qc.invalidateQueries({ queryKey: SPLIT_KEYS.labels(group.id) });
    },
    onError: (err) => toast.error(splitErrorMessage(err, "Couldn't create the label")),
  });

  const toggle = (id: string) => {
    const on = expense.labelIds.includes(id);
    setLabels.mutate(on ? expense.labelIds.filter((x) => x !== id) : [...expense.labelIds, id]);
  };
  const all = labels.data ?? [];
  const shown = readOnly ? all.filter((l) => expense.labelIds.includes(l.id)) : all;

  return (
    <Card><CardContent className="p-4 space-y-3">
      <h2 className="text-sm font-semibold">Labels</h2>
      <div className="flex flex-wrap gap-2">
        {shown.map((l) => {
          const on = expense.labelIds.includes(l.id);
          return (
            <button key={l.id} type="button" aria-pressed={on} disabled={readOnly || setLabels.isPending}
              onClick={() => toggle(l.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${on ? 'bg-accent font-semibold' : 'bg-background'}`}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />{l.name}
            </button>
          );
        })}
        {labels.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
        {labels.isError && (
          <p className="text-sm text-destructive">Couldn't load labels.{' '}
            <Button type="button" variant="outline" size="sm" onClick={() => void labels.refetch()}>Retry</Button></p>
        )}
        {labels.isSuccess && shown.length === 0 && <p className="text-sm text-muted-foreground">{readOnly ? 'No labels.' : 'No labels yet.'}</p>}
      </div>
      {!readOnly && (adding ? (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }}>
          <Input aria-label="Label name" value={name} maxLength={30} placeholder="Label name" onChange={(e) => setName(e.target.value)} />
          <div className="flex gap-2" role="radiogroup" aria-label="Label colour">
            {LABEL_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={c === color} aria-label={`Colour ${c}`}
                onClick={() => setColor(c)} style={{ backgroundColor: c }}
                className={`h-6 w-6 rounded-full ${c === color ? 'ring-2 ring-offset-2 ring-foreground' : ''}`} />
            ))}
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!name.trim() || create.isPending}>Create</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4 mr-1" />New label</Button>
      ))}
    </CardContent></Card>
  );
}

function CommentsCard({ expense }: { expense: SplitExpenseDto }) {
  const qc = useQueryClient();
  const readOnly = !!expense.deletedAt;
  const comments = useQuery({ queryKey: SPLIT_KEYS.comments(expense.id), queryFn: () => splitApi.listComments(expense.id) });
  const [body, setBody] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: SPLIT_KEYS.comments(expense.id) });

  const post = useMutation({
    mutationFn: () => splitApi.addComment(expense.id, body.trim()),
    onSuccess: () => { setBody(''); refresh(); },
    onError: (err) => toast.error(splitErrorMessage(err, "Couldn't post the comment")),
  });
  const del = useMutation({
    mutationFn: (id: string) => splitApi.deleteComment(id),
    onSuccess: refresh,
    onError: (err) => toast.error(splitErrorMessage(err, "Couldn't delete the comment")),
  });

  return (
    <Card><CardContent className="p-4 space-y-3">
      <h2 className="text-sm font-semibold">Comments</h2>
      {(comments.data ?? []).map((c) => (
        <div key={c.id} className="text-sm">
          <div className="flex items-center justify-between gap-2">
            <p><span className="font-medium">{c.authorName}</span>
              <span className="ml-2 text-xs text-muted-foreground">{formatDateTimeIST(c.createdAt)}</span></p>
            {c.mine && !readOnly && (
              <Button type="button" variant="ghost" size="sm" aria-label="Delete comment" onClick={() => setDeleteId(c.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="whitespace-pre-wrap break-words">{c.body}</p>
        </div>
      ))}
      {comments.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {comments.isError && (
        <p className="text-sm text-destructive">Couldn't load comments.{' '}
          <Button type="button" variant="outline" size="sm" onClick={() => void comments.refetch()}>Retry</Button></p>
      )}
      {comments.isSuccess && comments.data.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
      {!readOnly && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (body.trim()) post.mutate(); }}>
          <textarea aria-label="Add a comment" value={body} maxLength={1000} rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            onChange={(e) => setBody(e.target.value)} />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{body.length}/1000</span>
            <Button type="submit" size="sm" disabled={!body.trim() || post.isPending}>Post</Button>
          </div>
        </form>
      )}
      <ConfirmDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}
        title="Delete this comment?" confirmLabel="Delete" destructive
        onConfirm={() => { if (deleteId) del.mutate(deleteId); }} />
    </CardContent></Card>
  );
}

function CashActivityCard({ expense }: { expense: SplitExpenseDto }) {
  const qc = useQueryClient();
  const readOnly = !!expense.deletedAt;
  const link = useQuery({ queryKey: SPLIT_KEYS.shareLink(expense.id), queryFn: () => splitApi.getShareLink(expense.id) });
  const settings = useQuery({ queryKey: SPLIT_KEYS.settings, queryFn: splitApi.getSettings });
  const [needPortfolio, setNeedPortfolio] = useState(false);

  const save = useMutation({
    mutationFn: (i: { enabled: boolean; portfolioId?: string | null }) => splitApi.setShareLink(expense.id, i),
    onSuccess: () => {
      setNeedPortfolio(false);
      void qc.invalidateQueries({ queryKey: SPLIT_KEYS.shareLink(expense.id) });
      void qc.invalidateQueries({ queryKey: SPLIT_KEYS.expenses(expense.groupId) });
      // Cash Activity pages: CashFlowsPage, bank-account detail, forecast.
      for (const k of ['cashflows', 'bank-account-cashflows', 'cashflow-forecast']) void qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (err) => toast.error(splitErrorMessage(err, "Couldn't update Cash Activity")),
  });

  const l = link.data;
  if (!l) return <Card><CardContent className="p-4 text-sm text-muted-foreground">{link.isError ? "Couldn't load Cash Activity." : 'Loading…'}</CardContent></Card>;
  const noShare = toDecimal(l.myShare).isZero();
  const enabled = l.enabled;
  const defaultPortfolio = l.portfolioId ?? settings.data?.defaultPortfolioId ?? null;
  const label = `Add my share (${formatSplitMoney(l.myShare, l.currency || 'INR')}) to Cash Activity`;

  const flip = () => {
    if (enabled) { save.mutate({ enabled: false }); return; }
    if (defaultPortfolio) save.mutate({ enabled: true, portfolioId: defaultPortfolio });
    else setNeedPortfolio((v) => !v);
  };

  return (
    <Card><CardContent className="p-4 space-y-3">
      <h2 className="text-sm font-semibold">Cash Activity</h2>
      {noShare ? (
        <p className="text-sm text-muted-foreground">Not part of this split</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <span id={`ca-${expense.id}`} className="text-sm">{label}</span>
            <button type="button" role="switch" aria-checked={enabled || needPortfolio} aria-label={label}
              disabled={readOnly || save.isPending} onClick={flip}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${enabled || needPortfolio ? 'bg-primary' : 'bg-muted-foreground/40'}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${enabled || needPortfolio ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>
          {needPortfolio && !enabled && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Pick a portfolio for this entry</p>
              <PortfolioSelect value={null} emptyLabel="Choose a portfolio"
                onChange={(id) => { if (id) save.mutate({ enabled: true, portfolioId: id }); }} />
            </div>
          )}
        </>
      )}
    </CardContent></Card>
  );
}
