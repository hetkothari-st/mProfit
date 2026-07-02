import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Plus, IndianRupee, Trash2, Pencil, CalendarClock } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/common/EmptyState';
import { incomeApi, type IncomeDTO } from '@/api/income.api';
import { INCOME_TYPE_LABEL } from './incomeTypeMeta';
import { apiErrorMessage } from '@/api/client';
import { formatINR, toDecimal } from '@portfolioos/shared';
import { IncomeDialog } from './IncomeDialog';

export function IncomePage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<IncomeDTO | null>(null);

  const { data: incomes, isLoading } = useQuery({
    queryKey: ['income'],
    queryFn: () => incomeApi.list(),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => incomeApi.remove(id),
    onSuccess: () => {
      toast.success('Income entry removed');
      qc.invalidateQueries({ queryKey: ['income'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const active = (incomes ?? []).filter((i) => i.isActive);
  const inactive = (incomes ?? []).filter((i) => !i.isActive);
  const totalMonthly = active.reduce((s, i) => s.plus(toDecimal(i.monthlyAmount)), toDecimal(0));

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (i: IncomeDTO) => {
    setEditing(i);
    setDialogOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Income"
        description="Salary, business, trading, freelance, rental, or any other recurring income. Used to score your financial health (investment rate, debt burden, insurance) and wherever your income matters."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add income
          </Button>
        }
      />

      {isLoading && (
        <div className="py-10 text-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin inline" /> Loading…
        </div>
      )}

      {!isLoading && (incomes ?? []).length === 0 && (
        <EmptyState
          title="No income entries yet"
          description="Add your salary, business, trading, or any other income stream so Health Score and other features can use a real number instead of guessing from bank emails."
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add your first income
            </Button>
          }
        />
      )}

      {active.length > 0 && (
        <Card className="mb-6 flex items-center gap-4 p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-positive/15 ring-1 ring-positive/30">
            <IndianRupee className="h-5 w-5 text-positive" strokeWidth={1.8} />
          </span>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
              Total active monthly income
            </p>
            <p className="numeric-display text-2xl font-semibold">{formatINR(totalMonthly.toString())}</p>
          </div>
        </Card>
      )}

      {active.length > 0 && (
        <Section title="Active">
          <Grid incomes={active} onEdit={openEdit} onDelete={(id) => removeMut.mutate(id)} />
        </Section>
      )}

      {inactive.length > 0 && (
        <Section title="Inactive">
          <Grid incomes={inactive} onEdit={openEdit} onDelete={(id) => removeMut.mutate(id)} />
        </Section>
      )}

      {dialogOpen && (
        <IncomeDialog
          open={dialogOpen}
          existing={editing}
          onClose={() => {
            setDialogOpen(false);
            setEditing(null);
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['income'] });
            qc.invalidateQueries({ queryKey: ['intelligence', 'health-score'] });
            setDialogOpen(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">{title}</h2>
      {children}
    </div>
  );
}

function Grid({
  incomes, onEdit, onDelete,
}: {
  incomes: IncomeDTO[];
  onEdit: (i: IncomeDTO) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {incomes.map((i) => (
        <Card key={i.id} className="hover:shadow-sm transition-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2 min-w-0">
                <IndianRupee className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate">{i.sourceName}</span>
              </CardTitle>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => onEdit(i)} title="Edit">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onDelete(i.id)} title="Delete">
                  <Trash2 className="h-4 w-4 text-negative" />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="text-[10px] w-fit">{INCOME_TYPE_LABEL[i.type]}</Badge>
              {!i.isActive && (
                <Badge variant="outline" className="text-[10px] w-fit">Inactive</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="numeric-display text-xl font-semibold">{formatINR(i.monthlyAmount)}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <CalendarClock className="h-3 w-3" /> Credited on day {i.payDay}
            </p>
            {i.notes && <p className="text-[11px] text-muted-foreground">{i.notes}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
