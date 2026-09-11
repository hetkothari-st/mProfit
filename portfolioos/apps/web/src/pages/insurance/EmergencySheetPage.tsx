/**
 * One printable page with everything a family needs to claim on a policy:
 * who's covered, for how much, who the nominee is, and who to call. Printing
 * prints only the sheet (see `.print-sheet` in globals.css).
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { formatINR } from '@portfolioos/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { insuranceApi, type InsurancePolicyDTO } from '@/api/insurance.api';
import { insurerContactFor } from '@/lib/insurerContacts';
import {
  FREQUENCY_LABELS,
  LIFE_POLICY_TYPES,
  formatDay,
  policyTitle,
  policyTypeLabel,
  premiumDueMeta,
} from '@/lib/insurance';

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function SheetEntry({ p }: { p: InsurancePolicyDTO }) {
  const c = p.contacts ?? {};
  const nominees = p.nominees?.length
    ? p.nominees
        .map((n) => {
          const share = n.sharePercent != null ? `, ${n.sharePercent}%` : '';
          const appointee = n.isMinor && n.appointeeName ? ` — minor; appointee ${n.appointeeName}` : '';
          return `${n.name} (${n.relation}${share})${appointee}`;
        })
        .join('; ')
    : 'None recorded';
  const dirPhone = c.helpline ? null : (insurerContactFor(p.insurer)?.phones[0] ?? null);
  const claim = [
    c.helpline ? `Helpline ${c.helpline}` : dirPhone && `Customer care ${dirPhone} (from the insurer’s website)`,
    c.claimEmail,
    c.claimUrl,
    c.tpaName && `TPA ${c.tpaName}${c.tpaHelpline ? `, ${c.tpaHelpline}` : ''}`,
  ].filter(Boolean);
  const agent = [c.agentName, c.agentPhone, c.agentEmail].filter(Boolean);

  return (
    <article className="break-inside-avoid border-t py-4 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h3 className="font-display text-lg">
          {p.insurer} — {policyTitle(p)}
        </h3>
        <p className="tabular-nums">{formatINR(p.sumAssured, { fractionDigits: 0 })}</p>
      </div>
      <p className="text-xs text-muted-foreground">{policyTypeLabel(p.type)}</p>
      <dl className="mt-2 grid gap-x-8 gap-y-1.5 text-sm md:grid-cols-2">
        <Row term="Policyholder">{p.policyHolder}</Row>
        <Row term="Policy number">{p.policyNumberLast4 ? `Ends in ${p.policyNumberLast4}` : 'Not saved'}</Row>
        <Row term="Nominee">{nominees}</Row>
        <Row term="To claim">{claim.length ? claim.join(', ') : 'Contact not recorded'}</Row>
        {agent.length > 0 && <Row term="Agent">{agent.join(', ')}</Row>}
        <Row term="Premium">
          {p.premiumFrequency === 'SINGLE'
            ? 'Single premium'
            : `${formatINR(p.premiumAmount, { fractionDigits: 0 })} ${FREQUENCY_LABELS[p.premiumFrequency] ?? ''}; ${premiumDueMeta(p).label.toLowerCase()}`}
        </Row>
        {p.maturityDate && (
          <Row term={LIFE_POLICY_TYPES.has(p.type) ? 'Matures' : 'Cover ends'}>{formatDay(p.maturityDate)}</Row>
        )}
      </dl>
    </article>
  );
}

export function EmergencySheetPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['insurance-policies'],
    queryFn: () => insuranceApi.listPolicies(),
  });
  const active = (data ?? []).filter((p) => p.status === 'ACTIVE');
  const groups = [
    { title: 'Life cover', items: active.filter((p) => LIFE_POLICY_TYPES.has(p.type)) },
    { title: 'Health cover', items: active.filter((p) => p.type === 'HEALTH') },
    { title: 'Other cover', items: active.filter((p) => !LIFE_POLICY_TYPES.has(p.type) && p.type !== 'HEALTH') },
  ].filter((g) => g.items.length > 0);
  const holders = [...new Set(active.map((p) => p.policyHolder))];

  return (
    <div>
      <PageHeader
        title="Family insurance sheet"
        description="Everything your family needs to make a claim, on one page. Print it and keep it with your important papers."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/insurance">
                <ArrowLeft className="h-4 w-4" /> Policies
              </Link>
            </Button>
            <Button onClick={() => window.print()} disabled={active.length === 0}>
              <Printer className="h-4 w-4" /> Print
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <Card className="h-64 animate-pulse bg-muted/60" />
      ) : active.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No active policies yet. <Link to="/insurance" className="text-accent hover:underline">Add one</Link> and it
          will appear here.
        </p>
      ) : (
        <Card className="print-sheet mx-auto max-w-4xl px-6 py-6 sm:px-10 sm:py-8">
          <header className="border-b pb-4">
            <h2 className="font-display text-2xl">Insurance policies</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {holders.length > 0 && <>Held by {holders.join(', ')}. </>}As of {formatDay(new Date().toISOString())}.
            </p>
          </header>
          {groups.map((g) => (
            <section key={g.title} className="mt-6">
              <h2 className="font-display text-xl">{g.title}</h2>
              {g.items.map((p) => (
                <SheetEntry key={p.id} p={p} />
              ))}
            </section>
          ))}
          <footer className="mt-6 space-y-1 border-t pt-4 text-xs text-muted-foreground">
            <p>
              To claim, contact the insurer with the policyholder's name and the policy number, and keep the policy
              document, ID proof and bank details of the nominee ready.
            </p>
            <p>Full policy numbers are in the policy documents and on each policy's page in EveryPaisa.</p>
          </footer>
        </Card>
      )}
    </div>
  );
}
