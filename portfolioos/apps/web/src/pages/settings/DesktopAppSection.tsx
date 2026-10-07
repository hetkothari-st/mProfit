import { useQuery } from '@tanstack/react-query';
import { Apple, Download, Monitor } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { desktopAppVersion, fetchDesktopDownloads, visitorOs } from '@/lib/desktopApp';

/**
 * Settings → Desktop app. Download links for the latest published release;
 * inside the desktop app itself, just which version is running. Shows nothing
 * until a first release exists (or if GitHub can't be reached).
 */
export function DesktopAppSection() {
  const runningVersion = desktopAppVersion();
  const { data } = useQuery({
    queryKey: ['desktop-app', 'downloads'],
    queryFn: fetchDesktopDownloads,
    enabled: runningVersion === null,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  if (runningVersion) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Desktop app</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          You&apos;re using the EveryPaisa desktop app, version {runningVersion}. It updates itself; Help → Check for
          Updates checks now.
        </CardContent>
      </Card>
    );
  }

  if (!data || visitorOs() === 'other') return null;

  const windows = data.windows && (
    <Button asChild key="windows" variant={visitorOs() === 'windows' ? 'default' : 'outline'} size="sm">
      <a href={data.windows} rel="noopener noreferrer">
        <Monitor className="mr-2 h-4 w-4" /> Download for Windows
      </a>
    </Button>
  );
  const mac = data.mac && (
    <Button asChild key="mac" variant={visitorOs() === 'mac' ? 'default' : 'outline'} size="sm">
      <a href={data.mac} rel="noopener noreferrer">
        <Apple className="mr-2 h-4 w-4" /> Download for Mac
      </a>
    </Button>
  );

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Desktop app</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          <Download className="mt-0.5 h-5 w-5 text-primary" />
          <p className="text-sm text-muted-foreground">
            EveryPaisa in its own window on your computer, with the same account and data. It keeps itself up to
            date. Version {data.version}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">{visitorOs() === 'mac' ? [mac, windows] : [windows, mac]}</div>
      </CardContent>
    </Card>
  );
}
