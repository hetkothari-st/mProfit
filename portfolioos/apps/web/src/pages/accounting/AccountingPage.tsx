import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpenCheck, ChevronRight, ChevronDown, Plus, Trash2,
  FileText, Scale, TrendingDown, Landmark,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { formatINR } from '@portfolioos/shared';
import {
  accountingApi,
  type AccountNode,
  type AccountFlat,
  type AccountType,
  type VoucherType,
  type VoucherDTO,
  type VoucherEntryInput,
  type CreateVoucherInput,
} from '@/api/accounting.api';

// ─── Chart of Accounts ────────────────────────────────────────────────────────

function AccountTreeNode({ node, depth, onAdd, onDelete }: {
  node: AccountNode; depth: number;
  onAdd: (parentId: string) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = node.children.length > 0;
  const typeColors: Record<AccountType, string> = {
    ASSET: 'text-blue-600', LIABILITY: 'text-orange-600',
    EQUITY: 'text-purple-600', INCOME: 'text-green-600', EXPENSE: 'text-red-600',
  };
  return (
    <div>
      <div
        className="flex items-center gap-1 py-1.5 px-2 rounded hover:bg-muted/50 group"
        style={{ paddingLeft: `${8 + depth * 20}px` }}
      >
        <button type="button" onClick={() => setOpen((v) => !v)} className="w-4 shrink-0 text-muted-foreground">
          {hasChildren
            ? (open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />)
            : <span className="w-3 inline-block" />}
        </button>
        <span className="text-xs text-muted-foreground w-16 shrink-0 font-mono">{node.code}</span>
        <span className="flex-1 text-sm">{node.name}</span>
        <span className={`text-xs font-medium ${typeColors[node.type]} w-20 text-right`}>{node.type}</span>
        <span className="text-xs tabular-nums text-muted-foreground w-28 text-right">
          {parseFloat(node.openingBalance) !== 0 ? formatINR(node.openingBalance) : '—'}
        </span>
        <div className="opacity-0 group-hover:opacity-100 flex gap-1 ml-2">
          <button type="button" onClick={() => onAdd(node.id)} className="p-0.5 hover:text-primary">
            <Plus className="h-3 w-3" />
          </button>
          <button type="button" onClick={() => onDelete(node.id, node.name)} className="p-0.5 hover:text-destructive">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      {open && hasChildren && (
        <div>
          {node.children.map((c) => (
            <AccountTreeNode key={c.id} node={c} depth={depth + 1} onAdd={onAdd} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

const ACCOUNT_TYPES: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];

function ChartOfAccountsTab() {
  const qc = useQueryClient();
  const { data: tree = [] } = useQuery({ queryKey: ['accounts-tree'], queryFn: () => accountingApi.getAccountsTree() });
  const { data: flat = [] } = useQuery({ queryKey: ['accounts-flat'], queryFn: () => accountingApi.getAccountsFlat() });

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    code: '', name: '', type: 'ASSET' as AccountType, parentId: '', openingBalance: '0',
  });

  const createMut = useMutation({
    mutationFn: () => accountingApi.createAccount({ ...form, parentId: form.parentId || null }),
    onSuccess: () => {
      toast.success('Account created');
      qc.invalidateQueries({ queryKey: ['accounts-tree'] });
      qc.invalidateQueries({ queryKey: ['accounts-flat'] });
      setAddOpen(false);
      setForm({ code: '', name: '', type: 'ASSET', parentId: '', openingBalance: '0' });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => accountingApi.deleteAccount(id),
    onSuccess: () => {
      toast.success('Account deleted');
      qc.invalidateQueries({ queryKey: ['accounts-tree'] });
      qc.invalidateQueries({ queryKey: ['accounts-flat'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Delete account "${name}"?`)) deleteMut.mutate(id);
  };
  const openAdd = (parentId: string) => {
    setForm((f) => ({ ...f, parentId }));
    setAddOpen(true);
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={() => openAdd('')}><Plus className="h-4 w-4" /> Add account</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center gap-1 py-2 px-2 border-b text-xs text-muted-foreground font-medium uppercase tracking-wider">
            <span className="w-4 shrink-0" />
            <span className="w-16 shrink-0">Code</span>
            <span className="flex-1">Name</span>
            <span className="w-20 text-right">Type</span>
            <span className="w-28 text-right">Opening Balance</span>
            <span className="w-12" />
          </div>
          {tree.map((n) => (
            <AccountTreeNode key={n.id} node={n} depth={0} onAdd={openAdd} onDelete={handleDelete} />
          ))}
          {tree.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Loading default chart of accounts…
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Account</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Code</Label>
                <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="e.g. 1001" />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as AccountType }))}>
                  {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </div>
            </div>
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Account name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Parent Account</Label>
                <Select value={form.parentId} onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}>
                  <option value="">None (top-level)</option>
                  {flat.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </Select>
              </div>
              <div>
                <Label>Opening Balance (₹)</Label>
                <Input type="number" value={form.openingBalance} onChange={(e) => setForm((f) => ({ ...f, openingBalance: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} disabled={!form.code || !form.name || createMut.isPending}>
              {createMut.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Vouchers ─────────────────────────────────────────────────────────────────

const VOUCHER_TYPES: VoucherType[] = ['JOURNAL', 'PAYMENT', 'RECEIPT', 'CONTRA', 'PURCHASE', 'SALES'];
const VOUCHER_COLORS: Record<VoucherType, string> = {
  JOURNAL: 'bg-blue-100 text-blue-800', PAYMENT: 'bg-red-100 text-red-800',
  RECEIPT: 'bg-green-100 text-green-800', CONTRA: 'bg-gray-100 text-gray-800',
  PURCHASE: 'bg-orange-100 text-orange-800', SALES: 'bg-purple-100 text-purple-800',
};

function VoucherFormDialog({ open, onOpenChange, accounts, initial }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  accounts: AccountFlat[];
  initial?: Partial<CreateVoucherInput>;
}) {
  const qc = useQueryClient();
  const [type, setType] = useState<VoucherType>(initial?.type ?? 'JOURNAL');
  const [voucherNo, setVoucherNo] = useState(initial?.voucherNo ?? '');
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10));
  const [narration, setNarration] = useState(initial?.narration ?? '');
  const [entries, setEntries] = useState<VoucherEntryInput[]>(
    initial?.entries ?? [{ debitAccountId: '', creditAccountId: '', amount: '', narration: '' }],
  );

  const nextNoQuery = useQuery({
    queryKey: ['voucher-next-no', type],
    queryFn: () => accountingApi.nextVoucherNo(type),
    enabled: !initial?.voucherNo,
  });
  const effectiveNo = voucherNo || nextNoQuery.data || '';

  const createMut = useMutation({
    mutationFn: () => accountingApi.createVoucher({ type, voucherNo: effectiveNo, date, narration, entries }),
    onSuccess: () => {
      toast.success('Voucher created');
      qc.invalidateQueries({ queryKey: ['vouchers'] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addEntry = () => setEntries((es) => [...es, { debitAccountId: '', creditAccountId: '', amount: '', narration: '' }]);
  const removeEntry = (i: number) => setEntries((es) => es.filter((_, idx) => idx !== i));
  const updateEntry = (i: number, field: keyof VoucherEntryInput, value: string) =>
    setEntries((es) => es.map((e, idx) => idx === i ? { ...e, [field]: value } : e));

  const totalAmount = entries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{initial ? 'Edit Voucher' : 'New Voucher'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={type} onChange={(e) => setType(e.target.value as VoucherType)}>
                {VOUCHER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
            <div>
              <Label>Voucher No.</Label>
              <Input value={effectiveNo} onChange={(e) => setVoucherNo(e.target.value)} placeholder={nextNoQuery.data ?? 'Auto'} />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Narration</Label>
            <Input value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="Optional description" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Entries</Label>
              <Button type="button" variant="outline" size="sm" onClick={addEntry}><Plus className="h-3 w-3" /> Add row</Button>
            </div>
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Debit Account</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Credit Account</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Amount (₹)</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Narration</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1.5">
                        <Select value={e.debitAccountId} onChange={(ev) => updateEntry(i, 'debitAccountId', ev.target.value)} className="h-8 text-xs">
                          <option value="">Select…</option>
                          {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Select value={e.creditAccountId} onChange={(ev) => updateEntry(i, 'creditAccountId', ev.target.value)} className="h-8 text-xs">
                          <option value="">Select…</option>
                          {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input className="h-8 text-xs text-right" type="number" value={e.amount} onChange={(ev) => updateEntry(i, 'amount', ev.target.value)} placeholder="0" />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input className="h-8 text-xs" value={e.narration ?? ''} onChange={(ev) => updateEntry(i, 'narration', ev.target.value)} placeholder="Optional" />
                      </td>
                      <td className="px-2 py-1.5">
                        {entries.length > 1 && (
                          <button type="button" onClick={() => removeEntry(i)} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/20">
                    <td colSpan={2} className="px-3 py-2 text-xs font-medium text-right text-muted-foreground">Total</td>
                    <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums">{formatINR(totalAmount.toFixed(4))}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending || entries.some((e) => !e.debitAccountId || !e.creditAccountId || !e.amount)}
          >
            {createMut.isPending ? 'Saving…' : 'Save Voucher'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VouchersTab() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [filterType, setFilterType] = useState<VoucherType | ''>('');
  const [page, setPage] = useState(1);

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts-flat'], queryFn: () => accountingApi.getAccountsFlat() });
  const { data, isLoading } = useQuery({
    queryKey: ['vouchers', filterType, page],
    queryFn: () => accountingApi.listVouchers({ type: filterType || undefined, page, limit: 50 }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => accountingApi.deleteVoucher(id),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['vouchers'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Select
          value={filterType}
          onChange={(e) => { setFilterType(e.target.value as VoucherType | ''); setPage(1); }}
          className="w-40"
        >
          <option value="">All types</option>
          {VOUCHER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New Voucher</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Card key={i} className="h-12 animate-pulse bg-muted/60" />)}</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Voucher No.</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden md:table-cell">Narration</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Amount</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden sm:table-cell">Entries</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {(data?.vouchers ?? []).map((v: VoucherDTO) => {
                  const total = v.entries.reduce((s, e) => s + parseFloat(e.amount), 0);
                  return (
                    <tr key={v.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3 tabular-nums text-sm">{v.date}</td>
                      <td className="px-4 py-3 font-mono text-sm font-medium">{v.voucherNo}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${VOUCHER_COLORS[v.type]}`}>{v.type}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-sm truncate max-w-xs hidden md:table-cell">{v.narration ?? '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">{formatINR(total.toFixed(4))}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs hidden sm:table-cell">{v.entries.length} entr{v.entries.length === 1 ? 'y' : 'ies'}</td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => { if (confirm('Delete this voucher?')) deleteMut.mutate(v.id); }} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {data?.vouchers.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">No vouchers yet — create one above.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {(data?.total ?? 0) > 50 && (
        <div className="flex justify-center gap-2 mt-4">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground py-2">{page} / {Math.ceil((data?.total ?? 1) / 50)}</span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil((data?.total ?? 1) / 50)} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      <VoucherFormDialog open={createOpen} onOpenChange={setCreateOpen} accounts={accounts} />
    </div>
  );
}

// ─── Ledger ─────────────────────────────────────────────────────────────────────

function LedgerTab() {
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts-flat'], queryFn: () => accountingApi.getAccountsFlat() });
  const [selectedAccount, setSelectedAccount] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data: ledger, isLoading } = useQuery({
    queryKey: ['ledger', selectedAccount, from, to],
    queryFn: () => accountingApi.getLedger(selectedAccount, { from: from || undefined, to: to || undefined }),
    enabled: !!selectedAccount,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-48">
          <Label>Account</Label>
          <Select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}>
            <option value="">Select account…</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
          </Select>
        </div>
        <div>
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" />
        </div>
        <div>
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />
        </div>
      </div>

      {!selectedAccount && <p className="text-sm text-muted-foreground">Select an account to view its ledger.</p>}
      {isLoading && <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Card key={i} className="h-10 animate-pulse bg-muted/60" />)}</div>}

      {ledger && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle className="text-base">{ledger.account.code} — {ledger.account.name}</CardTitle>
              <div className="text-sm text-muted-foreground">
                Opening: <span className="font-medium tabular-nums">{formatINR(ledger.openingBalance)}</span>
                {' · '}
                Closing: <span className="font-semibold tabular-nums">{formatINR(ledger.closingBalance)}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Voucher</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Narration</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Debit</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Credit</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledger.entries.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">No entries in this period.</td></tr>
                )}
                {ledger.entries.map((e, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5 tabular-nums">{e.date}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{e.voucherNo}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs hidden md:table-cell">{e.narration ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-positive">{e.debit ? formatINR(e.debit) : '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-negative">{e.credit ? formatINR(e.credit) : '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatINR(e.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Reports ─────────────────────────────────────────────────────────────────

const TYPE_SECTION_ORDER: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];
const TYPE_LABELS: Record<AccountType, string> = {
  ASSET: 'Assets', LIABILITY: 'Liabilities', EQUITY: 'Equity',
  INCOME: 'Income', EXPENSE: 'Expenses',
};

function TrialBalanceReport() {
  const [asOf, setAsOf] = useState('');
  const { data = [], isLoading } = useQuery({
    queryKey: ['trial-balance', asOf],
    queryFn: () => accountingApi.getTrialBalance(asOf || undefined),
  });

  const totalDebit = data.reduce((s, r) => s + parseFloat(r.totalDebit), 0);
  const totalCredit = data.reduce((s, r) => s + parseFloat(r.totalCredit), 0);

  const grouped = TYPE_SECTION_ORDER.reduce<Record<string, typeof data>>((acc, t) => {
    acc[t] = data.filter((r) => r.type === t);
    return acc;
  }, {} as Record<string, typeof data>);

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div><Label>As of date</Label><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-40" /></div>
      </div>
      {isLoading ? <div className="h-32 animate-pulse bg-muted/60 rounded" /> : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider w-24">Code</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Account</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Opening</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Debit</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Credit</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Balance</th>
                </tr>
              </thead>
              <tbody>
                {TYPE_SECTION_ORDER.map((type) => {
                  const rows = grouped[type] ?? [];
                  if (rows.length === 0) return null;
                  return [
                    <tr key={`hdr-${type}`} className="bg-muted/30 border-b">
                      <td colSpan={6} className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{TYPE_LABELS[type]}</td>
                    </tr>,
                    ...rows.map((r) => (
                      <tr key={r.accountId} className="border-b hover:bg-muted/20">
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{r.code}</td>
                        <td className="px-4 py-2">{r.name}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted-foreground hidden lg:table-cell">{formatINR(r.openingBalance)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{parseFloat(r.totalDebit) ? formatINR(r.totalDebit) : '—'}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{parseFloat(r.totalCredit) ? formatINR(r.totalCredit) : '—'}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium">{formatINR(r.closingBalance)}</td>
                      </tr>
                    )),
                  ];
                })}
                <tr className="border-t-2 bg-muted/30 font-semibold">
                  <td colSpan={3} className="px-4 py-2.5 text-sm">Total</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatINR(totalDebit.toFixed(4))}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatINR(totalCredit.toFixed(4))}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatINR((totalDebit - totalCredit).toFixed(4))}</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PnLReport() {
  const currentYear = new Date().getFullYear();
  const [from, setFrom] = useState(`${currentYear}-04-01`);
  const [to, setTo] = useState(`${currentYear + 1}-03-31`);
  const { data, isLoading } = useQuery({
    queryKey: ['pnl', from, to],
    queryFn: () => accountingApi.getPnL(from || undefined, to || undefined),
  });
  const netClass = data ? (parseFloat(data.netProfit) >= 0 ? 'text-positive' : 'text-negative') : '';

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
        <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
      </div>
      {isLoading ? <div className="h-32 animate-pulse bg-muted/60 rounded" /> : data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-positive">Income</CardTitle></CardHeader>
            <CardContent className="p-0 pb-3">
              <table className="w-full text-sm">
                <tbody>
                  {data.income.map((r) => (
                    <tr key={r.accountId} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-2 text-muted-foreground text-xs">{r.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-positive">{formatINR(r.closingBalance)}</td>
                    </tr>
                  ))}
                  {data.income.length === 0 && <tr><td colSpan={2} className="px-4 py-6 text-center text-muted-foreground text-xs">No income recorded</td></tr>}
                  <tr className="border-t-2 font-semibold bg-muted/20">
                    <td className="px-4 py-2.5 text-sm">Total Income</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-positive">{formatINR(data.totalIncome)}</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-negative">Expenses</CardTitle></CardHeader>
            <CardContent className="p-0 pb-3">
              <table className="w-full text-sm">
                <tbody>
                  {data.expense.map((r) => (
                    <tr key={r.accountId} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-2 text-muted-foreground text-xs">{r.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-negative">{formatINR(r.closingBalance)}</td>
                    </tr>
                  ))}
                  {data.expense.length === 0 && <tr><td colSpan={2} className="px-4 py-6 text-center text-muted-foreground text-xs">No expenses recorded</td></tr>}
                  <tr className="border-t-2 font-semibold bg-muted/20">
                    <td className="px-4 py-2.5 text-sm">Total Expenses</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-negative">{formatINR(data.totalExpense)}</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
          <Card className="md:col-span-2">
            <CardContent className="flex items-center justify-between py-4 px-6">
              <span className="text-lg font-semibold">Net {parseFloat(data.netProfit) >= 0 ? 'Profit' : 'Loss'}</span>
              <span className={`text-2xl font-bold tabular-nums ${netClass}`}>{formatINR(data.netProfit)}</span>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function BalanceSheetReport() {
  const [asOf, setAsOf] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['balance-sheet', asOf],
    queryFn: () => accountingApi.getBalanceSheet(asOf || undefined),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div><Label>As of date</Label><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-40" /></div>
      </div>
      {isLoading ? <div className="h-32 animate-pulse bg-muted/60 rounded" /> : data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Assets</CardTitle></CardHeader>
            <CardContent className="p-0 pb-3">
              <table className="w-full text-sm">
                <tbody>
                  {data.assets.map((r) => (
                    <tr key={r.accountId} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-2 text-xs text-muted-foreground">{r.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatINR(r.closingBalance)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 font-semibold bg-muted/20">
                    <td className="px-4 py-2.5">Total Assets</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatINR(data.totalAssets)}</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Liabilities & Equity</CardTitle></CardHeader>
            <CardContent className="p-0 pb-3">
              <table className="w-full text-sm">
                <tbody>
                  {data.liabilities.map((r) => (
                    <tr key={r.accountId} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-2 text-xs text-muted-foreground">{r.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatINR(r.closingBalance)}</td>
                    </tr>
                  ))}
                  {data.equity.map((r) => (
                    <tr key={r.accountId} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-2 text-xs text-muted-foreground">{r.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatINR(r.closingBalance)}</td>
                    </tr>
                  ))}
                  <tr className="border-b hover:bg-muted/20 italic">
                    <td className="px-4 py-2 text-xs text-muted-foreground">Retained Earnings</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatINR(data.retainedEarnings)}</td>
                  </tr>
                  <tr className="border-t-2 font-semibold bg-muted/20">
                    <td className="px-4 py-2.5">Total Liabilities + Equity</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatINR((parseFloat(data.totalLiabilities) + parseFloat(data.totalEquity)).toFixed(4))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function ReportsTab() {
  return (
    <Tabs defaultValue="trial-balance">
      <TabsList>
        <TabsTrigger value="trial-balance"><Scale className="h-3.5 w-3.5 mr-1.5" />Trial Balance</TabsTrigger>
        <TabsTrigger value="pnl"><TrendingDown className="h-3.5 w-3.5 mr-1.5" />P&L Statement</TabsTrigger>
        <TabsTrigger value="balance-sheet"><Landmark className="h-3.5 w-3.5 mr-1.5" />Balance Sheet</TabsTrigger>
      </TabsList>
      <div className="mt-4">
        <TabsContent value="trial-balance"><TrialBalanceReport /></TabsContent>
        <TabsContent value="pnl"><PnLReport /></TabsContent>
        <TabsContent value="balance-sheet"><BalanceSheetReport /></TabsContent>
      </div>
    </Tabs>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function AccountingPage() {
  return (
    <div>
      <PageHeader
        title="Accounting"
        description="Double-entry bookkeeping — chart of accounts, vouchers, ledger, and financial statements"
        actions={<BookOpenCheck className="h-5 w-5 text-muted-foreground" />}
      />
      <Tabs defaultValue="chart">
        <TabsList>
          <TabsTrigger value="chart"><Landmark className="h-3.5 w-3.5 mr-1.5" />Chart of Accounts</TabsTrigger>
          <TabsTrigger value="vouchers"><FileText className="h-3.5 w-3.5 mr-1.5" />Vouchers</TabsTrigger>
          <TabsTrigger value="ledger"><BookOpenCheck className="h-3.5 w-3.5 mr-1.5" />Ledger</TabsTrigger>
          <TabsTrigger value="reports"><Scale className="h-3.5 w-3.5 mr-1.5" />Reports</TabsTrigger>
        </TabsList>
        <div className="mt-6">
          <TabsContent value="chart"><ChartOfAccountsTab /></TabsContent>
          <TabsContent value="vouchers"><VouchersTab /></TabsContent>
          <TabsContent value="ledger"><LedgerTab /></TabsContent>
          <TabsContent value="reports"><ReportsTab /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
