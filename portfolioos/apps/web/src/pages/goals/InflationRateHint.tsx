import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Decimal } from '@everypaisa/shared';
import { personalInflationApi, PERSONAL_INFLATION_QUERY_KEY } from '@/api/personalInflation.api';
import { suggestGoalRate, formatRatePct } from '@/pages/personalInflation/personalInflationView';

interface Props {
  category: string;
  current: string;
  onApply: (rate: string) => void;
}

/**
 * Offers the matching personal/official inflation rate under the Goal form's
 * inflation field. Suggest-only: nothing changes until the user clicks.
 */
export function InflationRateHint({ category, current, onApply }: Props) {
  const { data } = useQuery({
    queryKey: PERSONAL_INFLATION_QUERY_KEY,
    queryFn: () => personalInflationApi.summary(),
    staleTime: 5 * 60_000,
  });
  const s = suggestGoalRate(data, category);
  if (!s) return null;

  const applied = /^-?\d+(\.\d+)?$/.test(current) && new Decimal(current).equals(s.rate);
  return (
    <p className="text-[11px] text-muted-foreground mt-1">
      {formatRatePct(s.rate)} is {s.label}.{' '}
      {applied ? (
        <span className="text-positive">In use.</span>
      ) : (
        <button type="button" className="underline text-foreground" onClick={() => onApply(s.rate)}>
          Use this
        </button>
      )}{' '}
      <Link to="/personal-inflation" className="underline">See how</Link>
    </p>
  );
}
