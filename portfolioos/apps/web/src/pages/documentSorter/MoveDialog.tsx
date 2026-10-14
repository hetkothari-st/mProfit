import { useEffect, useState } from 'react';
import { DOC_TYPES, DOC_TYPE_LABEL, type SorterFileDTO, type SorterPersonDTO, type SortDocType } from '@everypaisa/shared';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface Props {
  file: SorterFileDTO | null;
  people: SorterPersonDTO[];
  saving: boolean;
  onSave: (patch: { personId: string; docType: SortDocType }) => void;
  onClose: () => void;
}

const SELECT = 'h-10 w-full rounded-md border bg-background px-3 text-sm focus-ring';

/** Move a file to another person/type, or assign one that could not be sorted. */
export function MoveDialog({ file, people, saving, onSave, onClose }: Props) {
  const [personId, setPersonId] = useState('');
  const [docType, setDocType] = useState<SortDocType>('OTHER');

  useEffect(() => {
    if (file) {
      setPersonId(file.personId ?? people[0]?.id ?? '');
      setDocType(file.docType ?? 'OTHER');
    }
  }, [file, people]);

  return (
    <Dialog open={file !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move to a folder</DialogTitle>
          <DialogDescription className="truncate">{file?.fileName}</DialogDescription>
        </DialogHeader>
        {people.length === 0 ? (
          <p className="text-sm text-muted-foreground">No people folders yet. They are created automatically from the names on your documents.</p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="move-person">Person</Label>
              <select id="move-person" className={SELECT} value={personId} onChange={(e) => setPersonId(e.target.value)}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.displayName}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="move-type">Document type</Label>
              <select id="move-type" className={SELECT} value={docType} onChange={(e) => setDocType(e.target.value as SortDocType)}>
                {DOC_TYPES.map((t) => (
                  <option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={saving || !personId} onClick={() => onSave({ personId, docType })}>
            {saving ? 'Moving…' : 'Move and rename'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
