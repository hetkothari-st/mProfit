/**
 * VerdictPage — displays the 0-100 score, GREEN/AMBER/RED badge,
 * pillar breakdown, strongest/weakest aspects, and critical issues.
 */

import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getReport } from '@/api/policyCheckApi';
import { PillarBars, ScoreRing, VerdictChip } from './ReportParts';
import type { PolicyScoreSnapshot, PolicyVerdictKind } from '@everypaisa/shared';

interface Props {
  checkId: string;
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
        <CardContent className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:gap-8">
          <ScoreRing score={score?.overall ? parseFloat(score.overall) : null} verdict={verdict?.verdict ?? 'INCOMPLETE'} />
          <div className="space-y-2 text-center sm:text-left">
            {verdict && <VerdictChip verdict={verdict.verdict} />}
            {score?.ratingCategory && <p className="text-sm font-medium">{score.ratingCategory}</p>}
            {!score?.overall && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Info className="h-4 w-4" /> Score unavailable — not enough could be read from the documents
              </p>
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
          <CardContent>
            <PillarBars pillars={score.pillars} />
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
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="w-4 h-4" />
              Critical Issues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {score.criticalIssues.map((issue, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-red-700 dark:text-red-400">
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
