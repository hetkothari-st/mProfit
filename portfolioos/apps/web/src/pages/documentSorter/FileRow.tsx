import { useState, type ReactNode } from 'react';
import { Download, Eye, FileText, FolderInput, Loader2, Trash2 } from 'lucide-react';
import { DOC_TYPE_LABEL, type SorterFileDTO } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { fileProgressLabel, formatBytes } from './treeView';

interface Props {
  file: SorterFileDTO;
  personName: string | null;
  onView: () => void;
  onDownload: () => void;
  onMove: () => void;
  onDelete: () => void;
  /** Extra state-specific action, e.g. "Enter password". */
  extra?: ReactNode;
}

/** One file in a folder: name, date and size, with view / download / move / delete. */
export function FileRow({ file, personName, onView, onDownload, onMove, onDelete, extra }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const viewable = file.mimeType === 'application/pdf' || file.mimeType.startsWith('image/');
  const filed = file.sortStatus === 'FILED';

  return (
    <li className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {file.sortStatus === 'PROCESSING' ? (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{file.fileName}</div>
          <div className="truncate text-xs text-muted-foreground">
            {filed
              ? [file.docType ? DOC_TYPE_LABEL[file.docType] : null, file.docDate, formatBytes(file.sizeBytes)].filter(Boolean).join(' · ')
              : `${fileProgressLabel(file, personName)} · ${formatBytes(file.sizeBytes)}`}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        {extra}
        {viewable && file.sortStatus !== 'PROCESSING' && (
          <Button type="button" variant="ghost" size="sm" onClick={onView} aria-label={`View ${file.fileName}`}>
            <Eye className="h-4 w-4" />
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onDownload} aria-label={`Download ${file.fileName}`}>
          <Download className="h-4 w-4" />
        </Button>
        {file.sortStatus !== 'PROCESSING' && (
          <Button type="button" variant="ghost" size="sm" onClick={onMove} aria-label={`Move ${file.fileName}`}>
            <FolderInput className="h-4 w-4" />
          </Button>
        )}
        {confirmDelete ? (
          <>
            <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
              Delete
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} aria-label={`Delete ${file.fileName}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </li>
  );
}
