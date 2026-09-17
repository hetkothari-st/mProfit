import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, HandCoins, Plus } from 'lucide-react';
import { Decimal, formatINR } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { loansGivenApi, type LoanGivenDTO } from '@/api/loansGiven.api';
import { LoanGivenFormDialog } from './LoanGivenFormDialog';
import { formatDay, relationshipLabel } from './loanGivenFormat';
import { LoanGivenStatusBadge } from './LoanGivenStatusBadge';
import { InstallmentProgress, InstallmentTracker } from '../InstallmentTracker';
import { LoanSectionHeader } from '../LoanSections';

function LoanGivenCard({ loan, onOpen }: { loan: LoanGivenDTO; onOpen: () => void }) {
  const { summary } = loan;
  const lent = new Decimal(summary.principalLent);
  const back = Decimal.min(new Decimal(summary.repaid).plus(summary.waived), lent);
  const pct = lent.isZero() ? 0 : back.dividedBy(lent).times(100).toNumber();
  return (
    <Card
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className={`cursor-pointer transition-colors hover:border-foreground/30 ${summary.overdueDays > 0 ? 'border-negative/50' : ''}`}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold truncate">{loan.borrowerName}</div>
            <div className="text-xs text-muted-foreground">
              {[relationshipLabel(loan.relationship), `Lent ${formatDay(loan.lentOn)}`]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          <LoanGivenStatusBadge status={loan.status} />
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Still owed</div>
            <div className="text-xl font-semibold tabular-nums">
              {formatINR(summary.outstandingPrincipal)}
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            of {formatINR(summary.principalLent)}
            {new Decimal(loan.interestRate).greaterThan(0) && (
              <div>{new Decimal(loan.interestRate).toString()}% p.a.</div>
            )}
          </div>
        </div>

        {summary.emi ? (
          <InstallmentTracker
            className="mt-3"
            done={summary.emi.installmentsPaid}
            total={summary.emi.installmentsTotal}
            accent="hsl(var(--positive))"
          />
        ) : (
          <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-positive" style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
        )}

        {loan.status === 'ACTIVE' && summary.nextDue && (
          <div
            className={`mt-3 flex items-center gap-1.5 text-xs ${summary.overdueDays > 0 ? 'text-negative' : 'text-muted-foreground'}`}
          >
            {summary.overdueDays > 0 ? (
              <AlertTriangle className="h-3.5 w-3.5" />
            ) : (
              <CalendarClock className="h-3.5 w-3.5" />
            )}
            {summary.overdueDays > 0
              ? `${formatINR(summary.nextDue.amount)} overdue by ${summary.overdueDays} day${summary.overdueDays === 1 ? '' : 's'}`
              : `${formatINR(summary.nextDue.amount)} due ${formatDay(summary.nextDue.date)}`}
          </div>
        )}

        {summary.emi && (
          <InstallmentProgress
            className="mt-4"
            done={summary.emi.installmentsPaid}
            total={summary.emi.installmentsTotal}
            accent="hsl(var(--positive))"
          />
        )}
      </CardContent>
    </Card>
  );
}

/** "Loans given" section of the Loans page: money the user has lent out. */
export function LoansGivenSection() {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['loans-given'],
    queryFn: () => loansGivenApi.list(),
  });
  const loans = data ?? [];
  const active = loans.filter((l) => l.status === 'ACTIVE');
  const closed = loans.filter((l) => l.status !== 'ACTIVE');
  const open = (id: string) => navigate(`/loans/given/${id}`);

  return (
    <div>
      <LoanSectionHeader
        section="given"
        title="Loans given"
        subtitle="Money you have lent — what they owe, repayments and interest"
        count={isLoading ? undefined : active.length}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Lend money
          </Button>
        }
      />

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="h-40 animate-pulse bg-muted/60" />
          ))}
        </div>
      )}

      {!isLoading && loans.length === 0 && (
        <EmptyState
          icon={HandCoins}
          title="No loans given yet"
          description="Lent money to a friend, relative or business? Track what they owe, repayments, interest and due dates here."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Record a loan you gave
            </Button>
          }
        />
      )}

      {active.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {active.map((loan) => (
            <LoanGivenCard key={loan.id} loan={loan} onOpen={() => open(loan.id)} />
          ))}
        </div>
      )}

      {closed.length > 0 && (
        <>
          <h3 className="text-sm font-medium text-muted-foreground mt-8 mb-3">
            Settled / Written off
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-70">
            {closed.map((loan) => (
              <LoanGivenCard key={loan.id} loan={loan} onOpen={() => open(loan.id)} />
            ))}
          </div>
        </>
      )}

      <LoanGivenFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initial={null}
        onSaved={(loan) => open(loan.id)}
      />
    </div>
  );
}
