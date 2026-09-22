import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LIVE_QUERY, LIVE_INTERVAL_MS } from '@/lib/liveQuery';
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
  Upload,
  FileClock,
  RefreshCw,
  Eye,
  Download,
  FolderDown,
  Sheet,
  FileBarChart,
  FolderOpen,
  History,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';
import { cn } from '@/lib/cn';
import { formatINR, toDecimal } from '@everypaisa/shared';
import {
  caApi,
  caReceiptsApi,
  type CaClient,
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
import { AddTransactionDialog } from '@/components/ca/AddTransactionDialog';
import { FmvFormDialog } from '@/components/ca/FmvFormDialog';
import { ClientReportsTab } from '@/components/ca/ClientReportsTab';
import { ClientDocumentsTab } from '@/components/ca/ClientDocumentsTab';
import { Initials, ClientAccessStrip } from '@/components/ca/AccessParts';
import { editModeOfClient, EDIT_MODE_LABEL, type EditMode } from '@/components/ca/accessModel';
import { IMPORT_STATUS_LABELS, type ImportStatus } from '@everypaisa/shared';

/**
 * One client's books, as kept by their CA.
 *
 * The band at the top says whose books these are and what the professional
 * was given, using the same strip the client sees on their Account Access
 * page. Everything here belongs to somebody else, who can read every change
 * and end the arrangement; the page says so instead of implying it.
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

/**
 * Tabs in the groups a CA works in: the ledger, the client's recorded
 * portfolio, what gets handed over, and the log. The dividers between groups
 * carry that; eight equal tabs in a row did not.
 */
const TAB_GROUPS: { key: Tab; label: string; icon: typeof BookOpen }[][] = [
  [
    { key: 'accounts', label: 'Chart of accounts', icon: BookOpen },
    { key: 'vouchers', label: 'Vouchers', icon: ScrollText },
    { key: 'trial-balance', label: 'Trial balance', icon: Scale },
  ],
  [
    { key: 'transactions', label: 'Transactions', icon: Receipt },
    { key: 'fmv', label: 'FMV (31 Jan 2018)', icon: Landmark },
  ],
  [
    { key: 'reports', label: 'Reports', icon: FileBarChart },
    { key: 'documents', label: 'Documents', icon: FolderOpen },
  ],
  [{ key: 'activity', label: 'Activity', icon: History }],
];

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

/** "COMPLETED_WITH_ERRORS" → "Completed with errors". */
const sentence = (s: string) => {
  const t = s.replace(/_/g, ' ').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function ClientBooksPage() {
  const { clientId = '' } = useParams();
  const qc = useQueryClient();

  // The account holder changes this from a different session, so it is a
  // live query: see LIVE_QUERY for why polling alone did not keep up.
  const { data: clients } = useQuery({
    queryKey: ['ca', 'clients'],
    queryFn: () => caApi.listClients(),
    ...LIVE_QUERY,
    refetchInterval: LIVE_INTERVAL_MS,
  });
  const client = (clients ?? []).find((c) => c.id === clientId) ?? null;

  /**
   * What this grant lets us change.
   *
   * The policies are what enforce this; hiding a control is a courtesy, so
   * that a professional is not offered a button whose only possible outcome is
   * a refusal. Defaults to false while the client list is still loading —
   * briefly missing a button beats briefly offering one that fails.
   */
  const may = {
    books: client?.canEditBooks ?? false,
    transactions: client?.canEditTransactions ?? false,
    imports: client?.canEditImports ?? false,
    fmv: client?.canEditFmv ?? false,
  };
  const readOnly = !may.books && !may.transactions && !may.imports && !may.fmv;

  // Buttons appearing or vanishing under someone's cursor with no explanation
  // reads as a glitch. Say what changed, once, when it changes.
  const rightsKey = client
    ? `${may.books}${may.transactions}${may.imports}${may.fmv}${client.status}`
    : null;
  const lastRights = useRef<string | null>(null);
  useEffect(() => {
    if (!rightsKey || !client) return;
    const prev = lastRights.current;
    lastRights.current = rightsKey;
    if (prev === null || prev === rightsKey) return;
    if (client.status !== 'ACTIVE') {
      toast(`${client.displayName} has withdrawn your access.`);
    } else if (readOnly) {
      toast(`${client.displayName} changed your access to view only.`);
    } else {
      toast.success(`${client.displayName} updated what you can do in their books.`);
    }
  }, [rightsKey, client, readOnly]);
  const [tab, setTab] = useState<Tab>('accounts');
  const [accountDialog, setAccountDialog] = useState<{
    open: boolean;
    account: CaAccountRow | null;
  }>({ open: false, account: null });
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [addTxnOpen, setAddTxnOpen] = useState(false);
  const [correcting, setCorrecting] = useState<CaTransactionRow | null>(null);
  const [fmvDialog, setFmvDialog] = useState<{ open: boolean; row: CaFmvRow | null }>({
    open: false,
    row: null,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const generateButton = !may.books ? null : (
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

  const imports = useQuery({
    queryKey: ['ca', clientId, 'imports'],
    queryFn: () => caApi.imports(clientId),
    enabled: tab === 'transactions' && !!clientId,
    // An import parses asynchronously — poll while the tab is open so
    // PENDING/PROCESSING rows resolve to their final status without a
    // manual refresh.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((j) => j.status === 'PENDING' || j.status === 'PROCESSING')
        ? 4000
        : false,
  });

  const uploadImport = useMutation({
    mutationFn: (file: File) => caApi.uploadImport(clientId, { file }),
    onSuccess: () => {
      toast.success('File uploaded — parsing in the background');
      qc.invalidateQueries({ queryKey: ['ca', clientId, 'imports'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Upload failed')),
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

  const downloadBundle = (format: 'zip' | 'xlsx') =>
    caReceiptsApi
      .bundle(clientId, format)
      .catch((e) => toast.error(apiErrorMessage(e, 'Could not build that download')));

  return (
    <div className="mx-auto max-w-6xl">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2 text-muted-foreground">
        <Link to="/ca">
          <ArrowLeft className="h-3.5 w-3.5" /> All clients
        </Link>
      </Button>

      {client ? (
        <ClientBand client={client} readOnly={readOnly} />
      ) : (
        <div className="mb-6 h-[150px] animate-pulse rounded-xl border border-border/60 bg-muted/20" />
      )}

      <nav
        aria-label="Sections of these books"
        className="mb-6 flex items-center gap-1 overflow-x-auto rounded-xl border border-border/70 bg-muted/30 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TAB_GROUPS.map((group, gi) => (
          <Fragment key={gi}>
            {gi > 0 && <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />}
            {group.map((t) => {
              const Icon = t.icon;
              const current = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors focus-ring',
                    current
                      ? 'bg-card font-medium text-foreground shadow-sm ring-1 ring-border/60'
                      : 'text-muted-foreground hover:bg-card/60 hover:text-foreground',
                  )}
                >
                  <Icon className={cn('h-3.5 w-3.5', current && 'text-accent-ink')} />
                  {t.label}
                </button>
              );
            })}
          </Fragment>
        ))}
      </nav>

      {tab === 'accounts' && (
        <>
          <SectionBar
            title="Chart of accounts"
            count={accounts.data?.length}
            hint="The ledger heads every voucher posts to."
          >
            {may.books && (
              <Button size="sm" onClick={() => setAccountDialog({ open: true, account: null })}>
                <Plus className="h-4 w-4" /> New account
              </Button>
            )}
          </SectionBar>
          <LedgerTable
            loading={accounts.isLoading}
            empty={{
              icon: BookOpen,
              title: 'No chart of accounts yet',
              description: 'A default chart is created the first time these books are opened.',
            }}
            columns={['Code', 'Account', 'Type']}
            rows={(accounts.data ?? []).map((a) => [
              <span className="numeric tabular-nums text-muted-foreground">{a.code}</span>,
              <span className="font-medium">{a.name}</span>,
              <Pill>{sentence(a.type)}</Pill>,
            ])}
            rowActions={(i) => {
              const a = (accounts.data ?? [])[i];
              if (!a || !may.books) return null;
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
          <SectionBar
            title="Vouchers"
            count={vouchers.data?.vouchers.length}
            hint="The double-entry record behind the trial balance, P&L and balance sheet."
          >
            <div className="inline-flex overflow-hidden rounded-md border border-input">
              <button
                type="button"
                onClick={() => downloadBundle('zip')}
                title="Every rent, premium and loan receipt in these books, one PDF each"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] text-foreground transition-colors hover:bg-muted focus-ring"
              >
                <FolderDown className="h-3.5 w-3.5" /> Receipts ZIP
              </button>
              <span aria-hidden className="w-px bg-input" />
              <button
                type="button"
                onClick={() => downloadBundle('xlsx')}
                title="The same receipts as one spreadsheet, totalled"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] text-foreground transition-colors hover:bg-muted focus-ring"
              >
                <Sheet className="h-3.5 w-3.5" /> Excel
              </button>
            </div>
            {generateButton}
            {may.books && (
              <Button size="sm" onClick={() => setVoucherOpen(true)}>
                <Plus className="h-4 w-4" /> Post voucher
              </Button>
            )}
          </SectionBar>
          <LedgerTable
            loading={vouchers.isLoading}
            empty={{
              icon: ScrollText,
              title: 'No vouchers yet',
              description:
                client?.kind === 'SHADOW'
                  ? // Worth saying outright: a managed record is its own empty
                    // ledger, and an advisor looking at their own populated
                    // books in another tab will otherwise read this as a bug.
                    'These are the books of a record you created, not of any existing account. It starts empty — nothing carries over from your own portfolios or from a client who signs in separately. Add transactions or import a statement, and the vouchers follow.'
                  : 'Vouchers are derived from what this client has recorded — trades, loan payments, rent, premiums — so there is nothing to derive them from yet.',
              action: generateButton,
            }}
            columns={['No.', 'Type', 'Date', 'Narration']}
            rows={(vouchers.data?.vouchers ?? []).map((v) => [
              <span className="numeric tabular-nums font-medium">{v.voucherNo}</span>,
              <Pill tone={v.type === 'RECEIPT' ? 'positive' : v.type === 'PAYMENT' ? 'negative' : 'neutral'}>
                {sentence(v.type)}
              </Pill>,
              <span className="whitespace-nowrap text-muted-foreground">{fmtDay(v.date)}</span>,
              v.narration ? (
                <span className="line-clamp-1">{v.narration}</span>
              ) : null,
            ])}
            rowActions={(i) => {
              const v = (vouchers.data?.vouchers ?? [])[i];
              if (!v) return null;
              return (
                <>
                  <RowButton
                    label={`View receipt ${v.voucherNo}`}
                    onClick={() =>
                      caReceiptsApi
                        .view(clientId, v.id)
                        .catch((e) =>
                          toast.error(apiErrorMessage(e, 'Could not produce that receipt')),
                        )
                    }
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </RowButton>
                  <RowButton
                    label={`Download receipt ${v.voucherNo}`}
                    onClick={() =>
                      caReceiptsApi
                        .download(clientId, v.id, `${v.date}-${v.voucherNo}.pdf`)
                        .catch((e) =>
                          toast.error(apiErrorMessage(e, 'Could not download that receipt')),
                        )
                    }
                  >
                    <Download className="h-3.5 w-3.5" />
                  </RowButton>
                  {may.books && (
                    <RowButton
                      label={`Delete voucher ${v.voucherNo}`}
                      danger
                      disabled={removeVoucher.isPending}
                      onClick={() => removeVoucher.mutate(v.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </RowButton>
                  )}
                </>
              );
            }}
          />
        </>
      )}

      {tab === 'transactions' && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.csv,.tsv,.xlsx,.xls,.html,.htm"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) uploadImport.mutate(file);
            }}
          />
          <SectionBar
            title="Transactions"
            count={transactions.data?.length}
            hint="Trades as this client recorded them. Corrections here flow into the vouchers."
          >
            {may.imports && (
              <Button
                size="sm"
                variant="outline"
                disabled={uploadImport.isPending}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {uploadImport.isPending ? 'Uploading…' : 'Import file'}
              </Button>
            )}
            {may.transactions && (
              <Button size="sm" onClick={() => setAddTxnOpen(true)}>
                <Plus className="h-4 w-4" /> Add transaction
              </Button>
            )}
          </SectionBar>

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
              <span className="whitespace-nowrap text-muted-foreground">{fmtDay(t.tradeDate)}</span>,
              <span className="font-medium">{t.assetName ?? t.isin ?? '—'}</span>,
              <Pill
                tone={
                  t.transactionType === 'BUY'
                    ? 'positive'
                    : t.transactionType === 'SELL'
                      ? 'negative'
                      : 'neutral'
                }
              >
                {sentence(t.transactionType)}
              </Pill>,
              toDecimal(t.quantity).toString(),
              formatINR(t.price),
              <span className="font-medium">{formatINR(t.netAmount)}</span>,
            ])}
            rowActions={(i) => {
              const t = (transactions.data ?? [])[i];
              if (!t || !may.transactions) return null;
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

          {(imports.data ?? []).length > 0 && (
            <div className="mt-8">
              <SectionBar
                title="Recent imports"
                count={imports.data?.length}
                hint="Statements uploaded into these books, and how each one parsed."
              />
              <LedgerTable
                loading={imports.isLoading}
                empty={{ icon: FileClock, title: 'No imports yet', description: '' }}
                columns={['File', 'Type', 'Status', 'Rows', 'Uploaded']}
                rows={(imports.data ?? []).map((j) => [
                  <span className="line-clamp-1 font-medium">{j.fileName}</span>,
                  <span className="text-muted-foreground">{sentence(j.type)}</span>,
                  <Pill tone={importTone(j.status)}>
                    {IMPORT_STATUS_LABELS[j.status as ImportStatus] ?? j.status}
                  </Pill>,
                  j.successRows !== null && j.totalRows !== null ? (
                    <span className="numeric tabular-nums">
                      {j.successRows} / {j.totalRows}
                    </span>
                  ) : null,
                  <span className="whitespace-nowrap text-muted-foreground">
                    {fmtDay(j.createdAt)}
                  </span>,
                ])}
              />
            </div>
          )}
        </>
      )}

      {tab === 'fmv' && (
        <>
          <SectionBar
            title="Fair market value on 31 Jan 2018"
            count={fmv.data?.length}
            hint="Grandfathers long-term gains under Section 55(2)(ac). Reference values are shared; values set here are this client's own."
          >
            {may.fmv && (
              <Button size="sm" onClick={() => setFmvDialog({ open: true, row: null })}>
                <Plus className="h-4 w-4" /> Set a value
              </Button>
            )}
          </SectionBar>
          <LedgerTable
            loading={fmv.isLoading}
            empty={{
              icon: Landmark,
              title: 'No overrides set',
              description:
                'Set the 31-Jan-2018 fair market value for a scrip to grandfather its long-term gains under Section 55(2)(ac).',
            }}
            columns={['ISIN', 'Scrip', 'Source', 'FMV per unit']}
            numericFrom={3}
            rows={(fmv.data ?? []).map((f) => [
              <span className="numeric tabular-nums text-muted-foreground">{f.isin}</span>,
              <span className="font-medium">{f.scripName ?? '—'}</span>,
              <Pill tone={f.source === 'USER' ? 'accent' : 'neutral'}>
                {f.source === 'USER' ? 'Set here' : 'Reference'}
              </Pill>,
              <span className="font-medium">{formatINR(f.fmvPerUnit)}</span>,
            ])}
            rowActions={(i) => {
              const f = (fmv.data ?? [])[i];
              // Seeded values are reference data, not this client's own
              // judgement — editing one here would silently fork it.
              if (!f || f.source !== 'USER' || !may.fmv) return null;
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
      <AddTransactionDialog clientId={clientId} open={addTxnOpen} onOpenChange={setAddTxnOpen} />
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

const MODE_TONE: Record<EditMode, string> = {
  FULL: 'bg-positive/10 text-positive ring-positive/25',
  PARTIAL: 'bg-warning/10 text-warning ring-warning/25',
  VIEW: 'bg-muted text-muted-foreground ring-border',
};

/**
 * Whose books these are, and what their owner gave the professional —
 * the same three answers the owner sees about them on Account Access.
 */
function ClientBand({ client, readOnly }: { client: CaClient; readOnly: boolean }) {
  const mode = editModeOfClient(client);
  const email =
    client.initiatedBy === 'CLIENT'
      ? client.displayEmail
      : (client.displayEmail ?? client.invitedEmail);

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-border/70 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5">
        <div className="flex min-w-0 items-center gap-4">
          <Initials name={client.displayName} tone="active" size="lg" />
          <div className="min-w-0">
            <p className="text-[12px] text-muted-foreground">Client books</p>
            <h1 className="truncate font-display text-[26px] leading-tight text-foreground">
              {client.displayName}
            </h1>
            {email && <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{email}</p>}
          </div>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium ring-1 ring-inset',
            MODE_TONE[mode],
          )}
        >
          {mode === 'VIEW' ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          {EDIT_MODE_LABEL[mode]}
        </span>
      </div>

      <ClientAccessStrip client={client} />

      <p className="border-t border-border/60 bg-muted/25 px-5 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
        {readOnly ? (
          <>
            <span className="font-medium text-foreground">View only.</span> You can read everything
            here and download reports, but not post entries or change transactions.{' '}
            {client.displayName} can widen this from their Account Access page.
          </>
        ) : client.kind === 'INVITED' ? (
          <>
            {client.displayName} can see every change you make here, and can withdraw access at any
            time.
          </>
        ) : (
          <>A record you manage. This client has no account, so nobody but you can see these books.</>
        )}
      </p>
    </section>
  );
}

/** A tab's title, what it holds, and the actions that belong to it. */
function SectionBar({
  title,
  count,
  hint,
  children,
}: {
  title: string;
  count?: number;
  hint: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-medium text-foreground">
          {title}
          {count !== undefined && count > 0 && (
            <span className="ml-1.5 numeric tabular-nums text-muted-foreground">{count}</span>
          )}
        </h2>
        <p className="mt-0.5 max-w-prose text-[12.5px] text-muted-foreground">{hint}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

type PillTone = 'neutral' | 'positive' | 'negative' | 'warning' | 'accent';

const PILL_TONE: Record<PillTone, string> = {
  neutral: 'bg-muted text-foreground/75',
  positive: 'bg-positive/10 text-positive',
  negative: 'bg-negative/10 text-negative',
  warning: 'bg-warning/10 text-warning',
  accent: 'bg-accent/15 text-accent-ink',
};

function Pill({ tone = 'neutral', children }: { tone?: PillTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium',
        PILL_TONE[tone],
      )}
    >
      {children}
    </span>
  );
}

function importTone(status: string): PillTone {
  if (status === 'COMPLETED') return 'positive';
  if (status === 'FAILED') return 'negative';
  return 'warning';
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
  children: ReactNode;
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
  action: ReactNode;
}) {
  // Decimal, not floats: these are the two figures a CA compares to decide
  // whether the books balance, and a rounding artefact in the last paisa is
  // indistinguishable on screen from a genuinely unbalanced ledger.
  const nz = (v: string) => !toDecimal(v).isZero();
  const totalDebit = rows.reduce((sum, r) => sum.plus(toDecimal(r.totalDebit)), toDecimal(0));
  const totalCredit = rows.reduce((sum, r) => sum.plus(toDecimal(r.totalCredit)), toDecimal(0));
  const difference = totalDebit.minus(totalCredit);
  const posted = rows.some((r) => nz(r.totalDebit) || nz(r.totalCredit) || nz(r.openingBalance));
  const balanced = difference.isZero();

  return (
    <>
      <SectionBar
        title="Trial balance"
        hint="Every account's opening, movement and closing balance. The two totals must agree."
      >
        {posted && (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium',
              balanced ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative',
            )}
          >
            {balanced ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" />
            )}
            {balanced
              ? 'Debits and credits agree'
              : `Out of balance by ${formatINR(difference.abs().toFixed(4))}`}
          </span>
        )}
        {posted && action}
      </SectionBar>
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
                <span className="numeric tabular-nums text-muted-foreground">{r.code}</span>,
                <span className="font-medium">{r.name}</span>,
                formatINR(r.openingBalance),
                nz(r.totalDebit) ? formatINR(r.totalDebit) : null,
                nz(r.totalCredit) ? formatINR(r.totalCredit) : null,
                <span className="font-medium">{formatINR(r.closingBalance)}</span>,
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
    </>
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
  rows: ReactNode[][];
  empty: {
    icon: typeof BookOpen;
    title: string;
    description: string;
    /** Offered inside the empty state, for the thing that would fill it. */
    action?: ReactNode;
  };
  /** A totals line, rendered in the same columns. Omitted when absent. */
  footer?: Array<string | null>;
  /** Column index from which values are figures and should be right-aligned. */
  numericFrom?: number;
  /**
   * Actions for row `i`. Rendered in a trailing column that only exists when
   * this is supplied, so read-only tables keep their full width.
   */
  rowActions?: (index: number) => ReactNode;
}) {
  const isNumeric = (i: number) => numericFrom !== undefined && i >= numericFrom;

  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
        <div className="h-9 border-b border-border/60 bg-muted/40" />
        <div className="divide-y divide-border/50">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[46px] animate-pulse bg-muted/20" />
          ))}
        </div>
      </div>
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
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40">
              {columns.map((c, i) => (
                <th
                  key={c}
                  scope="col"
                  className={cn(
                    'px-4 py-2.5 text-[11.5px] font-medium text-muted-foreground',
                    isNumeric(i) ? 'text-right' : 'text-left',
                  )}
                >
                  {c}
                </th>
              ))}
              {rowActions && (
                <th scope="col" className="w-[104px] px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr
                key={ri}
                className="group border-b border-border/50 transition-colors last:border-0 hover:bg-muted/25"
              >
                {r.map((cell, ci) => (
                  <td
                    key={ci}
                    className={cn(
                      'px-4 py-3 text-[13px] text-foreground',
                      isNumeric(ci) ? 'numeric tabular-nums text-right' : 'text-left',
                    )}
                  >
                    {cell ?? <span className="text-muted-foreground/60">—</span>}
                  </td>
                ))}
                {rowActions && (
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-0.5 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      {rowActions(ri)}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {footer && (
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40">
                {footer.map((cell, ci) => (
                  <td
                    key={ci}
                    className={cn(
                      'px-4 py-3 text-[13px] font-semibold text-foreground',
                      isNumeric(ci) ? 'numeric tabular-nums text-right' : 'text-left',
                    )}
                  >
                    {cell ?? ''}
                  </td>
                ))}
                {rowActions && <td className="px-4 py-3" />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
