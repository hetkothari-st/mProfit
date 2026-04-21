import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, RefreshCw, Trash2, ExternalLink, Plug } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/common/EmptyState';
import { connectorsApi } from '@/api/connectors.api';
import { portfoliosApi } from '@/api/portfolios.api';
import { apiErrorMessage } from '@/api/client';

export function ConnectorsPage() {
  const qc = useQueryClient();
  const [requestToken, setRequestToken] = useState('');
  const [portfolioId, setPortfolioId] = useState('');

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['connectors'],
    queryFn: () => connectorsApi.list(),
  });
  const { data: portfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.list(),
  });

  const loginUrlMut = useMutation({
    mutationFn: () => connectorsApi.kiteLoginUrl(),
    onSuccess: ({ url }) => {
      window.open(url, '_blank', 'noopener,noreferrer');
      toast('Complete login in the new tab, then paste the request_token here');
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const callbackMut = useMutation({
    mutationFn: () => connectorsApi.kiteCallback(requestToken.trim(), portfolioId || null),
    onSuccess: ({ userName }) => {
      toast.success(`Connected: ${userName}`);
      setRequestToken('');
      qc.invalidateQueries({ queryKey: ['connectors'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const syncMut = useMutation({
    mutationFn: (id: string) => connectorsApi.sync(id),
    onSuccess: (r) => {
      toast.success(`Synced: ${r.tradesImported} trades imported`);
      qc.invalidateQueries({ queryKey: ['connectors'] });
      qc.invalidateQueries({ queryKey: ['imports'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => connectorsApi.remove(id),
    onSuccess: () => {
      toast.success('Disconnected');
      qc.invalidateQueries({ queryKey: ['connectors'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <div>
      <PageHeader
        title="Broker Connectors"
        description="Link your broker to auto-sync trades and holdings"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plug className="h-4 w-4" /> Connect Zerodha (Kite)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Zerodha uses OAuth: click &ldquo;Get Login URL&rdquo;, authorize, then paste the
              <code className="mx-1 px-1 bg-muted rounded">request_token</code>
              from the redirect URL.
            </p>
            <div>
              <Label htmlFor="portfolio">Target portfolio (optional)</Label>
              <Select
                id="portfolio"
                className="mt-1"
                value={portfolioId}
                onChange={(e) => setPortfolioId(e.target.value)}
              >
                <option value="">Default portfolio</option>
                {portfolios?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="reqtoken">request_token</Label>
              <Input
                id="reqtoken"
                className="mt-1"
                placeholder="Paste request_token from Kite callback URL"
                value={requestToken}
                onChange={(e) => setRequestToken(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => loginUrlMut.mutate()}
                disabled={loginUrlMut.isPending}
              >
                {loginUrlMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                <ExternalLink className="h-4 w-4" /> Get Login URL
              </Button>
              <Button
                onClick={() => callbackMut.mutate()}
                disabled={!requestToken.trim() || callbackMut.isPending}
              >
                {callbackMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Complete Connection
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Connected Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-muted-foreground text-sm">Loading…</div>
            ) : !accounts || accounts.length === 0 ? (
              <EmptyState title="No connectors yet" description="Connect a broker to get started." />
            ) : (
              <div className="space-y-2">
                {accounts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between border rounded-md px-3 py-2"
                  >
                    <div>
                      <div className="font-medium text-sm">
                        {a.label ?? a.provider} ·{' '}
                        <span
                          className={
                            a.status === 'CONNECTED'
                              ? 'text-positive'
                              : a.status === 'ERROR'
                                ? 'text-negative'
                                : 'text-muted-foreground'
                          }
                        >
                          {a.status}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {a.publicUserId ? `User: ${a.publicUserId} · ` : ''}
                        {a.lastSyncAt
                          ? `Last synced ${new Date(a.lastSyncAt).toLocaleString()}`
                          : 'Never synced'}
                      </div>
                      {a.lastError && (
                        <div className="text-xs text-negative truncate max-w-md">
                          {a.lastError}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => syncMut.mutate(a.id)}
                        disabled={syncMut.isPending}
                        title="Sync now"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm('Disconnect this broker?')) delMut.mutate(a.id);
                        }}
                        title="Disconnect"
                      >
                        <Trash2 className="h-4 w-4 text-negative" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
