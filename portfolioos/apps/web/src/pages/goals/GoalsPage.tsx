import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Loader2,
  Plus,
  Target,
  Trash2,
  CalendarClock,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/common/EmptyState';
import { goalsApi, type GoalDTO, type GoalCategory, type GoalPriority } from '@/api/goals.api';
import { portfoliosApi } from '@/api/portfolios.api';
import { apiErrorMessage } from '@/api/client';
import { formatINR } from '@portfolioos/shared';
import { GoalDialog } from './GoalDialog';

const CATEGORY_LABEL: Record<GoalCategory, string> = {
  RETIREMENT: 'Retirement',
  CHILD_EDUCATION: 'Child education',
  HOME_PURCHASE: 'Home purchase',
  EMERGENCY_FUND: 'Emergency fund',
  FIRE_CORPUS: 'FIRE corpus',
  VEHICLE_PURCHASE: 'Vehicle',
  TRAVEL: 'Travel',
  WEALTH_BUILDING: 'Wealth building',
  CUSTOM: 'Custom',
};

const PRIORITY_TONE: Record<GoalPriority, string> = {
  HIGH: 'text-negative border-negative/30',
  MEDIUM: 'text-amber-600 border-amber-300',
  LOW: 'text-muted-foreground border-muted',
};

export function GoalsPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GoalDTO | null>(null);

  const { data: goals, isLoading } = useQuery({
    queryKey: ['goals'],
    queryFn: () => goalsApi.list(),
  });
  const { data: portfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.list(),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => goalsApi.remove(id),
    onSuccess: () => {
      toast.success('Goal removed');
      qc.invalidateQueries({ queryKey: ['goals'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const active = (goals ?? []).filter((g) => g.status === 'ACTIVE');
  const achieved = (goals ?? []).filter((g) => g.status === 'ACHIEVED');
  const paused = (goals ?? []).filter((g) => g.status === 'PAUSED' || g.status === 'ABANDONED');

  return (
    <div>
      <PageHeader
        title="Financial goals"
        description="Track progress against retirement, child education, FIRE corpus, and custom targets."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New goal
          </Button>
        }
      />

      {isLoading && (
        <div className="py-10 text-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin inline" /> Loading…
        </div>
      )}

      {!isLoading && (goals ?? []).length === 0 && (
        <EmptyState
          title="No goals yet"
          description="Set a target amount and date, link contributing portfolios, and watch progress accrue."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Create first goal
            </Button>
          }
        />
      )}

      {active.length > 0 && (
        <Section title="Active">
          <GoalGrid
            goals={active}
            portfolios={portfolios ?? []}
            onEdit={(g) => {
              setEditing(g);
              setDialogOpen(true);
            }}
            onDelete={(id) => {
              if (confirm('Delete this goal?')) removeMut.mutate(id);
            }}
          />
        </Section>
      )}

      {achieved.length > 0 && (
        <Section title="Achieved">
          <GoalGrid
            goals={achieved}
            portfolios={portfolios ?? []}
            onEdit={(g) => {
              setEditing(g);
              setDialogOpen(true);
            }}
            onDelete={(id) => {
              if (confirm('Delete this goal?')) removeMut.mutate(id);
            }}
          />
        </Section>
      )}

      {paused.length > 0 && (
        <Section title="Paused / abandoned">
          <GoalGrid
            goals={paused}
            portfolios={portfolios ?? []}
            onEdit={(g) => {
              setEditing(g);
              setDialogOpen(true);
            }}
            onDelete={(id) => {
              if (confirm('Delete this goal?')) removeMut.mutate(id);
            }}
          />
        </Section>
      )}

      {dialogOpen && (
        <GoalDialog
          open={dialogOpen}
          existing={editing}
          portfolios={portfolios ?? []}
          onClose={() => {
            setDialogOpen(false);
            setEditing(null);
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['goals'] });
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
      <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
        {title}
      </h2>
      {children}
    </div>
  );
}

interface GridProps {
  goals: GoalDTO[];
  portfolios: { id: string; name: string }[];
  onEdit: (g: GoalDTO) => void;
  onDelete: (id: string) => void;
}

function GoalGrid({ goals, portfolios, onEdit, onDelete }: GridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {goals.map((g) => (
        <GoalCard
          key={g.id}
          goal={g}
          portfolios={portfolios}
          onEdit={() => onEdit(g)}
          onDelete={() => onDelete(g.id)}
        />
      ))}
    </div>
  );
}

interface CardProps {
  goal: GoalDTO;
  portfolios: { id: string; name: string }[];
  onEdit: () => void;
  onDelete: () => void;
}

function GoalCard({ goal, portfolios, onEdit, onDelete }: CardProps) {
  const linked = portfolios.filter((p) => goal.portfolioIds.includes(p.id));
  const pct = Math.round(goal.progressPct);
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="truncate">{goal.name}</span>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <Badge variant="outline" className="text-[10px]">
                {CATEGORY_LABEL[goal.category]}
              </Badge>
              <Badge variant="outline" className={`text-[10px] ${PRIORITY_TONE[goal.priority]}`}>
                {goal.priority}
              </Badge>
              {goal.status !== 'ACTIVE' && (
                <Badge variant="outline" className="text-[10px]">
                  {goal.status}
                </Badge>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onDelete} title="Delete">
            <Trash2 className="h-4 w-4 text-negative" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-xs text-muted-foreground">Progress</span>
            <span className="text-sm font-medium tabular-nums">{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          <Cell label="Current" value={formatINR(goal.currentValue)} />
          <Cell label="Target" value={formatINR(goal.targetAmount)} />
          <Cell label="Remaining" value={formatINR(goal.remaining)} />
          <Cell
            label="Target date"
            value={new Date(goal.targetDate).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          />
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground border-t border-border/60 pt-2">
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3 w-3" />
            {goal.yearsRemaining.toFixed(1)}y left
          </span>
          {goal.requiredCagr != null && (
            <span
              className={`inline-flex items-center gap-1 ${
                goal.isOnTrack === false ? 'text-negative' : ''
              }`}
            >
              <TrendingUp className="h-3 w-3" />
              Need {(goal.requiredCagr * 100).toFixed(1)}% CAGR
            </span>
          )}
          {goal.isOnTrack === false && (
            <span className="inline-flex items-center gap-1 text-negative">
              <AlertTriangle className="h-3 w-3" />
              Off-track
            </span>
          )}
        </div>

        {linked.length > 0 && (
          <div className="text-[11px] text-muted-foreground">
            Linked: {linked.map((p) => p.name).join(', ')}
          </div>
        )}

        <Button variant="outline" size="sm" onClick={onEdit} className="w-full">
          Edit
        </Button>
      </CardContent>
    </Card>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground text-[10px] uppercase tracking-wider">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}
