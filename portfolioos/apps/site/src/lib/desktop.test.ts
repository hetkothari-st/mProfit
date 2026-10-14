import { describe, expect, it } from 'vitest';
import { pickDownloads, visitorOs } from './desktop';

const asset = (name: string) => ({ name, browser_download_url: `https://github.com/x/releases/download/v1.2.0/${name}` });

describe('desktop downloads', () => {
  it('picks the Windows installer and the Mac disk image, not blockmaps or zips', () => {
    const d = pickDownloads({
      tag_name: 'v1.2.0',
      assets: [
        asset('EveryPaisa-Setup-1.2.0.exe.blockmap'),
        asset('EveryPaisa-Setup-1.2.0.exe'),
        asset('EveryPaisa-1.2.0-mac.zip'),
        asset('EveryPaisa-1.2.0-mac.dmg'),
      ],
    });
    expect(d).toEqual({
      version: '1.2.0',
      windows: expect.stringMatching(/Setup-1\.2\.0\.exe$/),
      mac: expect.stringMatching(/-mac\.dmg$/),
    });
  });

  it('ignores drafts, pre-releases and releases without installers', () => {
    expect(pickDownloads({ draft: true, assets: [asset('EveryPaisa-Setup-1.0.0.exe')] })).toBeNull();
    expect(pickDownloads({ prerelease: true, assets: [asset('EveryPaisa-Setup-1.0.0.exe')] })).toBeNull();
    expect(pickDownloads({ assets: [asset('latest.yml')] })).toBeNull();
  });

  it('tells Windows, Mac and phones apart', () => {
    expect(visitorOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
    expect(visitorOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')).toBe('mac');
    expect(visitorOs('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('other');
  });
});
