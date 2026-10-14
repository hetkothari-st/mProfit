/**
 * Desktop app downloads, mirroring apps/web/src/lib/desktopApp.ts.
 *
 * Installers are GitHub Releases on the app's repository with the version
 * in the file name, so links are read from the latest release at runtime and
 * follow every new version. Until that request answers (and if it fails),
 * the buttons point at the releases page, which always has the installers.
 */

const REPO = 'hetkothari-st/mProfit';
export const DESKTOP_RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

export interface DesktopDownloads {
  version: string;
  windows: string | null;
  mac: string | null;
}

interface GithubRelease {
  tag_name?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: Array<{ name?: string; browser_download_url?: string }>;
}

/** Installer links from a GitHub release, or null if it has none. */
export function pickDownloads(release: GithubRelease): DesktopDownloads | null {
  if (release.draft || release.prerelease) return null;
  const assets = release.assets ?? [];
  const find = (test: (name: string) => boolean) =>
    assets.find((a) => a.name && a.browser_download_url && test(a.name))?.browser_download_url ?? null;
  const windows = find((n) => /^EveryPaisa-Setup-.*\.exe$/i.test(n));
  const mac = find((n) => /-mac\.dmg$/i.test(n));
  if (!windows && !mac) return null;
  return { version: (release.tag_name ?? '').replace(/^v/i, ''), windows, mac };
}

export async function fetchDesktopDownloads(): Promise<DesktopDownloads | null> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
    credentials: 'omit',
  });
  if (!res.ok) return null;
  return pickDownloads((await res.json()) as GithubRelease);
}

/** The visitor's computer, to put the right download first. */
export function visitorOs(ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''): 'windows' | 'mac' | 'other' {
  if (/iPhone|iPad|Android/i.test(ua)) return 'other';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac';
  if (/Windows/i.test(ua)) return 'windows';
  return 'other';
}
