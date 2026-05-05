import { useQuery } from '@tanstack/react-query';
import { portfoliosApi } from '@/api/portfolios.api';

interface Props {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  /** Placeholder shown when value is null. Defaults to "(no portfolio)". */
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Reusable portfolio dropdown. Used by loan / vehicle / real-estate edit
 * forms so the user can re-assign the asset to any portfolio after
 * creation. Renders a native `<select>` for accessibility and
 * consistency with other inline forms in the codebase.
 */
export function PortfolioSelect({
  value,
  onChange,
  emptyLabel = '(no portfolio)',
  className,
  disabled,
}: Props) {
  const { data: portfolios, isLoading } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.list(),
    staleTime: 60_000,
  });

  return (
    <select
      className={
        className ??
        'w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm'
      }
      value={value ?? ''}
      disabled={disabled || isLoading}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
    >
      <option value="">{emptyLabel}</option>
      {(portfolios ?? []).map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
