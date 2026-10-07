import { describe, it, expect } from 'vitest';
import { browserUserAgent, decideNavigation, decideWindowOpen, isNewerVersion } from './policy';

const APP = 'https://portfolio-os.up.railway.app';

describe('navigation of the app window', () => {
  it('keeps the app and Google sign-in in the window', () => {
    expect(decideNavigation(`${APP}/dashboard`, APP)).toBe('allow');
    expect(decideNavigation('https://accounts.google.com/o/oauth2/v2/auth?x=1', APP)).toBe('allow');
  });
  it('sends other sites to the browser, and refuses odd schemes', () => {
    expect(decideNavigation('https://wa.me/919999999999', APP)).toBe('external');
    expect(decideNavigation('https://accounts.google.com.evil.example/', APP)).toBe('external');
    expect(decideNavigation('http://portfolio-os.up.railway.app/', APP)).toBe('external'); // not the same origin
    expect(decideNavigation('file:///C:/Windows/win.ini', APP)).toBe('block');
    expect(decideNavigation('javascript:alert(1)', APP)).toBe('block');
    expect(decideNavigation('not a url', APP)).toBe('block');
  });
});

describe('window.open from the app', () => {
  it('opens receipts and app pages in an app window', () => {
    expect(decideWindowOpen(`blob:${APP}/3f1c2b`, '', APP)).toBe('child');
    expect(decideWindowOpen(`${APP}/reports`, '', APP)).toBe('child');
  });
  it('keeps sign-in popups attached to the app (they report back via opener)', () => {
    expect(decideWindowOpen('https://kite.zerodha.com/connect/login', 'width=520,height=720', APP)).toBe('child');
    expect(decideWindowOpen('https://consent.finvu.in/x', 'popup=yes,width=560', APP)).toBe('child');
  });
  it('sends plain links to the browser', () => {
    expect(decideWindowOpen('https://wa.me/9199', '', APP)).toBe('external');
    expect(decideWindowOpen('https://example.com', 'noopener', APP)).toBe('external');
    expect(decideWindowOpen('blob:https://evil.example/1', '', APP)).toBe('block');
    expect(decideWindowOpen('http://plain.example', 'width=10', APP)).toBe('external');
  });
});

describe('helpers', () => {
  it('strips the embedded-browser tokens from the user agent', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) EveryPaisa/1.0.0 Chrome/140.0.0.0 Electron/44.6.0 Safari/537.36';
    expect(browserUserAgent(ua)).toBe(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    );
  });
  it('compares versions numerically', () => {
    expect(isNewerVersion('v1.2.10', '1.2.9')).toBe(true);
    expect(isNewerVersion('1.2.9', '1.2.9')).toBe(false);
    expect(isNewerVersion('1.1.0', '1.2.0')).toBe(false);
    expect(isNewerVersion('2.0.0', '1.99.99')).toBe(true);
  });
});
