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
import { formatDay } from '@/lib/insurance';
import { insurerContactFor, phoneKind, telHref, whatsappHref, type InsurerContact } from '@/lib/insurerContacts';

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

const PHONE_NOTE = { 'toll-free': 'toll-free', 'shared-cost': 'charges apply', standard: null } as const;

function Phone({ number }: { number: string }) {
  const note = PHONE_NOTE[phoneKind(number)];
  return (
    <span className="whitespace-nowrap">
      <a href={telHref(number)} className="text-accent hover:underline">
        {number}
      </a>
      {note && <span className="ml-1 text-xs text-muted-foreground">({note})</span>}
    </span>
  );
}

function DirRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="min-w-0 space-x-2 break-words">{children}</dd>
    </div>
  );
}

/** What the insurer's own website lists, with where and when it was checked. */
function InsurerDirectory({ dir }: { dir: InsurerContact & { name: string } }) {
  const link = (href: string, text: string) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="break-all text-accent hover:underline">
      {text}
    </a>
  );
  return (
    <div className="space-y-2.5">
      <p className="text-xs text-muted-foreground">From {dir.name}’s website</p>
      <dl className="space-y-2 text-sm">
        <DirRow term="Customer care">
          {dir.phones.map((n) => (
            <Phone key={n} number={n} />
          ))}
        </DirRow>
        {dir.claimsPhones.map((c) => (
          <DirRow key={c.label} term={c.label}>
            {c.numbers.map((n) => (
              <Phone key={n} number={n} />
            ))}
          </DirRow>
        ))}
        {dir.whatsapp && <DirRow term="WhatsApp">{link(whatsappHref(dir.whatsapp), dir.whatsapp)}</DirRow>}
        {dir.claimsEmail && <DirRow term="Claims email">{link(`mailto:${dir.claimsEmail}`, dir.claimsEmail)}</DirRow>}
        {dir.email && <DirRow term="Email">{link(`mailto:${dir.email}`, dir.email)}</DirRow>}
        {dir.claimUrl && <DirRow term="Claim online">{link(dir.claimUrl, 'Claims page')}</DirRow>}
        {(dir.grievanceUrl || dir.grievanceEmail) && (
          <DirRow term="Complaints">
            {dir.grievanceUrl && link(dir.grievanceUrl, 'Grievance page')}
            {dir.grievanceEmail && link(`mailto:${dir.grievanceEmail}`, dir.grievanceEmail)}
          </DirRow>
        )}
      </dl>
      <p className="text-xs text-muted-foreground">
        Checked on{' '}
        <a href={dir.source} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
          their site
        </a>{' '}
        on {formatDay(dir.checkedOn)}. Numbers change — your policy document has the one for your policy.
      </p>
    </div>
  );
}

/** The numbers someone needs in the moment they have to claim. */
export function ContactsCard({ policy }: { policy: InsurancePolicyDTO }) {
  const [open, setOpen] = useState(false);
  const c = policy.contacts ?? {};
  const filled = FIELDS.filter((f) => c[f.key]);
  const dir = insurerContactFor(policy.insurer);

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
            {dir
              ? 'Add your agent’s number and anything your policy lists for claims.'
              : 'Add the claim helpline and your agent’s number, so no one has to hunt for them on a bad day.'}
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
        {dir && (
          <div className="mt-4 border-t pt-4">
            <InsurerDirectory dir={dir} />
          </div>
        )}
      </CardContent>
      <EditContactsDialog policy={policy} open={open} onOpenChange={setOpen} />
    </Card>
  );
}
