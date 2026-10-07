import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { desktopAppVersion, fetchDesktopDownloads, visitorOs } from '@/lib/desktopApp';

/**
 * Top bar: download the desktop app for this computer. Same release lookup
 * (and cache) as Settings → Desktop app; hidden on phones, inside the desktop
 * app itself, and until a release is published.
 */
export function DesktopDownloadButton() {
  const os = visitorOs();
  const inApp = desktopAppVersion() !== null;
  const { data } = useQuery({
    queryKey: ['desktop-app', 'downloads'],
    queryFn: fetchDesktopDownloads,
    enabled: !inApp && os !== 'other',
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const href = os === 'mac' ? data?.mac : os === 'windows' ? data?.windows : null;
  if (inApp || !href) return null;

  const label = os === 'mac' ? 'Download EveryPaisa for Mac' : 'Download EveryPaisa for Windows';
  return (
    <a
      href={href}
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
      className="hidden md:flex items-center gap-1.5 h-9 px-2 lg:px-3 rounded-md text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors focus-ring shrink-0"
    >
      <Download className="h-4 w-4" strokeWidth={1.7} />
      <span className="hidden lg:inline">Desktop app</span>
    </a>
  );
}
