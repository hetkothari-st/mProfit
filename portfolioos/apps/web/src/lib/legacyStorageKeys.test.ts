// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { migrateLegacyStorageKeys } from './legacyStorageKeys';

describe('migrateLegacyStorageKeys', () => {
  beforeEach(() => localStorage.clear());

  it('moves every portfolioos.* key to everypaisa.*', () => {
    localStorage.setItem('portfolioos.auth', '{"state":{"accessToken":"t"}}');
    localStorage.setItem('portfolioos.listView.rental', 'grid');
    localStorage.setItem('unrelated', 'x');

    migrateLegacyStorageKeys(localStorage);

    expect(localStorage.getItem('everypaisa.auth')).toBe('{"state":{"accessToken":"t"}}');
    expect(localStorage.getItem('everypaisa.listView.rental')).toBe('grid');
    expect(localStorage.getItem('portfolioos.auth')).toBeNull();
    expect(localStorage.getItem('portfolioos.listView.rental')).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('x');
  });

  it('keeps a value already written under the new key', () => {
    localStorage.setItem('portfolioos.theme', '{"state":{"dark":true}}');
    localStorage.setItem('everypaisa.theme', '{"state":{"dark":false}}');

    migrateLegacyStorageKeys(localStorage);

    expect(localStorage.getItem('everypaisa.theme')).toBe('{"state":{"dark":false}}');
    expect(localStorage.getItem('portfolioos.theme')).toBeNull();
  });
});
