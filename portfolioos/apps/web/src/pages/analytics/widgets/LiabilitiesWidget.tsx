import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatINR } from '@everypaisa/shared';
import type { LiabilitiesVsAssets } from '@/api/analytics.api';
import { AnalyticsInfo } from '../AnalyticsInfo';

/**
 * What you own, what you owe, and the difference.
 *
 * Three numbers and no chart: a bar chart of three values carries no more
 * information than the values themselves. The debt-to-asset ratio and its
 * "comfortable / moderate / high leverage" verdict are gone too — grading
 * someone's borrowing without knowing their income, EMIs or tenor is advice,
 * and not ours to give.
 */
export function LiabilitiesVsAssetsCard({ data }: { data: LiabilitiesVsAssets }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5">
          What you own and owe<AnalyticsInfo k="assetsVsLiabilities" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 min-[400px]:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">You own</p>
            <p className="mt-0.5 font-semibold tabular-nums">{formatINR(data.assets)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">You owe</p>
            <p className="mt-0.5 font-semibold tabular-nums text-red-600 dark:text-red-400">
              {formatINR(data.liabilities)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Net worth</p>
            <p className="mt-0.5 font-semibold tabular-nums">{formatINR(data.netWorth)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
