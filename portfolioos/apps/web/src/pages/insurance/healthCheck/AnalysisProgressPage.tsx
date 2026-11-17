/**
 * AnalysisProgressPage — starts the analysis, shows its outcome, and recovers
 * from failure. Status is polled independently of the trigger call so a page
 * reload or a slow response never leaves an endless spinner, and any failure
 * is shown with a way to retry.
 */

import { useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiErrorMessage } from '@/api/client';
import { getHealthCheck, triggerAnalysis } from '@/api/policyCheckApi';

interface Props {
  checkId: string;
}

const DONE = ['COMPLETED', 'PARTIAL'];

export function AnalysisProgressPage({ checkId }: Props) {
  const navigate = useNavigate();
  const started = useRef(false);

  const triggerMutation = useMutation({
    mutationFn: () => triggerAnalysis(checkId),
    onSuccess: (r) => {
      if (r.status && DONE.includes(r.status)) navigate(`/insurance/health-check/${checkId}/verdict`);
    },
  });

  // Start once on mount (the ref also stops React's dev double-mount from firing it twice).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    triggerMutation.mutate();
  }, [checkId]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: check } = useQuery({
    queryKey: ['policy-check', checkId],
    queryFn: () => getHealthCheck(checkId),
    refetchInterval: (q) => (DONE.includes(q.state.data?.status ?? '') || q.state.data?.status === 'FAILED' ? false : 2500),
  });

  useEffect(() => {
    if (check && DONE.includes(check.status)) navigate(`/insurance/health-check/${checkId}/verdict`);
  }, [check?.status, checkId, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const failed = check?.status === 'FAILED' || triggerMutation.isError;
  const finished = !!check && DONE.includes(check.status);
  const docCount = check?.docs?.length;

  const retry = () => triggerMutation.mutate();

  return (
    <div className="max-w-lg mx-auto space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-semibold">{failed ? 'Analysis did not finish' : 'Running Analysis'}</h1>
        {!failed && (
          <p className="text-muted-foreground mt-1">
            {docCount === undefined
              ? 'Evaluating your policy against 8 rule categories.'
              : `Evaluating ${docCount} document${docCount === 1 ? '' : 's'} against 8 rule categories.`}
          </p>
        )}
      </div>

      {failed && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="space-y-3">
            <p>
              {triggerMutation.isError
                ? apiErrorMessage(triggerMutation.error)
                : 'Something went wrong while analysing this policy.'}
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={retry} disabled={triggerMutation.isPending}>
                {triggerMutation.isPending ? 'Retrying…' : 'Try again'}
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link to={`/insurance/health-check/${checkId}/verify`}>Back to review</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {!failed && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What we're checking</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              'Co-payment terms',
              'Room rent restrictions',
              'Disease sub-limits',
              'Waiting periods and continuity of cover',
              'No-claim bonus structure',
              'Restoration conditions',
              'Permanent exclusions',
              'Additional benefits and document conflicts',
            ].map((item) => (
              <div key={item} className="flex items-center gap-3">
                {finished ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                ) : (
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
                )}
                <span className="text-sm">{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
