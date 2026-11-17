/**
 * ExtractionProgressPage — polls check status during document extraction and
 * LLM analysis phases, showing stage indicators.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getHealthCheck } from '@/api/policyCheckApi';
import type { PolicyCheckStatus } from '@everypaisa/shared';

interface Props {
  checkId: string;
}

const STAGES: Array<{ key: PolicyCheckStatus[]; label: string }> = [
  { key: ['EXTRACTING'], label: 'Extracting text from documents' },
  { key: ['EXTRACTED'], label: 'Text extraction complete' },
  { key: ['ANALYZING'], label: 'Analyzing policy terms' },
  { key: ['COMPLETED', 'PARTIAL'], label: 'Analysis complete' },
];

function stageStatus(
  stageKeys: PolicyCheckStatus[],
  currentStatus: PolicyCheckStatus,
): 'done' | 'active' | 'pending' {
  const allKeys: PolicyCheckStatus[] = ['EXTRACTING', 'EXTRACTED', 'VERIFIED', 'ANALYZING', 'COMPLETED', 'PARTIAL', 'FAILED'];
  const currentIdx = allKeys.indexOf(currentStatus);
  const stageIdx = allKeys.indexOf(stageKeys[0]!);

  if (currentIdx > stageIdx || stageKeys.includes(currentStatus) && currentStatus !== stageKeys[0]) {
    return 'done';
  }
  if (stageKeys.includes(currentStatus)) return 'active';
  return 'pending';
}

export function ExtractionProgressPage({ checkId }: Props) {
  const navigate = useNavigate();

  const { data: check } = useQuery({
    queryKey: ['policy-check', checkId],
    queryFn: () => getHealthCheck(checkId),
    refetchInterval: (data) => {
      const status = data?.state?.data?.status;
      if (!status) return 2000;
      if (['COMPLETED', 'PARTIAL', 'FAILED', 'EXTRACTED', 'VERIFIED'].includes(status)) return false;
      return 3000;
    },
  });

  useEffect(() => {
    if (!check) return;
    if (check.status === 'EXTRACTED') {
      navigate(`/insurance/health-check/${checkId}/verify`);
    } else if (check.status === 'COMPLETED' || check.status === 'PARTIAL') {
      navigate(`/insurance/health-check/${checkId}/verdict`);
    } else if (check.status === 'FAILED') {
      // Stay on this page and show error
    }
  }, [check?.status, checkId, navigate]);

  const currentStatus = check?.status ?? 'EXTRACTING';

  return (
    <div className="max-w-lg mx-auto space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Analysing your policy</h1>
        <p className="text-muted-foreground mt-1">
          This takes 1–3 minutes. You can leave this page and come back.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {STAGES.map((stage) => {
            const status = stageStatus(stage.key as PolicyCheckStatus[], currentStatus as PolicyCheckStatus);
            return (
              <div key={stage.label} className="flex items-center gap-3">
                {status === 'done' ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                ) : status === 'active' ? (
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin shrink-0" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground shrink-0" />
                )}
                <span
                  className={
                    status === 'active'
                      ? 'text-sm font-medium'
                      : status === 'done'
                      ? 'text-sm text-muted-foreground line-through'
                      : 'text-sm text-muted-foreground'
                  }
                >
                  {stage.label}
                </span>
              </div>
            );
          })}

          {currentStatus === 'FAILED' && (
            <div className="flex items-center gap-3">
              <XCircle className="w-5 h-5 text-destructive shrink-0" />
              <span className="text-sm text-destructive">
                Analysis failed. Check the document uploads and try again.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {check?.docs && check.docs.length > 0 && (
        <div className="text-sm text-muted-foreground">
          {check.docs.length} document{check.docs.length !== 1 ? 's' : ''} uploaded
          {check.docs.some((d) => d.ocrUsed) ? ' — OCR used for scanned pages' : ''}
        </div>
      )}
    </div>
  );
}
