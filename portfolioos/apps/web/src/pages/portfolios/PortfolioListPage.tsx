import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Briefcase, Star, ArrowUpRight, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { PortfolioFormDialog } from './PortfolioFormDialog';
import { PortfolioGroupFormDialog } from './PortfolioGroupFormDialog';
import { portfoliosApi, type PortfolioListItem } from '@/api/portfolios.api';
import { portfolioGroupsApi } from '@/api/portfolioGroups.api';
import { formatINR } from '@portfolioos/shared';
import type { PortfolioGroupListItem } from '@portfolioos/shared';

export function PortfolioListPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PortfolioListItem | null>(null);

  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<PortfolioGroupListItem | null>(null);

  const { data: portfolios, isLoading } = useQuery({
    queryKey: ['portfolios'],
    queryFn: portfoliosApi.list,
  });
  const { data: groups, isLoading: isGroupsLoading } = useQuery({
    queryKey: ['portfolio-groups'],
    queryFn: portfolioGroupsApi.list,
  });

  const handleCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const handleCreateGroup = () => {
    setEditingGroup(null);
    setGroupDialogOpen(true);
  };

  const hasPortfolios = (portfolios ?? []).length > 0;

  return (
    <div>
      <PageHeader
        eyebrow="Allocation"
        title="Portfolios"
        description="Group holdings by goal, strategy, or account. Bundle multiple portfolios into a family group for a consolidated view."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCreateGroup} disabled={!hasPortfolios}>
              <Users className="h-4 w-4" /> New group
            </Button>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4" /> New portfolio
            </Button>
          </div>
        }
      />

      {/* Groups section — only render once at least one group exists */}
      {!isGroupsLoading && (groups ?? []).length > 0 && (
        <section className="mb-8">
          <h2 className="text-base font-semibold uppercase tracking-kerned text-foreground mb-3">
            Family groups
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups!.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                onEdit={() => {
                  setEditingGroup(g);
                  setGroupDialogOpen(true);
                }}
              />
            ))}
          </div>
        </section>
      )}

      <h2 className="text-base font-semibold uppercase tracking-kerned text-foreground mb-3">
        Individual portfolios
      </h2>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-36 animate-pulse bg-muted/60" />
          ))}
        </div>
      )}

      {!isLoading && !hasPortfolios && (
        <EmptyState
          icon={Briefcase}
          title="No portfolios yet"
          description="Portfolios help you separate long-term investments from trading or goal-based strategies."
          action={
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4" /> Create your first portfolio
            </Button>
          }
        />
      )}

      {!isLoading && hasPortfolios && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {portfolios!.map((p) => (
            <PortfolioCard
              key={p.id}
              portfolio={p}
              onEdit={() => {
                setEditing(p);
                setDialogOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <PortfolioFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing ?? undefined}
      />

      <PortfolioGroupFormDialog
        open={groupDialogOpen}
        onOpenChange={setGroupDialogOpen}
        initial={editingGroup ?? undefined}
      />
    </div>
  );
}

function PortfolioCard({
  portfolio,
  onEdit,
}: {
  portfolio: PortfolioListItem;
  onEdit: () => void;
}) {
  return (
    <Card className="group relative overflow-hidden hover:shadow-elev-lg transition-all duration-200 hover:-translate-y-0.5">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-kerned text-muted-foreground">{portfolio.type}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <h3 className="font-display text-[30px] font-bold tracking-wide leading-tight truncate">{portfolio.name}</h3>
              {portfolio.isDefault && <Star className="h-3.5 w-3.5 fill-accent text-accent shrink-0" />}
            </div>
            {portfolio.description && (
              <p className="text-[12.5px] text-muted-foreground mt-1 line-clamp-2">
                {portfolio.description}
              </p>
            )}
            <div className="flex items-center gap-2 mt-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center rounded-full border border-border/70 px-2 py-0.5 bg-background/40">{portfolio.currency}</span>
              <span className="inline-flex items-center rounded-full border border-border/70 px-2 py-0.5 bg-background/40">{portfolio.holdingCount} holdings</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onEdit} className="opacity-60 group-hover:opacity-100 transition-opacity">
            Edit
          </Button>
        </div>

        <div className="mt-5 pt-4 border-t border-border/60 flex items-end justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-kerned text-muted-foreground">Current value</div>
            <div className="numeric-display text-[22px] mt-1 text-foreground">
              {portfolio.holdingCount > 0 ? formatINR(portfolio.currentValue) : '—'}
            </div>
          </div>
          <Button asChild variant="ghost" size="sm" className="text-accent-ink hover:text-accent">
            <Link to={`/portfolios/${portfolio.id}`}>
              Inspect <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function GroupCard({
  group,
  onEdit,
}: {
  group: PortfolioGroupListItem;
  onEdit: () => void;
}) {
  return (
    <Card className="group relative overflow-hidden hover:shadow-elev-lg transition-all duration-200 hover:-translate-y-0.5">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-kerned text-muted-foreground flex items-center gap-1.5">
              <Users className="h-3 w-3" /> Group
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <h3 className="font-display text-[30px] font-bold tracking-wide leading-tight truncate">{group.name}</h3>
            </div>
            {group.description && (
              <p className="text-[12.5px] text-muted-foreground mt-1 line-clamp-2">
                {group.description}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-1.5 mt-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center rounded-full border border-border/70 px-2 py-0.5 bg-background/40">{group.currency}</span>
              <span className="inline-flex items-center rounded-full border border-border/70 px-2 py-0.5 bg-background/40">{group.members.length} members</span>
              <span className="inline-flex items-center rounded-full border border-border/70 px-2 py-0.5 bg-background/40">{group.holdingCount} holdings</span>
            </div>
            {group.members.length > 0 && (
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-kerned text-muted-foreground mb-1.5">
                  Members
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {group.members.slice(0, 4).map((m) => (
                    <span
                      key={m.id}
                      className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-[12px] font-medium text-accent-ink"
                    >
                      <Users className="h-2.5 w-2.5 opacity-70" />
                      {m.name}
                    </span>
                  ))}
                  {group.members.length > 4 && (
                    <span className="text-[12px] text-muted-foreground self-center">
                      +{group.members.length - 4} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onEdit} className="opacity-60 group-hover:opacity-100 transition-opacity">
            Edit
          </Button>
        </div>

        <div className="mt-5 pt-4 border-t border-border/60 flex items-end justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-kerned text-muted-foreground">Combined value</div>
            <div className="numeric-display text-[22px] mt-1 text-foreground">
              {group.holdingCount > 0 ? formatINR(group.currentValue) : '—'}
            </div>
          </div>
          <Button asChild variant="ghost" size="sm" className="text-accent-ink hover:text-accent">
            <Link to={`/portfolio-groups/${group.id}`}>
              Inspect <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
