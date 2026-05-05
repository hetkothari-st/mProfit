import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { realEstateApi } from '@/api/realEstate.api';
import { apiErrorMessage } from '@/api/client';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  propertyId: string;
  propertyName: string;
}

export function MarkSoldDialog({ open, onOpenChange, propertyId, propertyName }: Props) {
  const qc = useQueryClient();
  const [saleDate, setSaleDate] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [saleBrokerage, setSaleBrokerage] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      realEstateApi.markSold(propertyId, {
        saleDate,
        salePrice,
        saleBrokerage: saleBrokerage || null,
      }),
    onSuccess: () => {
      toast.success('Marked as sold');
      qc.invalidateQueries({ queryKey: ['real-estate', propertyId] });
      qc.invalidateQueries({ queryKey: ['real-estate'] });
      qc.invalidateQueries({ queryKey: ['real-estate-summary'] });
      qc.invalidateQueries({ queryKey: ['real-estate-cg', propertyId] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to mark sold')),
  });

  function handleSubmit() {
    if (!saleDate || !salePrice) {
      toast.error('Sale date and price required');
      return;
    }
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mark "{propertyName}" as sold</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Sale date *</Label>
            <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
          </div>
          <div>
            <Label>Sale price (₹) *</Label>
            <Input value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
          </div>
          <div>
            <Label>Sale brokerage (₹)</Label>
            <Input value={saleBrokerage} onChange={(e) => setSaleBrokerage(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Capital gain (LTCG with CII indexation under section 112) will be computed automatically.
            Status will flip to <strong>SOLD</strong>; the row stays for tax records.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Mark sold'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
