// Bundles the main process into one file, so the packaged app ships no
// node_modules (and electron-builder never has to resolve pnpm's layout).
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron'],
  sourcemap: 'linked',
  logLevel: 'warning',
});
copyFileSync('src/offline.html', 'dist/offline.html');
