import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ImportJobDTO } from '@portfolioos/shared';

interface Props {
  job: ImportJobDTO | null;
  onClose: () => void;
}

export function ImportErrorDialog({ job, onClose }: Props) {
  const log = job?.errorLog;
  return (
    <Dialog open={Boolean(job)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import issues — {job?.fileName}</DialogTitle>
        </DialogHeader>

        {log?.parser && (
          <div className="text-xs text-muted-foreground">
            Parser: <span className="font-mono">{log.parser}</span>
          </div>
        )}

        {log?.general && (
          <div className="rounded-md border border-negative/40 bg-negative/5 p-3 text-sm text-negative">
            {log.general}
          </div>
        )}

        {(log?.parserWarnings ?? []).length > 0 && (
          <div>
            <div className="text-sm font-medium mb-1">Parser warnings</div>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              {log!.parserWarnings!.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {(log?.rowErrors ?? []).length > 0 && (
          <div>
            <div className="text-sm font-medium mb-1">
              Row errors ({log!.rowErrors!.length})
            </div>
            <div className="max-h-64 overflow-y-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-3 py-1.5">Row</th>
                    <th className="text-left font-medium px-3 py-1.5">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {log!.rowErrors!.map((e, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 tabular-nums">{e.row}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
