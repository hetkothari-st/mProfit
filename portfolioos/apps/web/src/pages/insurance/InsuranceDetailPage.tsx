import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Car, Pencil, Trash2 } from 'lucide-react';
import { formatINR } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiErrorMessage } from '@/api/client';
import { insuranceApi, type AddPremiumInput, type InsurancePolicyDTO } from '@/api/insurance.api';
import { DocumentVault } from '@/components/documents/DocumentVault';
import { Figure, Guilloche } from '@/components/receipt/Receipt';
import { CatalogBrief, inferCatalogId } from '@/components/insurance/InsuranceCatalogPicker';
import { ClaimsSection } from '@/components/insurance/ClaimsSection';
import { ContactsCard } from '@/components/insurance/ContactsCard';
import { InsurerLogo } from '@/components/insurance/InsurerLogo';
import { NomineesCard } from '@/components/insurance/NomineesCard';
import { PolicyFormDialog } from '@/components/insurance/PolicyFormDialog';
import { PolicyNumberReveal } from '@/components/insurance/PolicyNumberReveal';
import { PremiumScheduleCard } from '@/components/insurance/PremiumScheduleCard';
import { ImportedPremiumsCard } from '@/components/insurance/ImportedPremiumsCard';
import { SurrenderValueCard } from '@/components/insurance/SurrenderValueCard';
import { RecordPremiumDialog } from '@/components/insurance/RecordPremiumDialog';
import { useInsurerLook } from '@/components/insurance/useInsurerLook';
import { findCatalogProduct } from '@/data/insuranceCatalog';
import {
  FREQUENCY_LABELS,
  LIFE_POLICY_TYPES,
  POLICY_STATUS_LABELS,
  TONE_TEXT,
  criticalIllnessMeta,
  formatDay,
  nextPremiumPrefill,
  plural,
  policyTitle,
  policyTypeLabel,
  premiumDueMeta,
  type DueMeta,
} from '@/lib/insurance';

// ── Hero: the policy as a certificate ─────────────────────────────────

function PolicyHero({ policy }: { policy: InsurancePolicyDTO }) {
  const { panel } = useInsurerLook(policy.insurer, policy.type);
  const active = policy.status === 'ACTIVE';
  return (
    <div
      className="relative overflow-hidden rounded-xl px-6 pb-5 pt-6 text-white shadow-elev-lg"
      style={{ backgroundImage: `linear-gradient(135deg, ${panel.from} 0%, ${panel.via} 60%, ${panel.to} 100%)` }}
    >
      <Guilloche />
      <div className="relative flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <InsurerLogo insurer={policy.insurer} type={policy.type} size={38} maxWidth={170} className="shadow-md ring-1 ring-white/25" />
            <span className="text-sm text-white/80">{policy.insurer}</span>
          </div>
          <h1 className="mt-4 font-display text-[34px] leading-tight">{policyTitle(policy)}</h1>
          <p className="mt-1 text-sm text-white/75">
            {policyTypeLabel(policy.type)} · {policy.policyHolder}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-white/70">{LIFE_POLICY_TYPES.has(policy.type) ? 'Sum assured' : 'Cover'}</p>
          <p className="mt-0.5 font-display text-[46px] leading-none tabular-nums">
            {formatINR(policy.sumAssured, { compact: true })}
          </p>
          <p className="mt-1 text-xs tabular-nums text-white/70">{formatINR(policy.sumAssured, { fractionDigits: 0 })}</p>
        </div>
      </div>
      <div className="relative mt-5 flex items-center gap-2 text-xs text-white/75">
        <span>Policy no.</span>
        <PolicyNumberReveal policy={policy} variant="onDark" />
      </div>
      {!active && (
        <div className="pointer-events-none absolute bottom-6 right-8 -rotate-12 rounded-sm border-2 border-white/70 px-3 py-1 font-display text-lg text-white/85">
          {POLICY_STATUS_LABELS[policy.status] ?? policy.status}
        </div>
      )}
    </div>
  );
}

function KeyFacts({
  policy,
  due,
  ciOptionalInPlan,
}: {
  policy: InsurancePolicyDTO;
  due: DueMeta;
  /** The catalogue lists critical illness as an add-on for this plan. */
  ciOptionalInPlan: boolean;
}) {
  const life = LIFE_POLICY_TYPES.has(policy.type);
  const ci = criticalIllnessMeta(policy);
  return (
    <Card>
      <CardContent className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-4 md:grid-cols-3 xl:grid-cols-6">
        <Figure label="Premium">
          {formatINR(policy.premiumAmount, { fractionDigits: 0 })}{' '}
          <span className="text-xs text-muted-foreground">{FREQUENCY_LABELS[policy.premiumFrequency] ?? ''}</span>
        </Figure>
        {/* The date only — the banner above spells out what it means. */}
        <Figure label="Next premium" className={TONE_TEXT[due.tone]} hint={due.label}>
          {policy.status !== 'ACTIVE' || !policy.premiumDue.dueDate ? '—' : formatDay(policy.premiumDue.dueDate)}
        </Figure>
        <Figure label="Started">{formatDay(policy.startDate)}</Figure>
        <Figure label={life ? 'Matures' : 'Cover ends'}>{formatDay(policy.maturityDate)}</Figure>
        <Figure label="Grace period">
          {policy.premiumFrequency === 'SINGLE' ? '—' : policy.graceDays > 0 ? plural(policy.graceDays, 'day') : 'None'}
        </Figure>
        {ci && (
          <Figure
            label="Critical illness"
            className={TONE_TEXT[ci.tone]}
            hint={
              policy.criticalIllnessCover == null && ciOptionalInPlan
                ? 'This plan offers critical illness as an add-on — your policy schedule shows whether you took it.'
                : undefined
            }
          >
            {policy.criticalIllnessCover === true
              ? policy.criticalIllnessSumAssured
                ? formatINR(policy.criticalIllnessSumAssured, { compact: true })
                : 'Covered'
              : policy.criticalIllnessCover === false
                ? 'Not covered'
                : 'Not recorded'}
          </Figure>
        )}
        {ci && policy.criticalIllnessCover == null && ciOptionalInPlan && (
          <p className="col-span-2 text-xs text-muted-foreground md:col-span-3 xl:col-span-6">
            This plan offers critical illness cover as an add-on — your policy schedule shows whether you took it. Record
            it with Edit.
          </p>
        )}
        {policy.vehicle && (
          <div className="col-span-2 min-w-0 md:col-span-3 xl:col-span-6">
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Car className="h-3 w-3" /> Vehicle
            </p>
            <Link to={`/vehicles/${policy.vehicle.id}`} className="mt-0.5 block truncate text-[15px] text-accent hover:underline">
              {[policy.vehicle.make, policy.vehicle.model].filter(Boolean).join(' ')} · {policy.vehicle.registrationNo}
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Health cover (§9.3) ───────────────────────────────────────────────

function HealthCoverPanel({ policy }: { policy: InsurancePolicyDTO }) {
  const hc = policy.healthCoverDetails;
  if (!hc) return null;
  const rows: Array<[string, string]> = [];
  if (hc.members?.length) rows.push(['Members', hc.members.join(', ')]);
  if (hc.roomRent) rows.push(['Room rent limit', hc.roomRent]);
  if (hc.coPay != null) rows.push(['Co-pay', `${hc.coPay}%`]);
  if (hc.preExistingWait != null) rows.push(['Pre-existing disease wait', `${hc.preExistingWait} months`]);
  for (const [k, v] of Object.entries(hc.subLimits ?? {})) rows.push([k.replace(/_/g, ' '), v]);
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-xl">Health cover</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="capitalize text-muted-foreground">{k}</dt>
              <dd className="text-right">{v}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────

export function InsuranceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [record, setRecord] = useState<Partial<AddPremiumInput> | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const { data: policy, isLoading } = useQuery({
    queryKey: ['insurance-policy', id],
    queryFn: () => insuranceApi.getPolicy(id!),
    enabled: !!id,
  });

  // "/insurance/:id#claims" (from the open-claims list) lands on the claims.
  useEffect(() => {
    if (policy && location.hash === '#claims') {
      document.getElementById('claims')?.scrollIntoView({ block: 'start' });
    }
  }, [policy, location.hash]);

  const deleteMutation = useMutation({
    mutationFn: () => insuranceApi.deletePolicy(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insurance-policies'] });
      toast.success('Policy deleted');
      navigate('/insurance');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not delete the policy')),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card className="h-48 animate-pulse bg-muted/60" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="h-32 animate-pulse bg-muted/60" />
          <Card className="h-32 animate-pulse bg-muted/60" />
        </div>
      </div>
    );
  }

  if (!policy) {
    return (
      <div className="p-8 text-muted-foreground">
        Policy not found. <Link to="/insurance" className="text-accent hover:underline">Back to your policies</Link>
      </div>
    );
  }

  const due = premiumDueMeta(policy);
  const product = findCatalogProduct(inferCatalogId(policy.insurer, policy.planName));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/insurance">
            <ArrowLeft className="h-4 w-4" /> All policies
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-negative hover:bg-negative/10"
            aria-label="Delete policy"
            onClick={() => {
              if (window.confirm('Delete this policy, with its premiums and claims?')) deleteMutation.mutate();
            }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <PolicyHero policy={policy} />

      {due.urgent && (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
            due.tone === 'danger' ? 'border-negative/30 bg-negative/5' : 'border-amber-500/30 bg-amber-500/5'
          }`}
        >
          <div className="min-w-0">
            <p className={`text-sm font-medium ${TONE_TEXT[due.tone]}`}>{due.label}</p>
            {due.detail && <p className="text-sm text-muted-foreground">{due.detail}</p>}
          </div>
          <Button size="sm" onClick={() => setRecord(nextPremiumPrefill(policy))}>
            Record payment
          </Button>
        </div>
      )}

      <KeyFacts
        policy={policy}
        due={due}
        ciOptionalInPlan={Boolean(product?.coverageTags.some((t) => /critical illness/i.test(t)))}
      />

      {product && <CatalogBrief product={product} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <NomineesCard policy={policy} />
        <ContactsCard policy={policy} />
      </div>

      <ClaimsSection policy={policy} />

      {policy.type === 'HEALTH' && <HealthCoverPanel policy={policy} />}

      {/* Renders nothing when no imported premium needs reviewing. */}
      <ImportedPremiumsCard policyId={policy.id} />

      <PremiumScheduleCard policy={policy} onRecord={setRecord} />

      {/* Renders nothing for policy types without a surrender value. */}
      <SurrenderValueCard policy={policy} />

      <DocumentVault
        ownerType="INSURANCE_POLICY"
        ownerId={policy.id}
        title="Policy documents"
        defaultCategory="policy_document"
      />

      <RecordPremiumDialog
        policyId={policy.id}
        open={record !== null}
        onOpenChange={(v) => !v && setRecord(null)}
        initial={record}
      />
      <PolicyFormDialog open={editOpen} onOpenChange={setEditOpen} initial={policy} />
    </div>
  );
}
