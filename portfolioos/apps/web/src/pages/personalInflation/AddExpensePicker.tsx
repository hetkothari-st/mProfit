import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, PencilLine } from 'lucide-react';
import {
  COMMON_EXPENSE_PRESETS,
  cpiDivisionLabel,
  formatINR,
  type InflationItemInput,
  type PersonalInflationSummary,
} from '@everypaisa/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { apiErrorMessage } from '@/api/client';
import { personalInflationApi, PERSONAL_INFLATION_SOURCES_KEY } from '@/api/personalInflation.api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the fresh summary after items are added from the user's data. */
  onImported: (s: PersonalInflationSummary) => void;
  /** Opens the expense form, prefilled from a preset, or blank. */
  onCompose: (preset: Partial<InflationItemInput> | null) => void;
}

const PER: Record<'MONTHLY' | 'YEARLY', string> = { MONTHLY: '/month', YEARLY: '/year' };

/**
 * Three ways to add an expense: tick things the user already tracks (loan
 * EMIs, insurance premiums, society maintenance), start from a common expense,
 * or type one in.
 */
export function AddExpensePicker({ open, onOpenChange, onImported, onCompose }: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const { data: sources, isLoading } = useQuery({
    queryKey: PERSONAL_INFLATION_SOURCES_KEY,
    queryFn: () => personalInflationApi.sources(),
    enabled: open,
  });

  const importMut = useMutation({
    mutationFn: (refs: string[]) => personalInflationApi.importSources(refs),
    onSuccess: (s) => {
      onImported(s);
      toast.success(picked.size === 1 ? 'Expense added' : `${picked.size} expenses added`);
      setPicked(new Set());
      onOpenChange(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const toggle = (ref: string) => {
    const next = new Set(picked);
    if (next.has(ref)) next.delete(ref);
    else next.add(ref);
    setPicked(next);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setPicked(new Set()); onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add expenses</DialogTitle>
          <DialogDescription>Pick from what you already track, start from a common expense, or type your own.</DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">From your data</h3>
          {isLoading ? (
            <div className="py-4 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : !sources || sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing to pick yet. Loans, insurance policies and home maintenance you add in the app show up here.
            </p>
          ) : (
            <ul className="space-y-2">
              {sources.map((c) => (
                <li key={c.sourceRef}>
                  <label className={`flex gap-3 rounded-lg border p-3 ${c.alreadyAdded ? 'opacity-60' : 'cursor-pointer hover:bg-muted/40'}`}>
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0"
                      disabled={c.alreadyAdded}
                      checked={c.alreadyAdded || picked.has(c.sourceRef)}
                      onChange={() => toggle(c.sourceRef)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                        <span className="font-medium text-sm">{c.name}</span>
                        <span className="numeric text-sm">
                          {formatINR(c.amount, { fractionDigits: 0 })}{PER[c.frequency]}
                        </span>
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {c.detail} · {cpiDivisionLabel(c.divisionCode)}
                        {c.alreadyAdded && ' · already added'}
                      </span>
                      {c.note && !c.alreadyAdded && <span className="block text-xs text-muted-foreground mt-0.5">{c.note}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {picked.size > 0 && (
            <Button className="w-full" disabled={importMut.isPending} onClick={() => importMut.mutate([...picked])}>
              {importMut.isPending ? 'Adding…' : `Add ${picked.size === 1 ? '1 expense' : `${picked.size} expenses`}`}
            </Button>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Common expenses</h3>
          <div className="flex flex-wrap gap-2">
            {COMMON_EXPENSE_PRESETS.map((p) => (
              <Button key={p.name} type="button" variant="outline" size="sm" onClick={() => onCompose(p)}>
                {p.name}
              </Button>
            ))}
          </div>
        </section>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onCompose(null)}>
            <PencilLine className="h-4 w-4 mr-1" /> Something else
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
