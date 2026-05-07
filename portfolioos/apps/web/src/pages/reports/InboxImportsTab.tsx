import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { gmailScanApi } from '@/api/gmailScan.api';
import { apiErrorMessage } from '@/api/client';
import { InboxImportRow } from '@/components/upload/InboxImportRow';
import { InboxImportPreviewSheet } from '@/components/upload/InboxImportPreviewSheet';
import type { GmailDocStatus } from '@portfolioos/shared';
import { GmailDocStatus as STATUS, INBOX_DOC_TYPES } from '@portfolioos/shared';

const STATUS_OPTIONS: Array<{ value: GmailDocStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: STATUS.PENDING_APPROVAL, label: 'Pending review' },
  { value: STATUS.APPROVED, label: 'Approved' },
  { value: STATUS.IMPORTED, label: 'Imported' },
  { value: STATUS.PARSE_FAILED, label: 'Parse failed' },
  { value: STATUS.REJECTED, label: 'Rejected' },
  { value: STATUS.NOT_FINANCIAL, label: 'Not financial' },
  { value: STATUS.DUPLICATE, label: 'Already imported' },
];

export function InboxImportsTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'ALL' | GmailDocStatus>(STATUS.PENDING_APPROVAL);
  const [senderFilter, setSenderFilter] = useState<string>('');
  const [docTypeFilter, setDocTypeFilter] = useState<string>('');
  const [preview, setPreview] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Define scansQ first so runningScan drives docsQ's refetchInterval
  const scansQ = useQuery({
    queryKey: ['gmail-scan-jobs'],
    queryFn: () => gmailScanApi.listScans(),
    refetchInterval: 5000,
  });
  const runningScan = (scansQ.data ?? []).find((s) =>
    ['PENDING', 'LISTING', 'DOWNLOADING', 'CLASSIFYING'].includes(s.status),
  );

  const docsQ = useQuery({
    queryKey: ['gmail-discovered-docs', statusFilter, senderFilter, docTypeFilter],
    queryFn: () =>
      gmailScanApi.listDocs({
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        fromAddress: senderFilter || undefined,
        docType: docTypeFilter || undefined,
        limit: 200,
      }),
    // Poll while scan running so docs appear as they're classified, without
    // waiting for a manual refresh or switching to the "All" status filter.
    refetchInterval: runningScan
      ? 3000
      : (query) =>
          query.state.data?.some((d) => d.status === 'CLASSIFYING' || d.status === 'IMPORTING')
            ? 3000
            : false,
  });

  const sendersQ = useQuery({
    queryKey: ['gmail-discovered-senders'],
    queryFn: () => gmailScanApi.listSenders(),
  });

  const approve = useMutation({
    mutationFn: (input: { id: string; createRule: boolean }) =>
      gmailScanApi.approveDoc(input.id, input.createRule),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gmail-discovered-docs'] }),
    onError: (err) => toast.error(apiErrorMessage(err, 'Approve failed')),
  });
  const reject = useMutation({
    mutationFn: (input: { id: string; blocklist: boolean }) =>
      gmailScanApi.rejectDoc(input.id, { blocklist: input.blocklist }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gmail-discovered-docs'] }),
    onError: (err) => toast.error(apiErrorMessage(err, 'Reject failed')),
  });
  const bulkApprove = useMutation({
    mutationFn: () =>
      gmailScanApi.bulkApprove({ ids: [...selected], createAutoApproveRule: false }),
    onSuccess: () => {
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['gmail-discovered-docs'] });
      toast.success('Approved selected');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Bulk approve failed')),
  });
  const bulkReject = useMutation({
    mutationFn: () =>
      gmailScanApi.bulkReject({ ids: [...selected] }),
    onSuccess: () => {
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['gmail-discovered-docs'] });
      toast.success('Rejected selected');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Bulk reject failed')),
  });

  const docs = docsQ.data ?? [];
  const someSelected = selected.size > 0;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const progressLine = useMemo(() => {
    if (!runningScan) return null;
    const total = runningScan.totalMessages ?? 0;
    const kept = runningScan.attachmentsKept ?? 0;
    return total
      ? `Scanning your inbox — ${runningScan.processedMessages.toLocaleString()} / ${total.toLocaleString()} messages • ${kept} document${kept !== 1 ? 's' : ''} pending review`
      : `Scanning your inbox — ${runningScan.processedMessages.toLocaleString()} messages scanned so far`;
  }, [runningScan]);

  const TAB_FILTERS: Array<{ value: 'ALL' | GmailDocStatus; label: string }> = [
    { value: STATUS.PENDING_APPROVAL, label: 'Pending review' },
    { value: STATUS.APPROVED, label: 'Approved' },
    { value: STATUS.IMPORTED, label: 'Imported' },
    { value: STATUS.PARSE_FAILED, label: 'Parse failed' },
    { value: 'ALL', label: 'All' },
  ];

  return (
    <div className="space-y-3">
      {progressLine && (
        <div className="rounded border border-blue-300 bg-blue-50 px-3 py-2 text-xs text-blue-700 flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {progressLine}
        </div>
      )}

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1.5">
        {TAB_FILTERS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setStatusFilter(t.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === t.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-input text-muted-foreground hover:bg-accent'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          {/* Extra filters: sender + doc type */}
          <Select
            value={senderFilter}
            onChange={(e) => setSenderFilter(e.target.value)}
            className="h-8 text-xs w-56"
          >
            <option value="">All senders</option>
            {(sendersQ.data ?? []).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
          <Select
            value={docTypeFilter}
            onChange={(e) => setDocTypeFilter(e.target.value)}
            className="h-8 text-xs w-44"
          >
            <option value="">All doc types</option>
            {INBOX_DOC_TYPES.filter((t) => t !== 'NOT_FINANCIAL').map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </Select>
          <div className="ml-auto flex items-center gap-2">
            {someSelected && (
              <>
                <span className="text-xs text-muted-foreground">{selected.size} selected</span>
                <Button size="sm" onClick={() => bulkApprove.mutate()} disabled={bulkApprove.isPending}>
                  {bulkApprove.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Approve selected'}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => bulkReject.mutate()} disabled={bulkReject.isPending}>
                  {bulkReject.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Reject selected'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-2 py-2 w-8"></th>
                <th className="text-left px-2 py-2">File</th>
                <th className="text-left px-2 py-2">From</th>
                <th className="text-left px-2 py-2">Date</th>
                <th className="text-left px-2 py-2">Type</th>
                <th className="text-right px-2 py-2">Confidence</th>
                <th className="text-left px-2 py-2">Status</th>
                <th className="text-right px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {docsQ.isLoading ? (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
              ) : docs.length === 0 ? (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No documents in this filter.</td></tr>
              ) : docs.map((d) => (
                <InboxImportRow
                  key={d.id}
                  doc={d}
                  selected={selected.has(d.id)}
                  onToggleSelect={() => toggleSelect(d.id)}
                  onPreview={() => setPreview(d.id)}
                  onApprove={(createRule) => approve.mutate({ id: d.id, createRule })}
                  onReject={() => reject.mutate({ id: d.id, blocklist: false })}
                  isPending={approve.isPending || reject.isPending}
                />
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <InboxImportPreviewSheet docId={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
