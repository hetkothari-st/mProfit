import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { formatINR } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { ACT_ON_IT_POPUP_KEY, actOnItApi } from '@/api/actOnIt.api';

/**
 * New advice, once, in the corner of whatever page is open (mockup v4). The
 * server decides what is new and keeps to the 2-a-week cap; this only shows it.
 * Hidden on the Act on it page itself and for plans without advice (403).
 */
export function AdvicePopup() {
  const qc = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const onActOnIt = location.pathname.startsWith('/act-on-it');
  const { data, refetch } = useQuery({
    queryKey: ACT_ON_IT_POPUP_KEY,
    queryFn: () => actOnItApi.popup(),
    retry: false,
    staleTime: 60_000,
    enabled: !onActOnIt,
  });
  useEffect(() => {
    if (!onActOnIt) void refetch();
  }, [location.pathname, onActOnIt, refetch]);

  const seen = useMutation({
    mutationFn: (promptId: string) => actOnItApi.popupSeen(promptId),
    onSettled: () => qc.setQueryData(ACT_ON_IT_POPUP_KEY, null),
  });

  if (!data || onActOnIt) return null;
  return (
    <div
      role="dialog"
      aria-labelledby="advice-popup-title"
      className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 right-4 z-40 overflow-hidden rounded-3xl border bg-card shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] motion-safe:animate-in motion-safe:slide-in-from-bottom-6 motion-safe:fade-in md:bottom-8 md:left-auto md:right-8 md:w-[400px]"
    >
      <div className="px-6 pt-5">
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-[11px] font-bold text-background" aria-hidden>E</span>
          {data.urgent ? 'Advice with a deadline this week' : 'New advice for you'}
        </p>
        <h2 id="advice-popup-title" className="mt-2.5 font-display text-[24px] font-semibold leading-tight">{data.headline}</h2>
        {data.gainInr && (
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            About <span className="numeric-display text-accent-ink">{formatINR(data.gainInr, { fractionDigits: 0 })}</span>
            {data.riskBand && <> · {data.riskBand.toLowerCase()} risk</>}
            {data.liquidity && <> · money back in {data.liquidity}</>}
          </p>
        )}
      </div>
      <div className="flex gap-2 px-6 pb-5 pt-4">
        <Button
          className="flex-1 rounded-xl bg-accent text-background hover:bg-accent/90"
          onClick={() => {
            seen.mutate(data.promptId);
            navigate('/act-on-it');
          }}
        >
          See the advice
        </Button>
        <Button variant="outline" className="flex-1 rounded-xl" onClick={() => seen.mutate(data.promptId)}>Later</Button>
      </div>
    </div>
  );
}
