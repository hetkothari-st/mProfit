import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { portfoliosApi, type PortfolioListItem } from '@/api/portfolios.api';
import { apiErrorMessage } from '@/api/client';
import { PortfolioType } from '@portfolioos/shared';

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  type: z.nativeEnum(PortfolioType).default(PortfolioType.INVESTMENT),
  currency: z.string().length(3).default('INR'),
  isDefault: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: PortfolioListItem;
}

export function PortfolioFormDialog({ open, onOpenChange, initial }: Props) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(initial);

  const { register, handleSubmit, reset, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      type: PortfolioType.INVESTMENT,
      currency: 'INR',
      isDefault: false,
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: initial?.name ?? '',
        description: initial?.description ?? '',
        type: (initial?.type as PortfolioType) ?? PortfolioType.INVESTMENT,
        currency: initial?.currency ?? 'INR',
        isDefault: initial?.isDefault ?? false,
      });
    }
  }, [open, initial, reset]);

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (isEdit && initial) {
        return portfoliosApi.update(initial.id, values);
      }
      return portfoliosApi.create(values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      toast.success(isEdit ? 'Portfolio updated' : 'Portfolio created');
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Save failed')),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!initial) return;
      await portfoliosApi.remove(initial.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      toast.success('Portfolio deleted');
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Delete failed')),
  });

  const handleDelete = () => {
    if (!initial) return;
    if (!window.confirm(`Delete portfolio "${initial.name}"? This cannot be undone.`)) return;
    deleteMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit portfolio' : 'Create a new portfolio'}</DialogTitle>
          <DialogDescription>
            A portfolio groups holdings by strategy, goal, or account.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" className="mt-1" placeholder="Long Term Equity" {...register('name')} />
            {formState.errors.name && (
              <p className="text-xs text-negative mt-1">{formState.errors.name.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              className="mt-1"
              rows={3}
              placeholder="e.g. Core buy-and-hold positions across Nifty 50 and index funds"
              {...register('description')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="type">Type</Label>
              <Select id="type" className="mt-1" {...register('type')}>
                <option value={PortfolioType.INVESTMENT}>Investment</option>
                <option value={PortfolioType.TRADING}>Trading</option>
                <option value={PortfolioType.GOAL}>Goal-based</option>
                <option value={PortfolioType.STRATEGY}>Strategy</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="currency">Currency</Label>
              <Select id="currency" className="mt-1" {...register('currency')}>
                <option value="INR">INR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </Select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              {...register('isDefault')}
            />
            Set as default portfolio
          </label>

          <DialogFooter className="pt-2 gap-2 sm:justify-between">
            {isEdit ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4" /> Delete
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
                {isEdit ? 'Save changes' : 'Create'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
