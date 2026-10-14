import { useEffect, useRef, useState } from 'react';
import { DOC_TYPES, DOC_TYPE_LABEL, type SorterFileDTO, type SorterPersonDTO, type SortDocType } from '@everypaisa/shared';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type MoveTarget = { personId: string; docType: SortDocType } | { newPersonName: string; docType: SortDocType };

interface Props {
  file: SorterFileDTO | null;
  people: SorterPersonDTO[];
  saving: boolean;
  onSave: (target: MoveTarget) => void;
  onClose: () => void;
}

const SELECT = 'h-10 w-full rounded-md border bg-background px-3 text-sm focus-ring';
const NEW = '__new__';

/** Move a file to another person/type, or assign one that could not be sorted, creating the person if need be. */
export function MoveDialog({ file, people, saving, onSave, onClose }: Props) {
  const [personId, setPersonId] = useState('');
  const [newName, setNewName] = useState('');
  const [docType, setDocType] = useState<SortDocType>('OTHER');
  // The folder list is refreshed by polling while files are read. Reading it through a ref keeps a
  // refresh from resetting what the person has already picked.
  const peopleRef = useRef(people);
  peopleRef.current = people;

  useEffect(() => {
    if (file) {
      setPersonId(file.personId ?? peopleRef.current[0]?.id ?? NEW);
      setNewName('');
      setDocType(file.docType ?? 'OTHER');
    }
  }, [file?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- reset per file, never per refresh

  const choosingNew = people.length === 0 || personId === NEW;
  const canSave = choosingNew ? newName.trim().length > 0 : personId !== '';

  return (
    <Dialog open={file !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move to a folder</DialogTitle>
          <DialogDescription className="truncate">{file?.fileName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {people.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="move-person">Person</Label>
              <select id="move-person" className={SELECT} value={choosingNew ? NEW : personId} onChange={(e) => setPersonId(e.target.value)}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.displayName}</option>
                ))}
                <option value={NEW}>New person…</option>
              </select>
            </div>
          )}
          {choosingNew && (
            <div className="space-y-1.5">
              <Label htmlFor="move-new-person">New person</Label>
              <Input id="move-new-person" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name, as on the document" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="move-type">Document type</Label>
            <select id="move-type" className={SELECT} value={docType} onChange={(e) => setDocType(e.target.value as SortDocType)}>
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            type="button"
            disabled={saving || !canSave}
            onClick={() => onSave(choosingNew ? { newPersonName: newName.trim(), docType } : { personId, docType })}
          >
            {saving ? 'Moving…' : 'Move and rename'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
