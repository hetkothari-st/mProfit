// moveFiles:ignore — fixture paths below are test data, not imports to rewrite.
import { describe, it, expect } from 'vitest';
import { expandMoves, findUnresolved, rewriteSpecifiers } from '../../scripts/moveFiles.js';

describe('rewriteSpecifiers', () => {
  const map = new Map([
    ['/r/src/services/foPnl.service.ts', '/r/src/services/fo/foPnl.service.ts'],
    ['/r/src/services/foExpiry.service.ts', '/r/src/services/fo/foExpiry.service.ts'],
  ]);
  const existing = new Set(['/r/src/lib/prisma.ts', ...map.keys()]);
  const exists = (p: string) => existing.has(p);

  it('updates importer pointing at moved file', () => {
    const out = rewriteSpecifiers(`import { a } from '../services/foPnl.service.js';`, {
      importerOld: '/r/src/routes/fo.routes.ts',
      importerNew: '/r/src/routes/fo.routes.ts',
      fileMap: map,
      exists,
    });
    expect(out).toBe(`import { a } from '../services/fo/foPnl.service.js';`);
  });

  it('updates moved importer pointing at unmoved file', () => {
    const out = rewriteSpecifiers(`import { prisma } from '../lib/prisma.js';`, {
      importerOld: '/r/src/services/foPnl.service.ts',
      importerNew: '/r/src/services/fo/foPnl.service.ts',
      fileMap: map,
      exists,
    });
    expect(out).toBe(`import { prisma } from '../../lib/prisma.js';`);
  });

  it('keeps sibling import when both move together', () => {
    const src = `export { x } from './foExpiry.service.js';`;
    const out = rewriteSpecifiers(src, {
      importerOld: '/r/src/services/foPnl.service.ts',
      importerNew: '/r/src/services/fo/foPnl.service.ts',
      fileMap: map,
      exists,
    });
    expect(out).toBe(src);
  });

  it('rewrites vi.mock and dynamic import', () => {
    const src = [
      `vi.mock('../../src/services/foPnl.service.js', () => ({}));`,
      `const m = await import("../../src/services/foPnl.service.js");`,
    ].join('\n');
    const out = rewriteSpecifiers(src, {
      importerOld: '/r/test/services/foPnl.test.ts',
      importerNew: '/r/test/services/foPnl.test.ts',
      fileMap: map,
      exists,
    });
    expect(out).toBe(
      [
        `vi.mock('../../src/services/fo/foPnl.service.js', () => ({}));`,
        `const m = await import("../../src/services/fo/foPnl.service.js");`,
      ].join('\n'),
    );
  });

  it('leaves package and unresolvable specifiers alone', () => {
    const src = [
      `import express from 'express';`,
      `import { d } from '@everypaisa/shared';`,
      `import { m } from './missing.js';`,
    ].join('\n');
    const out = rewriteSpecifiers(src, {
      importerOld: '/r/src/services/foPnl.service.ts',
      importerNew: '/r/src/services/fo/foPnl.service.ts',
      fileMap: map,
      exists,
    });
    expect(out).toBe(src);
  });

  it('rewrites alias specifiers keeping alias form', () => {
    const webMap = new Map([['/r/src/api/mfCentral.api.ts', '/r/src/api/mf/mfCentral.api.ts']]);
    const out = rewriteSpecifiers(`import { f } from '@/api/mfCentral.api';`, {
      importerOld: '/r/src/pages/mf/Page.tsx',
      importerNew: '/r/src/pages/mf/Page.tsx',
      fileMap: webMap,
      exists: (p) => webMap.has(p),
      aliases: { '@/': '/r/src/' },
    });
    expect(out).toBe(`import { f } from '@/api/mf/mfCentral.api';`);
  });

  it('resolves by full path not basename', () => {
    const dirMap = new Map([
      ['/r/src/adapters/pf/types.ts', '/r/src/ingestion/pf/types.ts'],
      ['/r/src/adapters/pf/chain.ts', '/r/src/ingestion/pf/chain.ts'],
      ['/r/src/adapters/vehicle/types.ts', '/r/src/ingestion/vehicle/types.ts'],
      ['/r/src/adapters/vehicle/chain.ts', '/r/src/ingestion/vehicle/chain.ts'],
    ]);
    const ex = (p: string) => dirMap.has(p);
    const fromPf = rewriteSpecifiers(`import { T } from './types.js';\nimport { V } from '../vehicle/types.js';`, {
      importerOld: '/r/src/adapters/pf/chain.ts',
      importerNew: '/r/src/ingestion/pf/chain.ts',
      fileMap: dirMap,
      exists: ex,
    });
    expect(fromPf).toBe(`import { T } from './types.js';\nimport { V } from '../vehicle/types.js';`);
    const fromRoute = rewriteSpecifiers(`import { T } from '../adapters/vehicle/types.js';`, {
      importerOld: '/r/src/routes/v.routes.ts',
      importerNew: '/r/src/routes/v.routes.ts',
      fileMap: dirMap,
      exists: ex,
    });
    expect(fromRoute).toBe(`import { T } from '../ingestion/vehicle/types.js';`);
  });
});

describe('expandMoves', () => {
  const tree: Record<string, string[]> = {
    '/r/src/adapters/pf': ['/r/src/adapters/pf/a.ts', '/r/src/adapters/pf/epf/b.ts'],
  };
  const listFiles = (dir: string) => tree[dir] ?? [];
  const isDir = (p: string) => p in tree;

  it('expands a directory move to every file under it', () => {
    const m = expandMoves([{ from: '/r/src/adapters/pf', to: '/r/src/ingestion/pf' }], {
      listFiles,
      isDir,
      exists: () => false,
    });
    expect([...m.entries()]).toEqual([
      ['/r/src/adapters/pf/a.ts', '/r/src/ingestion/pf/a.ts'],
      ['/r/src/adapters/pf/epf/b.ts', '/r/src/ingestion/pf/epf/b.ts'],
    ]);
  });

  it('throws when destination exists', () => {
    expect(() =>
      expandMoves([{ from: '/r/src/services/reports.service.ts', to: '/r/src/services/reports/reports.service.ts' }], {
        listFiles,
        isDir,
        exists: (p) => p === '/r/src/services/reports/reports.service.ts',
      }),
    ).toThrow('destination exists: /r/src/services/reports/reports.service.ts');
  });

  it('throws on duplicate destination', () => {
    expect(() =>
      expandMoves(
        [
          { from: '/r/a/x.ts', to: '/r/b/x.ts' },
          { from: '/r/c/x.ts', to: '/r/b/x.ts' },
        ],
        { listFiles, isDir, exists: () => false },
      ),
    ).toThrow('duplicate destination: /r/b/x.ts');
  });
});

describe('findUnresolved', () => {
  it('reports relative specifiers that resolve to nothing, including vi.mock strings', () => {
    const existing = new Set(['/r/src/lib/prisma.ts']);
    const code = [
      `import { prisma } from '../lib/prisma.js';`,
      `import express from 'express';`,
      `vi.mock('../services/gone.service.js');`,
    ].join('\n');
    expect(findUnresolved(code, '/r/src/routes/a.routes.ts', (p) => existing.has(p))).toEqual([
      '../services/gone.service.js',
    ]);
  });
});

describe('findUnresolved in comments', () => {
  it('ignores example paths inside comment lines', () => {
    const code = [` * \`import { X } from './models'\` would shadow the barrel`, `// see from './nowhere.js'`].join('\n');
    expect(findUnresolved(code, '/r/src/a.ts', () => false)).toEqual([]);
  });
});

describe('less common module-path forms', () => {
  const map = new Map([['/r/src/services/c.ts', '/r/src/services/mf/c.ts']]);
  const exists = (p: string) => map.has(p);
  const opts = { importerOld: '/r/test/x.test.ts', importerNew: '/r/test/x.test.ts', fileMap: map, exists };

  it('rewrites vi.doUnmock, a generic importActual call and new URL(..., import.meta.url)', () => {
    const src = [
      `vi.doUnmock('../src/services/c.js');`,
      `const a = await vi.importActual<\n  typeof import('../src/services/c.js')\n>('../src/services/c.js');`,
      `const u = new URL(\n  '../src/services/c.ts',\n  import.meta.url,\n);`,
    ].join('\n');
    expect(rewriteSpecifiers(src, opts)).toBe(src.replaceAll('../src/services/c.', '../src/services/mf/c.'));
  });

  it('reports the same forms when they resolve to nothing', () => {
    const src = [`vi.doUnmock('../gone.js');`, `vi.importActual<T>('../gone2.js');`, `new URL('../gone3.ts', import.meta.url);`].join('\n');
    expect(findUnresolved(src, '/r/test/x.test.ts', () => false)).toEqual(['../gone.js', '../gone2.js', '../gone3.ts']);
  });
});

describe('directory specifiers (trailing slash)', () => {
  it('resolves an existing directory and follows a directory move', () => {
    const map = new Map([['/r/assets/fonts/a.ttf', '/r/static/fonts/a.ttf']]);
    const exists = (p: string) => p === '/r/assets/fonts/' || map.has(p);
    const src = `const dir = new URL('../../assets/fonts/', import.meta.url);`;
    expect(findUnresolved(src, '/r/src/will/f.ts', exists)).toEqual([]);
    expect(
      rewriteSpecifiers(src, { importerOld: '/r/src/will/f.ts', importerNew: '/r/src/will/f.ts', fileMap: map, exists }),
    ).toBe(`const dir = new URL('../../static/fonts/', import.meta.url);`);
  });
});

describe('paths that leave the --root', () => {
  it('treats a relative path climbing above the root as external (never reported, never rewritten)', () => {
    const src = `const shared = new URL('../../shared/src/', import.meta.url);`;
    expect(findUnresolved(src, '/scripts/lock.ts', () => false)).toEqual([]);
  });
});
