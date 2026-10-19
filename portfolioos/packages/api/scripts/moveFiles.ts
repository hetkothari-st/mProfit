/**
 * Moves files with `git mv` and rewrites every import that points at them, so a folder reorganisation is one
 * command instead of a hand-edit across src/, test/ and scripts/. Regex-based rather than AST-based on purpose:
 * it also catches the string paths inside `vi.mock(...)` and `import(...)`, which an AST mover leaves stale and
 * which then silently stop mocking.
 *
 *   pnpm --filter @everypaisa/api exec tsx scripts/moveFiles.ts --root . --map moves.json --scan src,test,scripts
 *   (web) ... --root ../../apps/web --scan src --alias @/=src/   (Git Bash on Windows: prefix with MSYS_NO_PATHCONV=1)
 *   (gate) ... --root . --scan src,test,scripts --check   -> lists relative imports that point at nothing
 *
 * moves.json: [{ "from": "src/services/foPnl.service.ts", "to": "src/services/fo/foPnl.service.ts" }, ...]
 * Paths are relative to --root; a `from` may be a directory, which moves every tracked file under it.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const posix = path.posix;

export type Move = { from: string; to: string };

export function expandMoves(
  moves: Move[],
  fs: { listFiles: (dir: string) => string[]; isDir: (p: string) => boolean; exists: (p: string) => boolean },
): Map<string, string> {
  const map = new Map<string, string>();
  const destinations = new Set<string>();
  const add = (from: string, to: string) => {
    if (destinations.has(to)) throw new Error(`duplicate destination: ${to}`);
    destinations.add(to);
    map.set(from, to);
  };
  for (const { from, to } of moves) {
    if (fs.isDir(from)) {
      for (const file of fs.listFiles(from)) add(file, to + file.slice(from.length));
    } else {
      add(from, to);
    }
  }
  for (const to of destinations) {
    if (fs.exists(to) && !map.has(to)) throw new Error(`destination exists: ${to}`);
  }
  return map;
}

// Every place a module path appears as a string literal: static/side-effect imports, re-exports, dynamic
// import(), require(), vitest's module-path APIs, the call half of a generic `vi.importActual<T>('…')`, and
// `new URL('…', import.meta.url)` file reads (resolved relative to the file, exactly like an import).
const SPECIFIER =
  /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*|\bvi\.(?:mock|doMock|unmock|doUnmock|importActual|importMock)\s*\(\s*|>\s*\(\s*|\bnew URL\(\s*)(['"])([^'"\n]+)\2/g;

const JS_TO_TS: Record<string, string[]> = {
  '.js': ['.ts', '.tsx', '.js'],
  '.jsx': ['.tsx', '.jsx'],
  '.mjs': ['.mts', '.mjs'],
  '.cjs': ['.cts', '.cjs'],
};

const EXACT_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.json', '.css', '.scss', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.txt', '.md', '.html']);

type Form = 'swapExt' | 'noExt' | 'index' | 'exact' | 'dir';

function stripExt(p: string): string {
  return p.slice(0, p.length - posix.extname(p).length);
}

type Resolved = { target: string; form: Form; ext: string; alias?: string; aliasRoot?: string };

/** null = a relative/alias path that points at nothing; 'external' = a package import we never touch. */
function resolveSpecifier(
  spec: string,
  importer: string,
  known: (p: string) => boolean,
  aliases: Record<string, string>,
): Resolved | 'external' | null {
  const alias = Object.keys(aliases).find((a) => spec.startsWith(a));
  const aliasRoot = alias === undefined ? undefined : aliases[alias];
  let base: string;
  if (alias !== undefined && aliasRoot !== undefined) base = aliasRoot + spec.slice(alias.length);
  else if (spec.startsWith('./') || spec.startsWith('../')) {
    // Climbing above the virtual root ("/" = --root) means another package, which this run neither scans nor moves.
    const ups = spec.split('/').filter((seg) => seg === '..').length;
    if (ups > posix.dirname(importer).split('/').filter(Boolean).length) return 'external';
    base = posix.resolve(posix.dirname(importer), spec);
  }
  else return 'external';

  // `new URL('../assets/fonts/', import.meta.url)`: a directory, kept with its trailing slash.
  if (spec.endsWith('/')) {
    const dir = base.endsWith('/') ? base : base + '/';
    return known(dir) ? { target: dir, form: 'dir', ext: '', alias, aliasRoot } : null;
  }

  const ext = posix.extname(base);
  const swaps = JS_TO_TS[ext];
  // `.api` in `mfCentral.api` is part of the name, not an extension; only real file types count as exact.
  const candidates: Array<[string, Form]> = swaps
    ? swaps.map((e): [string, Form] => [stripExt(base) + e, 'swapExt'])
    : EXACT_EXT.has(ext)
      ? [[base, 'exact']]
      : [
          [base + '.ts', 'noExt'],
          [base + '.tsx', 'noExt'],
          [base + '/index.ts', 'index'],
          [base + '/index.tsx', 'index'],
          [base, 'exact'],
        ];
  const hit = candidates.find(([c]) => known(c));
  if (!hit) return null;
  return { target: hit[0], form: hit[1], ext, alias, aliasRoot };
}

export function rewriteSpecifiers(
  code: string,
  opts: {
    importerOld: string;
    importerNew: string;
    fileMap: Map<string, string>;
    exists: (absPath: string) => boolean;
    aliases?: Record<string, string>;
  },
): string {
  const { importerOld, importerNew, fileMap, exists, aliases = {} } = opts;
  const movedFrom = [...fileMap.keys()];
  const known = (p: string) =>
    fileMap.has(p) || exists(p) || (p.endsWith('/') && movedFrom.some((k) => k.startsWith(p)));
  const importerMoved = importerOld !== importerNew;
  // A directory follows its files: if any file under it moved, the directory moved by the same prefix change.
  const movedDir = (dir: string): string => {
    const k = movedFrom.find((f) => f.startsWith(dir));
    if (k === undefined) return dir;
    const v = fileMap.get(k) ?? k;
    return v.slice(0, v.length - (k.length - dir.length));
  };

  return code.replace(SPECIFIER, (whole, lead: string, quote: string, spec: string) => {
    const r = resolveSpecifier(spec, importerOld, known, aliases);
    if (r === null || r === 'external') return whole;
    const { target, form, ext, alias, aliasRoot } = r;
    const newTarget = form === 'dir' ? movedDir(target) : (fileMap.get(target) ?? target);
    if (!importerMoved && newTarget === target) return whole;

    let next: string;
    if (form === 'swapExt') next = stripExt(newTarget) + ext;
    else if (form === 'noExt') next = stripExt(newTarget);
    else if (form === 'index') next = posix.dirname(newTarget);
    else next = newTarget;

    let newSpec: string;
    if (alias !== undefined && aliasRoot !== undefined && next.startsWith(aliasRoot)) {
      newSpec = alias + next.slice(aliasRoot.length);
    } else {
      newSpec = posix.relative(posix.dirname(importerNew), next);
      if (!newSpec.startsWith('.')) newSpec = './' + newSpec;
      if (form === 'dir') newSpec += '/';
    }
    return `${lead}${quote}${newSpec}${quote}`;
  });
}

/** Relative/alias specifiers in `code` that resolve to no file — the post-move gate for strings tsc can't see. */
export function findUnresolved(
  code: string,
  importer: string,
  exists: (absPath: string) => boolean,
  aliases: Record<string, string> = {},
): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(SPECIFIER)) {
    // Example paths in JSDoc/line comments are prose, not imports.
    const lineStart = code.lastIndexOf('\n', m.index) + 1;
    if (/^\s*(\*|\/\/|\/\*)/.test(code.slice(lineStart, m.index))) continue;
    const spec = m[3];
    if (spec !== undefined && resolveSpecifier(spec, importer, exists, aliases) === null) out.push(spec);
  }
  return out;
}

// A file containing this marker is never rewritten or checked (e.g. this tool's own test fixtures).
const IGNORE_MARKER = 'moveFiles:' + 'ignore';

const SOURCE_EXT = /\.(ts|tsx|mts|cts)$/;

function main(argv: string[]): void {
  const arg = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const root = path.resolve(arg('--root') ?? '.');
  const mapFile = arg('--map');
  const checkOnly = argv.includes('--check');
  if (!mapFile && !checkOnly) throw new Error('--map <moves.json> or --check is required');
  const scan = (arg('--scan') ?? 'src').split(',').map((d) => '/' + d.replace(/^\/|\/$/g, ''));
  const aliases: Record<string, string> = {};
  argv.forEach((a, i) => {
    if (a !== '--alias') return;
    const [from, to] = (argv[i + 1] ?? '').split('=');
    if (!from || !to) throw new Error('--alias expects <prefix>=<dir>, e.g. @/=src/');
    // Git Bash rewrites "@/" into "@C:/Program Files/Git/" before we see it, which silently disables the alias.
    if (from.includes(':')) throw new Error(`--alias prefix "${from}" was path-converted by the shell; rerun with MSYS_NO_PATHCONV=1`);
    aliases[from] = '/' + to.replace(/^\//, '');
  });

  // Work in a virtual root ("/" = --root) with posix separators, so paths behave the same on Windows.
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .map((f) => '/' + f);
  const trackedSet = new Set(tracked);
  // Directories too (with a trailing slash), so `new URL('../dir/', import.meta.url)` resolves.
  for (const f of tracked) {
    for (let i = f.indexOf('/', 1); i > 0; i = f.indexOf('/', i + 1)) trackedSet.add(f.slice(0, i + 1));
  }
  const real = (p: string) => path.join(root, p.slice(1));
  const isScanned = (p: string) => SOURCE_EXT.test(p) && scan.some((d) => p.startsWith(d + '/'));

  if (checkOnly) {
    let bad = 0;
    for (const file of tracked.filter(isScanned)) {
      const code = readFileSync(real(file), 'utf8');
      if (code.includes(IGNORE_MARKER)) continue;
      for (const spec of findUnresolved(code, file, (p) => trackedSet.has(p), aliases)) {
        console.log(`${file.slice(1)}: ${spec}`);
        bad++;
      }
    }
    console.log(`${bad} unresolved specifiers`);
    process.exitCode = bad ? 1 : 0;
    return;
  }

  const v = (p: string) => '/' + p.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/$/, '');
  const moves = (JSON.parse(readFileSync(mapFile ?? '', 'utf8')) as Move[]).map((m) => ({ from: v(m.from), to: v(m.to) }));

  const fileMap = expandMoves(moves, {
    listFiles: (dir) => tracked.filter((f) => f.startsWith(dir + '/')),
    isDir: (p) => tracked.some((f) => f.startsWith(p + '/')),
    exists: (p) => trackedSet.has(p),
  });
  for (const { from } of moves) {
    if (![...fileMap.keys()].some((f) => f === from || f.startsWith(from + '/'))) {
      throw new Error(`nothing tracked at: ${from}`);
    }
  }

  for (const [from, to] of fileMap) {
    mkdirSync(path.dirname(real(to)), { recursive: true });
    execFileSync('git', ['mv', real(from), real(to)], { cwd: root });
  }

  const reverse = new Map([...fileMap].map(([o, n]) => [n, o]));
  let rewritten = 0;
  for (const oldPath of tracked) {
    const newPath = fileMap.get(oldPath) ?? oldPath;
    if (!isScanned(newPath)) continue;
    const code = readFileSync(real(newPath), 'utf8');
    if (code.includes(IGNORE_MARKER)) continue;
    const next = rewriteSpecifiers(code, {
      importerOld: reverse.get(newPath) ?? newPath,
      importerNew: newPath,
      fileMap,
      exists: (p) => trackedSet.has(p),
      aliases,
    });
    if (next !== code) {
      writeFileSync(real(newPath), next);
      rewritten++;
    }
  }
  console.log(`moved ${fileMap.size} files, rewrote ${rewritten} files`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
