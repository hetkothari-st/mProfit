import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BookOpen,
  Scale,
  ScrollText,
  Plus,
  Pencil,
  Trash2,
  Receipt,
  Landmark,
  RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { cn } from '@/lib/cn';
import { formatINR, toDecimal } from '@portfolioos/shared';
import {
  caApi,
  type CaAccountRow,
  type CaTransactionRow,
  type CaFmvRow,
  type CaTrialBalanceRow,
} from '@/api/ca.api';
import { apiErrorMessage } from '@/api/client';
import { CaActivityFeed } from '@/components/ca/CaActivityFeed';
import { AccountFormDialog } from '@/components/ca/AccountFormDialog';
import { VoucherFormDialog } from '@/components/ca/VoucherFormDialog';
import { CorrectTransactionDialog } from '@/components/ca/CorrectTransactionDialog';
import { FmvFormDialog } from '@/components/ca/FmvFormDialog';
import { ClientReportsTab } from '@/components/ca/ClientReportsTab';
import { ClientDocumentsTab } from '@/components/ca/ClientDocumentsTab';

/**
 * One client's books, as kept by their CA.
 *
 * The header states which kind of client this is, and that is load-bearing
 * rather than decorative. Everything here belongs to somebody else; for a
 * consented client they can read every change and end the arrangement, and
 * for a managed record nobody but the CA can see any of it. A CA should never
 * have to guess which, so the page says so instead of implying it.
 */

type Tab =
  | 'accounts'
  | 'vouchers'
  | 'transactions'
  | 'fmv'
  | 'trial-balance'
  | 'reports'
  | 'documents'
  | 'activity';

const TABS: { key: Tab; label: string }[] = [
  { key: 'accounts', label: 'Chart of accounts' },
  { key: 'vouchers', label: 'Vouchers' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'fmv', label: 'FMV (31 Jan 2018)' },
  { key: 'trial-balance', label: 'Trial balance' },
  { key: 'reports', label: 'Reports' },
  { key: 'documents', label: 'Documents' },
  { key: 'activity', label: 'Activity' },
];

export function ClientBooksPage() {
  const { clientId = '' } = useParams();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('accounts');
  const [accountDialog, setAccountDialog] = useState<{
    open: boolean;
    account: CaAccountRow | null;
  }>({ open: false, account: null });
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [correcting, setCorrecting] = useState<CaTransactionRow | null>(null);
  const [fmvDialog, setFmvDialog] = useState<{ open: boolean; row: CaFmvRow | null }>({
    open: false,
    row: null,
  });

  const removeFmv = useMutation({
    mutationFn: (isin: string) => caApi.deleteFmv(clientId, isin),
    onSuccess: () => {
      toast.success('Override removed');
      qc.invalidateQueries({ queryKey: ['ca', clientId] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not remove the override')),
  });

  const removeAccount = useMutation({
    mutationFn: (id: string) => caApi.deleteAccount(clientId, id),
    onSuccess: () => {
      toast.success('Account deleted');
      qc.invalidateQueries({ queryKey: ['ca', clientId] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not delete the account')),
  });

  /**
   * Re-derive the client's vouchers from their recorded activity.
   *
   * The tabs already project when they load, so this is for the case that
   * cannot cover: the client added transactions while this page was open. It
   * says how many were created rather than a bare "Done", because a run that
   * creates nothing is the common and correct outcome and should not look
   * like a failure.
   */
  const generate = useMutation({
    mutationFn: () => caApi.generateVouchers(clientId),
    onSuccess: (r) => {
      toast.success(
        r.created > 0
          ? `Generated ${r.created} voucher${r.created === 1 ? '' : 's'}`
          : 'Books are already up to date',
      );
      qc.invalidateQueries({ queryKey: ['ca', clientId] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not generate vouchers')),
  });

  const generateButton = (
    <Button
      size="sm"
      variant="outline"
      disabled={generate.isPending}
      onClick={() => generate.mutate()}
    >
      <RefreshCw className={cn('h-3.5 w-3.5', generate.isPending && 'animate-spin')} />
      {generate.isPending ? 'Generating…' : 'Generate from activity'}
    </Button>
  );

  const removeVoucher = useMutation({
    mutationFn: (id: string) => caApi.deleteVoucher(clientId, id),
    onSuccess: () => {
      toast.success('Voucher deleted');
      qc.invalidateQueries({ queryKey: ['ca', clientId] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not delete the voucher')),
  });

  const { data: clients } = useQuery({
    queryKey: ['ca', 'clients'],
    queryFn: () => caApi.listClients(),
  });
  const client = (clients ?? []).find((c) => c.id === clientId) ?? null;

  const accounts = useQuery({
    queryKey: ['ca', clientId, 'accounts'],
    queryFn: () => caApi.accountsFlat(clientId),
    enabled: tab === 'accounts' && !!clientId,
  });

  const vouchers = useQuery({
    queryKey: ['ca', clientId, 'vouchers'],
    queryFn: () => caApi.vouchers(clientId),
    enabled: tab === 'vouchers' && !!clientId,
  });

  const trialBalance = useQuery({
    queryKey: ['ca', clientId, 'trial-balance'],
    queryFn: () => caApi.trialBalance(clientId),
    enabled: tab === 'trial-balance' && !!clientId,
  });

  const transactions = useQuery({
    queryKey: ['ca', clientId, 'transactions'],
    queryFn: () => caApi.transactions(clientId),
    enabled: tab === 'transactions' && !!clientId,
  });

  const fmv = useQuery({
    queryKey: ['ca', clientId, 'fmv'],
    queryFn: () => caApi.fmvOverrides(clientId),
    enabled: tab === 'fmv' && !!clientId,
  });

  const activity = useQuery({
    queryKey: ['ca', clientId, 'activity'],
    queryFn: () => caApi.activity(clientId),
    enabled: tab === 'activity' && !!clientId,
  });

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2 text-muted-foreground">
        <Link to="/ca">
          <ArrowLeft className="h-3.5 w-3.5" /> All clients
        </Link>
      </Button>

      <PageHeader
        eyebrow="Client books"
        title={client?.name ?? 'Client'}
        description={
          client?.kind === 'INVITED'
            ? 'This client granted you access from their own account. They can see everything you do here, and withdraw access at any time.'
            : 'A record you manage. This client has no account of their own, so nobody but you can see these books.'
        }
      />

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border scrollbar-none">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'shrink-0 border-b-2 px-3 py-2 text-[13px] transition-colors focus-ring',
              tab === t.key
                ? 'border-accent text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'accounts' && (
        <>
          <div className="mb-3 flex justify-end">
            <Button size="sm" onClick={() => setAccountDialog({ open: true, account: null })}>
              <Plus className="h-4 w-4" /> New account
            </Button>
          </div>
          <LedgerTable
            loading={accounts.isLoading}
            empty={{
              icon: BookOpen,
              title: 'No chart of accounts yet',
              description: 'A default chart is created the first time these books are opened.',
            }}
            columns={['Code', 'Account', 'Type']}
            rows={(accounts.data ?? []).map((a) => [a.code, a.name, a.type])}
            rowActions={(i) => {
              const a = (accounts.data ?? [])[i];
              if (!a) return null;
              return (
                <>
                  <RowButton
                    label={`Edit ${a.name}`}
                    onClick={() => setAccountDialog({ open: true, account: a })}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </RowButton>
                  <RowButton
                    label={`Delete ${a.name}`}
                    danger
                    disabled={removeAccount.isPending}
                    onClick={() => removeAccount.mutate(a.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </RowButton>
                </>
              );
            }}
          />
        </>
      )}

      {tab === 'vouchers' && (
        <>
          <div className="mb-3 flex justify-end gap-2">
            {generateButton}
            <Button size="sm" onClick={() => setVoucherOpen(true)}>
              <Plus className="h-4 w-4" /> Post voucher
            </Button>
          </div>
          <LedgerTable
            loading={vouchers.isLoading}
            empty={{
              icon: ScrollText,
              title: 'No vouchers yet',
              description:
                'Vouchers are the double-entry record behind the trial balance, P&L and balance sheet. They are derived from what this client has recorded — trades, loan payments, rent, premiums — so there is nothing to derive them from yet.',
              action: generateButton,
            }}
            columns={['No.', 'Type', 'Date', 'Narration']}
            rows={(vouchers.data?.vouchers ?? []).map((v) => [
              v.voucherNo,
              v.type,
              new Date(v.date).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              }),
              v.narration ?? '—',
            ])}
            rowActions={(i) => {
              const v = (vouchers.data?.vouchers ?? [])[i];
              if (!v) return null;
              return (
                <RowButton
                  label={`Delete voucher ${v.voucherNo}`}
                  danger
                  disabled={removeVoucher.isPending}
                  onClick={() => removeVoucher.mutate(v.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </RowButton>
              );
            }}
          />
        </>
      )}

      {tab === 'transactions' && (
        <LedgerTable
          loading={transactions.isLoading}
          empty={{
            icon: Receipt,
            title: 'No transactions',
            description: 'This client has no recorded trades yet.',
          }}
          columns={['Date', 'Asset', 'Type', 'Qty', 'Price', 'Net']}
          numericFrom={3}
          rows={(transactions.data ?? []).map((t) => [
            new Date(t.tradeDate).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            }),
            t.assetName ?? t.isin ?? '—',
            t.transactionType,
            t.quantity,
            t.price,
            t.netAmount,
          ])}
          rowActions={(i) => {
            const t = (transactions.data ?? [])[i];
            if (!t) return null;
            return (
              <RowButton
                label={`Correct ${t.assetName ?? 'transaction'}`}
                onClick={() => setCorrecting(t)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </RowButton>
            );
          }}
        />
      )}

      {tab === 'fmv' && (
        <>
          <div className="mb-3 flex justify-end">
            <Button size="sm" onClick={() => setFmvDialog({ open: true, row: null })}>
              <Plus className="h-4 w-4" /> Set a value
            </Button>
          </div>
          <LedgerTable
            loading={fmv.isLoading}
            empty={{
              icon: Landmark,
              title: 'No overrides set',
              description:
                'Set the 31-Jan-2018 fair market value for a scrip to grandfather its long-term gains under Section 55(2)(ac).',
            }}
            columns={['ISIN', 'Scrip', 'FMV per unit', 'Source']}
            numericFrom={2}
            rows={(fmv.data ?? []).map((f) => [f.isin, f.scripName ?? '—', f.fmvPerUnit, f.source])}
            rowActions={(i) => {
              const f = (fmv.data ?? [])[i];
              // Seeded values are reference data, not this client's own
              // judgement — editing one here would silently fork it.
              if (!f || f.source !== 'USER') return null;
              return (
                <>
                  <RowButton
                    label={`Edit ${f.isin}`}
                    onClick={() => setFmvDialog({ open: true, row: f })}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </RowButton>
                  <RowButton
                    label={`Remove ${f.isin}`}
                    danger
                    disabled={removeFmv.isPending}
                    onClick={() => removeFmv.mutate(f.isin)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </RowButton>
                </>
              );
            }}
          />
        </>
      )}

      {tab === 'trial-balance' && (
        <TrialBalanceTab
          loading={trialBalance.isLoading}
          rows={trialBalance.data ?? []}
          action={generateButton}
        />
      )}

      <AccountFormDialog
        clientId={clientId}
        account={accountDialog.account}
        open={accountDialog.open}
        onOpenChange={(open) => setAccountDialog((d) => ({ ...d, open }))}
      />
      <VoucherFormDialog clientId={clientId} open={voucherOpen} onOpenChange={setVoucherOpen} />
      <CorrectTransactionDialog
        clientId={clientId}
        transaction={correcting}
        open={!!correcting}
        onOpenChange={(open) => !open && setCorrecting(null)}
      />
      <FmvFormDialog
        clientId={clientId}
        existing={fmvDialog.row}
        open={fmvDialog.open}
        onOpenChange={(open) => setFmvDialog((d) => ({ ...d, open }))}
      />

      {tab === 'reports' && <ClientReportsTab clientId={clientId} />}

      {tab === 'documents' && <ClientDocumentsTab clientId={clientId} />}

      {tab === 'activity' && (
        <CaActivityFeed
          entries={activity.data ?? []}
          title="Everything you have done here"
          emptyLabel="You haven’t made any changes to these books yet."
        />
      )}
    </div>
  );
}

/** A small icon button for a table row. */
function RowButton({
  label,
  onClick,
  children,
  danger,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'grid h-7 w-7 place-items-center rounded-md text-muted-foreground/70 transition-colors focus-ring disabled:opacity-40',
        danger
          ? 'hover:bg-negative/10 hover:text-negative'
          : 'hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

/**
 * The trial balance.
 *
 * Two things make this more than a `LedgerTable` call. First, the server
 * returns one row per account whether or not anything has been posted to it,
 * so "no rows" is not what an unposted balance looks like — a full chart of
 * zeroes is. Rendering that as a table of dashes is how this tab came to look
 * broken; emptiness here has to be measured on the figures, not the row count.
 *
 * Second, the totals. A trial balance exists to be checked, and the check is
 * that the two columns agree. Leaving a CA to add up twenty rows to find that
 * out would be leaving out the only part they came for.
 */
function TrialBalanceTab({
  loading,
  rows,
  action,
}: {
  loading: boolean;
  rows: CaTrialBalanceRow[];
  action: React.ReactNode;
}) {
  // Decimal, not floats: these are the two figures a CA compares to decide
  // whether the books balance, and a rounding artefact in the last paisa is
  // indistinguishable on screen from a genuinely unbalanced ledger.
  const nz = (v: string) => !toDecimal(v).isZero();
  const totalDebit = rows.reduce((sum, r) => sum.plus(toDecimal(r.totalDebit)), toDecimal(0));
  const totalCredit = rows.reduce((sum, r) => sum.plus(toDecimal(r.totalCredit)), toDecimal(0));
  const difference = totalDebit.minus(totalCredit);
  const posted = rows.some((r) => nz(r.totalDebit) || nz(r.totalCredit) || nz(r.openingBalance));

  return (
    <div className="space-y-3">
      {posted && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] text-muted-foreground">
            {difference.isZero()
              ? 'Debits and credits agree.'
              : `Out of balance by ${formatINR(difference.abs().toFixed(4))}.`}
          </p>
          {action}
        </div>
      )}
      <LedgerTable
        loading={loading}
        empty={{
          icon: Scale,
          title: 'Nothing posted yet',
          description:
            'The chart of accounts is set up, but no vouchers have been posted against it, so every balance is zero. Generating them from the client’s recorded activity is what fills this in.',
          action,
        }}
        columns={['Code', 'Account', 'Opening', 'Debit', 'Credit', 'Balance']}
        numericFrom={2}
        rows={
          posted
            ? rows.map((r) => [
                r.code,
                r.name,
                formatINR(r.openingBalance),
                nz(r.totalDebit) ? formatINR(r.totalDebit) : null,
                nz(r.totalCredit) ? formatINR(r.totalCredit) : null,
                formatINR(r.closingBalance),
              ])
            : []
        }
        footer={
          posted
            ? [
                'Total',
                null,
                null,
                formatINR(totalDebit.toFixed(4)),
                formatINR(totalCredit.toFixed(4)),
                formatINR(difference.toFixed(4)),
              ]
            : undefined
        }
      />
    </div>
  );
}

function LedgerTable({
  loading,
  columns,
  rows,
  empty,
  numericFrom,
  rowActions,
  footer,
}: {
  loading: boolean;
  columns: string[];
  rows: Array<Array<string | null>>;
  empty: {
    icon: typeof BookOpen;
    title: string;
    description: string;
    /** Offered inside the empty state, for the thing that would fill it. */
    action?: React.ReactNode;
  };
  /** A totals line, rendered in the same columns. Omitted when absent. */
  footer?: Array<string | null>;
  /** Column index from which values are figures and should be right-aligned. */
  numericFrom?: number;
  /**
   * Actions for row `i`. Rendered in a trailing column that only exists when
   * this is supplied, so read-only tables keep their full width.
   */
  rowActions?: (index: number) => React.ReactNode;
}) {
  if (loading) {
    return (
      <Card className="overflow-hidden">
        <div className="divide-y divide-border/50">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[44px] animate-pulse bg-muted/30" />
          ))}
        </div>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={empty.icon}
        title={empty.title}
        description={empty.description}
        action={empty.action}
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[520px]">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40">
              {columns.map((c, i) => (
                <th
                  key={c}
                  className={cn(
                    'px-4 py-2 text-[10px] font-medium uppercase tracking-kerned text-foreground/70',
                    numericFrom !== undefined && i >= numericFrom ? 'text-right' : 'text-left',
                  )}
                >
                  {c}
                </th>
              ))}
              {rowActions && <th className="w-[88px] px-4 py-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-b border-border/50 last:border-0 hover:bg-muted/25">
                {r.map((cell, ci) => (
                  <td
                    key={ci}
                    className={cn(
                      'px-4 py-2.5 text-[13px] text-foreground',
                      numericFrom !== undefined && ci >= numericFrom
                        ? 'numeric tabular-nums text-right'
                        : 'text-left',
                    )}
                  >
                    {cell ?? '—'}
                  </td>
                ))}
                {rowActions && (
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-0.5">{rowActions(ri)}</div>
                  </td>
                )}
              </tr>
            ))}
            {footer && (
              <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                {footer.map((cell, ci) => (
                  <td
                    key={ci}
                    className={cn(
                      'px-4 py-2.5 text-[13px] text-foreground',
                      numericFrom !== undefined && ci >= numericFrom
                        ? 'numeric tabular-nums text-right'
                        : 'text-left',
                    )}
                  >
                    {cell ?? ''}
                  </td>
                ))}
                {rowActions && <td className="px-4 py-2.5" />}
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
