/**
 * VerdictPage — displays the 0-100 score, GREEN/AMBER/RED badge,
 * pillar breakdown, strongest/weakest aspects, and critical issues.
 */

import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Shield, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getReport } from '@/api/policyCheckApi';
import type { PolicyScoreSnapshot, PolicyVerdictKind } from '@everypaisa/shared';

interface Props {
  checkId: string;
}

function VerdictBadge({ verdict }: { verdict: PolicyVerdictKind }) {
  const config: Record<PolicyVerdictKind, { label: string; className: string }> = {
    GREEN: { label: 'Good Coverage', className: 'bg-green-100 text-green-800 border-green-200' },
    AMBER: { label: 'Some Limitations', className: 'bg-amber-100 text-amber-800 border-amber-200' },
    RED: { label: 'Significant Gaps', className: 'bg-red-100 text-red-800 border-red-200' },
    INCOMPLETE: { label: 'Incomplete Analysis', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  };
  const c = config[verdict];
  return (
    <Badge variant="outline" className={`text-sm px-3 py-1 ${c.className}`}>
      {c.label}
    </Badge>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 80 ? 'text-green-600' : score >= 65 ? 'text-amber-600' : score >= 45 ? 'text-orange-600' : 'text-red-600';
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`text-6xl font-bold tabular-nums ${color}`}>{Math.round(score)}</span>
      <span className="text-sm text-muted-foreground">/ 100</span>
    </div>
  );
}

type ReportData = {
  checkId: string;
  sections: {
    verdict: { verdict: PolicyVerdictKind; score: string | null; reasons: string[] } | null;
    scoreSnapshot: PolicyScoreSnapshot | null;
    criticalLimitations: Array<{ id: string; headline: string; severity: string }>;
  };
};

export function VerdictPage({ checkId }: Props) {
  const navigate = useNavigate();

  const { data: report, isLoading } = useQuery({
    queryKey: ['policy-report', checkId],
    queryFn: () => getReport(checkId) as Promise<ReportData>,
  });

  if (isLoading) return <div className="p-4 text-muted-foreground">Loading results…</div>;

  const verdict = report?.sections.verdict;
  const score = report?.sections.scoreSnapshot;

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Policy Check Results</h1>
        <p className="text-muted-foreground mt-1">
          Based on your policy documents
        </p>
      </div>

      {/* Verdict + Score */}
      <Card>
        <CardContent className="pt-6 pb-6">
          <div className="flex flex-col items-center gap-4">
            {verdict && <VerdictBadge verdict={verdict.verdict} />}
            {score?.overall ? (
              <ScoreGauge score={parseFloat(score.overall)} />
            ) : (
              <div className="text-center text-muted-foreground">
                <Info className="w-8 h-8 mx-auto mb-2" />
                <p>Score unavailable — insufficient data</p>
              </div>
            )}
            {score?.ratingCategory && (
              <p className="text-sm font-medium text-muted-foreground">{score.ratingCategory}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pillar breakdown */}
      {score?.pillars && score.pillars.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Score Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {score.pillars.map((p) => {
              const pScore = p.score ? parseFloat(p.score) : null;
              const barWidth = pScore !== null ? `${pScore}%` : '0%';
              const barColor = pScore === null ? 'bg-muted' : pScore >= 70 ? 'bg-green-500' : pScore >= 50 ? 'bg-amber-500' : 'bg-red-500';
              return (
                <div key={p.pillar} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="capitalize">{p.pillar.replace(/_/g, ' ')}</span>
                    <span className="font-mono text-muted-foreground">
                      {pScore !== null ? Math.round(pScore) : '—'}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: barWidth }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Strongest aspects */}
      {score?.strongestAspects && score.strongestAspects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              What's Working Well
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {score.strongestAspects.map((a) => (
                <li key={a} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  <span className="capitalize">{a}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Critical issues */}
      {score?.criticalIssues && score.criticalIssues.length > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-4 h-4" />
              Critical Issues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {score.criticalIssues.map((issue, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{issue}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => navigate(`/insurance/health-check/${checkId}/report`)}
        >
          View Full Report
        </Button>
        <Button
          className="flex-1"
          onClick={() => navigate(`/insurance`)}
        >
          Done
        </Button>
      </div>
    </div>
  );
}
