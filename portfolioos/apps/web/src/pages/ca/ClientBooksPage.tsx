import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, Scale, ScrollText } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { cn } from '@/lib/cn';
import { caApi } from '@/api/ca.api';
import { CaActivityFeed } from '@/components/ca/CaActivityFeed';

/**
 * One client's books, as kept by their CA.
 *
 * The header states which kind of client this is, and that is load-bearing
 * rather than decorative. Everything here belongs to somebody else; for a
 * consented client they can read every change and end the arrangement, and
 * for a managed record nobody but the CA can see any of it. A CA should never
 * have to guess which, so the page says so instead of implying it.
 */

type Tab = 'accounts' | 'vouchers' | 'trial-balance' | 'activity';

const TABS: { key: Tab; label: string }[] = [
  { key: 'accounts', label: 'Chart of accounts' },
  { key: 'vouchers', label: 'Vouchers' },
  { key: 'trial-balance', label: 'Trial balance' },
  { key: 'activity', label: 'Activity' },
];

export function ClientBooksPage() {
  const { clientId = '' } = useParams();
  const [tab, setTab] = useState<Tab>('accounts');

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
        <LedgerTable
          loading={accounts.isLoading}
          empty={{
            icon: BookOpen,
            title: 'No chart of accounts yet',
            description: 'A default chart is created the first time these books are opened.',
          }}
          columns={['Code', 'Account', 'Type']}
          rows={(accounts.data ?? []).map((a) => [a.code, a.name, a.type])}
        />
      )}

      {tab === 'vouchers' && (
        <LedgerTable
          loading={vouchers.isLoading}
          empty={{
            icon: ScrollText,
            title: 'No vouchers',
            description: 'Vouchers appear here once posted, or once generated from the client’s activity.',
          }}
          columns={['No.', 'Type', 'Date', 'Narration']}
          rows={(vouchers.data ?? []).map((v) => [
            v.voucherNo,
            v.type,
            new Date(v.date).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            }),
            v.narration ?? '—',
          ])}
        />
      )}

      {tab === 'trial-balance' && (
        <LedgerTable
          loading={trialBalance.isLoading}
          empty={{
            icon: Scale,
            title: 'Nothing to balance yet',
            description: 'The trial balance fills in once vouchers exist.',
          }}
          columns={['Code', 'Account', 'Debit', 'Credit']}
          numericFrom={2}
          rows={(trialBalance.data ?? []).map((r) => [r.code, r.name, r.debit, r.credit])}
        />
      )}

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

function LedgerTable({
  loading,
  columns,
  rows,
  empty,
  numericFrom,
}: {
  loading: boolean;
  columns: string[];
  rows: Array<Array<string | null>>;
  empty: { icon: typeof BookOpen; title: string; description: string };
  /** Column index from which values are figures and should be right-aligned. */
  numericFrom?: number;
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
    return <EmptyState icon={empty.icon} title={empty.title} description={empty.description} />;
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
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
