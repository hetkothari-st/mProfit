import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage } from '@/api/client';
import { insuranceApi, type InsurancePolicyDTO, type PolicyContacts } from '@/api/insurance.api';

type Key = keyof PolicyContacts;

const FIELDS: Array<{ key: Key; label: string; placeholder?: string; health?: boolean }> = [
  { key: 'helpline', label: 'Insurer helpline', placeholder: 'From the policy or the insurer’s site' },
  { key: 'claimEmail', label: 'Claims email' },
  { key: 'claimUrl', label: 'Claims web page', placeholder: 'https://…' },
  { key: 'tpaName', label: 'TPA', placeholder: 'Settles health claims for the insurer', health: true },
  { key: 'tpaHelpline', label: 'TPA helpline', health: true },
  { key: 'agentName', label: 'Agent or advisor' },
  { key: 'agentPhone', label: 'Agent’s phone' },
  { key: 'agentEmail', label: 'Agent’s email' },
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only http(s) links are rendered as links — never a javascript: URL from saved data. */
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : null);
const tel = (n: string) => `tel:${n.replace(/[^\d+]/g, '')}`;

function ContactValue({ k, value }: { k: Key; value: string }): ReactNode {
  if (k === 'helpline' || k === 'tpaHelpline' || k === 'agentPhone') {
    return (
      <a href={tel(value)} className="text-accent hover:underline">
        {value}
      </a>
    );
  }
  if ((k === 'claimEmail' || k === 'agentEmail') && EMAIL.test(value)) {
    return (
      <a href={`mailto:${value}`} className="break-all text-accent hover:underline">
        {value}
      </a>
    );
  }
  const url = k === 'claimUrl' ? safeUrl(value) : null;
  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-accent hover:underline">
        {value}
      </a>
    );
  }
  return <span className="break-words">{value}</span>;
}

function EditContactsDialog({
  policy,
  open,
  onOpenChange,
}: {
  policy: InsurancePolicyDTO;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<Key, string>>({} as Record<Key, string>);
  const [problem, setProblem] = useState<string | null>(null);
  const fields = FIELDS.filter((f) => !f.health || policy.type === 'HEALTH');

  useEffect(() => {
    if (!open) return;
    const c = policy.contacts ?? {};
    setForm(Object.fromEntries(FIELDS.map((f) => [f.key, c[f.key] ?? ''])) as Record<Key, string>);
    setProblem(null);
  }, [open, policy.contacts]);

  const mutation = useMutation({
    mutationFn: (contacts: PolicyContacts | null) => insuranceApi.updatePolicy(policy.id, { contacts }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insurance-policies'] });
      qc.invalidateQueries({ queryKey: ['insurance-policy', policy.id] });
      toast.success('Contacts saved');
      onOpenChange(false);
    },
  });

  function save() {
    const out: PolicyContacts = {};
    for (const { key } of FIELDS) {
      const v = form[key]?.trim();
      if (!v) continue;
      if ((key === 'claimEmail' || key === 'agentEmail') && !EMAIL.test(v)) {
        return setProblem(`"${v}" isn't an email address.`);
      }
      if (key === 'claimUrl' && !safeUrl(v)) return setProblem('The claims page should start with https://');
      out[key] = v;
    }
    setProblem(null);
    mutation.mutate(Object.keys(out).length > 0 ? out : null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Who to call</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key} className={f.key === 'claimUrl' ? 'sm:col-span-2' : undefined}>
              <Label htmlFor={`contact-${f.key}`}>{f.label}</Label>
              <Input
                id={`contact-${f.key}`}
                placeholder={f.placeholder}
                value={form[f.key] ?? ''}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        {(problem || mutation.isError) && (
          <p className="text-sm text-negative">{problem ?? apiErrorMessage(mutation.error, 'Could not save')}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save contacts'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The numbers someone needs in the moment they have to claim. */
export function ContactsCard({ policy }: { policy: InsurancePolicyDTO }) {
  const [open, setOpen] = useState(false);
  const c = policy.contacts ?? {};
  const filled = FIELDS.filter((f) => c[f.key]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="font-display text-xl">Who to call</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          {filled.length > 0 ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {filled.length > 0 ? 'Edit' : 'Add'}
        </Button>
      </CardHeader>
      <CardContent>
        {filled.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add the claim helpline and your agent’s number, so no one has to hunt for them on a bad day.
          </p>
        ) : (
          <dl className="space-y-2.5 text-sm">
            {filled.map((f) => (
              <div key={f.key} className="grid grid-cols-[8.5rem_1fr] gap-3">
                <dt className="text-muted-foreground">{f.label}</dt>
                <dd className="min-w-0">
                  <ContactValue k={f.key} value={c[f.key]!} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
      <EditContactsDialog policy={policy} open={open} onOpenChange={setOpen} />
    </Card>
  );
}
