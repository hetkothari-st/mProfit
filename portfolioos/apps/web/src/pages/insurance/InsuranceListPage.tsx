import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, BookOpen, ClipboardList, Loader2, Plus, Shield, ShieldCheck } from 'lucide-react';
import { Decimal, formatINR, premiumToAnnual } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { DownloadReportButton } from '@/components/reports/DownloadReportButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { apiErrorMessage } from '@/api/client';
import { insuranceApi, type AddPremiumInput, type InsurancePolicyDTO } from '@/api/insurance.api';
import { ComingUpPanel } from '@/components/insurance/ComingUpPanel';
import { OpenClaimsPanel } from '@/components/insurance/OpenClaimsPanel';
import { TaxSummaryCard } from '@/components/insurance/TaxSummaryCard';
import { PolicyCard } from '@/components/insurance/PolicyCard';
import { PolicyFormDialog } from '@/components/insurance/PolicyFormDialog';
import { RecordPremiumDialog } from '@/components/insurance/RecordPremiumDialog';
import { LIFE_POLICY_TYPES, needsNominee, nextPremiumPrefill, plural, policyTitle } from '@/lib/insurance';

const sum = (ps: InsurancePolicyDTO[], pick: (p: InsurancePolicyDTO) => Decimal) =>
  ps.reduce((s, p) => s.plus(pick(p)), new Decimal(0));

/** Cover in force and what it costs a year — the three numbers people ask about. */
function CoverSummary({ policies }: { policies: InsurancePolicyDTO[] }) {
  const active = policies.filter((p) => p.status === 'ACTIVE');
  const life = active.filter((p) => LIFE_POLICY_TYPES.has(p.type));
  const health = active.filter((p) => p.type === 'HEALTH');
  const figures = [
    { label: 'Life cover', value: sum(life, (p) => new Decimal(p.sumAssured)), note: plural(life.length, 'policy', 'policies') },
    { label: 'Health cover', value: sum(health, (p) => new Decimal(p.sumAssured)), note: plural(health.length, 'policy', 'policies') },
    {
      label: 'Premiums a year',
      value: sum(active, (p) => premiumToAnnual(new Decimal(p.premiumAmount), p.premiumFrequency)),
      note: `across ${plural(active.length, 'active policy', 'active policies')}`,
    },
  ];
  return (
    <Card>
      <CardContent className="grid grid-cols-1 divide-y px-0 py-0 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {figures.map((f) => (
          <div key={f.label} className="px-5 py-4">
            <p className="text-sm text-muted-foreground">{f.label}</p>
            <p className="mt-1 font-display text-3xl tabular-nums">{formatINR(f.value.toString(), { compact: true })}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{f.note}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function InsuranceListPage() {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editPolicy, setEditPolicy] = useState<InsurancePolicyDTO | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [record, setRecord] = useState<{ policyId: string; initial: Partial<AddPremiumInput> } | null>(null);

  const { data: policies, isLoading } = useQuery({
    queryKey: ['insurance-policies'],
    queryFn: () => insuranceApi.listPolicies(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => insuranceApi.deletePolicy(id),
    onSuccess: () => {
      toast.success('Policy deleted');
      setConfirmDeleteId(null);
      qc.invalidateQueries({ queryKey: ['insurance-policies'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not delete the policy')),
  });

  const list = policies ?? [];
  const active = list.filter((p) => p.status === 'ACTIVE');
  const inactive = list.filter((p) => p.status !== 'ACTIVE');
  const withoutNominee = active.filter(needsNominee);

  const renderCard = (p: InsurancePolicyDTO) =>
    confirmDeleteId === p.id ? (
      <Card key={p.id} className="border-destructive">
        <CardContent className="flex h-full flex-col justify-center gap-3 p-5">
          <p className="text-sm">
            Delete <span className="font-medium">{p.insurer} — {policyTitle(p)}</span>, with its premiums and claims?
          </p>
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(p.id)}>
              {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Delete'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>
              Keep it
            </Button>
          </div>
        </CardContent>
      </Card>
    ) : (
      <PolicyCard
        key={p.id}
        policy={p}
        onEdit={() => {
          setEditPolicy(p);
          setFormOpen(true);
        }}
        onDelete={() => setConfirmDeleteId(p.id)}
        deleting={deleteMutation.isPending && confirmDeleteId === p.id}
      />
    );

  return (
    <div>
      <PageHeader
        title="Insurance"
        description="Your policies, what's due, and who to call when you need to claim."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/insurance/coverage">
                <ShieldCheck className="h-4 w-4" /> Coverage check
              </Link>
            </Button>
            {list.length > 0 && (
              <Button asChild variant="outline">
                <Link to="/insurance/emergency-sheet">
                  <ClipboardList className="h-4 w-4" /> Family sheet
                </Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link to="/insurance/help">
                <BookOpen className="h-4 w-4" /> Help and rights
              </Link>
            </Button>
            <DownloadReportButton type="insurance" />
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" /> Add policy
            </Button>
          </div>
        }
      />

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-56 animate-pulse bg-muted/60" />
          ))}
        </div>
      )}

      {!isLoading && list.length === 0 && (
        <EmptyState
          icon={Shield}
          title="No policies yet"
          description="Add your term, health, motor and other policies. You'll get reminders before each premium, and one place to find cover, nominees and claim contacts."
          action={
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" /> Add your first policy
            </Button>
          }
        />
      )}

      {!isLoading && list.length > 0 && (
        <div className="space-y-6">
          <CoverSummary policies={list} />
          <ComingUpPanel
            policies={list}
            onRecord={(p) => setRecord({ policyId: p.id, initial: nextPremiumPrefill(p) })}
          />
          <OpenClaimsPanel policies={list} />
          <TaxSummaryCard />

          {withoutNominee.length > 0 && (
            <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p>
                <span className="font-medium">
                  {withoutNominee.length === 1
                    ? `${withoutNominee[0]!.insurer} — ${policyTitle(withoutNominee[0]!)} has no nominee recorded.`
                    : `${withoutNominee.length} policies have no nominee recorded.`}
                </span>{' '}
                <span className="text-muted-foreground">
                  Without one, your family may need a succession or legal-heir certificate before a claim is paid.
                </span>
              </p>
            </div>
          )}

          {active.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{active.map(renderCard)}</div>
          )}

          {inactive.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm text-muted-foreground">Lapsed, matured and closed</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{inactive.map(renderCard)}</div>
            </section>
          )}
        </div>
      )}

      <PolicyFormDialog
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setEditPolicy(null);
        }}
        initial={editPolicy}
      />
      <RecordPremiumDialog
        policyId={record?.policyId ?? null}
        open={record !== null}
        onOpenChange={(v) => !v && setRecord(null)}
        initial={record?.initial ?? null}
      />
    </div>
  );
}
