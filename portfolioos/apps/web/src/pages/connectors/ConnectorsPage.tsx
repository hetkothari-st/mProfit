import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Loader2,
  RefreshCw,
  Trash2,
  Plug,
  Settings2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/common/EmptyState';
import { brokerApi, type BrokerId, type BrokerStatus } from '@/api/fo.api';
import { connectorsApi } from '@/api/connectors.api';
import { apiErrorMessage } from '@/api/client';

interface BrokerMeta {
  id: BrokerId;
  name: string;
  flow: 'oauth-popup' | 'totp-inline';
  fields: Array<{
    key: 'apiKey' | 'apiSecret' | 'redirectUri' | 'clientCode' | 'password' | 'totpSecret';
    label: string;
    type?: string;
    required: boolean;
    placeholder?: string;
    hint?: string;
  }>;
  docsHref?: string;
}

const BROKERS: BrokerMeta[] = [
  {
    id: 'zerodha',
    name: 'Zerodha (Kite Connect)',
    flow: 'oauth-popup',
    fields: [
      { key: 'apiKey', label: 'API key', required: true, placeholder: 'kite_api_key' },
      { key: 'apiSecret', label: 'API secret', required: true, type: 'password' },
    ],
    docsHref: 'https://kite.trade/docs/connect/v3/',
  },
  {
    id: 'upstox',
    name: 'Upstox',
    flow: 'oauth-popup',
    fields: [
      { key: 'apiKey', label: 'API key (client id)', required: true },
      { key: 'apiSecret', label: 'API secret', required: true, type: 'password' },
      {
        key: 'redirectUri',
        label: 'Redirect URI',
        required: true,
        hint: 'Paste the value from "Server redirect" below into the Upstox developer console.',
      },
    ],
    docsHref: 'https://upstox.com/developer/api-documentation/authentication',
  },
  {
    id: 'angel',
    name: 'Angel One (SmartAPI)',
    flow: 'totp-inline',
    fields: [
      { key: 'apiKey', label: 'API key', required: true },
      { key: 'clientCode', label: 'Client code', required: true, placeholder: 'A12345' },
      { key: 'password', label: 'Login PIN/password', required: true, type: 'password' },
      {
        key: 'totpSecret',
        label: 'TOTP seed (Base32)',
        required: true,
        type: 'password',
        hint: 'Available in SmartAPI dashboard. Without this we cannot mint sessions.',
      },
    ],
    docsHref: 'https://smartapi.angelbroking.com/docs/User',
  },
];

type SetupForm = Partial<Record<BrokerMeta['fields'][number]['key'], string>>;

export function ConnectorsPage() {
  const qc = useQueryClient();
  const [setupOpen, setSetupOpen] = useState<Record<BrokerId, boolean>>({
    zerodha: false,
    upstox: false,
    angel: false,
  });
  const [forms, setForms] = useState<Record<BrokerId, SetupForm>>({
    zerodha: {},
    upstox: {},
    angel: {},
  });

  const { data: statuses, isLoading } = useQuery({
    queryKey: ['broker-status'],
    queryFn: () => brokerApi.status() as Promise<BrokerStatus[]>,
  });

  const { data: legacy } = useQuery({
    queryKey: ['connectors'],
    queryFn: () => connectorsApi.list(),
  });

  const statusByBroker = useMemo(() => {
    const m: Partial<Record<BrokerId, BrokerStatus>> = {};
    for (const s of statuses ?? []) {
      if (s.brokerId) m[s.brokerId] = s;
    }
    return m;
  }, [statuses]);

  // Listen for the popup's postMessage payload — broker callback page sends
  // { type: 'broker_oauth_result', payload: { ok, brokerId?, error? } }.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data as { type?: string; payload?: { ok?: boolean; brokerId?: string; error?: string } };
      if (data?.type !== 'broker_oauth_result') return;
      if (data.payload?.ok) {
        toast.success(`Connected: ${data.payload.brokerId}`);
        qc.invalidateQueries({ queryKey: ['broker-status'] });
      } else {
        toast.error(data.payload?.error ?? 'OAuth failed');
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [qc]);

  const setupMut = useMutation({
    mutationFn: (input: { brokerId: BrokerId; values: SetupForm }) =>
      brokerApi.setup({
        brokerId: input.brokerId,
        apiKey: input.values.apiKey ?? '',
        apiSecret: input.values.apiSecret,
        redirectUri: input.values.redirectUri,
        clientCode: input.values.clientCode,
        password: input.values.password,
        totpSecret: input.values.totpSecret,
      }),
    onSuccess: (_data, vars) => {
      toast.success(`${labelFor(vars.brokerId)} configured`);
      setSetupOpen((s) => ({ ...s, [vars.brokerId]: false }));
      setForms((f) => ({ ...f, [vars.brokerId]: {} }));
      qc.invalidateQueries({ queryKey: ['broker-status'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const startMut = useMutation({
    mutationFn: (brokerId: BrokerId) => brokerApi.startOauth(brokerId),
    onSuccess: ({ url, brokerId }) => {
      if (!url) {
        // Angel — inline login already done by the API.
        toast.success(`${labelFor(brokerId)} session refreshed`);
        qc.invalidateQueries({ queryKey: ['broker-status'] });
        return;
      }
      const w = window.open(url, 'broker-oauth', 'width=520,height=720');
      if (!w) toast.error('Popup blocked — allow popups for this site');
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const refreshMut = useMutation({
    mutationFn: (brokerId: BrokerId) => brokerApi.refresh(brokerId),
    onSuccess: (_d, brokerId) => {
      toast.success(`${labelFor(brokerId)} refreshed`);
      qc.invalidateQueries({ queryKey: ['broker-status'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const disconnectMut = useMutation({
    mutationFn: (brokerId: BrokerId) => brokerApi.disconnect(brokerId),
    onSuccess: (_d, brokerId) => {
      toast.success(`${labelFor(brokerId)} disconnected`);
      qc.invalidateQueries({ queryKey: ['broker-status'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const legacySync = useMutation({
    mutationFn: (id: string) => connectorsApi.sync(id),
    onSuccess: (r) => {
      toast.success(`Synced ${r.tradesImported} trades`);
      qc.invalidateQueries({ queryKey: ['connectors'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const legacyRemove = useMutation({
    mutationFn: (id: string) => connectorsApi.remove(id),
    onSuccess: () => {
      toast.success('Removed');
      qc.invalidateQueries({ queryKey: ['connectors'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <div>
      <PageHeader
        title="Broker Connectors"
        description="OAuth-linked brokers for automatic trade & holdings sync"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {BROKERS.map((b) => {
          const status = statusByBroker[b.id];
          const isConfigured = !!status?.configured;
          const isConnected = !!status?.connected;
          const isExpanded = setupOpen[b.id];
          const form = forms[b.id];

          return (
            <Card key={b.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Plug className="h-4 w-4" />
                    {b.name}
                  </div>
                  <StatusBadge isLoading={isLoading} status={status} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="text-muted-foreground text-xs flex items-center gap-2">
                  <span className="uppercase tracking-wider">
                    Flow: {b.flow === 'oauth-popup' ? 'Browser OAuth' : 'API + TOTP'}
                  </span>
                  {b.docsHref && (
                    <a
                      className="text-primary hover:underline"
                      href={b.docsHref}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Docs
                    </a>
                  )}
                </div>

                {!isConfigured && !isExpanded && (
                  <Button
                    variant="outline"
                    onClick={() => setSetupOpen((s) => ({ ...s, [b.id]: true }))}
                  >
                    <Settings2 className="h-4 w-4" /> Configure
                  </Button>
                )}

                {isExpanded && (
                  <SetupForm
                    brokerId={b.id}
                    fields={b.fields}
                    values={form}
                    onChange={(key, val) =>
                      setForms((f) => ({ ...f, [b.id]: { ...f[b.id], [key]: val } }))
                    }
                    onCancel={() => {
                      setSetupOpen((s) => ({ ...s, [b.id]: false }));
                      setForms((f) => ({ ...f, [b.id]: {} }));
                    }}
                    onSubmit={() => setupMut.mutate({ brokerId: b.id, values: form })}
                    submitting={setupMut.isPending}
                  />
                )}

                {isConfigured && !isExpanded && (
                  <div className="flex flex-wrap gap-2">
                    {!isConnected && (
                      <Button
                        onClick={() => startMut.mutate(b.id)}
                        disabled={startMut.isPending}
                      >
                        {startMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        Connect
                      </Button>
                    )}
                    {isConnected && (
                      <Button
                        variant="outline"
                        onClick={() => refreshMut.mutate(b.id)}
                        disabled={refreshMut.isPending}
                      >
                        {refreshMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        <RefreshCw className="h-4 w-4" /> Refresh
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => setSetupOpen((s) => ({ ...s, [b.id]: true }))}
                    >
                      <Settings2 className="h-4 w-4" /> Reconfigure
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (confirm(`Disconnect ${b.name}?`)) disconnectMut.mutate(b.id);
                      }}
                      disabled={disconnectMut.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-negative" /> Disconnect
                    </Button>
                  </div>
                )}

                {b.flow === 'oauth-popup' && isConfigured && (
                  <RedirectInfo brokerId={b.id} />
                )}

                {status?.lastSyncedAt && (
                  <div className="text-xs text-muted-foreground">
                    Last sync: {new Date(status.lastSyncedAt).toLocaleString()}
                  </div>
                )}
                {status?.tokenExpiresAt && (
                  <div className="text-xs text-muted-foreground">
                    Token expires: {new Date(status.tokenExpiresAt).toLocaleString()}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {legacy && legacy.length > 0 && (
        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Legacy connections
                <Badge variant="outline" className="text-xs">deprecated</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                These were linked via the older paste-token flow. Reconnect via the OAuth cards
                above to keep them in sync.
              </p>
              <div className="space-y-2">
                {legacy.map((a) => (
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
                        onClick={() => legacySync.mutate(a.id)}
                        disabled={legacySync.isPending}
                        title="Sync now"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm('Remove this legacy connection?'))
                            legacyRemove.mutate(a.id);
                        }}
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4 text-negative" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!isLoading && (statuses?.length ?? 0) === 0 && (!legacy || legacy.length === 0) && (
        <div className="mt-6">
          <EmptyState
            title="No brokers connected"
            description="Configure a broker above to start auto-syncing trades."
          />
        </div>
      )}
    </div>
  );
}

function labelFor(b: BrokerId): string {
  return BROKERS.find((x) => x.id === b)?.name ?? b;
}

function StatusBadge({
  isLoading,
  status,
}: {
  isLoading: boolean;
  status: BrokerStatus | undefined;
}) {
  if (isLoading) return <Badge variant="outline">Loading…</Badge>;
  if (!status?.configured) return <Badge variant="outline">Not configured</Badge>;
  if (status.connected) {
    return (
      <Badge variant="outline" className="text-positive border-positive/30">
        <CheckCircle2 className="h-3 w-3" /> Connected
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-amber-600 border-amber-300">
      <AlertTriangle className="h-3 w-3" /> Needs login
    </Badge>
  );
}

interface SetupFormProps {
  brokerId: BrokerId;
  fields: BrokerMeta['fields'];
  values: SetupForm;
  onChange: (key: BrokerMeta['fields'][number]['key'], val: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
}

function SetupForm({ brokerId, fields, values, onChange, onCancel, onSubmit, submitting }: SetupFormProps) {
  const canSubmit = fields.every((f) => !f.required || (values[f.key] ?? '').trim().length > 0);
  return (
    <div className="space-y-2 border rounded-md p-3">
      {fields.map((f) => (
        <div key={f.key}>
          <Label htmlFor={`${brokerId}-${f.key}`}>{f.label}</Label>
          <Input
            id={`${brokerId}-${f.key}`}
            className="mt-1"
            type={f.type ?? 'text'}
            placeholder={f.placeholder}
            value={values[f.key] ?? ''}
            onChange={(e) => onChange(f.key, e.target.value)}
          />
          {f.hint && <p className="text-xs text-muted-foreground mt-1">{f.hint}</p>}
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <Button onClick={onSubmit} disabled={!canSubmit || submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function RedirectInfo({ brokerId }: { brokerId: BrokerId }) {
  const { data } = useQuery({
    queryKey: ['broker-redirect', brokerId],
    queryFn: () => brokerApi.redirectInfo(brokerId),
  });
  if (!data) return null;
  return (
    <div className="text-xs bg-muted/40 border rounded-md p-2 space-y-1">
      <div className="font-medium">Server redirect URI</div>
      <code className="block break-all">{data.redirectUri}</code>
      <p className="text-muted-foreground">
        Register this URL on the broker&apos;s developer console — required for OAuth callback.
      </p>
    </div>
  );
}
