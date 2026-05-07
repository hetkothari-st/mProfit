import { CheckCircle2, XCircle, Loader2, AlertTriangle, Eye, FileText, FileSpreadsheet, FileImage } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { GmailDiscoveredDocDTO } from '@portfolioos/shared';
import { GMAIL_DOC_STATUS_LABELS } from '@portfolioos/shared';

const STATUS_CLASSES: Record<string, string> = {
  CLASSIFYING: 'bg-blue-500/10 text-blue-600',
  PENDING_APPROVAL: 'bg-amber-500/10 text-amber-700',
  APPROVED: 'bg-emerald-500/10 text-emerald-700',
  IMPORTING: 'bg-blue-500/10 text-blue-600',
  IMPORTED: 'bg-positive/10 text-positive',
  PARSE_FAILED: 'bg-negative/10 text-negative',
  REJECTED: 'bg-zinc-200 text-zinc-700',
  NOT_FINANCIAL: 'bg-zinc-200 text-zinc-700',
  DUPLICATE: 'bg-zinc-200 text-zinc-700',
};

function iconFor(name: string) {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return FileSpreadsheet;
  if (['png', 'jpg', 'jpeg'].includes(ext)) return FileImage;
  return FileText;
}

interface Props {
  doc: GmailDiscoveredDocDTO;
  selected: boolean;
  onToggleSelect: () => void;
  onPreview: () => void;
  onApprove: (createRule: boolean) => void;
  onReject: () => void;
  isPending: boolean;
}

export function InboxImportRow({
  doc, selected, onToggleSelect, onPreview, onApprove, onReject, isPending,
}: Props) {
  const Icon = iconFor(doc.fileName);
  const isPendingApproval = doc.status === 'PENDING_APPROVAL';
  return (
    <tr className={`border-t ${selected ? 'bg-accent/20' : 'hover:bg-muted/30'}`}>
      <td className="px-2 py-2 w-8">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          disabled={!isPendingApproval}
        />
      </td>
      <td className="px-2 py-2">
        <button onClick={onPreview} className="flex items-center gap-2 hover:underline text-left">
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium truncate max-w-[280px]">{doc.fileName}</span>
        </button>
      </td>
      <td className="px-2 py-2 text-xs text-muted-foreground truncate max-w-[200px]">{doc.fromAddress}</td>
      <td className="px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">
        {new Date(doc.receivedAt).toLocaleDateString()}
      </td>
      <td className="px-2 py-2 text-xs text-muted-foreground">{doc.classifiedDocType ?? '—'}</td>
      <td className="px-2 py-2 text-xs text-muted-foreground tabular-nums">
        {doc.classifierConfidence ? `${Math.round(parseFloat(doc.classifierConfidence) * 100)}%` : '—'}
      </td>
      <td className="px-2 py-2">
        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[doc.status] ?? ''}`}>
          {doc.status === 'CLASSIFYING' || doc.status === 'IMPORTING' ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : doc.status === 'IMPORTED' ? (
            <CheckCircle2 className="h-3 w-3" />
          ) : doc.status === 'PARSE_FAILED' ? (
            <AlertTriangle className="h-3 w-3" />
          ) : doc.status === 'REJECTED' ? (
            <XCircle className="h-3 w-3" />
          ) : null}
          {GMAIL_DOC_STATUS_LABELS[doc.status]}
        </span>
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onPreview}>
            <Eye className="h-3 w-3" /> Preview
          </Button>
          {isPendingApproval && (
            <>
              <Button
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onApprove(false)}
                disabled={isPending}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => onApprove(true)}
                disabled={isPending}
                title="Approve + auto-approve future docs from this sender"
              >
                + Always
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-destructive"
                onClick={onReject}
                disabled={isPending}
              >
                Reject
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
