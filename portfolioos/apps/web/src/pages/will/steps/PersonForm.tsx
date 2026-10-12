import { useEffect, useRef, useState } from 'react';
import { WILL_RELATIONSHIPS, type WillPerson, type WillRelationship } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field, RELATIONSHIP_LABEL } from '../parts';

const ORG_RELATIONSHIPS: WillRelationship[] = ['CHARITY', 'OTHER'];

export function PersonForm({ initial, others, today, onSave, onCancel }: {
  initial: WillPerson;
  /** Everyone else, for the back-up choice. */
  others: WillPerson[];
  /** Indian calendar date, YYYY-MM-DD: the latest possible date of birth. */
  today: string;
  onSave: (p: WillPerson) => void;
  onCancel: () => void;
}) {
  const [p, setP] = useState<WillPerson>(initial);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => nameRef.current?.focus(), []);
  const org = p.partyType === 'ORGANISATION';
  const relationships = org ? ORG_RELATIONSHIPS : WILL_RELATIONSHIPS.filter((r) => r !== 'CHARITY');
  const pid = (x: string) => `person-${x}`;

  function save() {
    if (!p.name.trim()) {
      setError('Enter a name.');
      return;
    }
    onSave({ ...p, name: p.name.trim(), contact: p.contact?.trim() || null, dob: org ? null : p.dob });
  }

  return (
    <div className="space-y-3 rounded-md border border-border/60 bg-card p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={pid('name')} label={org ? 'Name of the organisation' : 'Name'} required>
          <Input
            id={pid('name')}
            ref={nameRef}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? pid('error') : undefined}
            value={p.name} maxLength={120} onChange={(e) => setP({ ...p, name: e.target.value })}
          />
        </Field>
        <Field id={pid('rel')} label="Relationship">
          <Select id={pid('rel')} value={p.relationship} onChange={(e) => setP({ ...p, relationship: e.target.value as WillRelationship })}>
            {relationships.map((r) => <option key={r} value={r}>{RELATIONSHIP_LABEL[r]}</option>)}
          </Select>
        </Field>
        {!org && (
          <Field id={pid('dob')} label="Date of birth" hint="Tells us whether they are under 18.">
            <Input id={pid('dob')} type="date" min="1900-01-01" max={today} value={p.dob ?? ''} onChange={(e) => setP({ ...p, dob: e.target.value || null })} />
          </Field>
        )}
        <Field id={pid('contact')} label="Phone or email (optional)">
          <Input id={pid('contact')} value={p.contact ?? ''} maxLength={120} onChange={(e) => setP({ ...p, contact: e.target.value })} />
        </Field>
        <Field id={pid('backup')} label="If they die before you, their gifts go to">
          <Select id={pid('backup')} value={p.contingentId ?? ''} onChange={(e) => setP({ ...p, contingentId: e.target.value || null })}>
            <option value="">Shared among the others (default)</option>
            {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </Field>
      </div>
      {error && <p id={pid('error')} className="text-sm text-negative" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={save}>Save person</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
