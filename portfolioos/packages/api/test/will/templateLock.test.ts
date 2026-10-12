import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WILL_TEMPLATES } from '@everypaisa/shared';
import { templateHashes, WILL_TEMPLATE_DIR } from '../../scripts/willTemplateLock.js';

function lock(): Record<string, string> {
  return JSON.parse(readFileSync(join(WILL_TEMPLATE_DIR, 'LOCK.json'), 'utf8')) as Record<string, string>;
}

describe('will template lock', () => {
  it('no locked template file has changed (change wording with a new vN file, never an edit)', () => {
    expect(templateHashes()).toEqual(lock());
  });

  it('every current template has its own locked file', () => {
    const files = Object.keys(lock());
    for (const t of WILL_TEMPLATES) {
      const base = t.id.replace(/-([a-z])/g, (_m: string, c: string) => c.toUpperCase());
      expect(files).toContain(`${base}.v${t.version}.ts`);
    }
    expect(files).toContain('common.v1.ts');
    expect(files).toContain('summary.v1.ts');
  });
});
