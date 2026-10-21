import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WILL_TEMPLATES } from '@everypaisa/shared';
import {
  parseRebless, planLock, templateHashes, WILL_LOCKED_EXTRA_FILES, WILL_TEMPLATE_DIR,
} from '../../scripts/willTemplateLock.js';

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
    expect(files).toContain('regime.v1.ts');
    // v2 is current; the v1 files stay locked because generated wills were printed from them.
    for (const f of ['common.v2.ts', 'summary.v2.ts', 'isaHindu.v1.ts', 'isaGeneral.v1.ts', 'isaHindu.v2.ts', 'isaGeneral.v2.ts']) expect(files).toContain(f);
  });

  it('also locks the helpers the will prints through (amount in words, both block models)', () => {
    expect(WILL_LOCKED_EXTRA_FILES).toEqual(['amountInWords.ts', 'will/ast.ts', 'will/astV2.ts']);
    for (const f of WILL_LOCKED_EXTRA_FILES) expect(lock()[f]).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('lock writer', () => {
  const existing = { 'common.v1.ts': 'a'.repeat(64), 'will/ast.ts': 'b'.repeat(64) };

  it('adds new files and keeps unchanged entries', () => {
    const r = planLock({ ...existing, 'common.v2.ts': 'c'.repeat(64) }, existing);
    expect(r.errors).toEqual([]);
    expect(r.lock).toEqual({ ...existing, 'common.v2.ts': 'c'.repeat(64) });
  });

  it('refuses to change an existing hash without --rebless', () => {
    const r = planLock({ ...existing, 'common.v1.ts': 'd'.repeat(64) }, existing);
    expect(r.errors).toEqual(['common.v1.ts: locked file changed; add a new version instead (or --rebless common.v1.ts)']);
    expect(r.lock['common.v1.ts']).toBe('a'.repeat(64));
  });

  it('refuses a locked file that disappeared', () => {
    const r = planLock({ 'common.v1.ts': 'a'.repeat(64) }, existing);
    expect(r.errors).toEqual(['will/ast.ts: locked file is missing']);
  });

  it('accepts a changed hash for a file named with --rebless, and only that one', () => {
    const r = planLock(
      { 'common.v1.ts': 'd'.repeat(64), 'will/ast.ts': 'e'.repeat(64) },
      existing,
      ['common.v1.ts'],
    );
    expect(r.errors).toEqual(['will/ast.ts: locked file changed; add a new version instead (or --rebless will/ast.ts)']);
    const ok = planLock({ 'common.v1.ts': 'd'.repeat(64), 'will/ast.ts': 'b'.repeat(64) }, existing, ['common.v1.ts']);
    expect(ok.errors).toEqual([]);
    expect(ok.lock['common.v1.ts']).toBe('d'.repeat(64));
  });

  it('rejects --rebless of a file that is not locked yet', () => {
    expect(planLock(existing, existing, ['new.v1.ts']).errors).toEqual([
      '--rebless new.v1.ts: not in LOCK.json (new files are added without --rebless)',
    ]);
  });

  it('parses repeated --rebless flags and rejects anything else', () => {
    expect(parseRebless(['--rebless', 'a.v1.ts', '--rebless', 'will/ast.ts'])).toEqual(['a.v1.ts', 'will/ast.ts']);
    expect(() => parseRebless(['--force'])).toThrow('unknown argument --force');
    expect(() => parseRebless(['--rebless'])).toThrow('--rebless needs a file name');
  });
});
