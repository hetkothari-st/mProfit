import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LEGACY_CATEGORIES, LEGACY_CATEGORY_LABELS, type LegacyCategory, type LegacyNomineeDTO } from '@everypaisa/shared';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { documentsApi } from '@/api/documents.api';
import type { NomineeInput } from '@/api/legacy.api';

const EMPTY: NomineeInput = {
  name: '', email: '', relationship: '', priority: 1, isVerifier: false,
  categories: ['INSURANCE', 'BANK_ACCOUNTS'], documentIds: [], showAmounts: false,
};

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function NomineeDialog({ open, initial, onSave, onClose }: {
  open: boolean;
  initial: LegacyNomineeDTO | null;
  onSave: (v: NomineeInput) => void;
  onClose: () => void;
}) {
  const [v, setV] = useState<NomineeInput>(EMPTY);
  useEffect(() => {
    if (!open) return;
    setV(initial ? {
      name: initial.name, email: initial.email, relationship: initial.relationship, priority: initial.priority,
      isVerifier: initial.isVerifier, categories: initial.categories, documentIds: initial.documentIds, showAmounts: initial.showAmounts,
    } : EMPTY);
  }, [open, initial]);
  const wantsDocs = v.categories.includes('DOCUMENTS');
  const docs = useQuery({ queryKey: ['documents', 'legacy-picker'], queryFn: () => documentsApi.list(), enabled: open && wantsDocs });
  // A replaced will was revoked by a later one: offer it only where it is already shared, so it can be unticked.
  const shownDocs = (docs.data ?? []).filter(
    (d) => d.will?.current !== false || v.documentIds.includes(d.id) || (initial?.documentIds ?? []).includes(d.id),
  );
  const valid = v.name.trim() !== '' && /\S+@\S+\.\S+/.test(v.email) && v.relationship.trim() !== '' && v.categories.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{initial ? 'Edit nominee' : 'Add nominee'}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1"><Label htmlFor="ln-name">Name</Label>
            <Input id="ln-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="ln-email">Email</Label>
            <Input id="ln-email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label htmlFor="ln-rel">Relationship</Label>
              <Input id="ln-rel" value={v.relationship} placeholder="Spouse" onChange={(e) => setV({ ...v, relationship: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="ln-pri">Priority</Label>
              <Input id="ln-pri" type="number" min={1} max={20} value={v.priority}
                onChange={(e) => setV({ ...v, priority: Math.min(20, Math.max(1, Number.parseInt(e.target.value, 10) || 1)) })} /></div>
          </div>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">What they can see</legend>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {LEGACY_CATEGORIES.map((c: LegacyCategory) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={v.categories.includes(c)} onChange={() => setV({ ...v, categories: toggle(v.categories, c) })} />
                  {LEGACY_CATEGORY_LABELS[c]}
                </label>
              ))}
            </div>
          </fieldset>
          {wantsDocs && (
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Documents to share</legend>
              {docs.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {docs.data && shownDocs.length === 0 && <p className="text-sm text-muted-foreground">No documents in your vault yet.</p>}
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {shownDocs.map((d) => (
                  <label key={d.id} className="flex min-w-0 items-center gap-2 text-sm">
                    <input type="checkbox" checked={v.documentIds.includes(d.id)} onChange={() => setV({ ...v, documentIds: toggle(v.documentIds, d.id) })} />
                    <span className="truncate">{d.fileName}</span>
                    {d.will && (
                      <span className={`shrink-0 text-xs ${d.will.current ? 'text-muted-foreground' : 'font-medium text-destructive'}`}>{d.will.label}</span>
                    )}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={v.showAmounts} onChange={(e) => setV({ ...v, showAmounts: e.target.checked })} />
            <span>Show amounts (balances, values). Off means they see only what exists and where.</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={v.isVerifier} onChange={(e) => setV({ ...v, isVerifier: e.target.checked })} />
            <span>Verifier: asked to confirm before access opens. Only one per plan.</span>
          </label>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!valid} onClick={() => onSave({ ...v, email: v.email.trim().toLowerCase(), name: v.name.trim(), relationship: v.relationship.trim() })}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
