import { useCallback, useRef, useState } from 'react';
import { UploadCloud, Loader2, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import type { SorterTreeDTO } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { apiErrorMessage } from '@/api/client';
import { documentSorterApi } from '@/api/documentSorter.api';
import { fileProgressLabel, findFile, formatBytes } from './treeView';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.heic,.webp,.tiff,.bmp';
const BATCH = 20; // the API takes at most 20 files per request
const MAX_ROWS = 12;

interface DropRow {
  key: string;
  name: string;
  size: number;
  state: 'uploading' | 'sent' | 'error';
  progress: number;
  id?: string;
  duplicate?: boolean;
  error?: string;
}

interface Props {
  tree: SorterTreeDTO | undefined;
  onUploaded: () => void;
}

/** Drop-or-browse for many files; each one is shown moving through upload → reading → filed. */
export function SorterDropzone({ tree, onUploaded }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [rows, setRows] = useState<DropRow[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const patchRows = (keys: Set<string>, fn: (r: DropRow, index: number) => Partial<DropRow>) =>
    setRows((rs) => {
      let i = 0;
      return rs.map((r) => (keys.has(r.key) ? { ...r, ...fn(r, i++) } : r));
    });

  const send = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const fresh: DropRow[] = files.map((f, i) => ({
        key: `${Date.now()}-${i}-${f.name}`,
        name: f.name,
        size: f.size,
        state: 'uploading',
        progress: 0,
      }));
      setRows((rs) => [...fresh, ...rs].slice(0, MAX_ROWS));

      for (let start = 0; start < files.length; start += BATCH) {
        const chunk = files.slice(start, start + BATCH);
        const chunkRows = fresh.slice(start, start + BATCH);
        const keys = new Set(chunkRows.map((r) => r.key));
        try {
          const acks = await documentSorterApi.upload(chunk, (p) => patchRows(keys, () => ({ progress: p })));
          patchRows(keys, (_r, i) => ({
            state: 'sent',
            progress: 1,
            id: acks[i]?.id,
            duplicate: Boolean(acks[i]?.duplicateOf),
          }));
        } catch (err) {
          const message = apiErrorMessage(err, 'Upload failed');
          patchRows(keys, () => ({ state: 'error', error: message }));
          toast.error(message);
        }
      }
      onUploaded();
    },
    [onUploaded],
  );

  const statusOf = (r: DropRow): { text: string; tone: 'busy' | 'ok' | 'warn' | 'err' } => {
    if (r.state === 'uploading') return { text: `Uploading ${Math.round(r.progress * 100)}%`, tone: 'busy' };
    if (r.state === 'error') return { text: r.error ?? 'Upload failed', tone: 'err' };
    if (r.duplicate) return { text: 'Already in your Documents', tone: 'ok' };
    const found = r.id && tree ? findFile(tree, r.id) : null;
    if (!found) return { text: 'Uploaded — reading…', tone: 'busy' };
    const { file, personName } = found;
    const tone = file.sortStatus === 'FILED' ? 'ok' : file.sortStatus === 'PROCESSING' ? 'busy' : 'warn';
    return { text: fileProgressLabel(file, personName), tone };
  };

  return (
    <div className="space-y-3">
      <div
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void send(Array.from(e.dataTransfer.files ?? []));
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        className={`relative rounded-lg border-2 border-dashed p-6 text-center transition-colors sm:p-10 ${
          dragOver ? 'border-primary bg-primary/5' : 'border-muted bg-muted/20'
        }`}
      >
        <div className="flex flex-col items-center gap-2">
          <UploadCloud className={`h-10 w-10 ${dragOver ? 'text-primary' : 'text-muted-foreground'}`} />
          <div className="text-sm font-medium">Drop your documents here — we sort them for you</div>
          <div className="text-xs text-muted-foreground">
            PDFs and photos or scans · ITR, bank statements, income certificates and more · Many files at once
          </div>
          <Button type="button" variant="outline" className="mt-2" onClick={() => inputRef.current?.click()}>
            Choose files
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            void send(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>

      {rows.length > 0 && (
        <ul className="divide-y rounded-lg border bg-card text-sm" aria-label="Recent uploads">
          {rows.map((r) => {
            const s = statusOf(r);
            return (
              <li key={r.key} className="flex items-center gap-3 px-3 py-2">
                {s.tone === 'busy' && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
                {s.tone === 'ok' && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
                {(s.tone === 'warn' || s.tone === 'err') && <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {formatBytes(r.size)} · {s.text}
                  </div>
                </div>
              </li>
            );
          })}
          <li className="flex justify-end px-3 py-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={() => setRows([])}>
              <X className="mr-1 h-3.5 w-3.5" />
              Clear list
            </Button>
          </li>
        </ul>
      )}
    </div>
  );
}
