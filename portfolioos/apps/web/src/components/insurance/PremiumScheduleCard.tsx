/**
 * Every premium, paid or not, from the same shared schedule the server uses
 * for reminders — so this table and the "next due" everywhere else agree.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Clock, Plus, Trash2 } from 'lucide-react';
import { Decimal, GRACE_PERIOD_BASIS, buildPremiumSchedule, formatINR } from '@portfolioos/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiErrorMessage } from '@/api/client';
import { insuranceApi, type AddPremiumInput, type InsurancePolicyDTO } from '@/api/insurance.api';
import { formatDay, plural } from '@/lib/insurance';

const SHOW_FIRST = 12;

export function PremiumScheduleCard({
  policy,
  onRecord,
}: {
  policy: InsurancePolicyDTO;
  onRecord: (initial: Partial<AddPremiumInput>) => void;
}) {
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const history = useMemo(() => policy.premiumHistory ?? [], [policy.premiumHistory]);

  const rows = useMemo(
    () =>
      buildPremiumSchedule(
        { startDate: policy.startDate, premiumFrequency: policy.premiumFrequency, maturityDate: policy.maturityDate },
        history,
        { today, untrackedBefore: policy.premiumsTrackedFrom },
      ),
    [policy.startDate, policy.premiumFrequency, policy.maturityDate, policy.premiumsTrackedFrom, history, today],
  );

  const remove = useMutation({
    mutationFn: (id: string) => insuranceApi.removePremium(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insurance-policies'] });
      qc.invalidateQueries({ queryKey: ['insurance-policy', policy.id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Payment removed');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not remove the payment')),
  });

  const matched = new Set(rows.map((r) => r.payment).filter(Boolean));
  // Payments whose period doesn't line up with any due date still count.
  const unmatched = history.filter((p) => !matched.has(p));
  const untracked = rows.filter((r) => r.status === 'UNTRACKED');
  const listed = rows.filter((r) => r.status !== 'UNTRACKED').reverse();
  const visible = showAll ? listed : listed.slice(0, SHOW_FIRST);
  const overdue = rows.filter((r) => r.status === 'OVERDUE').length;
  const totalPaid = history.reduce((s, p) => s.plus(new Decimal(p.amount)), new Decimal(0));

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="font-display text-xl">Premiums</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {history.length > 0
              ? `${formatINR(totalPaid.toString(), { fractionDigits: 0 })} recorded across ${plural(history.length, 'payment')}`
              : 'No payments recorded yet'}
            {overdue > 0 && <span className="text-negative"> · {overdue} overdue</span>}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => onRecord({})}>
          <Plus className="h-3.5 w-3.5" /> Record
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {policy.premiumFrequency !== 'SINGLE' && (
          <p className="text-xs text-muted-foreground">
            Grace period: {policy.graceDays > 0 ? plural(policy.graceDays, 'day') : 'none — cover stops on the due date'}
            {policy.gracePeriodDays == null && policy.graceDays > 0 && (
              <>
                {' '}(the usual for this kind of policy —{' '}
                <a
                  href={GRACE_PERIOD_BASIS.source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={GRACE_PERIOD_BASIS.summary}
                  className="underline hover:text-foreground"
                >
                  IRDAI rules
                </a>
                ; your policy document has the exact figure)
              </>
            )}{' '}
            <Link to="/insurance/help#grace-period" className="underline hover:text-foreground">
              What the grace period means
            </Link>
          </p>
        )}

        {listed.length === 0 && unmatched.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {policy.premiumFrequency === 'SINGLE' ? 'Single premium — record it once it’s paid.' : 'No premiums yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="rtable w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="px-2 py-2 text-left font-medium">Due</th>
                  <th className="px-2 py-2 text-left font-medium">Covers</th>
                  <th className="px-2 py-2 text-right font-medium">Amount</th>
                  <th className="px-2 py-2 text-left font-medium">Status</th>
                  <th className="px-2 py-2 text-right font-medium">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.index} className="border-b last:border-0">
                    <td data-label="Due" className="px-2 py-2 tabular-nums">{formatDay(row.dueDate)}</td>
                    <td data-label="Covers" className="px-2 py-2 text-muted-foreground">
                      {formatDay(row.periodFrom)} – {formatDay(row.periodTo)}
                    </td>
                    <td data-label="Amount" className="px-2 py-2 text-right tabular-nums">
                      {row.payment ? (
                        formatINR(row.payment.amount, { fractionDigits: 0 })
                      ) : (
                        <span className="text-muted-foreground">{formatINR(policy.premiumAmount, { fractionDigits: 0 })}</span>
                      )}
                    </td>
                    <td data-label="Status" className="px-2 py-2">
                      {row.status === 'PAID' && (
                        <span className="inline-flex items-center gap-1 text-positive">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Paid {row.payment && formatDay(row.payment.paidOn)}
                        </span>
                      )}
                      {row.status === 'OVERDUE' && (
                        <span className="inline-flex items-center gap-1 text-negative">
                          <AlertTriangle className="h-3.5 w-3.5" /> Not recorded
                        </span>
                      )}
                      {row.status === 'UPCOMING' && (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" /> Upcoming
                        </span>
                      )}
                    </td>
                    <td data-label="Action" className="px-2 py-2 text-right">
                      {row.payment && 'id' in row.payment ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-muted-foreground hover:text-negative"
                          onClick={() => remove.mutate(row.payment!.id)}
                          disabled={remove.isPending}
                          aria-label={`Remove the payment for ${formatDay(row.dueDate)}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant={row.status === 'OVERDUE' ? 'default' : 'outline'}
                          className="h-7 px-3 text-xs"
                          onClick={() =>
                            onRecord({
                              paidOn: today,
                              amount: policy.premiumAmount,
                              periodFrom: row.periodFrom,
                              periodTo: row.periodTo,
                            })
                          }
                        >
                          Mark paid
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {listed.length > SHOW_FIRST && (
          <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show fewer' : `Show all ${listed.length}`}
          </Button>
        )}

        {unmatched.length > 0 && (
          <div className="border-t pt-3">
            <p className="mb-2 text-xs text-muted-foreground">Other recorded payments</p>
            <ul className="space-y-1.5 text-sm">
              {unmatched.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3">
                  <span>
                    Paid {formatDay(p.paidOn)}{' '}
                    <span className="text-muted-foreground">
                      for {formatDay(p.periodFrom)} – {formatDay(p.periodTo)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 tabular-nums">
                    {formatINR(p.amount, { fractionDigits: 0 })}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-muted-foreground hover:text-negative"
                      onClick={() => remove.mutate(p.id)}
                      disabled={remove.isPending}
                      aria-label={`Remove the payment made ${formatDay(p.paidOn)}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {untracked.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {plural(untracked.length, 'earlier premium')} (before {formatDay(policy.premiumsTrackedFrom)}) aren’t
            tracked here and count as paid.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
