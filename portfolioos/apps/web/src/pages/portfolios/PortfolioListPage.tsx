import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Briefcase, Star, ArrowUpRight } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { PortfolioFormDialog } from './PortfolioFormDialog';
import { portfoliosApi, type PortfolioListItem } from '@/api/portfolios.api';

export function PortfolioListPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PortfolioListItem | null>(null);

  const { data: portfolios, isLoading } = useQuery({
    queryKey: ['portfolios'],
    queryFn: portfoliosApi.list,
  });

  const handleCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Portfolios"
        description="Group your holdings by goal, strategy, or account"
        actions={
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4" /> New portfolio
          </Button>
        }
      />

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-36 animate-pulse bg-muted/60" />
          ))}
        </div>
      )}

      {!isLoading && (portfolios ?? []).length === 0 && (
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

      {!isLoading && (portfolios ?? []).length > 0 && (
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
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-semibold truncate">{portfolio.name}</h3>
              {portfolio.isDefault && <Star className="h-3.5 w-3.5 fill-accent text-accent" />}
            </div>
            {portfolio.description && (
              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                {portfolio.description}
              </p>
            )}
            <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
              <span>{portfolio.type}</span>
              <span>·</span>
              <span>{portfolio.currency}</span>
              <span>·</span>
              <span>{portfolio.holdingCount} holdings</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
        </div>

        <div className="mt-4 pt-4 border-t flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Current value</div>
            <div className="numeric font-semibold text-lg">—</div>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to={`/portfolios/${portfolio.id}`}>
              View <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
