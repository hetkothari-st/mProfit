import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import {
  formatDateOnly, isMinorOn, removeWillPerson, willMinorChildren,
  type WillPerson, type WillRoles, type WillSuggestionWire,
} from '@everypaisa/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { willApi } from '@/api/will.api';
import { Field, FindingList, newLocalId, RELATIONSHIP_LABEL } from '../parts';
import { PersonForm } from './PersonForm';
import type { WillStepProps } from './types';

function blank(partyType: WillPerson['partyType']): WillPerson {
  return {
    id: newLocalId('p'), partyType, name: '', relationship: partyType === 'ORGANISATION' ? 'CHARITY' : 'SON',
    dob: null, contact: null, sourceFamilyMemberId: null, contingentId: null,
  };
}

export function PeopleStep({ payload, update, findings, today }: WillStepProps) {
  const [tab, setTab] = useState('beneficiaries');
  const [editing, setEditing] = useState<WillPerson | null>(null);
  const { people, roles } = payload;
  const suggestions = useQuery({ queryKey: ['will', 'suggestions'], queryFn: () => willApi.suggestions() });

  const save = (next: WillPerson[], nextRoles: WillRoles = roles) => update('people', { people: next, roles: nextRoles });
  function upsert(p: WillPerson) {
    save(people.some((x) => x.id === p.id) ? people.map((x) => (x.id === p.id ? p : x)) : [...people, p]);
    setEditing(null);
  }
  function remove(id: string) {
    const next = removeWillPerson(payload, id);
    update('people', { people: next.people, roles: next.roles });
    update('allocation', next.allocation);
  }
  function addSuggestion(s: WillSuggestionWire) {
    upsert({
      id: newLocalId('p'), partyType: 'INDIVIDUAL', name: s.name, relationship: s.relationship ?? 'OTHER_RELATIVE',
      dob: s.dob, contact: null, sourceFamilyMemberId: s.userId, contingentId: null,
    });
  }

  const individuals = people.filter((p) => p.partyType === 'INDIVIDUAL');
  const organisations = people.filter((p) => p.partyType === 'ORGANISATION');
  const adults = individuals.filter((p) => isMinorOn(p.dob, today) !== true);
  const minors = willMinorChildren(payload, today);
  const added = new Set(people.map((p) => p.sourceFamilyMemberId).filter(Boolean));
  const quickPick = (suggestions.data ?? []).filter((s) => !added.has(s.userId));
  const stepFindings = findings.filter((f) => f.step === 3);

  const card = (p: WillPerson) => (
    <li key={p.id} data-testid={`person-${p.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-3">
      <div className="min-w-0">
        <p className="break-words font-medium text-foreground">{p.name}</p>
        <p className="text-xs text-muted-foreground">
          {RELATIONSHIP_LABEL[p.relationship]}
          {p.partyType === 'INDIVIDUAL' && (p.dob ? ` - born ${formatDateOnly(p.dob)}` : ' - date of birth not added')}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {isMinorOn(p.dob, today) === true && <Badge variant="outline">Under 18</Badge>}
        <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Edit</Button>
        <Button size="sm" variant="ghost" onClick={() => remove(p.id)}>Remove</Button>
      </div>
    </li>
  );

  const roleSelect = (id: string, label: string, value: string | null, key: keyof WillRoles, options: WillPerson[]) => (
    <Field id={id} label={label}>
      <Select id={id} value={value ?? ''} onChange={(e) => save(people, { ...roles, [key]: e.target.value || null })}>
        <option value="">Not chosen</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </Select>
    </Field>
  );

  return (
    <div className="space-y-4">
      {editing && (
        <PersonForm key={editing.id} initial={editing} others={people.filter((x) => x.id !== editing.id)} onSave={upsert} onCancel={() => setEditing(null)} />
      )}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="beneficiaries">Beneficiaries</TabsTrigger>
          <TabsTrigger value="executor">Executor</TabsTrigger>
          <TabsTrigger value="guardian">Guardian</TabsTrigger>
          <TabsTrigger value="others">Others</TabsTrigger>
        </TabsList>

        <TabsContent value="beneficiaries" className="space-y-3 pt-3">
          {quickPick.length > 0 && (
            <Card tone="muted" className="space-y-2 p-3">
              <p className="text-sm text-foreground">From your family on EveryPaisa</p>
              <div className="flex flex-wrap gap-2">
                {quickPick.map((s) => (
                  <Button key={s.userId} size="sm" variant="outline" aria-label={`Add ${s.name}`} onClick={() => addSuggestion(s)}>
                    <UserPlus className="mr-1 h-4 w-4" />{s.name}{s.relation ? ` (${s.relation})` : ''}
                  </Button>
                ))}
              </div>
            </Card>
          )}
          <ul className="space-y-2">{individuals.map(card)}</ul>
          <Button size="sm" variant="outline" onClick={() => setEditing(blank('INDIVIDUAL'))}>Add a person</Button>
        </TabsContent>

        <TabsContent value="executor" className="space-y-3 pt-3">
          <p className="text-sm text-muted-foreground">The executor collects your assets, pays your debts and shares out the rest as your will says.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {roleSelect('will-executor', 'Executor', roles.executorId, 'executorId', adults)}
            {roleSelect('will-alt-executor', 'Back-up executor', roles.altExecutorId, 'altExecutorId', adults)}
          </div>
        </TabsContent>

        <TabsContent value="guardian" className="space-y-3 pt-3">
          {minors.length === 0 ? (
            <p className="text-sm text-muted-foreground">You have no children under 18 in your list, so a guardian is not needed.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {roleSelect('will-guardian', 'Guardian', roles.guardianId, 'guardianId', adults)}
              {roleSelect('will-alt-guardian', 'Back-up guardian', roles.altGuardianId, 'altGuardianId', adults)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="others" className="space-y-3 pt-3">
          <p className="text-sm text-muted-foreground">Charities and other organisations you want to leave something to.</p>
          <ul className="space-y-2">{organisations.map(card)}</ul>
          <Button size="sm" variant="outline" onClick={() => setEditing(blank('ORGANISATION'))}>Add an organisation</Button>
        </TabsContent>
      </Tabs>
      <FindingList findings={stepFindings} />
    </div>
  );
}
