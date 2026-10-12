import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const FONT_DIR = fileURLToPath(new URL('../../assets/fonts/', import.meta.url));
const DOCKERFILE = fileURLToPath(new URL('../../Dockerfile', import.meta.url));

const PINNED: Record<string, string> = {
  'NotoSans-Regular.ttf': '478c558ea716033cd60c03438f628dfa75694dcf6b5f6d505a2f05fd2b4f3823',
  'NotoSans-Bold.ttf': '1df075a380fc7cb898acf64c1f7b3b4dd780de3caa860178bf929de35817a913',
  'NotoSansDevanagari-Regular.ttf': '4e3c66638958c3e2ab5d37f47a8deb89fffeb7be9985c665a519bbc7ba762313',
  'NotoSansDevanagari-Bold.ttf': '6a09c8d797cfc803d32cdc731e809424d74cbaff59f503de34ade421a08e5bc2',
  'OFL.txt': 'cee9892f9f0cc8fe882c9e9537ee6a89621d86ee7ceaf70b02e2b2b1c25c061a',
  'OFL-NotoSansDevanagari.txt': 'a216f6f8d85c7228093e0ee5e258d9d377e6671f68acb4db1930b29583d0f331',
};

describe('bundled will fonts', () => {
  for (const [file, sha] of Object.entries(PINNED)) {
    it(`${file} is present and matches the pinned release`, () => {
      const path = join(FONT_DIR, file);
      expect(existsSync(path)).toBe(true);
      expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(sha);
    });
  }

  it('the runtime image copies the assets folder', () => {
    expect(readFileSync(DOCKERFILE, 'utf8')).toContain(
      'COPY --from=build /app/packages/api/assets ./packages/api/assets',
    );
  });
});
