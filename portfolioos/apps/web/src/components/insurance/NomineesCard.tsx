import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage } from '@/api/client';
import { insuranceApi, type InsurancePolicyDTO, type Nominee } from '@/api/insurance.api';
import { needsNominee } from '@/lib/insurance';

const RELATIONS = ['Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister'];
const SHARE = /^\d{1,3}(\.\d{1,2})?$/;

interface Row {
  name: string;
  relation: string;
  share: string;
  isMinor: boolean;
  appointeeName: string;
  appointeeRelation: string;
}

const blankRow = (): Row => ({ name: '', relation: '', share: '', isMinor: false, appointeeName: '', appointeeRelation: '' });

function rowFrom(n: Nominee): Row {
  return {
    name: n.name,
    relation: n.relation,
    share: n.sharePercent != null ? String(n.sharePercent) : '',
    isMinor: n.isMinor === true,
    appointeeName: n.appointeeName ?? '',
    appointeeRelation: n.appointeeRelation ?? '',
  };
}

/** Hundredths, so 33.33 + 33.33 + 33.34 adds up exactly. */
const hundredths = (s: string) => Math.round(Number.parseFloat(s) * 100);

function EditNomineesDialog({
  policy,
  open,
  onOpenChange,
}: {
  policy: InsurancePolicyDTO;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRows(policy.nominees?.length ? policy.nominees.map(rowFrom) : [blankRow()]);
    setProblem(null);
  }, [open, policy.nominees]);

  const mutation = useMutation({
    mutationFn: (nominees: Nominee[] | null) => insuranceApi.updatePolicy(policy.id, { nominees }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insurance-policies'] });
      qc.invalidateQueries({ queryKey: ['insurance-policy', policy.id] });
      toast.success('Nominees saved');
      onOpenChange(false);
    },
  });

  const set = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function save() {
    const filled = rows.filter((r) => r.name.trim());
    for (const r of filled) {
      if (!r.relation.trim()) return setProblem(`Add how ${r.name.trim()} is related to the policyholder.`);
      if (r.isMinor && !r.appointeeName.trim()) {
        return setProblem(`${r.name.trim()} is a minor — add an appointee to receive the money for them.`);
      }
      if (r.share.trim() && !SHARE.test(r.share.trim())) return setProblem(`"${r.share}" isn't a percentage.`);
    }
    const withShare = filled.filter((r) => r.share.trim());
    if (withShare.length > 0) {
      if (withShare.length !== filled.length) return setProblem('Give every nominee a share, or leave all shares blank.');
      const total = withShare.reduce((s, r) => s + hundredths(r.share), 0);
      if (total !== 10000) return setProblem(`Shares add up to ${total / 100}% — they need to total 100%.`);
    }
    setProblem(null);
    mutation.mutate(
      filled.length === 0
        ? null
        : filled.map((r) => ({
            name: r.name.trim(),
            relation: r.relation.trim(),
            sharePercent: r.share.trim() ? hundredths(r.share) / 100 : null,
            isMinor: r.isMinor,
            appointeeName: r.isMinor ? r.appointeeName.trim() : null,
            appointeeRelation: r.isMinor ? r.appointeeRelation.trim() || null : null,
          })),
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nominees</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Record who's registered as nominee with {policy.insurer}. This is your record — to change the nominee on
          the policy itself, send the insurer their nomination form.
        </p>
        <datalist id="nominee-relations">
          {RELATIONS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <div className="space-y-4">
          {rows.map((r, i) => (
            <fieldset key={i} className="space-y-3 rounded-lg border p-3">
              <legend className="sr-only">Nominee {i + 1}</legend>
              <div className="grid gap-3 sm:grid-cols-[1fr_9rem_6rem_auto]">
                <div>
                  <Label htmlFor={`nominee-name-${i}`}>Name</Label>
                  <Input id={`nominee-name-${i}`} value={r.name} onChange={(e) => set(i, { name: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor={`nominee-relation-${i}`}>Relation</Label>
                  <Input
                    id={`nominee-relation-${i}`}
                    list="nominee-relations"
                    value={r.relation}
                    onChange={(e) => set(i, { relation: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor={`nominee-share-${i}`}>Share %</Label>
                  <Input
                    id={`nominee-share-${i}`}
                    inputMode="decimal"
                    placeholder={rows.length === 1 ? '100' : ''}
                    value={r.share}
                    onChange={(e) => set(i, { share: e.target.value })}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove nominee ${i + 1}`}
                    onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={r.isMinor} onChange={(e) => set(i, { isMinor: e.target.checked })} />
                Under 18
              </label>
              {r.isMinor && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor={`appointee-name-${i}`}>Appointee</Label>
                    <Input
                      id={`appointee-name-${i}`}
                      placeholder="Receives the money until they turn 18"
                      value={r.appointeeName}
                      onChange={(e) => set(i, { appointeeName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`appointee-relation-${i}`}>Appointee's relation</Label>
                    <Input
                      id={`appointee-relation-${i}`}
                      list="nominee-relations"
                      value={r.appointeeRelation}
                      onChange={(e) => set(i, { appointeeRelation: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </fieldset>
          ))}
          {rows.length < 10 && (
            <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, blankRow()])}>
              <Plus className="h-3.5 w-3.5" /> Add nominee
            </Button>
          )}
        </div>
        {(problem || mutation.isError) && (
          <p className="text-sm text-negative">{problem ?? apiErrorMessage(mutation.error, 'Could not save')}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save nominees'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NomineesCard({ policy }: { policy: InsurancePolicyDTO }) {
  const [open, setOpen] = useState(false);
  const nominees = policy.nominees ?? [];
  const missing = needsNominee(policy);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="font-display text-xl">Nominees</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          {nominees.length > 0 ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {nominees.length > 0 ? 'Edit' : 'Add'}
        </Button>
      </CardHeader>
      <CardContent>
        {nominees.length === 0 ? (
          missing ? (
            <div className="flex gap-2.5 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-muted-foreground">
                No nominee recorded. Without a nominee registered with the insurer, your family may need a
                succession or legal-heir certificate before a claim is paid.{' '}
                <Link to="/insurance/help#nomination" className="text-accent hover:underline">
                  How nomination works
                </Link>
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">None recorded.</p>
          )
        ) : (
          <ul className="space-y-3">
            {nominees.map((n, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px]">{n.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {n.relation}
                    {n.isMinor && n.appointeeName &&
                      ` · minor — appointee ${n.appointeeName}${n.appointeeRelation ? ` (${n.appointeeRelation})` : ''}`}
                  </p>
                </div>
                {n.sharePercent != null && <span className="shrink-0 tabular-nums">{n.sharePercent}%</span>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <EditNomineesDialog policy={policy} open={open} onOpenChange={setOpen} />
    </Card>
  );
}
