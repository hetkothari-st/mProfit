/**
 * The EveryPaisa desktop app (apps/desktop) and where to download it.
 *
 * Installers are published as GitHub Releases on the app's repository, with
 * the version in the file name, so the links are read from the latest
 * release rather than hard-coded: they follow every new version on their
 * own, and nothing shows until a first release is published.
 */

const REPO = 'hetkothari-st/mProfit';
export const DESKTOP_RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

declare global {
  interface Window {
    /** Set by the desktop app's preload (apps/desktop/src/preload.ts). */
    everypaisaDesktop?: { version: string; platform: string };
  }
}

/** The desktop app's version when this page runs inside it, else null. */
export function desktopAppVersion(): string | null {
  return typeof window !== 'undefined' ? (window.everypaisaDesktop?.version ?? null) : null;
}

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

/** Download links from a GitHub release, or null if it has no installers. */
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

/** The latest published installers; null when there is no release yet. */
export async function fetchDesktopDownloads(): Promise<DesktopDownloads | null> {
  // Plain fetch, not the API client: this goes to GitHub and must not carry
  // the user's session token.
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
    credentials: 'omit',
  });
  if (res.status === 404) return null; // nothing published yet
  if (!res.ok) throw new Error(`GitHub releases: HTTP ${res.status}`);
  return pickDownloads((await res.json()) as GithubRelease);
}

/** The visitor's computer, to put the right download first. */
export function visitorOs(ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''): 'windows' | 'mac' | 'other' {
  if (/iPhone|iPad|Android/i.test(ua)) return 'other';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac';
  if (/Windows/i.test(ua)) return 'windows';
  return 'other';
}
