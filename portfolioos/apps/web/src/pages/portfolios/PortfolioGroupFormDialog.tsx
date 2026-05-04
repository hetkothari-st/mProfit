import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { portfolioGroupsApi } from '@/api/portfolioGroups.api';
import { portfoliosApi } from '@/api/portfolios.api';
import { apiErrorMessage } from '@/api/client';
import type { PortfolioGroupListItem } from '@portfolioos/shared';

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
});
type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: PortfolioGroupListItem;
}

export function PortfolioGroupFormDialog({ open, onOpenChange, initial }: Props) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(initial);

  const portfoliosQuery = useQuery({
    queryKey: ['portfolios'],
    queryFn: portfoliosApi.list,
    enabled: open,
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { register, handleSubmit, reset, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '' },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: initial?.name ?? '',
        description: initial?.description ?? '',
      });
      setSelected(new Set(initial?.members.map((m) => m.id) ?? []));
    }
  }, [open, initial, reset]);

  // Single-currency invariant — derive from current selection
  const lockedCurrency = useMemo(() => {
    const portfolios = portfoliosQuery.data ?? [];
    const chosen = portfolios.filter((p) => selected.has(p.id));
    if (chosen.length === 0) return null;
    return chosen[0]!.currency;
  }, [portfoliosQuery.data, selected]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const memberIds = [...selected];
      if (isEdit && initial) {
        const updated = await portfolioGroupsApi.update(initial.id, values);
        await portfolioGroupsApi.setMembers(initial.id, memberIds);
        return updated;
      }
      return portfolioGroupsApi.create({ ...values, memberIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio-groups'] });
      toast.success(isEdit ? 'Group updated' : 'Group created');
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Save failed')),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!initial) return;
      await portfolioGroupsApi.remove(initial.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio-groups'] });
      toast.success('Group deleted');
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Delete failed')),
  });

  const handleDelete = () => {
    if (!initial) return;
    if (!window.confirm(`Delete group "${initial.name}"? Member portfolios are unaffected.`)) return;
    deleteMutation.mutate();
  };

  const portfolios = portfoliosQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit group' : 'Create a portfolio group'}</DialogTitle>
          <DialogDescription>
            Bundle multiple portfolios (e.g. each family member's investments) into a single
            consolidated view. Member portfolios stay independent for transactions.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              className="mt-1"
              placeholder="e.g. Kotharis"
              {...register('name')}
            />
            {formState.errors.name && (
              <p className="text-xs text-negative mt-1">{formState.errors.name.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              className="mt-1"
              rows={2}
              placeholder="e.g. Combined Kothari family net worth"
              {...register('description')}
            />
          </div>

          <div>
            <Label>Member portfolios</Label>
            <div className="mt-1 max-h-[260px] overflow-y-auto border rounded-md divide-y">
              {portfolios.length === 0 && (
                <div className="p-3 text-sm text-muted-foreground">
                  No portfolios available. Create individual portfolios first.
                </div>
              )}
              {portfolios.map((p) => {
                const checked = selected.has(p.id);
                const disabled =
                  !checked && lockedCurrency !== null && p.currency !== lockedCurrency;
                return (
                  <label
                    key={p.id}
                    className={`flex items-center gap-3 p-2 cursor-pointer hover:bg-muted/50 ${
                      disabled ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => !disabled && toggle(p.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.currency} · {p.type} · {p.holdingCount} holdings
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
            {lockedCurrency && (
              <p className="text-xs text-muted-foreground mt-1">
                Group currency locked to {lockedCurrency}. Other-currency portfolios disabled.
              </p>
            )}
          </div>

          <DialogFooter className="pt-2 gap-2 sm:justify-between">
            {isEdit ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4" /> Delete group
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {isEdit ? 'Save changes' : 'Create group'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
