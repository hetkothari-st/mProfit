import { Globe } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DownloadReportButton } from '@/components/reports/DownloadReportButton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ForexRateTicker } from './ForexRateTicker';
import { ForexCashTab } from './ForexCashTab';
import { ForexPairsTab } from './ForexPairsTab';
import { ForeignStocksTab } from './ForeignStocksTab';
import { LrsTab } from './LrsTab';

export function ForexPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            <Globe className="h-9 w-9 text-accent-ink" />
            Forex
          </span>
        }
        description="Foreign-currency cash, FX pair trading, foreign equities, and LRS remittance tracking. Live RBI reference rates with Yahoo fallback."
        eyebrow="Asset"
        actions={<DownloadReportButton type="holdings" assetClasses={['FOREIGN_EQUITY', 'FOREX_PAIR']} />}
      />

      <ForexRateTicker />

      <Tabs defaultValue="cash">
        <TabsList>
          <TabsTrigger value="cash">Cash</TabsTrigger>
          <TabsTrigger value="pairs">FX pairs</TabsTrigger>
          <TabsTrigger value="stocks">Foreign equities</TabsTrigger>
          <TabsTrigger value="lrs">LRS &amp; TCS</TabsTrigger>
        </TabsList>
        <TabsContent value="cash">
          <ForexCashTab />
        </TabsContent>
        <TabsContent value="pairs">
          <ForexPairsTab />
        </TabsContent>
        <TabsContent value="stocks">
          <ForeignStocksTab />
        </TabsContent>
        <TabsContent value="lrs">
          <LrsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
