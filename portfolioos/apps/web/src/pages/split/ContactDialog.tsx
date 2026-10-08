import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type { SplitContactDto } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { splitErrorMessage } from './errors';
import { SPLIT_KEYS, splitApi } from '@/api/split.api';

export function ContactDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved?: (c: SplitContactDto) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setName(''); setEmail(''); setPhone(''); setError(null); }
  }, [open]);

  const save = useMutation({
    mutationFn: () => splitApi.createContact({ name: name.trim(), email: email.trim() || null, phone: phone.trim() || null }),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: SPLIT_KEYS.contacts });
      toast.success(`${c.name} added`);
      onOpenChange(false);
      onSaved?.(c);
    },
    onError: (err) => setError(splitErrorMessage(err, 'Could not add the person')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Enter a name');
    save.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add a person</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="contact-name">Name</Label>
            <Input id="contact-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-email">Email (optional)</Label>
            <Input id="contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-phone">Phone (optional)</Label>
            <Input id="contact-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">Optional — used later to invite them.</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>Add person</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
