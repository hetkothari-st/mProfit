import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { splitErrorMessage } from './errors';
import { SPLIT_KEYS, splitApi, type NewGroupInput } from '@/api/split.api';
import { useSplitDisplayName } from './useSplitDisplayName';
import { ContactDialog } from './ContactDialog';

export const GROUP_TYPES: Array<{ value: NonNullable<NewGroupInput['type']>; label: string }> = [
  { value: 'TRIP', label: 'Trip' },
  { value: 'HOME', label: 'Home' },
  { value: 'COUPLE', label: 'Couple' },
  { value: 'OTHER', label: 'Other' },
];
export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'THB', 'JPY', 'AUD', 'CAD'];

export function NewGroupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const myName = useSplitDisplayName();
  const contacts = useQuery({ queryKey: SPLIT_KEYS.contacts, queryFn: splitApi.listContacts, enabled: open });
  const [name, setName] = useState('');
  const [type, setType] = useState<NonNullable<NewGroupInput['type']>>('TRIP');
  const [currency, setCurrency] = useState('INR');
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addingPerson, setAddingPerson] = useState(false);

  useEffect(() => {
    if (open) { setName(''); setType('TRIP'); setCurrency('INR'); setPicked([]); setError(null); }
  }, [open]);

  const save = useMutation({
    mutationFn: () => splitApi.createGroup({
      name: name.trim(), type, baseCurrency: currency, simplifyDebts: true,
      myDisplayName: myName, contactIds: picked,
    }),
    onSuccess: (g) => {
      void qc.invalidateQueries({ queryKey: SPLIT_KEYS.all });
      toast.success('Group created');
      onOpenChange(false);
      navigate(`/split/groups/${g.id}`);
    },
    onError: (err) => setError(splitErrorMessage(err, 'Could not create the group')),
  });

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Name the group');
    save.mutate();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New group</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="group-name">Group name</Label>
              <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Goa trip" autoComplete="off" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="group-type">Type</Label>
                <Select id="group-type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                  {GROUP_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="group-currency">Currency</Label>
                <Select id="group-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">People</legend>
              {contacts.isLoading && <p className="text-sm text-muted-foreground">Loading people…</p>}
              {contacts.isSuccess && contacts.data.length === 0 && <p className="text-sm text-muted-foreground">No people yet — add someone to split with.</p>}
              <div className="max-h-48 overflow-y-auto space-y-1">
                {(contacts.data ?? []).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60">
                    <input type="checkbox" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} aria-label={c.name} />
                    <span className="text-sm">{c.name}</span>
                  </label>
                ))}
              </div>
              <Button type="button" variant="link" size="sm" className="px-0" onClick={() => setAddingPerson(true)}>+ Add a person</Button>
            </fieldset>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={save.isPending}>Create group</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ContactDialog open={addingPerson} onOpenChange={setAddingPerson} onSaved={(c) => setPicked((p) => [...p, c.id])} />
    </>
  );
}
