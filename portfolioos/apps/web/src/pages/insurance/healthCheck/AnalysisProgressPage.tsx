/**
 * AnalysisProgressPage — triggers analysis on mount and polls until complete.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getHealthCheck, triggerAnalysis } from '@/api/policyCheckApi';

interface Props {
  checkId: string;
}

export function AnalysisProgressPage({ checkId }: Props) {
  const navigate = useNavigate();

  const triggerMutation = useMutation({
    mutationFn: () => triggerAnalysis(checkId),
  });

  // Trigger analysis on mount
  useEffect(() => {
    triggerMutation.mutate();
  }, [checkId]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: check } = useQuery({
    queryKey: ['policy-check', checkId],
    queryFn: () => getHealthCheck(checkId),
    refetchInterval: (data) => {
      const status = data?.state?.data?.status;
      if (status === 'COMPLETED' || status === 'PARTIAL' || status === 'FAILED') return false;
      return 3000;
    },
    enabled: triggerMutation.isSuccess,
  });

  useEffect(() => {
    if (!check) return;
    if (check.status === 'COMPLETED' || check.status === 'PARTIAL') {
      navigate(`/insurance/health-check/${checkId}/verdict`);
    }
  }, [check?.status, checkId, navigate]);

  return (
    <div className="max-w-lg mx-auto space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Running Analysis</h1>
        <p className="text-muted-foreground mt-1">
          Evaluating {check?.docs?.length ?? '…'} document section(s) against 8 rule categories.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What we're checking</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            'Co-payment terms',
            'Room rent restrictions',
            'Disease sub-limits',
            'Waiting periods (PED + initial)',
            'No-claim bonus structure',
            'Restoration conditions',
            'Permanent exclusions',
            'Additional benefits',
          ].map((item) => {
            const done = check?.status === 'COMPLETED' || check?.status === 'PARTIAL';
            return (
              <div key={item} className="flex items-center gap-3">
                {done ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                ) : (
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
                )}
                <span className="text-sm">{item}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
