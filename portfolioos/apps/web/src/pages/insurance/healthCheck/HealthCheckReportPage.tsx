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
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  AlertCircle,
  Calculator,
  BarChart3,
  FileText,
  Printer,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Link } from 'react-router-dom';
import { getReport, listHealthChecks, simulate, simulateTermAdequacy } from '@/api/policyCheckApi';
import { apiErrorMessage } from '@/api/client';
import { FIELD_SPECS, REPORT_PARAMETERS } from './productFields';
import type { FinancialSimulatorInput, FinancialSimulatorOutput, InsurerMetricsDTO, Money, PolicyFindingDTO, PolicyProductType, TermAdequacyOutput } from '@everypaisa/shared';

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

function describeValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.length + ' listed';
  if (typeof v === 'object') return Object.entries(v as Record<string, unknown>).map(([k, x]) => k + ': ' + String(x)).join('; ');
  return String(v);
}

const SEVERITY_ORDER = ['CRITICAL', 'WARNING', 'NOTICE', 'INFO'];

function ParameterTable({ fields, findings, productType }: { fields: Record<string, ExtractedField> | null; findings: PolicyFindingDTO[]; productType: PolicyProductType }) {
  if (!fields) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-3">Parameter</th>
            <th className="py-2 pr-3">Policy finding</th>
            <th className="py-2">Assessment</th>
          </tr>
        </thead>
        <tbody>
          {REPORT_PARAMETERS[productType].map((p) => {
            const found = p.keys
              .map((k) => ({ k, f: fields[k] }))
              .filter((x) => x.f && x.f.status !== 'NOT_FOUND' && x.f.value !== null && x.f.value !== undefined);
            const related = findings.filter((f) => f.category === p.category);
            const worst = SEVERITY_ORDER.find((sv) => related.some((f) => f.severity === sv));
            const page = found.find((x) => x.f?.sourcePage)?.f?.sourcePage;
            return (
              <tr key={p.label} className="border-t align-top">
                <td className="py-2 pr-3 font-medium">{p.label}</td>
                <td className="py-2 pr-3">
                  {found.length === 0 ? (
                    <span className="text-muted-foreground">Not found in the documents provided</span>
                  ) : (
                    <>
                      {found.map((x) => `${(FIELD_SPECS[productType].labels[x.k] ?? x.k).replace(/ \(.*?\)$/, '')}: ${describeValue(x.f!.value)}`).join(' · ')}
                      {page ? <span className="text-xs text-muted-foreground"> (p.{page})</span> : null}
                    </>
                  )}
                </td>
                <td className="py-2">
                  {worst ? (
                    <span className="inline-flex items-center gap-1"><SeverityIcon severity={worst} /> {worst === 'INFO' ? 'Good' : worst === 'NOTICE' ? 'Note' : worst === 'WARNING' ? 'Attention' : 'Critical'}</span>
                  ) : (
                    <span className="text-muted-foreground">Verify</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Recommendations({ findings }: { findings: PolicyFindingDTO[] }) {
  const actionable = findings.filter((f) => f.severity !== 'INFO' && f.whatWouldChangeThis);
  if (actionable.length === 0) return null;
  const seen = new Set<string>();
  const items = actionable.filter((f) => (seen.has(f.whatWouldChangeThis) ? false : (seen.add(f.whatWouldChangeThis), true)));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">What to look into</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {items.map((f) => (
          <p key={f.id}>• {f.whatWouldChangeThis}</p>
        ))}
        <p className="text-xs text-muted-foreground pt-2">
          This report is informational and non-binding. Before switching or porting a policy, weigh waiting-period
          credits already earned, pre-existing disease cover, your age and health, claim history and any new underwriting.
        </p>
      </CardContent>
    </Card>
  );
}


function SeverityIcon({ severity }: { severity: string }) {
  if (severity === 'CRITICAL') return <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />;
  if (severity === 'WARNING') return <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />;
  if (severity === 'NOTICE') return <Info className="w-4 h-4 text-blue-600 shrink-0" />;
  return <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />;
}

function FindingCard({ finding }: { finding: PolicyFindingDTO }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="flex items-start gap-2">
        <SeverityIcon severity={finding.severity} />
        <p className="text-sm font-medium">{finding.headline}</p>
      </div>
      {expanded && (
        <div className="ml-6 space-y-2 text-sm text-muted-foreground">
          <p>{finding.whatWouldChangeThis}</p>
          {finding.evidence && Array.isArray(finding.evidence) && finding.evidence.length > 0 && (
            <div className="space-y-1">
              <p className="font-medium text-foreground text-xs uppercase tracking-wider">Evidence</p>
              {(finding.evidence as Array<{ docId: string; page: number; clauseHeading: string | null; extractedText: string }>).map((e, i) => (
                <div key={i} className="bg-muted/50 rounded p-2 text-xs">
                  <p className="font-medium">
                    {e.clauseHeading ?? 'Unnamed clause'} — Page {e.page}
                  </p>
                  <p className="mt-1 italic">"{e.extractedText}"</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <button
        className="ml-6 text-xs text-blue-600 hover:underline"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? 'Show less' : 'Show details & evidence'}
      </button>
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
      <div className="grid grid-cols-2 gap-4">
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
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[
              { label: 'Income to replace', value: result.incomeReplacementInr },
              { label: 'Estimated total need', value: result.totalNeedInr },
              { label: 'Total cover (this + other)', value: result.totalCoverInr },
              { label: 'Estimated shortfall', value: result.shortfallInr, highlight: true },
            ].map((row) => (
              <div key={row.label} className={`flex justify-between p-2 rounded ${row.highlight ? 'bg-muted font-medium' : ''}`}>
                <span className="text-muted-foreground">{row.label}</span>
                <span>{formatINR(row.value)}</span>
              </div>
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
      <div className="grid grid-cols-2 gap-4">
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
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[
              { label: 'Insurer pays', value: result.insurerPayableInr, highlight: true },
              { label: 'Your co-payment', value: result.copaymentInr },
              { label: 'Deductible', value: result.deductibleInr },
              { label: 'Room rent deduction', value: result.roomRentDeductionInr },
              { label: 'Other non-payables', value: result.otherNonPayableInr },
              { label: 'Your total out-of-pocket', value: result.userContributionInr, highlight: true },
            ].map((row) => (
              <div
                key={row.label}
                className={`flex justify-between p-2 rounded ${row.highlight ? 'bg-muted font-medium' : ''}`}
              >
                <span className="text-muted-foreground">{row.label}</span>
                <span>₹{new Decimal(row.value).toFixed(0)}</span>
              </div>
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
    verdict: { verdict: string; score: string | null; prose: string | null; proseVerified: boolean } | null;
    scoreSnapshot: { overall: string | null; ratingCategory: string | null } | null;
    whatsGood: PolicyFindingDTO[];
    needsAttention: PolicyFindingDTO[];
    criticalLimitations: PolicyFindingDTO[];
    parameterAnalysis: unknown;
    insurerPerformance: { found: boolean; metrics?: unknown; explanations?: { claimSettlementRatio: string; incurredClaimRatio: string } } | null;
    docs: Array<{ id: string; classification: string; pageCount: number }>;
  };
};

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
  const totalFindings = sections.whatsGood.length + sections.needsAttention.length + sections.criticalLimitations.length;

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-4">
      <div>
        <div className="flex items-center justify-between gap-2 print:hidden">
          <span />
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-1" /> Download / Print PDF
          </Button>
        </div>
        <h1 className="text-2xl font-semibold">{report.productType === 'TERM' ? 'Term Life Policy Report' : 'Policy Health Report'}</h1>
        <p className="text-sm text-muted-foreground">
          {totalFindings} finding{totalFindings !== 1 ? 's' : ''} across {sections.docs.length} document{sections.docs.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* 1. Verdict */}
      {sections.verdict && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Overall Verdict</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-sm capitalize">{sections.verdict.verdict}</Badge>
              {sections.scoreSnapshot?.overall && (
                <span className="text-2xl font-bold tabular-nums">
                  {Math.round(parseFloat(sections.scoreSnapshot.overall))}/100
                </span>
              )}
              {sections.scoreSnapshot?.ratingCategory && (
                <span className="text-sm text-muted-foreground">{sections.scoreSnapshot.ratingCategory}</span>
              )}
            </div>
            {sections.verdict.prose && sections.verdict.proseVerified && (
              <p className="text-sm text-muted-foreground">{sections.verdict.prose}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 3. What's Good */}
      {sections.whatsGood.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              What's Working Well
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sections.whatsGood.map((f) => <FindingCard key={f.id} finding={f} />)}
          </CardContent>
        </Card>
      )}

      {/* 4. Needs Attention */}
      {sections.needsAttention.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-500" />
              Needs Attention
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sections.needsAttention.map((f) => <FindingCard key={f.id} finding={f} />)}
          </CardContent>
        </Card>
      )}

      {/* 5. Critical Limitations */}
      {sections.criticalLimitations.length > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-red-700">
              <AlertCircle className="w-4 h-4" />
              Critical Limitations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sections.criticalLimitations.map((f) => <FindingCard key={f.id} finding={f} />)}
          </CardContent>
        </Card>
      )}

      {/* 6. Detailed Parameter Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Detailed Parameter Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <ParameterTable
            productType={report.productType ?? 'HEALTH'}
            fields={(sections.parameterAnalysis as Record<string, ExtractedField> | null) ?? null}
            findings={[...sections.whatsGood, ...sections.needsAttention, ...sections.criticalLimitations]}
          />
        </CardContent>
      </Card>

      {/* 7. Financial Simulator */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Calculator className="w-4 h-4" />
            {report.productType === 'TERM' ? 'Cover Calculator' : 'Financial Simulator'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {report.productType === 'TERM' ? <TermAdequacySection checkId={checkId} /> : <SimulatorSection checkId={checkId} />}
        </CardContent>
      </Card>

      {/* 8. Insurer Performance */}
      {sections.insurerPerformance?.found && Boolean(sections.insurerPerformance.metrics) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Insurer Performance (IRDAI Data)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(() => {
              const m = sections.insurerPerformance.metrics as InsurerMetricsDTO;
              const exp = sections.insurerPerformance.explanations;
              const count = (n: number | null) => (n === null ? 'unavailable' : n.toLocaleString('en-IN'));
              const inr = (v: string | null) => (v === null ? 'unavailable' : formatINR(v));
              if (m.segment === 'LIFE') {
                return (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {m.insurerName} · FY {m.financialYear} · insurer-wide figures, not a prediction for your claim
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">Claims settled (by number)</p>
                        <p className="text-2xl font-bold">{m.claimSettlementRatio ? `${m.claimSettlementRatio}%` : 'unavailable'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">Claims settled (by amount)</p>
                        <p className="text-2xl font-bold">{m.claimSettlementRatioByAmount ? `${m.claimSettlementRatioByAmount}%` : 'unavailable'}</p>
                      </div>
                    </div>
                    <p className="text-xs text-amber-700">
                      These are individual death claims across all of this insurer's individual life policies, not term plans alone.
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <span className="text-muted-foreground">Death claims handled</span><span>{count(m.claimsTotal)}</span>
                      <span className="text-muted-foreground">Claims paid</span><span>{count(m.claimsSettled)}</span>
                      <span className="text-muted-foreground">Repudiated or rejected</span><span>{count(m.claimsRepudiated)}</span>
                      <span className="text-muted-foreground">Pending at year end</span><span>{count(m.claimsPending)}</span>
                      <span className="text-muted-foreground">Amount paid</span><span>{inr(m.claimsPaidInr)}</span>
                    </div>
                    {m.methodology && <p className="text-xs text-muted-foreground border-t pt-2">{m.methodology}</p>}
                    <p className="text-xs text-muted-foreground">
                      Source: {m.source} (retrieved {new Date(m.retrievedAt).toLocaleDateString('en-IN')})
                    </p>
                  </>
                );
              }
              return (
                <>
                  <p className="text-xs text-muted-foreground">
                    {m.insurerName} · FY {m.financialYear} · insurer-wide figures, not a prediction for your claim
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Claim settlement ratio</p>
                      <p className="text-2xl font-bold">{m.claimSettlementRatio ? `${m.claimSettlementRatio}%` : 'unavailable'}</p>
                      <p className="text-xs text-muted-foreground">by number of claims</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Incurred claim ratio (health)</p>
                      <p className="text-2xl font-bold">{m.incurredClaimRatio ? `${m.incurredClaimRatio}%` : 'unavailable'}</p>
                      <p className="text-xs text-muted-foreground">claims incurred ÷ net premium earned</p>
                    </div>
                  </div>
                  {m.claimsScope === 'ALL_LINES' && (
                    <p className="text-xs text-amber-700">
                      This insurer also sells motor, fire and other policies. Its settlement ratio and claim counts cover
                      all of them, not health alone. The incurred claim ratio and the amounts below are health only.
                    </p>
                  )}
                  {(() => {
                    const cp = m.complaints as { reported?: number; attended?: number | null; outstandingAtYearEnd?: number | null; perTenThousandClaims?: string | null; basis?: string } | null;
                    if (!cp || typeof cp.reported !== 'number') return null;
                    return (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm border-t pt-2">
                        <span className="text-muted-foreground">Customer complaints in the year</span><span>{cp.reported.toLocaleString('en-IN')}</span>
                        <span className="text-muted-foreground">Complaints attended to</span><span>{count(cp.attended ?? null)}</span>
                        {cp.outstandingAtYearEnd !== null && cp.outstandingAtYearEnd !== undefined && (
                          <><span className="text-muted-foreground">Still open at year end</span><span>{cp.outstandingAtYearEnd.toLocaleString('en-IN')}</span></>
                        )}
                        {cp.perTenThousandClaims && (
                          <><span className="text-muted-foreground">Complaints per 10,000 claims handled</span><span>{cp.perTenThousandClaims}</span></>
                        )}
                        <p className="col-span-2 text-xs text-muted-foreground">{cp.basis}</p>
                      </div>
                    );
                  })()}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <span className="text-muted-foreground">Claims handled</span><span>{count(m.claimsTotal)}</span>
                    <span className="text-muted-foreground">Claims paid</span><span>{count(m.claimsSettled)}</span>
                    <span className="text-muted-foreground">Claims repudiated</span><span>{count(m.claimsRepudiated)}</span>
                    <span className="text-muted-foreground">Claims outstanding at year end</span><span>{count(m.claimsPending)}</span>
                    <span className="text-muted-foreground">Health claims incurred (net)</span><span>{inr(m.claimsIncurredInr)}</span>
                    <span className="text-muted-foreground">Health net premium earned</span><span>{inr(m.netEarnedPremiumInr)}</span>
                  </div>
                  {exp && (
                    <div className="text-xs text-muted-foreground space-y-1 border-t pt-2">
                      <p><strong>Settlement ratio:</strong> {m.methodology ?? exp.claimSettlementRatio}</p>
                      <p><strong>Incurred claim ratio:</strong> {exp.incurredClaimRatio}</p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Source: {m.source} (retrieved {new Date(m.retrievedAt).toLocaleDateString('en-IN')})
                  </p>
                </>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* 9. Recommendations */}
      <Recommendations findings={[...sections.needsAttention, ...sections.criticalLimitations]} />

      {/* 10. Evidence & References */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Documents Analysed
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {sections.docs.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between text-sm">
              <span className="capitalize">{doc.classification.replace(/_/g, ' ').toLowerCase()}</span>
              <span className="text-muted-foreground">{doc.pageCount} page{doc.pageCount !== 1 ? 's' : ''}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
