import { describe, it, expect } from 'vitest';
import { pickDownloads, visitorOs } from './desktopApp';

const asset = (name: string) => ({ name, browser_download_url: `https://github.com/x/releases/download/v1.2.0/${name}` });

describe('desktop app downloads', () => {
  it('picks the Windows installer and the Mac disk image, not the update files', () => {
    const d = pickDownloads({
      tag_name: 'v1.2.0',
      assets: [
        asset('latest.yml'),
        asset('EveryPaisa-Setup-1.2.0.exe.blockmap'),
        asset('EveryPaisa-Setup-1.2.0.exe'),
        asset('EveryPaisa-1.2.0-mac.zip'),
        asset('EveryPaisa-1.2.0-mac.dmg'),
      ],
    });
    expect(d).toEqual({
      version: '1.2.0',
      windows: expect.stringMatching(/EveryPaisa-Setup-1\.2\.0\.exe$/),
      mac: expect.stringMatching(/EveryPaisa-1\.2\.0-mac\.dmg$/),
    });
  });
  it('offers nothing for drafts, pre-releases, or a release without installers', () => {
    expect(pickDownloads({ draft: true, assets: [asset('EveryPaisa-Setup-1.0.0.exe')] })).toBeNull();
    expect(pickDownloads({ prerelease: true, assets: [asset('EveryPaisa-Setup-1.0.0.exe')] })).toBeNull();
    expect(pickDownloads({ tag_name: 'v1.0.0', assets: [asset('notes.txt')] })).toBeNull();
  });
  it('tells computers from phones', () => {
    expect(visitorOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
    expect(visitorOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)')).toBe('mac');
    expect(visitorOs('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('other');
    expect(visitorOs('Mozilla/5.0 (Linux; Android 14)')).toBe('other');
  });
});
