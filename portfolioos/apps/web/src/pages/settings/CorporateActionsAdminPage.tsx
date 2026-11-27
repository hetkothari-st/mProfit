import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { formatDateIST } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiErrorMessage } from '@/api/client';
import { corporateActionsAdminApi, type ManualCorporateActionInput } from '@/api/corporateActionsAdmin.api';
import { useAuthStore } from '@/stores/auth.store';

const QUERY_KEY = ['admin-corporate-actions-manual'];

/**
 * Settings - Corporate actions. Enter a split or bonus the NSE/BSE feeds missed;
 * it is stored like a feed row and, if asked, applied to every holding of the
 * stock straight away. The server gate (ADMIN + second factor) is the control
 * that matters; the role check here only avoids a page whose requests would fail.
 */
export function CorporateActionsAdminPage() {
  const isAdmin = useAuthStore((s) => s.user?.role) === 'ADMIN';
  const qc = useQueryClient();
  const [type, setType] = useState<'SPLIT' | 'BONUS'>('SPLIT');
  const [stock, setStock] = useState('');
  const [exDate, setExDate] = useState('');
  const [a, setA] = useState(''); // old face value, or bonus shares
  const [b, setB] = useState(''); // new face value, or shares held
  const [applyNow, setApplyNow] = useState(true);

  const list = useQuery({ queryKey: QUERY_KEY, queryFn: () => corporateActionsAdminApi.list(), enabled: isAdmin });
  const add = useMutation({
    mutationFn: (input: ManualCorporateActionInput) => corporateActionsAdminApi.add(input),
    onSuccess: (r) => {
      toast.success(
        `${r.symbol} ${r.type.toLowerCase()} ${r.created ? 'saved' : 'already stored'} (ratio ${r.ratio}). ` +
          `Applied to ${r.portfoliosApplied} portfolio${r.portfoliosApplied === 1 ? '' : 's'}.`,
      );
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not save the corporate action')),
  });

  if (!isAdmin) return <p className="text-sm text-muted-foreground">This page is for the EveryPaisa team.</p>;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const base = { stock: stock.trim(), exDate, applyNow };
    add.mutate(
      type === 'SPLIT'
        ? { type, ...base, fromFaceValue: a.trim(), toFaceValue: b.trim() }
        : { type, ...base, bonusShares: a.trim(), heldShares: b.trim() },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Corporate actions"
        description="Enter a split or bonus the NSE and BSE feeds missed. It is applied to every holding of that stock: units go up, total cost stays the same."
      />
      <Card>
        <CardContent className="p-4 sm:p-6">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ca-type">Action</Label>
              <Select id="ca-type" value={type} onChange={(e) => setType(e.target.value as 'SPLIT' | 'BONUS')}>
                <option value="SPLIT">Split (face value lowered)</option>
                <option value="BONUS">Bonus shares</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="ca-stock">NSE symbol or ISIN</Label>
              <Input id="ca-stock" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="e.g. INFY" required />
            </div>
            <div>
              <Label htmlFor="ca-exdate">Ex-date</Label>
              <Input id="ca-exdate" type="date" value={exDate} onChange={(e) => setExDate(e.target.value)} required />
            </div>
            <div />
            <div>
              <Label htmlFor="ca-a">{type === 'SPLIT' ? 'Old face value (₹)' : 'Bonus shares'}</Label>
              <Input id="ca-a" inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} placeholder={type === 'SPLIT' ? '2' : '4'} required />
            </div>
            <div>
              <Label htmlFor="ca-b">{type === 'SPLIT' ? 'New face value (₹)' : 'For every … shares held'}</Label>
              <Input id="ca-b" inputMode="decimal" value={b} onChange={(e) => setB(e.target.value)} placeholder="1" required />
            </div>
            <p className="text-[13px] text-muted-foreground sm:col-span-2">
              {type === 'SPLIT'
                ? 'Face value ₹2 → ₹1 means each share becomes 2.'
                : '4 for every 1 held means 4 free shares per share (NSE writes this "Bonus 4:1").'}
            </p>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={applyNow} onChange={(e) => setApplyNow(e.target.checked)} />
              Apply to holdings now (otherwise the nightly job applies it)
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={add.isPending}>{add.isPending ? 'Saving…' : 'Save corporate action'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Entered by hand</h2>
        {list.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : list.isError ? (
          <p className="text-sm text-negative">{apiErrorMessage(list.error, 'Could not load corporate actions.')}</p>
        ) : (list.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing entered by hand yet.</p>
        ) : (
          <ul className="divide-y rounded-xl border text-sm">
            {list.data!.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span className="font-medium">{r.symbol ?? '—'}</span>
                <span>{r.type === 'SPLIT' ? 'Split' : r.type === 'BONUS' ? 'Bonus' : r.type} · ratio {r.ratio ?? '—'}</span>
                <span className="text-muted-foreground">ex-date {formatDateIST(r.exDate)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
