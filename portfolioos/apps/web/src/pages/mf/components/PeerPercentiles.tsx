import { MIN_UNIVERSE_SIZE, type MfPeerPercentiles } from '@portfolioos/shared';
import { Card, CardContent } from '@/components/ui/card';
import { SectionUnavailable } from './MetricValue';
import { formatPercentileOrdinal, formatRatio, humanizeKey } from '../mfFormat';

/**
 * Where each metric sits in the scheme's own SEBI category, at this horizon
 * (`03 §1`).
 *
 * The percentile is direction-adjusted on the server — higher always means
 * better, so a low standard deviation and a high Sortino both read as a high
 * percentile, and the reader does not have to remember which metrics invert.
 *
 * A percentile only appears here for a metric the peer-rank job actually ranked
 * in this universe; an unranked metric is absent rather than shown at zero,
 * because a 0th percentile is a real and damning result. The union of keys
 * across `percentiles` and `medians` is iterated so a metric with a published
 * category median but no rank still shows the median instead of vanishing.
 */
export function PeerPercentiles({ peer }: { peer: MfPeerPercentiles | undefined }) {
  if (peer === undefined) {
    return (
      <div data-testid="mf-peers">
        <Heading />
        <SectionUnavailable
          title="No category ranking at this horizon"
          reason="The peer-rank job has not ranked this scheme for this horizon, so no percentile can be stated. This is a coverage gap, not a bottom-of-category result."
        />
      </div>
    );
  }

  const keys = Array.from(
    new Set([...Object.keys(peer.percentiles), ...Object.keys(peer.medians)]),
  ).sort();

  return (
    <div data-testid="mf-peers">
      <Heading />
      <Card tone="flat">
        <CardContent className="p-5">
          <p className="mb-3 text-[11px] text-muted-foreground">
            Ranked against <span className="numeric">{peer.universeSize}</span> schemes in{' '}
            <span className="font-medium text-foreground">{peer.universeKey}</span>.
            {peer.universeSize < MIN_UNIVERSE_SIZE &&
              ` Below ${MIN_UNIVERSE_SIZE} schemes a percentile moves by double digits per place, so read these as indicative only.`}
          </p>
          {keys.length === 0 ? (
            <p
              data-metric-value
              data-status="INSUFFICIENT_DATA"
              className="text-[12px] text-muted-foreground"
            >
              Not available — the universe was built but no metric was ranked in it
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-[13px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Metric</th>
                    <th className="pb-2 pr-4 font-medium">Percentile</th>
                    <th className="pb-2 font-medium">Category median</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {keys.map((k) => {
                    const percentile = peer.percentiles[k];
                    const median = peer.medians[k];
                    return (
                      <tr key={k} data-peer-metric={k}>
                        <td className="py-1.5 pr-4 text-foreground">{humanizeKey(k)}</td>
                        <td className="py-1.5 pr-4">
                          {percentile === undefined ? (
                            <span
                              data-metric-value
                              data-status="INSUFFICIENT_DATA"
                              className="text-[11px] italic text-muted-foreground"
                            >
                              Not available — not ranked
                            </span>
                          ) : (
                            <span
                              data-metric-value
                              data-status="OK"
                              className="numeric tabular-nums"
                            >
                              {formatPercentileOrdinal(percentile)}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5">
                          {median === undefined ? (
                            <span
                              data-metric-value
                              data-status="INSUFFICIENT_DATA"
                              className="text-[11px] italic text-muted-foreground"
                            >
                              Not available — no published median
                            </span>
                          ) : (
                            <span
                              data-metric-value
                              data-status="OK"
                              className="numeric tabular-nums"
                            >
                              {formatRatio(median, 2)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Heading() {
  return (
    <h3 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      Category rank
    </h3>
  );
}
