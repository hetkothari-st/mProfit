/**
 * Premiums found in imported insurance statements that look like this
 * policy's. "Link" records the payment against the premium it covers;
 * "Not this policy" stops suggesting it here. Hidden when there's nothing to
 * review — premiums with this policy's exact number are linked on import.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Link2 } from 'lucide-react';
import { formatINR } from '@portfolioos/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiErrorMessage } from '@/api/client';
import { insuranceApi, type ImportSuggestionDTO } from '@/api/insurance.api';
import { formatDay, plural } from '@/lib/insurance';

const MATCHED_BY: Record<ImportSuggestionDTO['matchedBy'], string> = {
  POLICY_NUMBER: 'Same policy number',
  INSURER_AMOUNT: 'Same insurer, similar amount',
};

export function ImportedPremiumsCard({ policyId }: { policyId: string }) {
  const qc = useQueryClient();
  const key = ['insurance-import-suggestions', policyId];
  const { data } = useQuery({ queryKey: key, queryFn: () => insuranceApi.importSuggestions(policyId) });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['insurance-policy', policyId] });
    qc.invalidateQueries({ queryKey: ['insurance-policies'] });
    qc.invalidateQueries({ queryKey: ['insurance-tax-summary'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const link = useMutation({
    mutationFn: (transactionId: string) => insuranceApi.linkImportedPremium(policyId, transactionId),
    onSuccess: () => {
      refresh();
      toast.success('Payment recorded on this policy');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not link the payment')),
  });

  const dismiss = useMutation({
    mutationFn: (transactionId: string) => insuranceApi.dismissImportSuggestion(policyId, transactionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success('It won’t be suggested for this policy again');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not dismiss it')),
  });

  const list = data ?? [];
  if (list.length === 0) return null;
  const busy = link.isPending || dismiss.isPending;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-xl">From your imported statements</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          {plural(list.length, 'premium')} that may belong to this policy. Link the ones that do.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {list.map((s) => {
            const amount = formatINR(s.amount, { fractionDigits: 0 });
            const source = [s.insurer, s.policyNumberLast4 && `policy no. ending ${s.policyNumberLast4}`]
              .filter(Boolean)
              .join(' · ');
            return (
              <li
                key={s.transactionId}
                className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="tabular-nums">{amount}</span> paid {formatDay(s.paidOn)}
                  </p>
                  {source && <p className="mt-0.5 truncate text-xs text-muted-foreground">{source}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {MATCHED_BY[s.matchedBy]} · for the premium due {formatDay(s.periodFrom)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    onClick={() => link.mutate(s.transactionId)}
                    disabled={busy}
                    aria-label={`Link the ${amount} paid ${formatDay(s.paidOn)}`}
                  >
                    <Link2 className="h-3.5 w-3.5" /> Link
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => dismiss.mutate(s.transactionId)}
                    disabled={busy}
                    aria-label={`The ${amount} paid ${formatDay(s.paidOn)} is not this policy’s`}
                  >
                    Not this policy
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
