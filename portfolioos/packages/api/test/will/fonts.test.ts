import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const FONT_DIR = fileURLToPath(new URL('../../assets/fonts/', import.meta.url));
const DOCKERFILE = fileURLToPath(new URL('../../Dockerfile', import.meta.url));

const PINNED: Record<string, string> = {
  'OFL.txt': 'cee9892f9f0cc8fe882c9e9537ee6a89621d86ee7ceaf70b02e2b2b1c25c061a',
  'OFL-NotoSerifDevanagari.txt': 'a216f6f8d85c7228093e0ee5e258d9d377e6671f68acb4db1930b29583d0f331',
  'NotoSerif-Regular.ttf': '19e72cd8d595fae5bd74a5206f5d938512e1183d4fed7abb1ec1be1d7efa5f88',
  'NotoSerif-Bold.ttf': '96656aa5cec8f1d6fd0e804c1fad397e1a1cfa082e6642124e0bda68cd8363ce',
  'NotoSerif-Italic.ttf': '749e80e313ef711f9373c6cce17c72297ef05490b3dcda7967d1d5d90bf1183f',
  'NotoSerifDevanagari-Regular.ttf': 'e272d11d271c61a8d5d0f65764fd368ae53b9f9dabcce244a8941aa8f32ccc70',
  'NotoSerifDevanagari-Bold.ttf': '0544878a7b09ea1dc16d9de1f7a1f8cf82beb255d66a287712bb05a24336bcc0',
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
