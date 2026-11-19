/**
 * HealthCheckReportPage — full 10-section health check report.
 *
 * Sections:
 *  1. Policy Overview
 *  2. Verdict + Score
 *  3. What's Good (INFO findings)
 *  4. Needs Attention (NOTICE + WARNING)
 *  5. Critical Limitations (CRITICAL)
 *  6. Parameter Analysis
 *  7. Financial Simulator
 *  8. Insurer Performance
 *  9. Recommendations (derived from findings)
 *  10. Evidence & References
 *
 * All money displayed via formatINR. No money arithmetic on the frontend.
 */

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { formatINR } from '@everypaisa/shared';
import { Decimal } from '@everypaisa/shared';
import { Calculator, BarChart3, FileText, Printer, ChevronDown, ListChecks, Table2, Lightbulb } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getLinkedCover, getReport, listHealthChecks, simulate, simulateHomeCover, simulateMotorIdv, simulateSavings, simulateTermAdequacy } from '@/api/policyCheckApi';
import { apiErrorMessage } from '@/api/client';
import { FIELD_SPECS, REPORT_PARAMETERS } from './productFields';
import { PillarBars, ScoreRing, SectionTitle, SEVERITY_STYLE, SeverityChip, StatTile, VerdictChip, asSeverity, type Severity } from './ReportParts';
import type { FinancialSimulatorInput, FinancialSimulatorOutput, HomeCoverOutput, InsurerMetricsDTO, Money, MotorIdvOutput, PolicyFindingDTO, PolicyProductType, PolicyScoreSnapshot, SavingsReturnOutput, TermAdequacyOutput } from '@everypaisa/shared';

interface Props {
  checkId: string;
}

// ---------------------------------------------------------------------------
// Section 6 — parameter table, Section 9 — recommendations
// ---------------------------------------------------------------------------

type ExtractedField = {
  value: unknown;
  status: 'EXTRACTED' | 'USER_EDITED' | 'NOT_FOUND';
  sourcePage: number | null;
  clauseHeading: string | null;
};

const MONEY_KEYS = new Set(['sumAssured', 'sumInsured', 'roomRentLimitInr', 'deductibleInr', 'premiumAmountInr', 'criticalIllnessCoverInr', 'accidentalDeathBenefitInr', 'maturityBenefitGuaranteedInr', 'maturityBenefitIllustratedInr', 'idvInr', 'ownerDriverPaInr', 'passengerPaInr', 'compulsoryDeductibleInr', 'voluntaryDeductibleInr', 'sumInsuredStructureInr', 'sumInsuredContentsInr', 'valuablesLimitInr', 'alternateAccommodationInr', 'publicLiabilityInr', 'personalAccidentInr']);

function describeValue(v: unknown, key?: string): string {
  if (v === null || v === undefined) return '';
  if (key && MONEY_KEYS.has(key) && (typeof v === 'number' || (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)))) return formatINR(String(v));
  if (typeof v === 'string' && /^[A-Z][A-Z_]+$/.test(v)) {
    const t = v.replace(/_/g, ' ').toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (key && (typeof v === 'number' || (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)))) {
    const unit = /Pct$|Percent$/.test(key) ? '%' : /Years$|^ageAtEntry$|^coverEndsAtAge$/.test(key) ? ' years' : /Months$/.test(key) ? ' months' : /Days$/.test(key) ? ' days' : '';
    if (unit) return `${v}${unit}`;
  }
  if (Array.isArray(v)) return v.length + ' listed';
  if (typeof v === 'object') return Object.entries(v as Record<string, unknown>).map(([k, x]) => k + ': ' + String(x)).join('; ');
  return String(v);
}

const SEVERITY_ORDER = ['CRITICAL', 'WARNING', 'NOTICE', 'INFO'];

function ParameterTable({ fields, findings, productType, isUlip }: { fields: Record<string, ExtractedField> | null; findings: PolicyFindingDTO[]; productType: PolicyProductType; isUlip: boolean }) {
  if (!fields) return null;
  // A savings plan is either traditional or unit-linked: hide the rows that cannot apply.
  const rows = REPORT_PARAMETERS[productType].filter(
    (p) => productType !== 'SAVINGS' || (isUlip ? p.category !== 'RETURNS' : p.category !== 'CHARGES'),
  );
  return (
    <div className="divide-y rounded-lg border">
      {rows.map((p) => {
        const found = p.keys
          .map((k) => ({ k, f: fields[k] }))
          .filter((x) => x.f && x.f.status !== 'NOT_FOUND' && x.f.value !== null && x.f.value !== undefined);
        const related = findings.filter((f) => f.category === p.category);
        const worst = SEVERITY_ORDER.find((sv) => related.some((f) => f.severity === sv));
        const page = found.find((x) => x.f?.sourcePage)?.f?.sourcePage;
        return (
          <div key={p.label} className="grid gap-2 p-3 sm:grid-cols-[170px_1fr_auto] sm:items-start sm:gap-4">
            <p className="text-sm font-medium">{p.label}</p>
            <div className="text-sm">
              {found.length === 0 ? (
                <span className="text-muted-foreground">Not found in the documents provided</span>
              ) : (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {found.map((x) => (
                    <span key={x.k}>
                      <span className="text-muted-foreground">{(FIELD_SPECS[productType].labels[x.k] ?? x.k).replace(/ \(.*?\)$/, '')}: </span>
                      <span className="font-medium">{describeValue(x.f!.value, x.k)}</span>
                    </span>
                  ))}
                  {page ? <span className="text-xs text-muted-foreground">p.{page}</span> : null}
                </div>
              )}
            </div>
            <div>
              {worst ? <SeverityChip severity={asSeverity(worst)} /> : <span className="text-xs text-muted-foreground">Verify</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Recommendations({ findings, productType }: { findings: PolicyFindingDTO[]; productType: PolicyProductType }) {
  const actionable = findings.filter((f) => f.severity !== 'INFO' && f.whatWouldChangeThis);
  if (actionable.length === 0) return null;
  const seen = new Set<string>();
  const items = actionable.filter((f) => (seen.has(f.whatWouldChangeThis) ? false : (seen.add(f.whatWouldChangeThis), true)));
  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {items.map((f, i) => (
          <li key={f.id} className="flex gap-3 rounded-lg border bg-card p-3 text-sm">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
            <span>{f.whatWouldChangeThis}</span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">
        {productType === 'HEALTH'
          ? 'This report is informational and non-binding. Before switching or porting a policy, weigh waiting-period credits already earned, pre-existing disease cover, your age and health, claim history and any new underwriting.'
          : productType === 'HOME'
            ? 'This report is informational and non-binding. Before renewing or switching, update the sums insured to today’s rebuild and replacement costs, compare the claim basis and covered perils like for like, and never let the policy lapse.'
          : productType === 'MOTOR'
            ? 'This report is informational and non-binding. Before switching insurer, carry your no-claim bonus over, compare the IDV and add-ons like for like, and never let the policy lapse, even for a day.'
          : productType === 'SAVINGS'
            ? 'This report is informational and non-binding. Before surrendering or stopping premiums, get the surrender value in writing and weigh the life cover you give up, any charges, and the tax treatment of what you receive.'
            : 'This report is informational and non-binding. Before replacing a policy, weigh your age and health, any new underwriting, and the cover you would lose while the new policy starts.'}
      </p>
    </div>
  );
}

function FindingCard({ finding }: { finding: PolicyFindingDTO }) {
  const [expanded, setExpanded] = useState(false);
  const sev = asSeverity(finding.severity);
  const st = SEVERITY_STYLE[sev];
  const evidence = Array.isArray(finding.evidence) ? (finding.evidence as Array<{ docId: string; page: number; clauseHeading: string | null; extractedText: string }>) : [];
  return (
    <div className={`rounded-lg border border-l-4 ${st.border} ${st.tint}`}>
      <button className="flex w-full items-start gap-3 p-3 text-left" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
        <st.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${st.text}`} />
        <span className="flex-1 text-sm font-medium">{finding.headline}</span>
        <SeverityChip severity={sev} />
        <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="space-y-3 border-t px-3 py-3 pl-10 text-sm">
          {finding.whatWouldChangeThis ? (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">What could change this: </span>
              {finding.whatWouldChangeThis}
            </p>
          ) : null}
          {evidence.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">From your documents</p>
              {evidence.map((e, i) => (
                <blockquote key={i} className="rounded border-l-2 border-muted-foreground/40 bg-background/70 p-2 text-xs">
                  <p className="font-medium">
                    {e.clauseHeading ?? 'Unnamed clause'} · page {e.page}
                  </p>
                  <p className="mt-1 italic text-muted-foreground">“{e.extractedText}”</p>
                </blockquote>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type FindingFilter = 'ALL' | 'CRITICAL' | 'ATTENTION' | 'GOOD';

function FindingsSection({ good, attention, critical }: { good: PolicyFindingDTO[]; attention: PolicyFindingDTO[]; critical: PolicyFindingDTO[] }) {
  const [filter, setFilter] = useState<FindingFilter>('ALL');
  const all = [...critical, ...attention, ...good];
  const shown = filter === 'ALL' ? all : filter === 'CRITICAL' ? critical : filter === 'ATTENTION' ? attention : good;
  const chips: Array<{ key: FindingFilter; label: string; n: number }> = [
    { key: 'ALL', label: 'All', n: all.length },
    { key: 'CRITICAL', label: 'Critical', n: critical.length },
    { key: 'ATTENTION', label: 'Needs attention', n: attention.length },
    { key: 'GOOD', label: 'Working well', n: good.length },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 print:hidden">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filter === c.key ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            {c.label} <span className="opacity-70">{c.n}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nothing in this group.</p>
      ) : (
        <div className="space-y-2">
          {shown.map((f) => (
            <FindingCard key={f.id} finding={f} />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${highlight ? 'bg-primary/10 font-semibold' : 'bg-background'}`}>
      <span className={highlight ? '' : 'text-muted-foreground'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function InsurerSection({ metrics, explanations }: { metrics: InsurerMetricsDTO; explanations?: { claimSettlementRatio: string; incurredClaimRatio: string } }) {
  const m = metrics;
  const count = (n: number | null) => (n === null ? 'unavailable' : n.toLocaleString('en-IN'));
  const inr = (v: string | null) => (v === null ? 'unavailable' : formatINR(v));
  const pct = (v: string | null | undefined) => (v ? `${v}%` : 'unavailable');
  const csrTone = (v: string | null | undefined, good: number, ok: number) => {
    if (!v) return undefined;
    const n = parseFloat(v);
    return n >= good ? ('good' as const) : n >= ok ? ('warn' as const) : ('bad' as const);
  };
  const isLife = m.segment === 'LIFE';
  const cp = m.complaints as { reported?: number; attended?: number | null; outstandingAtYearEnd?: number | null; perTenThousandClaims?: string | null; basis?: string } | null;

  const rows: Array<[string, string]> = isLife
    ? [
        ['Death claims handled', count(m.claimsTotal)],
        ['Claims paid', count(m.claimsSettled)],
        ['Repudiated or rejected', count(m.claimsRepudiated)],
        ['Pending at year end', count(m.claimsPending)],
        ['Amount paid', inr(m.claimsPaidInr)],
      ]
    : [
        ['Claims handled', count(m.claimsTotal)],
        ['Claims paid', count(m.claimsSettled)],
        ['Claims repudiated', count(m.claimsRepudiated)],
        ['Outstanding at year end', count(m.claimsPending)],
        ['Health claims incurred (net)', inr(m.claimsIncurredInr)],
        ['Health net premium earned', inr(m.netEarnedPremiumInr)],
      ];

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{m.insurerName}</span> · FY {m.financialYear} · insurer-wide figures, not a prediction for your claim
      </p>
      <div className="grid grid-cols-2 gap-3">
        {isLife ? (
          <>
            <StatTile label="Claims settled" value={pct(m.claimSettlementRatio)} hint="by number of claims" tone={csrTone(m.claimSettlementRatio, 97, 93)} />
            <StatTile label="Claims settled" value={pct(m.claimSettlementRatioByAmount)} hint="by amount" tone={csrTone(m.claimSettlementRatioByAmount, 95, 90)} />
          </>
        ) : (
          <>
            <StatTile label="Claim settlement ratio" value={pct(m.claimSettlementRatio)} hint="by number of claims" tone={csrTone(m.claimSettlementRatio, 92, 85)} />
            <StatTile label="Incurred claim ratio" value={pct(m.incurredClaimRatio)} hint="claims incurred ÷ net premium earned" />
          </>
        )}
      </div>
      {isLife && (
        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          These are individual death claims across all of this insurer's individual life policies, not term plans alone.
        </p>
      )}
      {!isLife && m.claimsScope === 'ALL_LINES' && (
        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          This insurer also sells motor, fire and other policies. Its settlement ratio and claim counts cover all of them, not health alone.
          The incurred claim ratio and the amounts below are health only.
        </p>
      )}
      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between border-b py-1.5">
            <span className="text-muted-foreground">{k}</span>
            <span className="tabular-nums">{v}</span>
          </div>
        ))}
      </div>
      {cp && typeof cp.reported === 'number' && (
        <div className="rounded-lg border p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Customer complaints</p>
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <div className="flex justify-between"><span className="text-muted-foreground">Received in the year</span><span className="tabular-nums">{cp.reported.toLocaleString('en-IN')}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Attended to</span><span className="tabular-nums">{count(cp.attended ?? null)}</span></div>
            {cp.outstandingAtYearEnd !== null && cp.outstandingAtYearEnd !== undefined && (
              <div className="flex justify-between"><span className="text-muted-foreground">Still open at year end</span><span className="tabular-nums">{cp.outstandingAtYearEnd.toLocaleString('en-IN')}</span></div>
            )}
            {cp.perTenThousandClaims && (
              <div className="flex justify-between"><span className="text-muted-foreground">Per 10,000 claims handled</span><span className="tabular-nums">{cp.perTenThousandClaims}</span></div>
            )}
          </div>
          {cp.basis && <p className="mt-2 text-xs text-muted-foreground">{cp.basis}</p>}
        </div>
      )}
      <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
        {m.methodology ? <p>{m.methodology}</p> : explanations ? <p><strong>Settlement ratio:</strong> {explanations.claimSettlementRatio}</p> : null}
        {!isLife && explanations ? <p><strong>Incurred claim ratio:</strong> {explanations.incurredClaimRatio}</p> : null}
        <p>Source: {m.source} (retrieved {new Date(m.retrievedAt).toLocaleDateString('en-IN')})</p>
      </div>
    </div>
  );
}

function TermAdequacySection({ checkId }: { checkId: string }) {
  const [income, setIncome] = useState('');
  const [years, setYears] = useState('15');
  const [loans, setLoans] = useState('');
  const [assets, setAssets] = useState('');
  const [other, setOther] = useState('');
  const [result, setResult] = useState<TermAdequacyOutput | null>(null);

  const linked = useQuery({
    queryKey: ['policy-check-linked-cover', checkId],
    queryFn: () => getLinkedCover(checkId),
    staleTime: 60_000,
  });
  const hasLinked = !!linked.data && (linked.data.otherPolicies.length > 0 || linked.data.loans.length > 0);
  const fillFromRecords = () => {
    if (!linked.data) return;
    // Drop the ".0000" the API serialises; the input is a plain rupee amount.
    const whole = (v: string) => v.replace(/\.0+$/, '');
    if (linked.data.otherPolicies.length > 0) setOther(whole(linked.data.otherLifeCoverInr));
    if (linked.data.loans.length > 0) setLoans(whole(linked.data.outstandingLoansInr));
  };

  const m = useMutation({
    mutationFn: () =>
      simulateTermAdequacy(checkId, {
        annualIncomeInr: income as Money,
        yearsOfIncomeToReplace: years ? Number(years) : null,
        outstandingLoansInr: loans ? (loans as Money) : null,
        liquidAssetsInr: assets ? (assets as Money) : null,
        otherLifeCoverInr: other ? (other as Money) : null,
      }),
    onSuccess: setResult,
  });

  const field = (label: string, value: string, set: (v: string) => void, placeholder: string) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" placeholder={placeholder} value={value} onChange={(e) => set(e.target.value)} />
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A simple check of whether this cover is enough for your situation. It uses your own numbers, not anything from the policy.
      </p>
      {hasLinked && linked.data && (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-2">
          <p className="font-medium">We found these in your other records</p>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {linked.data.otherPolicies.map((p) => (
              <li key={p.policyId}>
                {p.insurer}{p.planName ? ` · ${p.planName}` : ''} ({p.type.replace('_', ' ').toLowerCase()}): cover {formatINR(p.sumAssuredInr, { fractionDigits: 0 })}
              </li>
            ))}
            {linked.data.loans.map((l) => (
              <li key={l.loanId}>
                {l.lenderName} ({l.loanType.toLowerCase()} loan): {formatINR(l.outstandingInr, { fractionDigits: 0 })} outstanding
              </li>
            ))}
          </ul>
          <Button type="button" variant="outline" size="sm" onClick={fillFromRecords}>
            Use these numbers
          </Button>
          <p className="text-xs text-muted-foreground">
            Only active policies and loans on this account are counted. You can still change the numbers below.
          </p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {field('Annual income (₹)', income, setIncome, 'e.g. 1200000')}
        {field('Years of income to replace', years, setYears, '15')}
        {field('Outstanding loans (₹)', loans, setLoans, 'e.g. 5000000')}
        {field('Savings and investments you could draw on (₹)', assets, setAssets, 'e.g. 2000000')}
        {field('Life cover under other policies (₹)', other, setOther, 'e.g. 0')}
      </div>
      <Button onClick={() => m.mutate()} disabled={!income || m.isPending} size="sm">
        <Calculator className="w-4 h-4 mr-2" />
        Check my cover
      </Button>
      {m.isError && <p className="text-sm text-destructive">{apiErrorMessage(m.error)}</p>}
      {result && (
        <div className="bg-muted/40 rounded-lg p-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { label: 'Income to replace', value: result.incomeReplacementInr },
              { label: 'Estimated total need', value: result.totalNeedInr },
              { label: 'Total cover (this + other)', value: result.totalCoverInr },
              { label: 'Estimated shortfall', value: result.shortfallInr, highlight: true },
            ].map((row) => (
              <ResultRow key={row.label} label={row.label} value={formatINR(row.value)} highlight={row.highlight} />
            ))}
          </div>
          <p className="text-sm font-medium">{result.summary}</p>
          {result.missingInputs.length > 0 && (
            <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">
              Partial — {result.missingInputs.join('; ')}
            </Badge>
          )}
          <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
            {result.assumptions.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function HomeSection({ checkId }: { checkId: string }) {
  const [area, setArea] = useState('');
  const [cost, setCost] = useState('');
  const [contents, setContents] = useState('');
  const [result, setResult] = useState<HomeCoverOutput | null>(null);

  const m = useMutation({
    mutationFn: () =>
      simulateHomeCover(checkId, {
        builtUpAreaSqft: area ? Number(area) : null,
        rebuildCostPerSqftInr: cost ? (cost as Money) : null,
        contentsReplacementValueInr: contents ? (contents as Money) : null,
      }),
    onSuccess: setResult,
  });

  const field = (label: string, value: string, set: (v: string) => void, placeholder: string, hint: string) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" placeholder={placeholder} value={value} onChange={(e) => set(e.target.value)} />
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  const pct = (v: string | null) => (v === null ? '—' : `${v}%`);
  const amt = (v: string | null) => (v ? formatINR(v, { fractionDigits: 0 }) : '—');

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        The building should be insured for what it would cost to rebuild, not what the property would sell for: the land is not insured. Compare both sums insured with your own estimates.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {field('Built-up area (sq ft)', area, setArea, 'e.g. 1500', 'The constructed area of your home, from the sale deed or society records.')}
        {field('Rebuild cost per sq ft (₹)', cost, setCost, 'e.g. 3000', 'Construction cost only, with finishing. A local builder or architect can give a figure.')}
        {field('What your belongings would cost to replace (₹)', contents, setContents, 'e.g. 1000000', 'Furniture, appliances, electronics, clothes and jewellery, at today’s prices.')}
      </div>
      <Button onClick={() => m.mutate()} disabled={(!area && !contents) || m.isPending} size="sm">
        <Calculator className="w-4 h-4 mr-2" />
        Check my cover
      </Button>
      {m.isError && <p className="text-sm text-destructive">{apiErrorMessage(m.error)}</p>}
      {result && (
        <div className="bg-muted/40 rounded-lg p-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { label: 'Building sum insured', value: amt(result.structureSumInsuredInr) },
              { label: 'Estimated rebuild cost', value: amt(result.rebuildCostInr) },
              { label: 'Building shortfall', value: amt(result.structureShortfallInr), highlight: true },
              { label: 'Building insured at', value: pct(result.structureCoveredPct) },
              { label: 'Contents sum insured', value: amt(result.contentsSumInsuredInr) },
              { label: 'Contents replacement cost', value: amt(result.contentsReplacementValueInr) },
              { label: 'Contents shortfall', value: amt(result.contentsShortfallInr), highlight: true },
              { label: 'Contents insured at', value: pct(result.contentsCoveredPct) },
            ].map((row) => (
              <ResultRow key={row.label} label={row.label} value={row.value} highlight={'highlight' in row ? row.highlight : undefined} />
            ))}
          </div>
          <p className="text-sm font-medium">{result.summary}</p>
          {result.missingInputs.length > 0 && (
            <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">
              Partial — {result.missingInputs.join('; ')}
            </Badge>
          )}
          <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
            {result.assumptions.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function MotorSection({ checkId }: { checkId: string }) {
  const [market, setMarket] = useState('');
  const [price, setPrice] = useState('');
  const [result, setResult] = useState<MotorIdvOutput | null>(null);

  const m = useMutation({
    mutationFn: () =>
      simulateMotorIdv(checkId, {
        currentMarketValueInr: market ? (market as Money) : null,
        exShowroomPriceInr: price ? (price as Money) : null,
      }),
    onSuccess: setResult,
  });

  const field = (label: string, value: string, set: (v: string) => void, placeholder: string, hint: string) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" placeholder={placeholder} value={value} onChange={(e) => set(e.target.value)} />
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        The IDV is what the insurer pays if the vehicle is stolen or written off. Compare it with what the vehicle would really sell for.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {field('What it would sell for today (₹)', market, setMarket, 'e.g. 800000', 'From a dealer quote or similar used-car listings.')}
        {field('Original ex-showroom price (₹, optional)', price, setPrice, 'e.g. 1000000', 'Lets us show the IRDAI depreciation-schedule IDV for vehicles up to 5 years old.')}
      </div>
      <Button onClick={() => m.mutate()} disabled={(!market && !price) || m.isPending} size="sm">
        <Calculator className="w-4 h-4 mr-2" />
        Check my IDV
      </Button>
      {m.isError && <p className="text-sm text-destructive">{apiErrorMessage(m.error)}</p>}
      {result && (
        <div className="bg-muted/40 rounded-lg p-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { label: 'IDV on your policy', value: result.idvInr ? formatINR(result.idvInr) : '—' },
              { label: 'What it would sell for', value: result.marketValueInr ? formatINR(result.marketValueInr) : '—' },
              { label: 'Shortfall (market value − IDV)', value: result.gapInr ? formatINR(result.gapInr) : '—', highlight: true },
              { label: 'As a share of market value', value: result.gapPct !== null ? `${result.gapPct}%` : '—' },
              { label: 'Vehicle age at policy start', value: result.vehicleAgeYears !== null ? `${result.vehicleAgeYears} years` : '—' },
              { label: 'IRDAI schedule IDV (estimate)', value: result.scheduleIdvInr ? formatINR(result.scheduleIdvInr) : '—' },
            ].map((row) => (
              <ResultRow key={row.label} label={row.label} value={row.value} highlight={'highlight' in row ? row.highlight : undefined} />
            ))}
          </div>
          <p className="text-sm font-medium">{result.summary}</p>
          {result.missingInputs.length > 0 && (
            <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">
              Partial — {result.missingInputs.join('; ')}
            </Badge>
          )}
          <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
            {result.assumptions.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function SavingsSection({ checkId, isUlip }: { checkId: string; isUlip: boolean }) {
  const [years, setYears] = useState('');
  const [exitValue, setExitValue] = useState('');
  const [rate, setRate] = useState('7');
  const [result, setResult] = useState<SavingsReturnOutput | null>(null);

  const m = useMutation({
    mutationFn: () =>
      simulateSavings(checkId, {
        yearsPaid: years ? Number(years) : null,
        surrenderValueNowInr: !isUlip && exitValue ? (exitValue as Money) : null,
        fundValueNowInr: isUlip && exitValue ? (exitValue as Money) : null,
        benchmarkRatePct: rate ? Number(rate) : null,
      }),
    onSuccess: setResult,
  });

  const field = (label: string, value: string, set: (v: string) => void, placeholder: string, hint?: string) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" placeholder={placeholder} value={value} onChange={(e) => set(e.target.value)} />
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );

  const pct = (v: string | null) => (v === null ? '—' : `${v}%`);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Compare keeping this policy with exiting it. The premiums and the guaranteed amounts come from your policy; the rest is what you tell us below.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {field('Years of premiums paid', years, setYears, 'e.g. 5')}
        {isUlip
          ? field('Fund value today (₹)', exitValue, setExitValue, 'e.g. 300000', 'From your latest ULIP statement.')
          : field('Surrender value today (₹)', exitValue, setExitValue, 'e.g. 150000', 'Ask the insurer for a written quote. We do not estimate it.')}
        {field('Compare against (% a year)', rate, setRate, '7', 'A fixed deposit rate is a fair yardstick.')}
      </div>
      <Button onClick={() => m.mutate()} disabled={m.isPending} size="sm">
        <Calculator className="w-4 h-4 mr-2" />
        Compare keep vs exit
      </Button>
      {m.isError && <p className="text-sm text-destructive">{apiErrorMessage(m.error)}</p>}
      {result && (
        <div className="bg-muted/40 rounded-lg p-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { label: 'Total premiums over the policy', value: result.totalPremiumsInr ? formatINR(result.totalPremiumsInr) : '—' },
              { label: 'Guaranteed maturity amount', value: result.guaranteedMaturityInr ? formatINR(result.guaranteedMaturityInr) : 'Not guaranteed' },
              { label: 'Guaranteed return a year', value: pct(result.guaranteedReturnPct) },
              { label: 'Same premiums at your comparison rate', value: result.benchmarkValueAtMaturityInr ? formatINR(result.benchmarkValueAtMaturityInr) : '—' },
              { label: 'Premiums paid so far', value: result.premiumsPaidSoFarInr ? formatINR(result.premiumsPaidSoFarInr) : '—' },
              { label: 'Value if you exit today', value: result.exitValueNowInr ? formatINR(result.exitValueNowInr) : '—' },
              { label: 'Gain or loss on exit', value: result.gainOrLossOnExitInr ? formatINR(result.gainOrLossOnExitInr) : '—' },
              { label: 'Return if you exit today', value: pct(result.returnIfExitNowPct) },
              { label: 'Return on staying in', value: pct(result.returnOnStayingPct), highlight: true },
            ].map((row) => (
              <ResultRow key={row.label} label={row.label} value={row.value} highlight={'highlight' in row ? row.highlight : undefined} />
            ))}
          </div>
          <p className="text-sm font-medium">{result.summary}</p>
          {result.missingInputs.length > 0 && (
            <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">
              Partial — {result.missingInputs.join('; ')}
            </Badge>
          )}
          <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
            {result.assumptions.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function SimulatorSection({ checkId }: { checkId: string }) {
  const [inputs, setInputs] = useState<Partial<FinancialSimulatorInput>>({
    totalBillInr: '' as Money,
    roomRentPerDayInr: null,
    durationDays: null,
    copaymentPctOverride: null,
    roomRentLimitOverride: null,
  });
  const [result, setResult] = useState<FinancialSimulatorOutput | null>(null);

  const simulateMutation = useMutation({
    mutationFn: () => simulate(checkId, inputs as FinancialSimulatorInput),
    onSuccess: setResult,
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enter a hypothetical hospital bill to see how your policy would cover it.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Total Hospital Bill (₹)</Label>
          <Input
            type="number"
            placeholder="e.g. 500000"
            value={inputs.totalBillInr ?? ''}
            onChange={(e) => setInputs((p) => ({ ...p, totalBillInr: e.target.value as Money }))}
          />
        </div>
        <div>
          <Label className="text-xs">Room Rent per Day (₹)</Label>
          <Input
            type="number"
            placeholder="e.g. 5000"
            value={inputs.roomRentPerDayInr ?? ''}
            onChange={(e) => setInputs((p) => ({ ...p, roomRentPerDayInr: e.target.value ? e.target.value as Money : null }))}
          />
        </div>
        <div>
          <Label className="text-xs">Duration (days)</Label>
          <Input
            type="number"
            placeholder="e.g. 5"
            value={inputs.durationDays ?? ''}
            onChange={(e) => setInputs((p) => ({ ...p, durationDays: e.target.value ? Number(e.target.value) : null }))}
          />
        </div>
      </div>
      <Button
        onClick={() => simulateMutation.mutate()}
        disabled={!inputs.totalBillInr || simulateMutation.isPending}
        size="sm"
      >
        <Calculator className="w-4 h-4 mr-2" />
        Calculate
      </Button>

      {result && (
        <div className="bg-muted/40 rounded-lg p-4 space-y-2">
          {result.isPartialEstimate && (
            <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">
              Partial estimate — {result.missingInputs.join(', ')} not available
            </Badge>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { label: 'Insurer pays', value: result.insurerPayableInr, highlight: true },
              { label: 'Your co-payment', value: result.copaymentInr },
              { label: 'Deductible', value: result.deductibleInr },
              { label: 'Room rent deduction', value: result.roomRentDeductionInr },
              { label: 'Other non-payables', value: result.otherNonPayableInr },
              { label: 'Your total out-of-pocket', value: result.userContributionInr, highlight: true },
            ].map((row) => (
              <ResultRow key={row.label} label={row.label} value={`₹${new Decimal(row.value).toFixed(0)}`} highlight={row.highlight} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type ReportData = {
  checkId: string;
  policyId: string;
  productType?: PolicyProductType;
  sections: {
    policyOverview?: { policy: { type?: string } | null } | null;
    verdict: { verdict: string; score: string | null; prose: string | null; proseVerified: boolean } | null;
    scoreSnapshot: PolicyScoreSnapshot | null;
    whatsGood: PolicyFindingDTO[];
    needsAttention: PolicyFindingDTO[];
    criticalLimitations: PolicyFindingDTO[];
    parameterAnalysis: unknown;
    insurerPerformance: { found: boolean; metrics?: unknown; explanations?: { claimSettlementRatio: string; incurredClaimRatio: string } } | null;
    docs: Array<{ id: string; classification: string; pageCount: number }>;
  };
};

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="space-y-3 break-inside-avoid">{children}</section>;
}

export function HealthCheckReportPage({ checkId }: Props) {
  const { data: report, isLoading } = useQuery({
    queryKey: ['policy-report', checkId],
    queryFn: () => getReport(checkId) as Promise<ReportData>,
  });

  const { data: history } = useQuery({
    queryKey: ['policy-report-history', report?.policyId],
    queryFn: () => listHealthChecks(report!.policyId),
    enabled: Boolean(report?.policyId),
  });

  if (isLoading) return <div className="p-4 text-muted-foreground">Loading report…</div>;
  if (!report) return <div className="p-4 text-muted-foreground">Report not available.</div>;

  const { sections } = report;
  const productType: PolicyProductType = report.productType ?? 'HEALTH';
  const isTerm = productType === 'TERM';
  const isSavings = productType === 'SAVINGS';
  const isMotor = productType === 'MOTOR';
  const isHome = productType === 'HOME';
  const isUlip = sections.policyOverview?.policy?.type === 'ULIP';
  const nGood = sections.whatsGood.length;
  const nAttention = sections.needsAttention.length;
  const nCritical = sections.criticalLimitations.length;
  const totalFindings = nGood + nAttention + nCritical;
  const overall = sections.scoreSnapshot?.overall ? parseFloat(sections.scoreSnapshot.overall) : null;
  const verdictKey = sections.verdict?.verdict ?? 'INCOMPLETE';
  const allFindings = [...sections.whatsGood, ...sections.needsAttention, ...sections.criticalLimitations];
  const pillars = sections.scoreSnapshot?.pillars ?? [];
  const metrics = sections.insurerPerformance?.found ? (sections.insurerPerformance.metrics as InsurerMetricsDTO | undefined) : undefined;
  const pastChecks = (history ?? []).filter((h) => h.completedAt);

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{isHome ? 'Home insurance' : isMotor ? 'Motor insurance' : isSavings ? (isUlip ? 'Unit-linked insurance plan (ULIP)' : 'Savings-type life insurance') : isTerm ? 'Term life insurance' : 'Health insurance'}</p>
          <h1 className="text-2xl font-semibold">{isHome ? 'Home Policy Report' : isMotor ? 'Motor Policy Report' : isSavings ? (isUlip ? 'ULIP Policy Report' : 'Savings Plan Report') : isTerm ? 'Term Life Policy Report' : 'Policy Health Report'}</h1>
          <p className="text-sm text-muted-foreground">
            {totalFindings} finding{totalFindings !== 1 ? 's' : ''} across {sections.docs.length} document{sections.docs.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
          <Printer className="mr-1 h-4 w-4" /> Download / Print PDF
        </Button>
      </div>

      {/* Hero: score + verdict + counts */}
      <Card className="overflow-hidden">
        <CardContent className="grid gap-6 p-6 md:grid-cols-[auto_1fr] md:items-center">
          <div className="flex justify-center">
            <ScoreRing score={overall} verdict={verdictKey} />
          </div>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <VerdictChip verdict={verdictKey} />
              {sections.scoreSnapshot?.ratingCategory && <span className="text-sm text-muted-foreground">{sections.scoreSnapshot.ratingCategory}</span>}
            </div>
            {sections.verdict?.prose && sections.verdict.proseVerified ? (
              <p className="text-sm leading-relaxed text-muted-foreground">{sections.verdict.prose}</p>
            ) : overall === null ? (
              <p className="text-sm text-muted-foreground">Not enough of the policy could be read to give a score. Add the full policy wording or confirm the missing details on the review screen.</p>
            ) : null}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-red-50 p-3 text-center dark:bg-red-950/30">
                <p className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">{nCritical}</p>
                <p className="text-xs text-muted-foreground">Critical</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-3 text-center dark:bg-amber-950/30">
                <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{nAttention}</p>
                <p className="text-xs text-muted-foreground">Need attention</p>
              </div>
              <div className="rounded-lg bg-green-50 p-3 text-center dark:bg-green-950/30">
                <p className="text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">{nGood}</p>
                <p className="text-xs text-muted-foreground">Working well</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Score breakdown */}
      {pillars.length > 0 && (
        <Panel>
          <SectionTitle icon={<BarChart3 className="h-4 w-4" />}>How the score is made up</SectionTitle>
          <Card>
            <CardContent className="p-5">
              <PillarBars pillars={pillars} />
              <p className="mt-4 text-xs text-muted-foreground">
                Areas we could not read from your documents are left out of the score, not counted as zero. The score reflects the policy's terms only; insurer claim statistics never feed into it.
              </p>
            </CardContent>
          </Card>
        </Panel>
      )}

      {/* Findings */}
      {totalFindings > 0 && (
        <Panel>
          <SectionTitle icon={<ListChecks className="h-4 w-4" />}>Findings</SectionTitle>
          <FindingsSection good={sections.whatsGood} attention={sections.needsAttention} critical={sections.criticalLimitations} />
        </Panel>
      )}

      {/* Recommendations */}
      {[...sections.needsAttention, ...sections.criticalLimitations].some((f) => f.severity !== 'INFO' && f.whatWouldChangeThis) && (
        <Panel>
          <SectionTitle icon={<Lightbulb className="h-4 w-4" />}>What to look into</SectionTitle>
          <Recommendations productType={productType} findings={[...sections.criticalLimitations, ...sections.needsAttention]} />
        </Panel>
      )}

      {/* Parameters */}
      <Panel>
        <SectionTitle icon={<Table2 className="h-4 w-4" />}>Policy terms at a glance</SectionTitle>
        <ParameterTable productType={productType} isUlip={isUlip}fields={(sections.parameterAnalysis as Record<string, ExtractedField> | null) ?? null} findings={allFindings} />
      </Panel>

      {/* Calculator */}
      <Panel>
        <SectionTitle icon={<Calculator className="h-4 w-4" />}>{isHome ? 'Is your home insured enough?' : isMotor ? 'Is your IDV right?' : isSavings ? 'Keep or exit?' : isTerm ? 'Cover calculator' : 'Financial simulator'}</SectionTitle>
        <Card className="print:hidden">
          <CardContent className="p-5">
            {isHome ? <HomeSection checkId={checkId} /> : isMotor ? <MotorSection checkId={checkId} /> : isSavings ? <SavingsSection checkId={checkId} isUlip={isUlip} /> : isTerm ? <TermAdequacySection checkId={checkId} /> : <SimulatorSection checkId={checkId} />}
          </CardContent>
        </Card>
      </Panel>

      {/* Insurer */}
      {metrics && (
        <Panel>
          <SectionTitle icon={<BarChart3 className="h-4 w-4" />}>Insurer track record (IRDAI data)</SectionTitle>
          <Card>
            <CardContent className="p-5">
              <InsurerSection metrics={metrics} explanations={sections.insurerPerformance?.explanations} />
            </CardContent>
          </Card>
        </Panel>
      )}

      {/* Earlier checks */}
      {pastChecks.length > 1 && (
        <Panel>
          <SectionTitle>Earlier checks of this policy</SectionTitle>
          <div className="divide-y rounded-lg border text-sm">
            {pastChecks.slice(0, 6).map((h) => (
              <div key={h.checkId} className="flex items-center justify-between gap-3 p-3">
                <span className="text-muted-foreground">{new Date(h.completedAt ?? h.asOf).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <span className="flex items-center gap-2">
                  {h.verdict ? <VerdictChip verdict={h.verdict} /> : null}
                  {h.score ? <span className="tabular-nums font-medium">{Math.round(parseFloat(h.score))}/100</span> : null}
                  {h.checkId !== checkId ? (
                    <Link to={`/insurance/health-check/${h.checkId}/report`} className="text-xs text-primary hover:underline print:hidden">View</Link>
                  ) : (
                    <Badge variant="outline" className="text-xs">This report</Badge>
                  )}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Documents */}
      <Panel>
        <SectionTitle icon={<FileText className="h-4 w-4" />}>Documents analysed</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {sections.docs.map((doc) => (
            <span key={doc.id} className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm">
              <span className="capitalize">{doc.classification.replace(/_/g, ' ').toLowerCase()}</span>
              <span className="text-xs text-muted-foreground">{doc.pageCount} page{doc.pageCount !== 1 ? 's' : ''}</span>
            </span>
          ))}
        </div>
      </Panel>
    </div>
  );
}
